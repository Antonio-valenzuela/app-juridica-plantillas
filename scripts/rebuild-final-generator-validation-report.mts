/**
 * Rebuild the audit report for an already completed generator run.
 * This script is deliberately offline: it never invokes a provider or reruns generation.
 */
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { evaluateProfessionalDraftQuality } from '@/lib/legal-engine/professionalDraftQuality';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { assessFinalGeneratorReadiness, countIssueGenerationAttemptRecords } from './finalGeneratorReadiness';

type JsonRecord = Record<string, any>;

const wordCount = (text: string): number => (text.match(/[\p{L}\p{N}]+/gu) || []).length;
const countBy = (items: JsonRecord[], key: string): Record<string, number> => items.reduce((counts, item) => {
  const value = String(item?.[key] ?? '(unavailable)');
  counts[value] = (counts[value] || 0) + 1;
  return counts;
}, {} as Record<string, number>);
const countLossReasons = (losses: JsonRecord[]): Record<string, { occurrences: number; words: number }> =>
  losses.reduce((reasons, loss) => {
    const key = String(loss?.reason || '(reason not recorded)');
    reasons[key] ||= { occurrences: 0, words: 0 };
    reasons[key].occurrences += 1;
    reasons[key].words += Number(loss?.words) || 0;
    return reasons;
  }, {} as Record<string, { occurrences: number; words: number }>);

async function readJson(file: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(file, 'utf8')) as JsonRecord;
}

