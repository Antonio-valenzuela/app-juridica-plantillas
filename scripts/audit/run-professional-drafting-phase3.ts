import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { POST as analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import type { DraftDepth } from '@/lib/legal-engine/draftDepth';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type AuditCase = {
  caseNumber: string;
  sourceEntry: string;
  extractedSourcePath: string;
  sourceSha256: string;
  sourceBytes: number;
  matter: string;
  sourceDocumentType: string;
  outputDocumentType: string;
  sourceFileName: string;
};

type RunResult = {
  caseNumber: string;
  sourceEntry: string;
  sourceSha256: string;
  draftDepth: DraftDepth;
  status: 'EXPORTED_REVIEW_DRAFT' | 'FAILED';
  startedAt: string;
  completedAt: string;
  totalMs: number;
  source: Record<string, unknown>;
  pipeline: Record<string, unknown>;
  coverage: Record<string, unknown>;
  quality: Record<string, unknown> | null;
  exports: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  files: Record<string, string | null>;
};

const repoRoot = process.cwd();
const phase4Audit = process.env.PHASE4_AUDIT === 'true';
const phase4Attempt = process.env.PHASE4_AUDIT_ATTEMPT || '';
if (phase4Attempt && !/^attempt-\d{2}$/.test(phase4Attempt)) throw new Error('INVALID_PHASE4_AUDIT_ATTEMPT');
const auditBaseRoot = path.resolve(repoRoot, phase4Audit
  ? path.join('audit/autonomous-legal-drafting-phase4', phase4Attempt)
  : 'audit/professional-drafting-phase3');

export async function createIsolatedAuditRoot(baseRoot = auditBaseRoot): Promise<string> {
  const runsRoot = path.join(baseRoot, 'runs');
  await mkdir(runsRoot, { recursive: true });
  return mkdtemp(path.join(runsRoot, 'run-'));
}
const manifestPath = path.resolve(repoRoot, 'audit/final-legal-readiness-2026/selected-cases.json');
const DEPTHS: DraftDepth[] = phase4Audit
  ? ['EXTENSIVE_40', 'PROFESSIONAL_20']
  : ['PROFESSIONAL_20', 'EXTENSIVE_40'];

export function buildAuditRunOrder(caseNumbers: readonly string[], depthFirst = false): Array<[string, DraftDepth]> {
  const depths: DraftDepth[] = depthFirst
    ? ['EXTENSIVE_40', 'PROFESSIONAL_20']
    : ['PROFESSIONAL_20', 'EXTENSIVE_40'];
  return depthFirst
    ? depths.flatMap((depth) => caseNumbers.map((caseNumber) => [caseNumber, depth] as [string, DraftDepth]))
    : caseNumbers.flatMap((caseNumber) => depths.map((depth) => [caseNumber, depth] as [string, DraftDepth]));
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
}

function words(text: string): number {
  return text.match(/[\p{L}\p{N}]+/gu)?.length || 0;
}

function documentText(document: UniversalLegalDocument): string {
  return document.sections.flatMap((section) => section.content.map((block) => block.text || '')).join('\n\n');
}

function countByStatus(items: Array<{ status: string; required?: boolean }>): Record<string, number> {
  return items.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    if (item.required) result.required = (result.required || 0) + 1;
    return result;
  }, {});
}

function countPattern(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readPdfPages(filePath: string): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(await readFile(filePath)) });
  try {
    const parsed = await parser.getText();
    return parsed.pages.map((page) => page.text || '');
  } finally {
    await parser.destroy();
  }
}

async function analyzeSource(source: AuditCase): Promise<{ response: any; status: number }> {
  const bytes = await readFile(source.extractedSourcePath);
  const form = new FormData();
  form.append('file', new File([bytes], source.sourceFileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  const request = new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: form });
  const response = await analyzeUpload(request);
  return { response: await response.json(), status: response.status };
}

