import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST as analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { resolveContestacionRoutingFromSource } from '@/lib/legal-engine/documentRouting';
import { evaluateProvenanceIntegrityGate } from '@/lib/legal-engine/provenanceIntegrityGate';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type Phase2Case = {
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

type StageEvent = { stage: string; event: 'start' | 'complete' | 'error'; at: string; elapsedMs: number; error?: string };

export type Phase2CaseResult = {
  caseNumber: string;
  status: 'PASS_REVIEWABLE' | 'BLOCKED_REVIEW' | 'FAILED';
  startedAt: string;
  completedAt: string;
  totalMs: number;
  expected: { sourceDocumentType: string; matter: string; outputDocumentType: string };
  observed: { sourceDocumentType?: string; matter?: string; outputDocumentType?: string; documentFamily?: string; expediente?: string | null };
  source: { fileName: string; bytes: number; sha256: string; extractedChars: number; pageCount: number; validated: boolean; qualityStatus?: string };
  classification: { before: unknown; after: unknown; passed: boolean };
  grounding: unknown;
  provenanceIntegrityGate: unknown;
  routing: unknown;
  inspection: unknown;
  stages: StageEvent[];
  progressMessages: string[];
  errors: string[];
  warnings: string[];
  files: Record<string, string | null>;
};

const repoRoot = process.cwd();
const sourceAuditRoot = path.resolve(repoRoot, 'audit/final-legal-readiness-2026');
const phase2Root = path.resolve(repoRoot, 'audit/final-legal-readiness-2026-phase2');
const manifestPath = path.join(sourceAuditRoot, 'selected-cases.json');

function nowIso(): string { return new Date().toISOString(); }

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
}