async function fileExists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function main(): Promise<void> {
  const runDir = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('Uso: rebuild-final-generator-validation-report.mts <runDir>');
  const evidenceDir = path.join(runDir, 'evidence');
  const outputDir = path.join(runDir, 'outputs');
  const manifest = await readJson(path.resolve('audit/final-legal-readiness-2026/selected-cases.json'));
  const sourceManifest = (manifest.cases || []).find((item: JsonRecord) => String(item.caseNumber) === String(process.argv[3] || '01'));
  const [request, analysis, generated, trace, generatedText] = await Promise.all([
    readJson(path.join(evidenceDir, 'generation-request-summary.json')),
    readJson(path.join(evidenceDir, 'analyze-upload-response.json')),
    readJson(path.join(evidenceDir, 'generated-document.json')),
    readJson(path.join(evidenceDir, 'generation-trace.json')),
    readFile(path.join(evidenceDir, 'generated-text.txt'), 'utf8'),
  ]);

  let draftExportAllowed = false;
  let draftExportError: string | null = null;
  try {
    await prepareUniversalDocumentForExport(generated, { exportMode: 'DRAFT' });
    draftExportAllowed = true;
  } catch (error) {
    draftExportError = error instanceof Error ? error.message : String(error);
  }

  const docxPath = path.join(outputDir, `caso-${request.caseNumber}-${request.draftDepth}-DRAFT.docx`);
  const pdfPath = path.join(outputDir, `caso-${request.caseNumber}-${request.draftDepth}-DRAFT.pdf`);
  const [docxPresent, pdfPresent] = await Promise.all([fileExists(docxPath), fileExists(pdfPath)]);
  const gate = runQualityGateCheck(generated as any);
  const metrics = gate.metrics as Record<string, number>;
  const taskExecutions: JsonRecord[] = trace.taskExecutions || [];
  const issueAttempts: JsonRecord[] = trace.issueGenerationAttempts || [];
  const extension = generated.generationMetadata?.generationExtension || {};
  const providerNames = new Set(['gemini', 'groq', 'nvidia']);
  const providerBackedTasks = taskExecutions.filter((item) => providerNames.has(String(item.providerActuallyUsed || '').toLowerCase()));
  const allSectionBlocks: JsonRecord[] = (generated.sections || []).flatMap((section: JsonRecord) =>
    (section.content || []).map((block: JsonRecord) => ({ ...block, _documentSectionId: section.id }))
  );
  const generationTasks: JsonRecord[] = trace.generationTasks || [];
  const draftBlocks: JsonRecord[] = trace.draftBlocks || [];
  const coverageItems: JsonRecord[] = generated.coverageMatrix?.items || [];

  const coverageTrace = coverageItems.map((item) => {
    const tasks = generationTasks.filter((task) => (task.coverageItemIds || []).includes(item.id));
    const taskIds = new Set(tasks.map((task) => task.taskId));
    const executions = taskExecutions.filter((execution) => taskIds.has(execution.taskId));
    const attempts = issueAttempts.filter((attempt) => taskIds.has(attempt.taskId));
    const traceBlocks = draftBlocks.filter((block) => (block.coverageItemIds || []).includes(item.id));
    const assembledBlocks = allSectionBlocks.filter((block) => (block.coverageItemIds || []).includes(item.id));
    const providerGeneratedWords = attempts.reduce((sum, attempt) => sum + (Number(attempt.providerGeneratedWords) || 0), 0);
    const generated = providerGeneratedWords > 0 || traceBlocks.length > 0;
    const validated = executions.some((execution) => ['VALID_ACCEPTED', 'VALID_NON_FINAL', 'COMPLETED'].includes(execution.responseStatus))
      || attempts.some((attempt) => ['VALID_ACCEPTED', 'VALID_NON_FINAL', 'COMPLETED'].includes(attempt.validationStatus));
    let stage = 'PLANNED';
    let dropReason: string | null = null;
    if (assembledBlocks.length > 0) stage = 'ASSEMBLED';
    else if (traceBlocks.length > 0) { stage = 'MATERIALIZED'; dropReason = 'NOT_PRESENT_IN_FINAL_SECTION_CONTENT'; }
    else if (validated) { stage = 'VALIDATED'; dropReason = 'VALIDATED_BUT_NO_DRAFT_BLOCK'; }
    else if (generated) { stage = 'GENERATED'; dropReason = 'PROVIDER_OUTPUT_NOT_VALIDATED'; }
    else if (tasks.length > 0) { stage = 'TASK_CREATED'; dropReason = attempts.length ? 'NO_PROVIDER_TEXT_OR_VALIDATION_FAILED' : 'NO_ATTEMPT_RECORDED'; }
    else dropReason = item.statusReason || (item.requiresClientPosition ? 'CLIENT_POSITION_REQUIRED_NO_GENERATION_TASK' : 'NO_GENERATION_TASK');

    const taskError = tasks.map((task) => task.error).find(Boolean);
    const fallbackReason = attempts.map((attempt) => attempt.reason || attempt.error).find(Boolean);
    const finalCoverageReason = item.statusReason || (item.status === 'covered' ? null : `FINAL_STATUS_${String(item.status).toUpperCase()}`);
    return {
      coverageItemId: item.id,
      category: item.category,
      targetSectionIds: item.targetSectionIds || [],
      required: Boolean(item.required),
      sourceEntityIds: item.sourceEntityIds || [],
      finalCoverageStatus: item.status,
      finalCoverageReason,
      pipelineStage: stage,
      planned: true,
      taskCreated: tasks.length > 0,
      generationTaskIds: [...taskIds],
      providerAttemptCount: attempts.length,
      providerGeneratedWords,
      providerOutputObserved: generated,
      validationObserved: validated,
      materializedBlockCount: traceBlocks.length,
      assembledBlockIds: assembledBlocks.map((block) => block.id),
      assembledSectionIds: [...new Set(assembledBlocks.map((block) => block._documentSectionId))],
      responseStatuses: [...new Set([...executions.map((execution) => execution.responseStatus), ...attempts.map((attempt) => attempt.validationStatus)].filter(Boolean))],
      dropReason: stage === 'ASSEMBLED' ? null : taskError || fallbackReason || dropReason,
    };
  });

  const accountingRows = (trace.wordAccounting || []).map((row: JsonRecord) => {
    const losses: JsonRecord[] = row.losses || [];
    return {
      ...row,
      sectionTitle: generated.sections.find((section: JsonRecord) => section.id === row.sectionId)?.title || null,
      lossReasonSummary: countLossReasons(losses),
    };
  });
  const accountingFields = [
    'plannedWords', 'providerGeneratedWords', 'providerGeneratedChars', 'validatedWords',
    'rejectedWords', 'dedupRemovedWords', 'materializedWords', 'admittedWords', 'assembledWords', 'exportedWords',
  ];
  const wordTotals = Object.fromEntries(accountingFields.map((field) => [field,
    accountingRows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0),
  ]));
  const provenanceGate = generated.generationMetadata?.provenanceIntegrityGate;
  const provenanceErrors = Array.isArray(provenanceGate?.errors) ? provenanceGate.errors.length
    : Array.isArray(provenanceGate?.issues) ? provenanceGate.issues.length : null;
  const coherenceErrors = ((generated.validation?.errors || []) as JsonRecord[]).filter((error) =>
    /COHERENCE|CONSISTENCY|CONTRADICTION/i.test(`${error?.code || ''} ${error?.message || ''}`)
  ).length;
  const requiredCoverage = coverageItems.filter((item) => item.required);
  const statusCounts = countBy(coverageItems, 'status');
  const categoryStatusCounts = coverageItems.reduce((result, item) => {
    const key = `${item.category}:${item.status}`;
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {} as Record<string, number>);
  const qualityCheckIds = (gate.criticalErrors || []).map((item: JsonRecord) => item.checkId);
  const getMetric = (key: string): number | null => Number.isFinite(metrics[key]) ? metrics[key] : null;
  const factualUnsupportedClaims = getMetric('unsupportedFactualClaimCount');
  const unverifiedFactualClaims = getMetric('unverifiedFactualClaimCount');
  const unsupportedLegalAuthorities = getMetric('unsupportedLegalAuthorities');
  const actualPdfPages: number | null = null;
  const exportedWordsPdf: number | null = null;
  const exportedWordsDocx: number | null = null;
  const evidenceCoverageItems = requiredCoverage.filter((item) => /EVIDENCE/.test(item.category));
  const professional = evaluateProfessionalDraftQuality({
    draftDepth: request.draftDepth,
    renderedPages: [],
    sourceTexts: [analysis.extractedText || ''],
    substantiveText: generatedText,
    contentStopReason: generated.generationMetadata?.draftContentStopReason || null,
    verifiedAuthorityCount: getMetric('verifiedAuthorityCount') ?? 0,
    appliedAuthorityCount: getMetric('appliedAuthorityCount') ?? 0,
    factsCovered: getMetric('factsWithResponse') ?? 0,
    factsRequired: getMetric('factsTotal') ?? 0,
    claimsCovered: getMetric('claimsWithResponse') ?? 0,
    claimsRequired: getMetric('claimsTotal') ?? 0,
    evidenceCoverage: evidenceCoverageItems.length
      ? evidenceCoverageItems.filter((item) => item.status === 'covered').length / evidenceCoverageItems.length : 1,
    sectionCoverage: generated.sections?.length
      ? generated.sections.filter((section: JsonRecord) => (section.content || []).some((block: JsonRecord) => (block.text || '').trim().length > 50)).length / generated.sections.length
      : 0,
    coherenceErrors,
    provenanceErrors: provenanceErrors ?? 1,
  });
  const providerAttemptsByOutcome = countBy(issueAttempts, 'outcome');
  const providerAttemptsByProvider = countBy(issueAttempts, 'providerActuallyUsed');
  const providerTasksByStatus = countBy(taskExecutions, 'responseStatus');
  const providerTasksByProvider = countBy(taskExecutions, 'providerActuallyUsed');
  const providerModels = issueAttempts.reduce((result, attempt) => {
    const provider = String(attempt.providerActuallyUsed || '(unavailable)');
    const model = String(attempt.model || '(model not recorded)');
    result[provider] ||= {};
    result[provider][model] = (result[provider][model] || 0) + 1;
    return result;
  }, {} as Record<string, Record<string, number>>);
  const providerResponsesWithText = issueAttempts.filter((attempt) => Number(attempt.providerGeneratedWords) > 0);
  const deterministicBlocks = draftBlocks.filter((block) => block.generatedBy === 'DETERMINISTIC');
  const sectionTitles = (generated.sections || []).map((section: JsonRecord) => ({
    id: section.id,
    type: section.type,
    title: section.title,
    words: wordCount((section.content || []).map((block: JsonRecord) => block.text || '').join(' ')),
  }));
  const placeholderMatches = [...generatedText.matchAll(/\[(?:DATO PENDIENTE[^\]]*|REQUIERE DEFINIR[^\]]*|NO RESUELTO[^\]]*)\]/giu)].map((match) => match[0]);
  const readiness = assessFinalGeneratorReadiness({
    exportAllowed: draftExportAllowed,
    docxPresent,
    pdfPresent,
    actualPdfPages,
    minimumPages: request.draftDepth === 'PROFESSIONAL_20' ? 15 : 30,
    substantiveWords: professional.substantiveWords,
    minimumSubstantiveWords: request.draftDepth === 'PROFESSIONAL_20' ? 1_200 : 1_800,
    professionalQualityGate: professional.qualityGate,
    criticalCheckIds: [
      ...qualityCheckIds,
      ...(!docxPresent ? ['DOCX_NOT_EXPORTED'] : []),
      ...(!pdfPresent ? ['PDF_NOT_EXPORTED'] : []),
    ],
    factualUnsupportedClaims,
    unverifiedFactualClaims,
    unsupportedLegalAuthorities,
    factsTotal: getMetric('factsTotal') ?? 0,
    factsWithResponse: getMetric('factsWithResponse') ?? 0,
    claimsTotal: getMetric('claimsTotal') ?? 0,
    claimsWithResponse: getMetric('claimsWithResponse') ?? 0,
    providerBackedTasks: providerBackedTasks.length,
  });

  const report = {
    meta: {
      runId: trace.generationId || path.basename(runDir),
      runFolder: path.basename(runDir),
      caseNumber: request.caseNumber,
      draftDepth: request.draftDepth,
      runDir,
      startedAt: request.startedAt,
      completedAt: trace.completedAt || null,
      privateCaseContext: request.privateCaseContext,
      externalProviderOptIn: request.externalProviderOptIn,
      sourceFileName: request.sourceFileName,
      sourceSha256: request.sourceSha256,
      sourcePath: sourceManifest?.extractedSourcePath || null,
      sourceBytes: sourceManifest?.sourceBytes || null,
      generationDurationMs: trace.startedAt && trace.completedAt
        ? Date.parse(trace.completedAt) - Date.parse(trace.startedAt) : null,
      result: readiness.ready ? `CASE_${String(request.caseNumber).padStart(2, '0')}_GENERATOR_PASS` : `CASE_${String(request.caseNumber).padStart(2, '0')}_GENERATOR_FAIL`,
      evidenceRebuiltOffline: true,
      reportRebuildReason: 'El proceso E2E terminó el pipeline y guardó generated-document/trace, pero el runner falló al ensamblar el reporte por una referencia no definida. Este archivo se reconstruyó sin invocar providers ni volver a generar.',
    },
    providerInfo: {
      configuredChain: request.providerChain,
      providerDistributionByGenerationTask: providerTasksByProvider,
      providerTaskStatusCounts: providerTasksByStatus,
      generationTaskExecutions: taskExecutions.length,
      providerBackedGenerationTasks: providerBackedTasks.length,
      issueGenerationAttemptRecords: countIssueGenerationAttemptRecords(trace),
      issueAttemptOutcomeCounts: providerAttemptsByOutcome,
      issueAttemptProviderCounts: providerAttemptsByProvider,
      issueAttemptModelsByProvider: providerModels,
      externalProviderAttemptsWithGeneratedText: providerResponsesWithText.length,
      issueAttemptsByValidationStatus: countBy(issueAttempts, 'validationStatus'),
      deterministicDraftBlockCount: deterministicBlocks.length,
      deterministicDraftBlockSections: [...new Set(deterministicBlocks.map((block) => block.sectionId))],
      extensionMetrics: extension.metrics || null,
      rawHttpCallCount: null,
      rawHttpCallCountNote: 'El trace no registra cada request HTTP de provider; distingue task executions e issue-generation attempts.',
    },
    sourceAnalysis: {
      sourceValidated: analysis.sourceValidated,
      extractedCharacters: (analysis.extractedText || '').length,
      sourcePages: (analysis.pages || []).length,
      facts: analysis.analysis?.facts?.length ?? null,
      claims: analysis.analysis?.claims?.length ?? null,
      evidence: analysis.analysis?.evidence?.length ?? null,
    },
    document: {
      pagesActualPdf: actualPdfPages,
      pageCountReason: 'No hay PDF exportado: el preflight DRAFT bloqueó la exportación. No se estima ni se inventa una paginación.',
      draftContentStopReason: generated.generationMetadata?.draftContentStopReason || null,
      extensionPlan: {
        targetWords: extension.targetWords ?? null,
        maxCallsPerDocument: extension.maxCallsPerDocument ?? null,
        maxContinuationsPerSection: extension.maxContinuationsPerSection ?? null,
        maxExpansionPasses: extension.maxExpansionPasses ?? null,
        maxGeneratedTokens: extension.maxGeneratedTokens ?? null,
        targetPages: extension.targetPages ?? null,
        minPages: extension.minPages ?? null,
        maxPages: extension.maxPages ?? null,
        internalEstimatedPages: extension.actualPages ?? null,
        extensionTargetUnmet: extension.metrics?.extensionTargetUnmet ?? null,
      },
      generatedTextWords: wordCount(generatedText),
      qualityGateWordCount: metrics.wordCount ?? null,
      traceAssembledWords: wordTotals.assembledWords,
      traceExportedWords: wordTotals.exportedWords,
      exportedPdfWords: exportedWordsPdf,
      exportedDocxWords: exportedWordsDocx,
      sections: sectionTitles,
      placeholderCount: placeholderMatches.length,
      placeholders: [...new Set(placeholderMatches)],
    },
    quality: {
      gate: professional.qualityGate,
      storedDocumentQualityGatePassed: generated.qualityGate?.passed ?? null,
      documentQualityCriticalChecks: qualityCheckIds,
      criticalErrors: gate.criticalErrors || [],
      exactDuplicateRatio: professional.exactDuplicateRatio,
      semanticDuplicateRatio: professional.semanticDuplicateRatio,
      sourceCopyRatio: professional.sourceCopyRatio,
      factualUnsupportedClaims,
      unverifiedFactualClaims,
      verifiedAuthorityCount: getMetric('verifiedAuthorityCount'),
      appliedAuthorityCount: getMetric('appliedAuthorityCount'),
      unsupportedLegalAuthorities,
      provenanceErrors,
      provenanceStatus: provenanceGate?.status || null,
      provenanceIssues: provenanceGate?.issues || [],
      coherenceErrors,
      factsTotal: getMetric('factsTotal'),
      factsWithResponse: getMetric('factsWithResponse'),
      claimsTotal: getMetric('claimsTotal'),
      claimsWithResponse: getMetric('claimsWithResponse'),
      unsupportedEvidenceCount: getMetric('unsupportedEvidenceCount'),
      inappropriateSectionCount: getMetric('inappropriateSectionCount'),
    },
    coverage: {
      totalItems: coverageItems.length,
      required: requiredCoverage.length,
      covered: requiredCoverage.filter((item) => item.status === 'covered').length,
      pending: requiredCoverage.filter((item) => item.status === 'pending').length,
      weak: requiredCoverage.filter((item) => item.status === 'weak').length,
      needsClientPosition: requiredCoverage.filter((item) => item.status === 'needs_client_position').length,
      blocked: requiredCoverage.filter((item) => item.status === 'blocked').length,
      statusCounts,
      categoryStatusCounts,
      pipelineStageCounts: countBy(coverageTrace, 'pipelineStage'),
      trace: coverageTrace,
    },
    wordAccounting: {
      unit: 'Unicode letter/number tokens, as recorded by the runner',
      totals: wordTotals,
      actualExportWords: null,
      rows: accountingRows,
    },
    export: {
      mode: 'DRAFT',
      allowed: draftExportAllowed,
      preflightError: draftExportError,
      docxPresent,
      pdfPresent,
      docxPath: docxPresent ? docxPath : null,
      pdfPath: pdfPresent ? pdfPath : null,
      pdfPageCountActual: actualPdfPages,
      note: 'Los artefactos de salida no existen porque falló el preflight; este proceso offline no intenta omitir el guard.',
    },
    runtimeIncidents: [
      'La conexión Prisma falló al abrir TLS: Windows SChannel indicó que no había credenciales disponibles en el paquete de seguridad (-2146893042); el flujo de análisis continuó en fallback local y los eventos de uso no pudieron persistirse.',
      'Groq registró 429 por límites de tokens/TPD y el router recurrió a NVIDIA y, en una tarea, a Gemini. La cadena configurada se conserva en la evidencia.',
      'La consola registró timeouts de 60 segundos en las secciones EXCEPCIONES Y DEFENSAS y DERECHO, que usaron contenido determinístico.',
      'Una llamada NVIDIA agotó el timeout de 120 segundos y el router hizo fallback a Gemini; no se restaura Ollama.',
    ],
    readiness,
    files: {
      validationReport: path.join(runDir, 'validation-report.json'),
      generatedDocument: path.join(evidenceDir, 'generated-document.json'),
      generatedText: path.join(evidenceDir, 'generated-text.txt'),
      analyzeUploadResponse: path.join(evidenceDir, 'analyze-upload-response.json'),
      generationTrace: path.join(evidenceDir, 'generation-trace.json'),
      docx: docxPresent ? docxPath : null,
      pdf: pdfPresent ? pdfPath : null,
    },
  };

  const evidenceNames = [
    'analyze-upload-response.json', 'generated-document.json', 'generated-text.txt',
    'generation-report-final-validation-01-EXTENSIVE_40-2026-09-29T02-39-12.md',
    'generation-request-summary.json', 'generation-trace.json',
    'generation-trace-final-validation-01-EXTENSIVE_40-2026-09-29T02-39-12.json',
  ];
  const evidenceSizes: Record<string, number | null> = {};
  for (const name of evidenceNames) {
    try { evidenceSizes[name] = (await stat(path.join(evidenceDir, name))).size; }
    catch { evidenceSizes[name] = null; }
  }
  report.files = { ...report.files, evidenceSizes };

  await writeFile(path.join(runDir, 'validation-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.meta.runId, result: report.meta.result, generatedTextWords: report.document.generatedTextWords, pagesActualPdf: report.document.pagesActualPdf, issueGenerationAttemptRecords: report.providerInfo.issueGenerationAttemptRecords, coverage: report.coverage.statusCounts, blockers: report.readiness.blockers, validationReport: report.files.validationReport }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