async function runDepth(
  source: AuditCase,
  analysis: any,
  sourceText: string,
  depth: DraftDepth,
  auditRoot: string,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const stages: Array<Record<string, unknown>> = [];
  const stageStarts = new Map<string, number>();
  const runRoot = path.join(auditRoot, 'cases', source.caseNumber, depth);
  const evidenceRoot = path.join(runRoot, 'evidence');
  const outputRoot = path.join(runRoot, 'outputs');
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  let generated: UniversalLegalDocument | null = null;
  let providerTrace: unknown;
  let docxPath: string | null = null;
  let pdfPath: string | null = null;
  let docxHash: string | null = null;
  let pdfHash: string | null = null;
  let docxBytes = 0;
  let pdfBytes = 0;
  let pdfPages: string[] = [];
  let finalDocxBlock = 'NOT_TESTED';
  let finalPdfBlock = 'NOT_TESTED';
  let quality: Record<string, unknown> | null = null;

  try {
    const sourceDocument = createSourceDocument({
      id: `phase3-${source.caseNumber}-${depth}`,
      filename: source.sourceFileName,
      extractedText: analysis.extractedText,
      pages: analysis.pages,
      sourceValidated: analysis.sourceValidated,
      sourceQualityStatus: analysis.sourceQualityStatus,
      qualityScore: analysis.qualityScore,
      classification: { sourceDocumentType: source.sourceDocumentType },
    } as any);
    await writeJson(path.join(evidenceRoot, 'generation-request-summary.json'), {
      flow: 'DOCUMENT_ANALYSIS',
      sourceFileName: source.sourceFileName,
      sourceSha256: source.sourceSha256,
      sourceValidated: Boolean(analysis.sourceValidated),
      draftDepth: depth,
      writesToPrisma: false,
      productionDatabaseUsed: false,
      userInstruction: 'Generar un borrador de contestación estrictamente sujeto al expediente. No inferir posturas del abogado; dejar pendientes los datos no confirmados.',
    });

    generated = await runGenerationPipeline({
      flow: 'DOCUMENT_ANALYSIS',
      draftDepth: depth,
      externalProviderOptIn: process.env.RUN_LIVE_PROVIDER_TESTS === 'true',
      userInstruction: 'Generar un borrador de contestación sujeto al documento fuente. Usar solo hechos y posturas confirmados; dejar los datos y decisiones no confirmados para revisión del abogado.',
      selectedDocumentType: source.outputDocumentType,
      documentTypeLabel: `Contestación ${source.matter.toLowerCase()}`,
      matter: source.matter,
      sourceDocuments: [sourceDocument],
      traceOptions: { enabled: true, outputDir: evidenceRoot, writeMarkdown: true },
      generationId: `professional-drafting-phase3-${source.caseNumber}-${depth}`,
    }, {
      onStageStart: (stage: string) => {
        stageStarts.set(stage, Date.now());
        stages.push({ stage, event: 'start', at: new Date().toISOString() });
      },
      onStageComplete: (stage: string) => {
        stages.push({ stage, event: 'complete', at: new Date().toISOString(), elapsedMs: Date.now() - (stageStarts.get(stage) || start) });
      },
      onError: (error: unknown, stage: string) => errors.push(`${stage}: ${safeError(error)}`),
      onProgressMessage: (message: string) => stages.push({ event: 'progress', message, at: new Date().toISOString() }),
      onTraceReady: (trace: unknown) => { providerTrace = trace; },
    } as any);

    const generatedText = documentText(generated);
    await writeJson(path.join(evidenceRoot, 'generated-document.json'), generated);
    await writeFile(path.join(evidenceRoot, 'generated-text.txt'), generatedText, 'utf8');
    if (providerTrace) await writeJson(path.join(evidenceRoot, 'generation-trace.json'), providerTrace);

    docxPath = path.join(outputRoot, `caso-${source.caseNumber}-${depth}-DRAFT.docx`);
    pdfPath = path.join(outputRoot, `caso-${source.caseNumber}-${depth}-DRAFT.pdf`);
    const docx = await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'DRAFT' });
    const pdf = await exportUniversalToPdf(generated, undefined, { exportMode: 'DRAFT' });
    await writeFile(docxPath, docx);
    await writeFile(pdfPath, pdf);
    docxBytes = docx.byteLength;
    pdfBytes = pdf.byteLength;
    docxHash = sha256(docx);
    pdfHash = sha256(pdf);
    pdfPages = await readPdfPages(pdfPath);

    try {
      await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'FINAL' });
      finalDocxBlock = 'FINAL_EXPORT_ALLOWED';
      warnings.push('El gate permitió una exportación DOCX FINAL sin revisión explícita.');
    } catch (error) {
      finalDocxBlock = safeError(error);
    }
    try {
      await exportUniversalToPdf(generated, undefined, { exportMode: 'FINAL' });
      finalPdfBlock = 'FINAL_EXPORT_ALLOWED';
      warnings.push('El gate permitió una exportación PDF FINAL sin revisión explícita.');
    } catch (error) {
      finalPdfBlock = safeError(error);
    }

    const coverageItems = generated.coverageMatrix?.items || [];
    const requiredCoverage = coverageItems.filter((item) => item.required);
    const covered = (status: string) => requiredCoverage.filter((item) => item.status === status).length;
    const factMatrix = generated.generationMetadata.factResponseMatrix;
    const factRows = factMatrix?.rows || [];
    const pendingAttorneyFacts = factRows.filter((row) => row.positionStatus === 'PENDING').length;
    const blocks = generated.sections.flatMap((section) => section.content || []);
    const verifiedAuthorityIds = new Set(blocks.flatMap((block) => block.verifiedAuthorityIds || []));
    const coherenceErrors = (generated.validation?.errors || []).filter((item: any) => /COHERENCE|CONSISTENCY|CONTRADICTION/i.test(`${item.code || ''} ${item.message || ''}`)).length;
    const provenanceGate = generated.generationMetadata.provenanceIntegrityGate as any;
    const provenanceErrors = Array.isArray(provenanceGate?.errors) ? provenanceGate.errors.length : 0;
    const requiredFacts = requiredCoverage.filter((item) => /FACT|HECHO/i.test(`${item.category} ${item.description}`));
    const requiredClaims = requiredCoverage.filter((item) => /CLAIM|PRETENSION|PRESTACION/i.test(`${item.category} ${item.description}`));
    const requiredEvidence = requiredCoverage.filter((item) => /EVIDENCE|PRUEBA/i.test(`${item.category} ${item.description}`));
    const requiredSections = new Set(requiredCoverage.flatMap((item) => item.targetSectionIds || []));
    const renderedSections = new Set(generated.sections.filter((section) => section.content.some((block) => block.text.trim())).map((section) => section.id));
    const sectionCoverage = requiredSections.size === 0 ? 0 : Array.from(requiredSections).filter((id) => renderedSections.has(id)).length / requiredSections.size;
    const rawStopReason = generated.generationMetadata.draftContentStopReason;
    const qualityStopReason = rawStopReason === 'CONTENT_LIMIT_REACHED'
      || rawStopReason === 'COVERAGE_COMPLETE'
      || rawStopReason === 'TARGET_REACHED'
      ? rawStopReason
      : null;
    quality = evaluateProfessionalDraftQuality({
      draftDepth: depth,
      renderedPages: pdfPages,
      sourceTexts: [sourceText],
      contentStopReason: qualityStopReason,
      unresolvedAttorneyQuestions: pendingAttorneyFacts,
      verifiedAuthorityCount: (generated.generationMetadata.legalDocumentPlan?.verifiedAuthorityIds || []).length,
      appliedAuthorityCount: verifiedAuthorityIds.size,
      factsCovered: requiredFacts.filter((item) => item.status === 'covered').length,
      factsRequired: requiredFacts.length,
      claimsCovered: requiredClaims.filter((item) => item.status === 'covered').length,
      claimsRequired: requiredClaims.length,
      evidenceCoverage: requiredEvidence.length === 0 ? 0 : covered('covered') / requiredEvidence.length,
      sectionCoverage,
      coherenceErrors,
      provenanceErrors,
    }) as unknown as Record<string, unknown>;

    const result: RunResult = {
      caseNumber: source.caseNumber,
      sourceEntry: source.sourceEntry,
      sourceSha256: source.sourceSha256,
      draftDepth: depth,
      status: docxBytes > 0 && pdfBytes > 0 ? 'EXPORTED_REVIEW_DRAFT' : 'FAILED',
      startedAt,
      completedAt: new Date().toISOString(),
      totalMs: Date.now() - start,
      source: {
        sourceFileName: source.sourceFileName,
        sourceBytes: source.sourceBytes,
        sourceSha256: source.sourceSha256,
        sourceValidated: Boolean(analysis.sourceValidated),
        sourceQualityStatus: analysis.sourceQualityStatus,
        extractionChars: String(analysis.extractedText || '').length,
        extractedPageCount: Array.isArray(analysis.pages) ? analysis.pages.length : 0,
        analysisHttpStatus: 200,
      },
      pipeline: {
        status: generated.status,
        readiness: (generated.generationMetadata as any).readiness || null,
        aiUsed: Boolean(generated.generationMetadata.aiUsed),
        aiProvider: generated.generationMetadata.aiProvider || null,
        aiModel: generated.generationMetadata.aiModel || null,
        generationTimeMs: generated.generationMetadata.generationTimeMs || 0,
        contentStopReason: generated.generationMetadata.draftContentStopReason || null,
        stageEvents: stages,
        warningCodes: (generated.validation?.warnings || []).map((item: any) => item.code || item.message),
        sourceGroundingStatus: (generated.generationMetadata.sourceGrounding || []).map((item: any) => item.status),
        providerTracePath: providerTrace ? path.join(evidenceRoot, 'generation-trace.json') : null,
      },
      coverage: {
        requiredItems: requiredCoverage.length,
        byStatus: countByStatus(coverageItems),
        requiredFactItems: requiredFacts.length,
        factItemsCovered: requiredFacts.filter((item) => item.status === 'covered').length,
        requiredClaimItems: requiredClaims.length,
        claimItemsCovered: requiredClaims.filter((item) => item.status === 'covered').length,
        requiredEvidenceItems: requiredEvidence.length,
        evidenceItemsCovered: requiredEvidence.filter((item) => item.status === 'covered').length,
        attorneyFactPositionsPending: pendingAttorneyFacts,
        legalIssueCount: generated.legalIssueMatrix?.issues.length || 0,
        unresolvedAuthorityIds: generated.generationMetadata.legalDocumentPlan?.unresolvedAuthorityIds || [],
        renderedSectionCount: renderedSections.size,
        requiredSectionCount: requiredSections.size,
      },
      quality,
      exports: {
        docxBytes,
        docxSha256: docxHash,
        pdfBytes,
        pdfSha256: pdfHash,
        actualPdfPages: pdfPages.length,
        pdfWords: words(pdfPages.join('\n')),
        placeholderCount: countPattern(pdfPages.join('\n'), /\[[^\]\r\n]{2,100}\]/g),
        finalDocxBlock,
        finalPdfBlock,
        formatWarnings: pdfPages.some((page) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(page)) ? ['Control characters found in parsed PDF text.'] : [],
      },
      errors,
      warnings,
      files: {
        docx: docxPath,
        pdf: pdfPath,
        generatedDocument: path.join(evidenceRoot, 'generated-document.json'),
        generatedText: path.join(evidenceRoot, 'generated-text.txt'),
        trace: providerTrace ? path.join(evidenceRoot, 'generation-trace.json') : null,
        result: path.join(evidenceRoot, 'run-result.json'),
      },
    };
    await writeJson(path.join(evidenceRoot, 'run-result.json'), result);
    return result;
  } catch (error) {
    const message = safeError(error);
    errors.push(message);
    if (generated) await writeJson(path.join(evidenceRoot, 'generated-document.json'), generated);
    const result: RunResult = {
      caseNumber: source.caseNumber,
      sourceEntry: source.sourceEntry,
      sourceSha256: source.sourceSha256,
      draftDepth: depth,
      status: 'FAILED',
      startedAt,
      completedAt: new Date().toISOString(),
      totalMs: Date.now() - start,
      source: {
        sourceFileName: source.sourceFileName,
        sourceBytes: source.sourceBytes,
        sourceSha256: source.sourceSha256,
        sourceValidated: Boolean(analysis.sourceValidated),
        extractionChars: String(analysis.extractedText || '').length,
      },
      pipeline: { status: generated?.status || 'FAILED', stageEvents: stages },
      coverage: {},
      quality,
      exports: { docxBytes, docxSha256: docxHash, pdfBytes, pdfSha256: pdfHash, actualPdfPages: pdfPages.length, finalDocxBlock, finalPdfBlock },
      errors,
      warnings,
      files: {
        docx: docxPath,
        pdf: pdfPath,
        trace: providerTrace ? path.join(evidenceRoot, 'generation-trace.json') : null,
        result: path.join(evidenceRoot, 'run-result.json'),
      },
    };
    await writeJson(path.join(evidenceRoot, 'run-result.json'), result);
    return result;
  }
}

