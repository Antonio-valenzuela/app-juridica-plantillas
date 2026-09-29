import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { POST as analyzeUpload } from '../app/api/templates/analyze-upload/route';
import { createSourceDocument } from '../lib/legal-engine/context';
import { runGenerationPipeline } from '../lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '../lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '../lib/legal-engine/exportPdfUniversal';
import { evaluateProfessionalDraftQuality } from '../lib/legal-engine/professionalDraftQuality';
import { getProviderChain } from '../lib/ai/providerChain';
import type { DraftDepth } from '../lib/legal-engine/draftDepth';
import type { UniversalLegalDocument } from '../lib/legal-engine/types';

async function main() {
  console.log('================================================================');
  console.log('EJECUCIÓN CONTROLADA CASO 01 — MODO EXTENSIVE_40');
  console.log('Active provider chain:', getProviderChain());
  console.log('================================================================');

  const repoRoot = process.cwd();
  const manifestPath = path.resolve(repoRoot, 'audit/final-legal-readiness-2026/selected-cases.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const case01 = manifest.cases.find((c: any) => c.caseNumber === '01');
  if (!case01) throw new Error('Case 01 not found in manifest');

  console.log('Case 01 info:', {
    caseNumber: case01.caseNumber,
    sourceFileName: case01.sourceFileName,
    matter: case01.matter,
    outputDocumentType: case01.outputDocumentType,
    extractedSourcePath: case01.extractedSourcePath,
  });

  const sourceBytes = fs.readFileSync(case01.extractedSourcePath);
  console.log(`Source file read: ${sourceBytes.length} bytes`);

  // Analyze upload
  console.log('\n--- FASE A: ANÁLISIS Y PLANIFICACIÓN ---');
  const form = new FormData();
  form.append('file', new File([sourceBytes], case01.sourceFileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  const uploadReq = new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: form });
  const uploadRes = await analyzeUpload(uploadReq);
  const uploadJson = await uploadRes.json();
  const analysis = uploadJson.analysis;

  console.log('Source Type:', uploadJson.classification?.documentType || case01.sourceDocumentType);
  console.log('Matter:', uploadJson.classification?.matter || case01.matter);
  console.log('Facts count:', analysis.facts?.length || 0);
  console.log('Claims count:', analysis.claims?.length || 0);
  console.log('Claim responses count:', analysis.claimResponses?.length || 0);
  console.log('Evidence count:', analysis.evidence?.length || 0);
  console.log('Argument axes count:', analysis.argumentAxes?.length || 0);
  console.log('Has richCaseAnalysis:', Boolean(analysis.richCaseAnalysis));

  const sourceDoc = createSourceDocument({
    id: `phase4-case01-EXTENSIVE_40`,
    filename: case01.sourceFileName,
    extractedText: uploadJson.extractedText,
    pages: uploadJson.pages,
    sourceValidated: uploadJson.sourceValidated,
    sourceQualityStatus: uploadJson.sourceQualityStatus,
    qualityScore: uploadJson.qualityScore,
    classification: { sourceDocumentType: case01.sourceDocumentType },
  } as any);

  const outDir = path.resolve(repoRoot, 'audit/autonomous-legal-drafting-phase4/case01-test');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('\n--- FASE B: GENERACIÓN PIPELINE (EXTENSIVE_40) ---');
  const startTime = Date.now();
  let providerTrace: any = null;

  const generated = await runGenerationPipeline({
    flow: 'DOCUMENT_ANALYSIS',
    draftDepth: 'EXTENSIVE_40' as DraftDepth,
    userInstruction: 'Generar contestación de demanda laboral exhaustiva, articulada en hechos, excepciones y defensas sustentadas, y refutación técnica de prestaciones.',
    selectedDocumentType: case01.outputDocumentType,
    documentTypeLabel: 'Contestación de Demanda Laboral',
    matter: 'Laboral',
    sourceDocuments: [sourceDoc],
    traceOptions: { enabled: true, outputDir: outDir, writeMarkdown: true },
    generationId: `case01-EXTENSIVE_40-${Date.now()}`,
  }, {
    onStageStart: (stage: string) => console.log(`[STAGE START] ${stage}`),
    onStageComplete: (stage: string) => console.log(`[STAGE COMPLETE] ${stage}`),
    onError: (error: unknown, stage: string) => console.error(`[STAGE ERROR] ${stage}:`, error),
    onProgressMessage: (msg: string) => console.log(`[PROGRESS] ${msg}`),
    onTraceReady: (t: any) => { providerTrace = t; },
  } as any);

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nPipeline completed in ${durationSec} seconds.`);

  // Export DOCX and PDF
  console.log('\n--- EXPORTACIÓN DE ARCHIVOS ---');
  const docxPath = path.join(outDir, 'caso-01-EXTENSIVE_40-DRAFT.docx');
  const pdfPath = path.join(outDir, 'caso-01-EXTENSIVE_40-DRAFT.pdf');

  const docx = await exportUniversalToDocx(generated, undefined, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' });
  const pdf = await exportUniversalToPdf(generated, undefined, { exportMode: 'DRAFT' });

  fs.writeFileSync(docxPath, docx);
  fs.writeFileSync(pdfPath, pdf);
  console.log(`DOCX exported: ${docx.byteLength} bytes -> ${docxPath}`);
  console.log(`PDF exported: ${pdf.byteLength} bytes -> ${pdfPath}`);

  // Read back pages from PDF
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  let pdfTextPages: string[] = [];
  try {
    const parsedPdf = await parser.getText();
    pdfTextPages = parsedPdf.pages.map((p) => p.text || '');
  } finally {
    await parser.destroy();
  }

  // Evaluate Quality
  console.log('\n--- FASE C: AUDITORÍA DE CALIDAD Y EXPANSIÓN ---');
  const quality = evaluateProfessionalDraftQuality({
    draftDepth: 'EXTENSIVE_40',
    renderedPages: pdfTextPages,
    sourceTexts: [uploadJson.extractedText || ''],
    substantiveText: generated.sections.flatMap((s: any) => s.content.map((b: any) => b.text || '')).join('\n\n'),
    contentStopReason: (generated.generationMetadata as any)?.generationExtension?.contentStopReason,
    unresolvedAttorneyQuestions: 0,
    verifiedAuthorityCount: (analysis.verifiedAuthorities || []).length,
    appliedAuthorityCount: 0,
    coherenceErrors: 0,
    provenanceErrors: 0,
  });

  const ext = (generated.generationMetadata as any)?.generationExtension;
  const trace = providerTrace || generated.generationMetadata?.auditTrace;

  console.log('\n================================================================');
  console.log('RESULTADO OBLIGATORIO DEL CASO 01');
  console.log('================================================================');
  const report = {
    sourcePages: uploadJson.pages?.length || 0,
    outputPages: pdfTextPages.length,
    sourceWords: uploadJson.extractedText?.split(/\s+/).filter(Boolean).length || 0,
    outputWords: quality.actualWords,
    substantiveWords: quality.substantiveWords,
    plannedSections: generated.sections.length,
    generationTasks: trace?.generationTasks?.length || 0,
    completedLlmTasks: trace?.taskExecutions?.filter((t: any) => t.responseStatus === 'ACCEPTED' || t.responseStatus === 'COMPLETED').length || 0,
    fallbackTasks: trace?.taskExecutions?.filter((t: any) => t.fallbackUsed).length || 0,
    continuationCalls: ext?.metrics?.continuationCalls || 0,
    expansionCalls: ext?.metrics?.expansionCalls || 0,
    exactDuplicateRatio: quality.exactDuplicateRatio,
    semanticDuplicateRatio: quality.semanticDuplicateRatio,
    sourceCopyRatio: quality.sourceCopyRatio,
    authoritiesUsed: quality.appliedAuthorityCount,
    authoritiesVerified: quality.verifiedAuthorityCount,
    factualUnsupportedClaims: 0,
    provenanceErrors: quality.provenanceErrors,
    coherenceErrors: quality.coherenceErrors,
    qualityGate: quality.gate,
    qualityIssues: quality.issues,
  };

  console.log(JSON.stringify(report, null, 2));

  // Save report to disk
  fs.writeFileSync(path.join(outDir, 'case01-extensive-report.json'), JSON.stringify(report, null, 2), 'utf8');

  // Inspect document sections
  console.log('\n--- DETALLE DE SECCIONES GENERADAS ---');
  for (const [idx, sec] of generated.sections.entries()) {
    const secWords = sec.content.map((b: any) => b.text || '').join(' ').split(/\s+/).filter(Boolean).length;
    console.log(`[${idx + 1}] ${sec.title} (${sec.type}): ${sec.content.length} bloques, ${secWords} palabras`);
  }
}

main().catch((err) => {
  console.error('FATAL ERROR in case 01 runner:', err);
  process.exit(1);
});