function textFromDocument(document: UniversalLegalDocument): string {
  return (document.sections || []).flatMap((section) => (section.content || []).map((block) => block.text || '')).join('\n\n');
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function writeText(filePath: string, value: string): Promise<void> {
  await writeFile(filePath, value, 'utf8');
}

async function upload(source: Phase2Case): Promise<{ body: any; status: number }> {
  const buffer = await readFile(path.resolve(repoRoot, source.extractedSourcePath));
  const formData = new FormData();
  formData.append('file', new File([buffer], source.sourceFileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  const response = await analyzeUpload(new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: formData }));
  return { body: await response.json(), status: response.status };
}

function sourceDocumentFromAnalysis(source: Phase2Case, analysis: any) {
  return createSourceDocument({
    id: `phase2-${source.caseNumber}-${source.sourceFileName}`,
    filename: source.sourceFileName,
    extractedText: analysis.extractedText,
    pages: analysis.pages,
    sourceValidated: analysis.sourceValidated,
    sourceQualityStatus: analysis.sourceQualityStatus,
    qualityScore: analysis.qualityScore,
  });
}

async function runCase(source: Phase2Case): Promise<Phase2CaseResult> {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const caseRoot = path.join(phase2Root, 'cases', source.caseNumber);
  const evidenceRoot = path.join(caseRoot, 'evidence');
  const outputRoot = path.join(caseRoot, 'outputs');
  await mkdir(evidenceRoot, { recursive: true });
  await mkdir(outputRoot, { recursive: true });

  const stages: StageEvent[] = [];
  const progressMessages: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const stageStarted = new Map<string, number>();
  let analysis: any = null;
  let generated: UniversalLegalDocument | null = null;
  let routing: any = null;

  const start = (stage: string) => {
    stageStarted.set(stage, Date.now());
    stages.push({ stage, event: 'start', at: nowIso(), elapsedMs: Date.now() - startedMs });
  };
  const complete = (stage: string) => {
    stages.push({ stage, event: 'complete', at: nowIso(), elapsedMs: Date.now() - (stageStarted.get(stage) || startedMs) });
  };

  try {
    start('SOURCE');
    const uploaded = await upload(source);
    analysis = uploaded.body;
    await writeJson(path.join(evidenceRoot, 'analyze-upload-response.json'), analysis);
    if (uploaded.status !== 200 || !analysis?.sourceValidated) throw new Error(`ANALYZE_UPLOAD_FAILED status=${uploaded.status}`);
    const sourceDocument = sourceDocumentFromAnalysis(source, analysis);
    const grounding = buildSourceGrounding(sourceDocument);
    const classificationBefore = {
      sourceDocumentType: analysis.classification?.sourceDocumentType,
      matter: analysis.classification?.materia,
      documentType: analysis.classification?.documentType,
      confidence: analysis.classification?.confidence,
      sourceDriven: true,
    };
    await writeText(path.join(evidenceRoot, 'source-extracted.txt'), String(analysis.extractedText || ''));
    await writeJson(path.join(evidenceRoot, 'classification-before.json'), classificationBefore);
    await writeJson(path.join(evidenceRoot, 'source-grounding.json'), grounding);
    await writeJson(path.join(evidenceRoot, 'metadata.json'), {
      actor: null,
      defendant: null,
      authority: grounding.container.evidence,
      matter: grounding.container.matter,
      sourceDocumentType: grounding.container.documentType,
      outputDocumentType: null,
      expediente: grounding.caseMetadata.expediente,
      claims: grounding.caseClaims,
      facts: grounding.caseFacts,
      evidence: grounding.caseEvidence,
      jurisprudence: grounding.authoritySpans,
      precedentFacts: grounding.precedentFacts,
      precedentHoldings: grounding.precedentHoldings,
    });
    complete('SOURCE');

    if (grounding.container.documentType !== source.sourceDocumentType.replace('DEMANDA_FAMILIAR', 'DEMANDA_CIVIL')
      || grounding.container.matter !== source.matter) {
      throw new Error(`SOURCE_CLASSIFICATION_MISMATCH expected=${source.sourceDocumentType}/${source.matter} observed=${grounding.container.documentType}/${grounding.container.matter}`);
    }

    start('CLASSIFICATION');
    routing = resolveContestacionRoutingFromSource({
      sourceDocumentType: grounding.container.documentType,
      matter: grounding.container.matter,
      caseText: grounding.caseText,
    });
    complete('CLASSIFICATION');
    await writeJson(path.join(evidenceRoot, 'classification-after.json'), {
      sourceDocumentType: grounding.container.documentType,
      matter: grounding.container.matter,
      documentFamily: grounding.container.documentFamily,
      classificationIndependentOfOutput: true,
    });
    await writeJson(path.join(evidenceRoot, 'routing.json'), routing);
    if (routing.resolvedTemplate !== source.outputDocumentType) throw new Error(`ROUTING_MISMATCH expected=${source.outputDocumentType} observed=${routing.resolvedTemplate}`);

    start('GENERATION');
    generated = await runGenerationPipeline({
      flow: 'DOCUMENT_ANALYSIS',
      userInstruction: 'Redactar la contestación con base únicamente en la fuente cargada. No inventar hechos, partes, fechas, expedientes ni autoridades; conservar pendientes para revisión del abogado.',
      selectedDocumentType: routing.resolvedTemplate,
      matter: grounding.container.matter,
      sourceDocuments: [sourceDocument],
      traceOptions: { enabled: true, outputDir: evidenceRoot, writeMarkdown: true },
      generationId: `phase2-source-grounding-${source.caseNumber}`,
    }, {
      onStageStart: (stage) => start(stage),
      onStageComplete: (stage) => complete(stage),
      onError: (error, stage) => { const message = `${stage}: ${safeError(error)}`; errors.push(message); stages.push({ stage, event: 'error', at: nowIso(), elapsedMs: Date.now() - startedMs, error: message }); },
      onProgressMessage: (message) => progressMessages.push(message),
    });

    const generatedText = textFromDocument(generated);
    const reconstructedFacts = generated.caseAnalysis?.facts?.map((fact) => fact.text) || [];
    const precedentFactTexts = grounding.precedentFacts.map((fact) => fact.text);
    const contamination = {
      caseExpediente: generated.caseRefs?.expediente || null,
      caseExpedienteIsAuthority: Boolean(generated.caseRefs?.expediente && grounding.values.some((value) => value.value === generated?.caseRefs?.expediente && value.category === 'JURISPRUDENCE')),
      precedentFactsInCaseAnalysis: reconstructedFacts.filter((fact) => precedentFactTexts.some((precedent) => fact.toLowerCase().includes(precedent.toLowerCase()) || precedent.toLowerCase().includes(fact.toLowerCase()))),
      forbiddenCase04Phrase: source.caseNumber === '04' && /un hombre demand[oó] a su padre/i.test(generatedText),
      forbiddenExpedienteLabel: source.caseNumber === '04' && /EXPEDIENTE\s*:\s*2\/2022/i.test(generatedText),
    };
    await writeJson(path.join(evidenceRoot, 'generated-document.json'), generated);
    await writeText(path.join(evidenceRoot, 'generated-text.txt'), generatedText);
    await writeJson(path.join(evidenceRoot, 'case-analysis.json'), {
      parties: generated.parties,
      authorities: generated.caseAnalysis?.authorities || [],
      caseNumbers: generated.caseAnalysis?.caseNumbers || {},
      claims: generated.caseAnalysis?.claims || [],
      facts: reconstructedFacts,
      evidence: generated.caseAnalysis?.evidence || [],
      sourceGrounding: generated.caseAnalysis?.sourceGrounding || generated.generationMetadata.sourceGrounding || [],
    });
    const provenance = evaluateProvenanceIntegrityGate({
      sourceGrounding: generated.generationMetadata.sourceGrounding,
      caseRefs: generated.caseRefs,
      caseAnalysis: generated.caseAnalysis,
    });
    await writeJson(path.join(evidenceRoot, 'provenance-integrity-gate.json'), provenance);
    await writeJson(path.join(evidenceRoot, 'inspection.json'), {
      actor: generated.parties.actor || generated.parties.quejoso || null,
      defendant: generated.parties.demandado || null,
      authority: generated.parties.autoridadResponsable || generated.parties.autoridadDestinataria || null,
      matter: generated.matter,
      sourceDocumentType: generated.generationMetadata.routing?.sourceDocumentType || null,
      outputDocumentType: generated.documentType,
      expediente: generated.caseRefs?.expediente || null,
      claims: generated.caseAnalysis?.claims || [],
      facts: reconstructedFacts,
      evidence: generated.caseAnalysis?.evidence || [],
      jurisprudence: grounding.authoritySpans,
      contamination,
    });
    await writeJson(path.join(evidenceRoot, 'generation-trace.json'), generated.generationMetadata.auditTrace || generated.generationMetadata.trace || []);
    if (contamination.caseExpedienteIsAuthority || contamination.precedentFactsInCaseAnalysis.length || contamination.forbiddenCase04Phrase || contamination.forbiddenExpedienteLabel) {
      throw new Error(`PROVENANCE_CONTAMINATION ${JSON.stringify(contamination)}`);
    }
    complete('GENERATION');

    const docxPath = path.join(outputRoot, `caso-${source.caseNumber}-contestacion-DRAFT.docx`);
    const pdfPath = path.join(outputRoot, `caso-${source.caseNumber}-contestacion-DRAFT.pdf`);
    await writeFile(docxPath, await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'DRAFT' }));
    await writeFile(pdfPath, await exportUniversalToPdf(generated, undefined, { exportMode: 'DRAFT' }));
    let finalDocxBlock = '';
    let finalPdfBlock = '';
    try { await exportUniversalToDocx(generated, undefined, generated.generationMetadata.auditTrace, { exportMode: 'FINAL' }); finalDocxBlock = 'FINAL_EXPORT_ALLOWED'; } catch (error) { finalDocxBlock = safeError(error); }
    try { await exportUniversalToPdf(generated, undefined, { exportMode: 'FINAL' }); finalPdfBlock = 'FINAL_EXPORT_ALLOWED'; } catch (error) { finalPdfBlock = safeError(error); }
    await writeJson(path.join(evidenceRoot, 'gates.json'), {
      provenance,
      finalDocxBlock,
      finalPdfBlock,
      draftExported: true,
      finalBlockedByProvenance: provenance.status !== 'PASS' && finalDocxBlock !== 'FINAL_EXPORT_ALLOWED' && finalPdfBlock !== 'FINAL_EXPORT_ALLOWED',
      lifecycle: generated.lifecycle || null,
      validation: generated.validation || null,
    });
    const result: Phase2CaseResult = {
      caseNumber: source.caseNumber,
      status: finalDocxBlock === 'FINAL_EXPORT_ALLOWED' || finalPdfBlock === 'FINAL_EXPORT_ALLOWED' ? 'BLOCKED_REVIEW' : 'PASS_REVIEWABLE',
      startedAt,
      completedAt: nowIso(),
      totalMs: Date.now() - startedMs,
      expected: { sourceDocumentType: source.sourceDocumentType.replace('DEMANDA_FAMILIAR', 'DEMANDA_CIVIL'), matter: source.matter, outputDocumentType: source.outputDocumentType },
      observed: { sourceDocumentType: grounding.container.documentType, matter: grounding.container.matter, outputDocumentType: generated.documentType, documentFamily: grounding.container.documentFamily, expediente: generated.caseRefs?.expediente || null },
      source: { fileName: source.sourceFileName, bytes: source.sourceBytes, sha256: source.sourceSha256, extractedChars: String(analysis.extractedText || '').length, pageCount: analysis.pages?.length || 0, validated: Boolean(analysis.sourceValidated), qualityStatus: analysis.sourceQualityStatus },
      classification: { before: classificationBefore, after: grounding.container, passed: true },
      grounding,
      provenanceIntegrityGate: provenance,
      routing,
      inspection: { generatedDocumentStatus: generated.status, finalDocxBlock, finalPdfBlock },
      stages,
      progressMessages,
      errors,
      warnings,
      files: { source: source.extractedSourcePath, analysis: path.join(evidenceRoot, 'analyze-upload-response.json'), grounding: path.join(evidenceRoot, 'source-grounding.json'), classificationBefore: path.join(evidenceRoot, 'classification-before.json'), classificationAfter: path.join(evidenceRoot, 'classification-after.json'), routing: path.join(evidenceRoot, 'routing.json'), caseAnalysis: path.join(evidenceRoot, 'case-analysis.json'), generatedDocument: path.join(evidenceRoot, 'generated-document.json'), generatedText: path.join(evidenceRoot, 'generated-text.txt'), gate: path.join(evidenceRoot, 'provenance-integrity-gate.json'), gates: path.join(evidenceRoot, 'gates.json'), docx: docxPath, pdf: pdfPath },
    };
    await writeJson(path.join(evidenceRoot, 'case-result.json'), result);
    return result;
  } catch (error) {
    const message = safeError(error);
    errors.push(message);
    await writeJson(path.join(evidenceRoot, 'error-detail.json'), { message, stack: error instanceof Error ? error.stack : null });
    const failed: Phase2CaseResult = {
      caseNumber: source.caseNumber,
      status: 'FAILED',
      startedAt,
      completedAt: nowIso(),
      totalMs: Date.now() - startedMs,
      expected: { sourceDocumentType: source.sourceDocumentType.replace('DEMANDA_FAMILIAR', 'DEMANDA_CIVIL'), matter: source.matter, outputDocumentType: source.outputDocumentType },
      observed: { sourceDocumentType: analysis?.classification?.sourceDocumentType, matter: analysis?.classification?.materia, outputDocumentType: generated?.documentType },
      source: { fileName: source.sourceFileName, bytes: source.sourceBytes, sha256: source.sourceSha256, extractedChars: String(analysis?.extractedText || '').length, pageCount: analysis?.pages?.length || 0, validated: Boolean(analysis?.sourceValidated), qualityStatus: analysis?.sourceQualityStatus },
      classification: { before: analysis?.classification || null, after: null, passed: false },
      grounding: analysis?.sourceGrounding || null,
      provenanceIntegrityGate: null,
      routing,
      inspection: null,
      stages,
      progressMessages,
      errors,
      warnings,
      files: { source: source.extractedSourcePath, analysis: analysis ? path.join(evidenceRoot, 'analyze-upload-response.json') : null, error: path.join(evidenceRoot, 'error-detail.json'), docx: null, pdf: null },
    };
    await writeJson(path.join(evidenceRoot, 'case-result.json'), failed);
    return failed;
  }
}