export async function runProfessionalDraftingPhase3(): Promise<Record<string, unknown>> {
  const auditRoot = await createIsolatedAuditRoot();
  const useConfiguredProviders = process.env.PHASE3_USE_CONFIGURED_PROVIDERS === 'true';
  process.env.DEMO_MODE_ENABLED = 'true';
  if (!useConfiguredProviders) {
    for (const key of ['NVIDIA_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY']) process.env[key] = '';
    process.env.NVIDIA_REAL_TEST = 'false';
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { testBankZip?: string; productionDatabaseExcluded?: boolean; cases: AuditCase[] };
  if (manifest.productionDatabaseExcluded !== true) throw new Error('El manifiesto no acredita la exclusión de la base productiva.');
  const selected = manifest.cases.slice().sort((left, right) => left.caseNumber.localeCompare(right.caseNumber));
  if (selected.length !== 6 || new Set(selected.map((entry) => entry.sourceSha256)).size !== 6) {
    throw new Error('La selección debe contener exactamente seis fuentes distintas.');
  }

  const results: RunResult[] = [];
  const prepared = new Map<string, { source: AuditCase; sourceText: string; analysis: Awaited<ReturnType<typeof analyzeSource>> }>();
  for (const source of selected) {
    const actualBytes = await readFile(source.extractedSourcePath);
    if (sha256(actualBytes) !== source.sourceSha256 || actualBytes.byteLength !== source.sourceBytes) {
      throw new Error(`SOURCE_HASH_MISMATCH:${source.caseNumber}`);
    }
    const sourceRoot = path.join(auditRoot, 'cases', source.caseNumber, 'source');
    await mkdir(sourceRoot, { recursive: true });
    const sourceTextResult = await mammoth.extractRawText({ buffer: actualBytes });
    await writeFile(path.join(sourceRoot, 'extracted-source.txt'), sourceTextResult.value, 'utf8');
    const analysis = await analyzeSource(source);
    await writeJson(path.join(sourceRoot, 'analyze-upload-response.json'), analysis.response);
    prepared.set(source.caseNumber, { source, sourceText: sourceTextResult.value, analysis });
  }
  for (const [caseNumber, depth] of buildAuditRunOrder(selected.map((source) => source.caseNumber), phase4Audit)) {
    const item = prepared.get(caseNumber);
    if (!item) throw new Error(`AUDIT_CASE_NOT_PREPARED:${caseNumber}`);
    const { source, sourceText, analysis } = item;
    if (analysis.status !== 200 || !analysis.response?.ok || !analysis.response?.sourceValidated) {
      const failed = await runDepth(source, { ...(analysis.response || {}), analysisError: analysis.status }, sourceText, depth, auditRoot);
      failed.status = 'FAILED';
      failed.errors.push(`ANALYZE_UPLOAD_FAILED:${analysis.status}:${analysis.response?.error || 'source not validated'}`);
      if (failed.files.result) await writeJson(failed.files.result, failed);
      results.push(failed);
      continue;
    }
    const result = await runDepth(source, analysis.response, sourceText, depth, auditRoot);
    results.push(result);
    console.log(JSON.stringify({ caseNumber: result.caseNumber, draftDepth: result.draftDepth, status: result.status, totalMs: result.totalMs, pages: result.exports.actualPdfPages, qualityGate: (result.quality as any)?.qualityGate, files: result.files }));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    testBank: manifest.testBankZip || 'C:\\Users\\yahir\\Desktop\\Datos.zip',
    productionDatabaseExcluded: true,
    writesToPrisma: false,
    providerPolicy: useConfiguredProviders ? 'EXPLICITLY_CONFIGURED' : 'CREDENTIALS_SUPPRESSED_LOCAL_FALLBACK_ONLY',
    requestedCaseCount: selected.length,
    requestedDepths: DEPTHS,
    expectedRunCount: 12,
    counts: {
      total: results.length,
      exportedReviewDrafts: results.filter((result) => result.status === 'EXPORTED_REVIEW_DRAFT').length,
      failed: results.filter((result) => result.status === 'FAILED').length,
      docx: results.filter((result) => Number(result.exports.docxBytes) > 0).length,
      pdf: results.filter((result) => Number(result.exports.pdfBytes) > 0).length,
      qualityPass: results.filter((result) => (result.quality as any)?.qualityGate === 'PASS').length,
      qualityReviewRequired: results.filter((result) => (result.quality as any)?.qualityGate === 'REVIEW_REQUIRED').length,
      qualityFail: results.filter((result) => (result.quality as any)?.qualityGate === 'FAIL').length,
    },
    results,
  };
  await writeJson(path.join(auditRoot, 'run-summary.json'), summary);
  console.log(JSON.stringify({ summary: path.join(auditRoot, 'run-summary.json'), counts: summary.counts }));
  return summary;
}

export async function runSingleCaseDepth(caseNumber: string, depth: DraftDepth): Promise<RunResult> {
  const auditRoot = await createIsolatedAuditRoot();
  const useConfiguredProviders = process.env.PHASE3_USE_CONFIGURED_PROVIDERS === 'true';
  process.env.DEMO_MODE_ENABLED = 'true';
  if (!useConfiguredProviders) {
    for (const key of ['NVIDIA_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY']) process.env[key] = '';
    process.env.NVIDIA_REAL_TEST = 'false';
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { testBankZip?: string; productionDatabaseExcluded?: boolean; cases: AuditCase[] };
  const source = manifest.cases.find((c) => c.caseNumber === caseNumber);
  if (!source) throw new Error(`Case ${caseNumber} not found in manifest`);

  const actualBytes = await readFile(source.extractedSourcePath);
  if (sha256(actualBytes) !== source.sourceSha256 || actualBytes.byteLength !== source.sourceBytes) {
    throw new Error(`SOURCE_HASH_MISMATCH:${source.caseNumber}`);
  }
  const sourceRoot = path.join(auditRoot, 'cases', source.caseNumber, 'source');
  await mkdir(sourceRoot, { recursive: true });
  const sourceTextResult = await mammoth.extractRawText({ buffer: actualBytes });
  await writeFile(path.join(sourceRoot, 'extracted-source.txt'), sourceTextResult.value, 'utf8');
  const analysis = await analyzeSource(source);
  await writeJson(path.join(sourceRoot, 'analyze-upload-response.json'), analysis.response);

  return runDepth(source, analysis.response, sourceTextResult.value, depth, auditRoot);
}

if (process.argv[1]?.toLowerCase().includes('run-professional-drafting-phase3')) {
  runProfessionalDraftingPhase3().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
