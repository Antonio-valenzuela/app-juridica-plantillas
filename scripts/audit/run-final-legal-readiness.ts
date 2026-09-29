import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST as analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AuditCase = {
  caseNumber: string;
  sourceEntry: string;
  sourceRelativePath: string;
  extractedSourcePath: string;
  sourceSha256: string;
  sourceBytes: number;
  matter: string;
  sourceDocumentType: string;
  outputDocumentType: string;
  rationale: string;
  expectedReviewState: string;
  sourceFileName: string;
};

type StageEvent = {
  stage: string;
  event: 'start' | 'complete' | 'error';
  at: string;
  elapsedMs: number;
  error?: string;
};

type CaseResult = {
  caseNumber: string;
  sourceEntry: string;
  outputDocumentType: string;
  status: 'PASS_REVIEWABLE' | 'BLOCKED_REVIEW' | 'FAILED';
  startedAt: string;
  completedAt: string;
  totalMs: number;
  source: {
    bytes: number;
    sha256: string;
    extractedChars: number;
    pageCount: number;
    sourceValidated: boolean;
    sourceQualityStatus?: string;
    analysisHttpStatus: number;
    classification?: unknown;
  };
  stages: StageEvent[];
  progressMessages: string[];
  blockEvents: Array<Record<string, unknown>>;
  errors: string[];
  warnings: string[];
  errorDetails?: Record<string, unknown>;
  semanticState?: Record<string, unknown>;
  providerTrace?: unknown;
  files: Record<string, string | null>;
};

const repoRoot = process.cwd();
const auditRoot = path.resolve(repoRoot, 'audit/final-legal-readiness-2026');
const manifestPath = path.join(auditRoot, 'selected-cases.json');

function nowIso(): string {
  return new Date().toISOString();
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
}

function describeError(error: unknown): Record<string, unknown> {
  const candidate = error as any;
  return {
    name: candidate?.name || null,
    code: candidate?.code || null,
    message: safeError(error),
    reasons: Array.isArray(candidate?.reasons) ? candidate.reasons : [],
    guardErrors: Array.isArray(candidate?.result?.errors) ? candidate.result.errors : [],
    guardWarnings: Array.isArray(candidate?.result?.warnings) ? candidate.result.warnings : [],
  };
}