export async function runPhase2SourceGrounding(): Promise<unknown> {
  process.env.DEMO_MODE_ENABLED = 'true';
  process.env.NVIDIA_API_KEY = '';
  process.env.NVIDIA_REAL_TEST = 'false';
  process.env.GEMINI_API_KEY = '';
  process.env.GROQ_API_KEY = '';
  process.env.OPENROUTER_API_KEY = '';
  await mkdir(phase2Root, { recursive: true });
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { cases: Phase2Case[] };
  const cases = manifest.cases;
  const results: Phase2CaseResult[] = [];
  for (const source of cases.sort((left, right) => left.caseNumber.localeCompare(right.caseNumber))) {
    const result = await runCase(source);
    results.push(result);
    console.log(JSON.stringify({ caseNumber: result.caseNumber, status: result.status, totalMs: result.totalMs, errors: result.errors }));
  }
  const summary = {
    generatedAt: nowIso(),
    sourceAuditRoot,
    phase2Root,
    productionDatabaseExcluded: true,
    testBankZip: 'C:\\Users\\yahir\\Desktop\\Datos.zip',
    counts: { total: results.length, passReviewable: results.filter((result) => result.status === 'PASS_REVIEWABLE').length, blockedReview: results.filter((result) => result.status === 'BLOCKED_REVIEW').length, failed: results.filter((result) => result.status === 'FAILED').length, docx: results.filter((result) => result.files.docx).length, pdf: results.filter((result) => result.files.pdf).length },
    results,
  };
  await writeJson(path.join(phase2Root, 'run-summary.json'), summary);
  return summary;
}

if (process.argv[1]?.toLowerCase().includes('run-phase2-source-grounding')) {
  runPhase2SourceGrounding().catch((error) => { console.error(safeError(error)); process.exitCode = 1; });
}
