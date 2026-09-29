/**
 * FINAL GENERATOR VALIDATION — run-final-generator-validation.mts
 *
 * Prueba E2E real del generador:
 *   upload → extraction → analysis → generation → export
 *
 * - privateCaseContext = true  (expediente privado)
 * - externalProviderOptIn = true  (consentimiento explícito para esta ejecución E2E autorizada)
 * - providers: Gemini → Groq → NVIDIA (cadena configurada en .env)
 * - guarda en: audit/final-generator-validation/run-<timestamp>/
 * - NO sobrescribe carpetas anteriores
 *
 * Uso:
 *   npx tsx scripts/run-final-generator-validation.mts [caseNumber] [depth]
 *   Ej: npx tsx scripts/run-final-generator-validation.mts 01 EXTENSIVE_40
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST as analyzeUpload } from '@/app/api/templates/analyze-upload/route';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { countPdfPages } from '@/lib/legal-engine/documentPageMetrics';
import { getProviderChain } from '@/lib/ai/providerChain';
import type { DraftDepth } from '@/lib/legal-engine/draftDepth';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import {
  assessFinalGeneratorReadiness,
  countIssueGenerationAttemptRecords,
} from './finalGeneratorReadiness';

// ─── CONSENTIMIENTO E2E (autorizado explícitamente para esta ejecución de prueba) ────────────────
const PRIVATE_CASE_CONTEXT = true;
const EXTERNAL_PROVIDER_OPT_IN = true;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function safeErr(e: unknown): string {
  const raw = e instanceof Error ? `${e.message}\n${e.stack || ''}` : String(e);
  return raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[^\s"']+/gi, '[REDACTED]');
}

function sha256(buf: Uint8Array | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

function documentText(doc: UniversalLegalDocument): string {
  return doc.sections
    .flatMap((s) => s.content.map((b) => b.text || ''))
    .join('\n\n');
}

async function writeJson(filePath: string, val: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(val, null, 2), 'utf8');
}

async function extractPdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdfModule = eval('require')('pdf-parse') as any;
  const parser = new pdfModule.PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return Array.isArray(result?.pages) ? result.pages.map((page: any) => String(page?.text || '')) : [];
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = eval('require')('mammoth') as any;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return String(result?.value || '');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const caseArg = process.argv[2] || '01';
  const depthArg = (process.argv[3] || 'EXTENSIVE_40') as DraftDepth;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const repoRoot = process.cwd();
  const runDir = path.resolve(repoRoot, `audit/final-generator-validation/run-${timestamp}`);

  if (existsSync(runDir)) {
    throw new Error(`RUN DIR YA EXISTE: ${runDir} — no se sobrescribe evidencia previa.`);
  }

  const evidenceDir = path.join(runDir, 'evidence');
  const outputDir = path.join(runDir, 'outputs');
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`FINAL GENERATOR VALIDATION — CASO ${caseArg} — ${depthArg}`);
  console.log(`Run dir: ${runDir}`);
  console.log(`Provider chain: ${getProviderChain().join(' → ')}`);
  console.log(`privateCaseContext=${PRIVATE_CASE_CONTEXT}  externalProviderOptIn=${EXTERNAL_PROVIDER_OPT_IN}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ─── LEER MANIFIESTO ────────────────────────────────────────────────────────
  const manifestPath = path.resolve(repoRoot, 'audit/final-legal-readiness-2026/selected-cases.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    productionDatabaseExcluded: boolean;
    cases: Array<{
      caseNumber: string;
      extractedSourcePath: string;
      sourceFileName: string;
      sourceSha256: string;
      sourceBytes: number;
      matter: string;
      sourceDocumentType: string;
      outputDocumentType: string;
    }>;
  };

  if (manifest.productionDatabaseExcluded !== true) {
    throw new Error('El manifiesto no acredita la exclusión de la base productiva.');
  }

  const source = manifest.cases.find((c) => c.caseNumber === caseArg);
  if (!source) throw new Error(`Caso ${caseArg} no encontrado en el manifiesto.`);

  // ─── FASE A: EXTRACCIÓN / ANÁLISIS ──────────────────────────────────────────
  console.log('─── FASE A: EXTRACCIÓN Y ANÁLISIS ───');
  const sourceBytes = await readFile(source.extractedSourcePath);

  const actualSha = sha256(new Uint8Array(sourceBytes));
  if (actualSha !== source.sourceSha256) {
    throw new Error(`SOURCE_HASH_MISMATCH: esperado=${source.sourceSha256} actual=${actualSha}`);
  }
  if (sourceBytes.byteLength !== source.sourceBytes) {
    throw new Error(`SOURCE_SIZE_MISMATCH: esperado=${source.sourceBytes} actual=${sourceBytes.byteLength}`);
  }
  console.log(`✓ Fuente verificada: ${source.sourceFileName} (${sourceBytes.byteLength} bytes)`);

  const form = new FormData();
  form.append('file', new File([sourceBytes], source.sourceFileName, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));

  const uploadReq = new NextRequest('http://localhost/api/templates/analyze-upload', {
    method: 'POST',
    body: form,
  });

  const uploadRes = await analyzeUpload(uploadReq);
  const uploadJson = await uploadRes.json();
  await writeJson(path.join(evidenceDir, 'analyze-upload-response.json'), uploadJson);

  if (uploadRes.status !== 200 || !uploadJson.ok || !uploadJson.sourceValidated) {
    throw new Error(
      `ANALYZE_UPLOAD_FAILED: status=${uploadRes.status} ok=${uploadJson.ok} ` +
      `sourceValidated=${uploadJson.sourceValidated} error=${uploadJson.error || 'n/a'}`
    );
  }

  const analysis = uploadJson;
  console.log(`✓ Análisis OK:`);
  console.log(`  Texto extraído:      ${(analysis.extractedText || '').length} chars`);
  console.log(`  Páginas fuente:      ${(analysis.pages || []).length}`);
  console.log(`  Hechos:              ${(analysis.analysis?.facts || []).length}`);
  console.log(`  Pretensiones:        ${(analysis.analysis?.claims || []).length}`);
  console.log(`  Evidencias:          ${(analysis.analysis?.evidence || []).length}`);
  console.log(`  Ejes arg.:           ${(analysis.analysis?.argumentAxes || []).length}`);
  console.log(`  richCaseAnalysis:    ${Boolean(analysis.analysis?.richCaseAnalysis)}`);

  // ─── FASE B: GENERACIÓN ─────────────────────────────────────────────────────
  console.log('\n─── FASE B: GENERACIÓN PIPELINE ───');
  const sourceDoc = createSourceDocument({
    id: `final-validation-${caseArg}-${depthArg}`,
    filename: source.sourceFileName,
    extractedText: analysis.extractedText,
    pages: analysis.pages,
    sourceValidated: analysis.sourceValidated,
    sourceQualityStatus: analysis.sourceQualityStatus,
    qualityScore: analysis.qualityScore,
    classification: { sourceDocumentType: source.sourceDocumentType },
  } as Parameters<typeof createSourceDocument>[0]);

  await writeJson(path.join(evidenceDir, 'generation-request-summary.json'), {
    caseNumber: caseArg,
    draftDepth: depthArg,
    matter: source.matter,
    outputDocumentType: source.outputDocumentType,
    sourceFileName: source.sourceFileName,
    sourceSha256: source.sourceSha256,
    privateCaseContext: PRIVATE_CASE_CONTEXT,
    externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
    providerChain: getProviderChain(),
    startedAt: new Date().toISOString(),
  });

  const genStart = Date.now();
  let providerTrace: unknown = null;
  let generated: UniversalLegalDocument;

  try {
    generated = await runGenerationPipeline({
      flow: 'DOCUMENT_ANALYSIS',
      draftDepth: depthArg,
      externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
      userInstruction: [
        'Generar contestación de demanda completa y profesional estrictamente sujeta al expediente fuente.',
        'Desarrollar: comparecencia, contestación de prestaciones, contestación de hechos (hecho por hecho),',
        'excepciones y defensas sustentadas, análisis probatorio, fundamento de derecho y jurisprudencia verificable,',
        'y petitorios. No inventar hechos, fechas, pagos ni contratos.',
        'Las afirmaciones de la actora que no estén probadas se tratan como alegaciones de la contraparte.',
        'No repetir párrafos. No copiar el texto de la demanda. No pedir preguntas al abogado.',
      ].join(' '),
      selectedDocumentType: source.outputDocumentType,
      documentTypeLabel: `Contestación de Demanda ${source.matter.charAt(0) + source.matter.slice(1).toLowerCase()}`,
      matter: source.matter,
      sourceDocuments: [sourceDoc],
      traceOptions: { enabled: true, outputDir: evidenceDir, writeMarkdown: true },
      generationId: `final-validation-${caseArg}-${depthArg}-${timestamp}`,
    }, {
      onStageStart: (stage: string) => console.log(`  [►] ${stage}`),
      onStageComplete: (stage: string) => console.log(`  [✓] ${stage}`),
      onError: (err: unknown, stage: string) =>
        console.error(`  [✗] ${stage}: ${safeErr(err).slice(0, 300)}`),
      onProgressMessage: (msg: string) => console.log(`  [→] ${msg}`),
      onTraceReady: (t: unknown) => { providerTrace = t; },
    } as Parameters<typeof runGenerationPipeline>[1]);
  } catch (err) {
    await writeJson(path.join(runDir, 'GENERATION_ERROR.json'), {
      error: safeErr(err),
      caseNumber: caseArg,
      draftDepth: depthArg,
      timestamp,
    });
    throw err;
  }

  const genDurationSec = ((Date.now() - genStart) / 1000).toFixed(1);
  console.log(`\n✓ Pipeline completado en ${genDurationSec}s`);

  const generatedText = documentText(generated);
  await writeJson(path.join(evidenceDir, 'generated-document.json'), generated);
  await writeFile(path.join(evidenceDir, 'generated-text.txt'), generatedText, 'utf8');
  if (providerTrace) {
    await writeJson(path.join(evidenceDir, 'generation-trace.json'), providerTrace);
  }

  // ─── FASE C: EXPORTACIÓN ────────────────────────────────────────────────────
  console.log('\n─── FASE C: EXPORTACIÓN DOCX / PDF ───');
  const docxPath = path.join(outputDir, `caso-${caseArg}-${depthArg}-DRAFT.docx`);
  const pdfPath = path.join(outputDir, `caso-${caseArg}-${depthArg}-DRAFT.pdf`);

  let draftExportAllowed = false;
  let draftExportError: string | null = null;
  let docxExportError: string | null = null;
  let pdfExportError: string | null = null;
  let docxBuf: Uint8Array | null = null;
  let pdfBuf: Uint8Array | null = null;
  try {
    await prepareUniversalDocumentForExport(generated, { exportMode: 'DRAFT' });
    draftExportAllowed = true;
  } catch (error) {
    draftExportError = safeErr(error);
  }

  if (draftExportAllowed) {
    try {
      docxBuf = await exportUniversalToDocx(
        generated, undefined, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' }
      );
      await writeFile(docxPath, docxBuf);
    } catch (error) {
      docxExportError = safeErr(error);
    }
    try {
      pdfBuf = await exportUniversalToPdf(
        generated, generated.generationMetadata?.auditTrace, { exportMode: 'DRAFT' }
      );
      await writeFile(pdfPath, pdfBuf);
    } catch (error) {
      pdfExportError = safeErr(error);
    }
  }

  if (providerTrace) {
    await writeJson(path.join(evidenceDir, 'generation-trace.json'), providerTrace);
  }
  console.log(draftExportAllowed ? '✓ Preflight DRAFT permitido' : '✗ Preflight DRAFT bloqueado');
  if (draftExportError) console.log(draftExportError.slice(0, 600));
  if (docxBuf) console.log('DOCX: ' + docxBuf.byteLength + ' bytes → ' + docxPath);
  if (pdfBuf) console.log('PDF: ' + pdfBuf.byteLength + ' bytes → ' + pdfPath);

  // ─── FASE D: AUDITORÍA DE CALIDAD ───────────────────────────────────────────
  console.log('\n─── FASE D: AUDITORÍA DE CALIDAD ───');

  const ext = (generated.generationMetadata as any)?.generationExtension;
  const traceData = (providerTrace as any) || generated.generationMetadata?.auditTrace;
  const taskExecs: any[] = traceData?.taskExecutions || [];
  const wordAccountingSections: any[] = traceData?.wordAccounting || [];
  const wordAccountingFields = [
    'plannedWords', 'providerGeneratedWords', 'providerGeneratedChars', 'validatedWords',
    'rejectedWords', 'dedupRemovedWords', 'materializedWords', 'admittedWords', 'assembledWords', 'exportedWords',
  ];
  const wordAccounting = {
    unit: 'Unicode letter/number tokens',
    sections: wordAccountingSections.map((row) => ({
      ...row,
      title: generated.sections.find((section) => section.id === row.sectionId)?.title || null,
      lostWords: row.rejectedWords,
      lossReasons: row.losses || [],
    })),
    traceTotals: Object.fromEntries(wordAccountingFields.map((field) => [
      field,
      wordAccountingSections.reduce((sum, row) => sum + (Number(row[field]) || 0), 0),
    ])),
  };

  const coverageItems = generated.coverageMatrix?.items || [];
  const requiredCoverage = coverageItems.filter((item) => item.required);
  const qualityGate = runQualityGateCheck(generated);
  const qualityMetrics = qualityGate.metrics as Record<string, number>;
  const provenanceGate = (generated.generationMetadata as any).provenanceIntegrityGate;
  const provenanceErrors = Array.isArray(provenanceGate?.errors)
    ? provenanceGate.errors.length
    : Array.isArray(provenanceGate?.issues) ? provenanceGate.issues.length : null;
  const coherenceErrors = ((generated.validation?.errors || []) as any[]).filter(
    (e) => /COHERENCE|CONSISTENCY|CONTRADICTION/i.test(`${e?.code || ''} ${e?.message || ''}`)
  ).length;

  let docxText: string | null = null;
  let docxTextExtractionError: string | null = null;
  if (docxBuf) {
    try {
      docxText = await extractDocxText(docxBuf);
    } catch (error) {
      docxTextExtractionError = safeErr(error);
    }
  }

  const pdfPageCount = pdfBuf ? countPdfPages(pdfBuf) : null;
  let pdfPageTexts: string[] = [];
  let pdfTextExtractionError: string | null = null;
  if (pdfBuf) {
    try {
      pdfPageTexts = await extractPdfPageTexts(pdfBuf);
    } catch (error) {
      pdfTextExtractionError = safeErr(error);
    }
  }
  const pdfPageTextMismatch = pdfPageCount !== null && pdfPageTexts.length !== pdfPageCount;
  const renderedPdfPages = pdfPageCount === null
    ? []
    : Array.from({ length: pdfPageCount }, (_, index) => pdfPageTexts[index] || '');
  const pdfText = pdfPageTexts.join('\n');
  const exportedPdfWords = pdfBuf && !pdfTextExtractionError ? wordCount(pdfText) : null;
  const exportedDocxWords = docxBuf && !docxTextExtractionError && docxText ? wordCount(docxText) : null;
  const evidenceCoverageItems = requiredCoverage.filter((item) => /EVIDENCE/.test(item.category));
  const evidenceCoverage = evidenceCoverageItems.length > 0
    ? evidenceCoverageItems.filter((item) => item.status === 'covered').length / evidenceCoverageItems.length
    : 1;

  const quality = evaluateProfessionalDraftQuality({
    draftDepth: depthArg,
    renderedPages: renderedPdfPages,
    sourceTexts: [analysis.extractedText || ''],
    substantiveText: pdfText || docxText || generatedText,
    contentStopReason: (generated.generationMetadata as any).draftContentStopReason as any ?? null,
    verifiedAuthorityCount: qualityMetrics.verifiedAuthorityCount ?? 0,
    appliedAuthorityCount: qualityMetrics.appliedAuthorityCount ?? 0,
    factsCovered: qualityMetrics.factsWithResponse ?? 0,
    factsRequired: qualityMetrics.factsTotal ?? 0,
    claimsCovered: qualityMetrics.claimsWithResponse ?? 0,
    claimsRequired: qualityMetrics.claimsTotal ?? 0,
    evidenceCoverage,
    sectionCoverage: generated.sections.length > 0
      ? generated.sections.filter((section) => section.content.some((block) => block.text.trim().length > 50)).length / generated.sections.length
      : 0,
    coherenceErrors,
    provenanceErrors: provenanceErrors ?? 1,
  });

  const sectionsWithContent = generated.sections.filter(
    (s) => s.content.some((b) => (b.text || '').trim().length > 50)
  );
  const externalProviders = new Set(['gemini', 'groq', 'nvidia']);
  const providerBackedTasks = taskExecs.filter((task: any) =>
    externalProviders.has(String(task.providerActuallyUsed || '').toLowerCase())
  );
  const usedProviders = [...new Set(providerBackedTasks.map((task: any) =>
    String(task.providerActuallyUsed).toLowerCase()
  ))];
  const providerDistribution = Object.fromEntries(
    usedProviders.map((provider) => [provider, providerBackedTasks.filter((task: any) =>
      String(task.providerActuallyUsed).toLowerCase() === provider
    ).length])
  );
  const qualityCheckIds = qualityGate.criticalErrors.map((issue) => issue.checkId);
  const factualUnsupportedClaims = Number.isFinite(qualityMetrics.unsupportedFactualClaimCount)
    ? qualityMetrics.unsupportedFactualClaimCount : null;
  const unverifiedFactualClaims = Number.isFinite(qualityMetrics.unverifiedFactualClaimCount)
    ? qualityMetrics.unverifiedFactualClaimCount : null;
  const unsupportedLegalAuthorities = Number.isFinite(qualityMetrics.unsupportedLegalAuthorities)
    ? qualityMetrics.unsupportedLegalAuthorities : null;
  const readiness = assessFinalGeneratorReadiness({
    exportAllowed: draftExportAllowed,
    docxPresent: Boolean(docxBuf),
    pdfPresent: Boolean(pdfBuf),
    actualPdfPages: pdfPageCount,
    minimumPages: depthArg === 'PROFESSIONAL_20' ? 15 : 30,
    substantiveWords: quality.substantiveWords,
    minimumSubstantiveWords: depthArg === 'PROFESSIONAL_20' ? 1_200 : 1_800,
    professionalQualityGate: quality.qualityGate,
    criticalCheckIds: [
      ...qualityCheckIds,
      ...(pdfTextExtractionError ? ['PDF_TEXT_EXTRACTION_FAILED'] : []),
      ...(docxTextExtractionError || !docxText ? ['DOCX_TEXT_EXTRACTION_FAILED'] : []),
      ...(pdfPageTextMismatch ? ['PDF_PAGE_TEXT_COUNT_MISMATCH'] : []),
    ],
    factualUnsupportedClaims,
    unverifiedFactualClaims,
    unsupportedLegalAuthorities,
    factsTotal: qualityMetrics.factsTotal ?? 0,
    factsWithResponse: qualityMetrics.factsWithResponse ?? 0,
    claimsTotal: qualityMetrics.claimsTotal ?? 0,
    claimsWithResponse: qualityMetrics.claimsWithResponse ?? 0,
    providerBackedTasks: providerBackedTasks.length,
  });

  // ─── REPORTE ────────────────────────────────────────────────────────────────
  const report = {
    meta: {
      caseNumber: caseArg,
      draftDepth: depthArg,
      runDir,
      timestamp,
      generationDurationSec: parseFloat(genDurationSec),
      privateCaseContext: PRIVATE_CASE_CONTEXT,
      externalProviderOptIn: EXTERNAL_PROVIDER_OPT_IN,
    },
    providerInfo: {
      configuredChain: getProviderChain(),
      providersUsed: usedProviders,
      providerDistributionByTask: providerDistribution,
      generationTaskExecutions: taskExecs.length,
      providerBackedTaskExecutions: providerBackedTasks.length,
      providerAttemptRecords: countIssueGenerationAttemptRecords(traceData),
      successfulProviderBackedExecutions: providerBackedTasks.filter((task: any) =>
        ['ACCEPTED', 'VALID_NON_FINAL', 'COMPLETED'].includes(task.responseStatus)
      ).length,
      acceptedProviderBackedExecutions: providerBackedTasks.filter((task: any) =>
        task.responseStatus === 'ACCEPTED' || task.responseStatus === 'COMPLETED'
      ).length,
      fallbackExecutions: taskExecs.filter((task: any) =>
        String(task.providerActuallyUsed || '').toLowerCase() === 'local'
        || task.fallbackUsed === true
        || task.usedFallback === true
      ).length,
      continuationCalls: ext?.metrics?.continuationCalls ?? 0,
      expansionCalls: ext?.metrics?.expansionCalls ?? 0,
      rawHttpCallCount: null,
      rawHttpCallCountNote: 'El trace registra ejecuciones/tareas y provider final, no cada intento HTTP de fallback.',
    },
    document: {
      pagesActualPdf: pdfPageCount,
      docxBytes: docxBuf?.byteLength ?? null,
      pdfBytes: pdfBuf?.byteLength ?? null,
      generatedJsonWords: wordCount(generatedText),
      exportedDocxWords: exportedDocxWords,
      exportedPdfWords: exportedPdfWords,
      totalWords: exportedPdfWords ?? exportedDocxWords ?? wordCount(generatedText),
      contentStopReason: (generated.generationMetadata as any)?.draftContentStopReason || null,
      substantiveWords: quality.substantiveWords,
      sections: generated.sections.length,
      sectionsWithContent: sectionsWithContent.length,
      sectionTitles: generated.sections.map((s) => ({
        id: s.id,
        type: s.type,
        title: s.title,
        words: wordCount(s.content.map((b) => b.text || '').join(' ')),
      })),
    },
    quality: {
      gate: quality.qualityGate,
      documentQualityGatePassed: qualityGate.passed,
      documentQualityCriticalChecks: qualityCheckIds,
      issues: quality.issues,
      exactDuplicateRatio: quality.exactDuplicateRatio,
      semanticDuplicateRatio: quality.semanticDuplicateRatio,
      sourceCopyRatio: quality.sourceCopyRatio,
      factualUnsupportedClaims,
      unverifiedFactualClaims,
      verifiedAuthorityCount: qualityMetrics.verifiedAuthorityCount ?? null,
      appliedAuthorityCount: qualityMetrics.appliedAuthorityCount ?? null,
      unsupportedLegalAuthorities,
      provenanceErrors,
      coherenceErrors,
    },
    coverage: {
      totalItems: coverageItems.length,
      required: requiredCoverage.length,
      covered: requiredCoverage.filter((i) => i.status === 'covered').length,
      pending: requiredCoverage.filter((i) => i.status === 'pending').length,
      weak: requiredCoverage.filter((i) => i.status === 'weak').length,
      factsTotal: qualityMetrics.factsTotal ?? 0,
      factsWithResponse: qualityMetrics.factsWithResponse ?? 0,
      claimsTotal: qualityMetrics.claimsTotal ?? 0,
      claimsWithResponse: qualityMetrics.claimsWithResponse ?? 0,
    },
    export: {
      mode: 'DRAFT',
      allowed: draftExportAllowed,
      preflightError: draftExportError,
      docxError: docxExportError,
      pdfError: pdfExportError,
      pdfPageCountActual: pdfPageCount,
      pdfPageTextCount: pdfPageTexts.length,
      pdfPageTextMismatch,
      pdfTextExtractionError,
      docxTextExtractionError,
    },
    readiness,
    wordAccounting,
    files: {
      docx: docxBuf ? docxPath : null,
      pdf: pdfBuf ? pdfPath : null,
      generatedDocument: path.join(evidenceDir, 'generated-document.json'),
      generatedText: path.join(evidenceDir, 'generated-text.txt'),
      analyzeUploadResponse: path.join(evidenceDir, 'analyze-upload-response.json'),
      generationTrace: providerTrace
        ? path.join(evidenceDir, 'generation-trace.json')
        : null,
    },
  };

  await writeJson(path.join(runDir, 'validation-report.json'), report);

  // ─── RESUMEN EN CONSOLA ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`RESULTADO — CASO ${caseArg} ${depthArg}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Páginas PDF reales:      ' + (pdfPageCount ?? 'NO EXPORTADO'));
  console.log('Palabras JSON generado:  ' + wordCount(generatedText));
  console.log('Palabras extraídas PDF:  ' + (exportedPdfWords ?? 'NO DISPONIBLE'));
  console.log('Palabras extraídas DOCX: ' + (exportedDocxWords ?? 'NO DISPONIBLE'));
  console.log('Palabras sustantivas:    ' + quality.substantiveWords);
  console.log('Secciones con contenido: ' + sectionsWithContent.length + '/' + generated.sections.length);
  console.log('Tareas LLM aceptadas/no finales: ' + report.providerInfo.successfulProviderBackedExecutions + '/' + report.providerInfo.providerBackedTaskExecutions);
  console.log('Tareas fallback/local:   ' + report.providerInfo.fallbackExecutions);
  console.log('Distribución provider:   ' + JSON.stringify(providerDistribution));
  console.log('Intentos HTTP crudos:    NO REGISTRADOS POR EL TRACE');
  console.log('Continuaciones / expansiones: ' + report.providerInfo.continuationCalls + ' / ' + report.providerInfo.expansionCalls);
  console.log('Stop reason:             ' + (report.document.contentStopReason || '(sin razón registrada)'));
  console.log('Providers externos:      ' + (usedProviders.join(', ') || '(sin trace disponible)'));
  console.log('exactDuplicateRatio:     ' + quality.exactDuplicateRatio.toFixed(4));
  console.log('semanticDuplicateRatio:  ' + quality.semanticDuplicateRatio.toFixed(4));
  console.log('sourceCopyRatio:         ' + quality.sourceCopyRatio.toFixed(4));
  console.log('factualUnsupportedClaims:' + (factualUnsupportedClaims ?? 'NO DISPONIBLE'));
  console.log('unverifiedFactualClaims: ' + (unverifiedFactualClaims ?? 'NO DISPONIBLE'));
  console.log('unsupportedAuthorities: ' + (unsupportedLegalAuthorities ?? 'NO DISPONIBLE'));
  console.log('verified/applied authorities: ' + (qualityMetrics.verifiedAuthorityCount ?? 'NO DISPONIBLE') + '/' + (qualityMetrics.appliedAuthorityCount ?? 'NO DISPONIBLE'));
  console.log('provenanceErrors:        ' + (provenanceErrors ?? 'NO DISPONIBLE'));
  console.log('coherenceErrors:         ' + coherenceErrors);
  console.log('Quality Gate profesional: ' + quality.qualityGate);
  console.log('\n--- CONTABILIDAD DE PALABRAS POR SECCIÓN ---');
  for (const row of wordAccounting.sections) {
    console.log(JSON.stringify({
      section: row.title || row.sectionId,
      planned: row.plannedWords,
      generated: row.providerGeneratedWords,
      validated: row.validatedWords,
      rejected: row.rejectedWords,
      dedupRemoved: row.dedupRemovedWords,
      materialized: row.materializedWords,
      admitted: row.admittedWords,
      assembled: row.assembledWords,
      exportedTraceOnly: row.exportedWords,
      actualExportBySection: 'NO INSTRUMENTADO; ver totales DOCX/PDF extraídos',
      reasons: row.lossReasons,
    }));
  }
  if ((quality.issues || []).length > 0) {
    console.log('Quality Issues:');
    for (const issue of quality.issues || []) {
      console.log(`  - ${issue}`);
    }
  }
  console.log('\n--- SECCIONES ---');
  for (const [idx, sec] of generated.sections.entries()) {
    const w = wordCount(sec.content.map((b) => b.text || '').join(' '));
    const flag = w < 50 ? 'VACÍA' : 'OK';
    console.log(
      `  [${String(idx + 1).padStart(2, '0')}] ${flag} ${sec.type.padEnd(20)} | "${sec.title}" | ${w} palabras`
    );
  }

  console.log('\nDOCX: ' + (docxBuf ? docxPath : 'NO EXPORTADO' + (docxExportError ? ' — ' + docxExportError.slice(0, 500) : '')));
  console.log('PDF:  ' + (pdfBuf ? pdfPath : 'NO EXPORTADO' + (pdfExportError ? ' — ' + pdfExportError.slice(0, 500) : '')));
  console.log(`Report: ${path.join(runDir, 'validation-report.json')}`);

  // ─── VEREDICTO ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (readiness.ready) {
    console.log('CASE_' + caseArg.padStart(2, '0') + '_GENERATOR_PASS');
    console.log('El resultado aún requiere inspección visual humana antes de certificarlo.');
  } else {
    console.log('CASE_' + caseArg.padStart(2, '0') + '_GENERATOR_FAIL');
    console.log('Bloqueos: ' + readiness.blockers.join(', '));
    process.exitCode = 1;
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n\n*** ERROR FATAL ***');
  console.error(safeErr(err));
  process.exit(1);
});