function textFromDocument(doc: UniversalLegalDocument): string {
  return (doc.sections || [])
    .flatMap((section) => (section.content || []).map((block) => block.text || ''))
    .join('\n\n');
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function writeText(filePath: string, value: string): Promise<void> {
  await writeFile(filePath, value, 'utf8');
}

async function uploadSource(source: AuditCase): Promise<{ response: any; status: number }> {
  const sourceBuffer = await readFile(path.resolve(repoRoot, source.extractedSourcePath));
  const formData = new FormData();
  formData.append('file', new File([sourceBuffer], source.sourceFileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  const request = new NextRequest('http://localhost/api/templates/analyze-upload', {
    method: 'POST',
    body: formData,
  });
  const response = await analyzeUpload(request);
  const body = await response.json();
  return { response: body, status: response.status };
}

async function runCase(source: AuditCase): Promise<CaseResult> {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const caseRoot = path.join(auditRoot, 'cases', source.caseNumber);
  const evidenceRoot = path.join(caseRoot, 'evidence');
  const outputRoot = path.join(caseRoot, 'outputs');
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const stages: StageEvent[] = [];
  const progressMessages: string[] = [];
  const blockEvents: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let analysis: any = null;
  let generated: UniversalLegalDocument | null = null;
  let providerTrace: unknown;
  let currentStageStartedAt = new Map<string, number>();

  const recordStageStart = (stage: string) => {
    const at = nowIso();
    const elapsedMs = Date.now() - startedMs;
    currentStageStartedAt.set(stage, Date.now());
    stages.push({ stage, event: 'start', at, elapsedMs });
  };
  const recordStageComplete = (stage: string) => {
    const at = nowIso();
    const elapsedMs = Date.now() - startedMs;
    const stageStart = currentStageStartedAt.get(stage);
    stages.push({ stage, event: 'complete', at, elapsedMs: stageStart ? Date.now() - stageStart : elapsedMs });
  };

  try {
    recordStageStart('upload');
    const upload = await uploadSource(source);
    analysis = upload.response;
    recordStageComplete('upload');
    await writeJson(path.join(evidenceRoot, 'analyze-upload-response.json'), analysis);

    if (upload.status !== 200 || !analysis?.ok || !analysis?.sourceValidated) {
      throw new Error(`ANALYZE_UPLOAD_FAILED status=${upload.status} error=${analysis?.error || 'source not validated'}`);
    }

    await writeText(path.join(evidenceRoot, 'source-extracted.txt'), String(analysis.extractedText || ''));

    const sourceDocument = createSourceDocument({
      id: `audit-${source.caseNumber}-${source.sourceFileName}`,
      filename: source.sourceFileName,
      extractedText: analysis.extractedText,
      pages: analysis.pages,
      sourceValidated: analysis.sourceValidated,
      sourceQualityStatus: analysis.sourceQualityStatus,
      qualityScore: analysis.qualityScore,
      classification: { sourceDocumentType: source.sourceDocumentType },
    } as any);

    const pipelineInput = {
      flow: 'DOCUMENT_ANALYSIS' as const,
      userInstruction: `Redactar contestación jurídica de ${source.matter.toLowerCase()} respecto del documento fuente, contestando únicamente hechos y prestaciones que consten en la fuente y dejando pendientes los datos no confirmados.`,
      selectedDocumentType: source.outputDocumentType,
      documentTypeLabel: `Contestación de ${source.matter.toLowerCase()}`,
      matter: source.matter,
      sourceDocuments: [sourceDocument],
      traceOptions: {
        enabled: true,
        outputDir: evidenceRoot,
        writeMarkdown: true,
      },
      generationId: `final-legal-readiness-${source.caseNumber}`,
    };

    generated = await runGenerationPipeline(pipelineInput, {
      onStageStart: (stage) => recordStageStart(stage),
      onStageComplete: (stage) => recordStageComplete(stage),
      onError: (error, stage) => {
        const message = safeError(error);
        errors.push(`${stage}: ${message}`);
        stages.push({ stage, event: 'error', at: nowIso(), elapsedMs: Date.now() - startedMs, error: message });
      },
      onProgressMessage: (message) => progressMessages.push(message),
      onBlockComplete: (completed, total, block, meta) => {
        blockEvents.push({
          completed,
          total,
          blockId: block.id,
          sectionId: (block as { sectionId?: string }).sectionId,
          title: block.title,
          ...meta,
        });
      },
      onTraceReady: (trace) => {
        providerTrace = trace;
      },
    });

    const generatedText = textFromDocument(generated);
    await writeJson(path.join(evidenceRoot, 'generated-document.json'), generated);
    await writeText(path.join(evidenceRoot, 'generated-text.txt'), generatedText);

    const draftDocxPath = path.join(outputRoot, `caso-${source.caseNumber}-contestacion-DRAFT.docx`);
    const draftPdfPath = path.join(outputRoot, `caso-${source.caseNumber}-contestacion-DRAFT.pdf`);
    const docxBuffer = await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'DRAFT' });
    const pdfBuffer = await exportUniversalToPdf(generated, undefined, { exportMode: 'DRAFT' });
    await writeFile(draftDocxPath, docxBuffer);
    await writeFile(draftPdfPath, pdfBuffer);

    let finalDocxBlock = 'NO_BLOCK_RECORDED';
    let finalPdfBlock = 'NO_BLOCK_RECORDED';
    try {
      await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'FINAL' });
      finalDocxBlock = 'FINAL_EXPORT_ALLOWED';
      warnings.push('La exportación DOCX FINAL fue permitida sin revisión explícita.');
    } catch (error) {
      finalDocxBlock = safeError(error);
    }
    try {
      await exportUniversalToPdf(generated, undefined, { exportMode: 'FINAL' });
      finalPdfBlock = 'FINAL_EXPORT_ALLOWED';
      warnings.push('La exportación PDF FINAL fue permitida sin revisión explícita.');
    } catch (error) {
      finalPdfBlock = safeError(error);
    }

    const semanticState = {
      documentStatus: generated.status,
      readiness: (generated.generationMetadata as any).readiness || null,
      lifecycle: (generated.generationMetadata as any).lifecycle || null,
      validation: generated.validation || null,
      qualityGate: (generated as UniversalLegalDocument & { qualityGate?: unknown }).qualityGate || null,
      pipelineState: generated.generationMetadata.pipelineState,
      missingFields: generated.missingFields || [],
      anonymizedFields: generated.anonymizedFields || [],
      placeholderCount: countMatches(generatedText, /\[(?:DATO|REQUIERE|SIN|NO VERIFICADO|NOMBRE|FECHA|SALA|DESCRIBIR)[^\]]*\]/gi),
      finalDocxBlock,
      finalPdfBlock,
    };
    await writeJson(path.join(evidenceRoot, 'semantic-state.json'), semanticState);
    if (providerTrace) await writeJson(path.join(evidenceRoot, 'generation-trace.json'), providerTrace);

    const status = finalDocxBlock === 'FINAL_EXPORT_ALLOWED' || finalPdfBlock === 'FINAL_EXPORT_ALLOWED'
      ? 'BLOCKED_REVIEW'
      : 'PASS_REVIEWABLE';
    const result: CaseResult = {
      caseNumber: source.caseNumber,
      sourceEntry: source.sourceEntry,
      outputDocumentType: source.outputDocumentType,
      status,
      startedAt,
      completedAt: nowIso(),
      totalMs: Date.now() - startedMs,
      source: {
        bytes: source.sourceBytes,
        sha256: source.sourceSha256,
        extractedChars: String(analysis.extractedText || '').length,
        pageCount: Array.isArray(analysis.pages) ? analysis.pages.length : 0,
        sourceValidated: Boolean(analysis.sourceValidated),
        sourceQualityStatus: analysis.sourceQualityStatus,
        analysisHttpStatus: 200,
        classification: analysis.classification,
      },
      stages,
      progressMessages,
      blockEvents,
      errors,
      warnings,
      semanticState,
      providerTrace,
      files: {
        source: source.extractedSourcePath,
        analysis: path.join(evidenceRoot, 'analyze-upload-response.json'),
        generatedDocument: path.join(evidenceRoot, 'generated-document.json'),
        generatedText: path.join(evidenceRoot, 'generated-text.txt'),
        docx: draftDocxPath,
        pdf: draftPdfPath,
        trace: providerTrace ? path.join(evidenceRoot, 'generation-trace.json') : null,
      },
    };
    await writeJson(path.join(evidenceRoot, 'case-result.json'), result);
    return result;
  } catch (error) {
    const message = safeError(error);
    const errorDetails = describeError(error);
    errors.push(message);
    await writeJson(path.join(evidenceRoot, 'error-detail.json'), errorDetails);
    const result: CaseResult = {
      caseNumber: source.caseNumber,
      sourceEntry: source.sourceEntry,
      outputDocumentType: source.outputDocumentType,
      status: 'FAILED',
      startedAt,
      completedAt: nowIso(),
      totalMs: Date.now() - startedMs,
      source: {
        bytes: source.sourceBytes,
        sha256: source.sourceSha256,
        extractedChars: analysis?.extractedText ? String(analysis.extractedText).length : 0,
        pageCount: Array.isArray(analysis?.pages) ? analysis.pages.length : 0,
        sourceValidated: Boolean(analysis?.sourceValidated),
        sourceQualityStatus: analysis?.sourceQualityStatus,
        analysisHttpStatus: analysis ? 200 : 0,
        classification: analysis?.classification,
      },
      stages,
      progressMessages,
      blockEvents,
      errors,
      warnings,
      errorDetails,
      providerTrace,
      files: {
        source: source.extractedSourcePath,
        analysis: analysis ? path.join(evidenceRoot, 'analyze-upload-response.json') : null,
        generatedDocument: generated ? path.join(evidenceRoot, 'generated-document.json') : null,
        generatedText: generated ? path.join(evidenceRoot, 'generated-text.txt') : null,
        docx: null,
        pdf: null,
        trace: providerTrace ? path.join(evidenceRoot, 'generation-trace.json') : null,
        errorDetail: path.join(evidenceRoot, 'error-detail.json'),
      },
    };
    await writeJson(path.join(evidenceRoot, 'case-result.json'), result);
    return result;
  }
}

export async function runFinalLegalReadiness(): Promise<unknown> {
  const useConfiguredProviders = process.env.AUDIT_USE_CONFIGURED_PROVIDERS === 'true';
  // La auditoría se ejecuta bajo Vitest: DEMO_MODE solo habilita la identidad
  // sintética de pruebas y no cambia la cadena de proveedores de generación.
  process.env.DEMO_MODE_ENABLED = 'true';
  if (!useConfiguredProviders) {
    process.env.NVIDIA_API_KEY = '';
    process.env.NVIDIA_REAL_TEST = 'false';
    process.env.GEMINI_API_KEY = '';
    process.env.GROQ_API_KEY = '';
    process.env.OPENROUTER_API_KEY = '';
  } else {
    process.env.NVIDIA_REAL_TEST = 'true';
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { cases: AuditCase[] };
  const requestedCase = process.env.AUDIT_ONLY_CASE?.trim();
  const selectedCases = requestedCase
    ? manifest.cases.filter((source) => source.caseNumber === requestedCase)
    : manifest.cases;
  if (selectedCases.length === 0) throw new Error(`No se encontró el caso solicitado: ${requestedCase}`);
  const results: CaseResult[] = [];
  for (const source of selectedCases.sort((a, b) => a.caseNumber.localeCompare(b.caseNumber))) {
    const result = await runCase(source);
    results.push(result);
    console.log(JSON.stringify({
      caseNumber: result.caseNumber,
      status: result.status,
      totalMs: result.totalMs,
      errors: result.errors,
      files: result.files,
    }));
  }

  const summary = {
    generatedAt: nowIso(),
    environment: {
      demoMode: process.env.DEMO_MODE_ENABLED,
      providerRequested: 'NVIDIA',
      providerKeysSuppressed: !useConfiguredProviders,
      configuredProvidersUsed: useConfiguredProviders,
      realProviderTest: process.env.NVIDIA_REAL_TEST,
    },
    requestedCaseCount: selectedCases.length,
    counts: {
      total: results.length,
      passReviewable: results.filter((result) => result.status === 'PASS_REVIEWABLE').length,
      blockedReview: results.filter((result) => result.status === 'BLOCKED_REVIEW').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      docx: results.filter((result) => result.files.docx).length,
      pdf: results.filter((result) => result.files.pdf).length,
    },
    results,
  };
  await writeJson(path.join(auditRoot, 'run-summary.json'), summary);
  console.log(JSON.stringify({ summary: path.join(auditRoot, 'run-summary.json'), counts: summary.counts }));
  return summary;
}

if (process.argv[1]?.toLowerCase().includes('run-final-legal-readiness')) {
  runFinalLegalReadiness().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
