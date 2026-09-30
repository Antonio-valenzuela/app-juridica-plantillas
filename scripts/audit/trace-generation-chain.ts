import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { reconcileSectionWordAccounting } from '../../lib/legal-engine/generationWordReconciliation';

type Row = Record<string, any>;
type IssueTraceContext = {
  document: Row;
  trace: Row;
  finalBlocks: Row[];
  traceBlocks: Row[];
  assembledIds: Set<string>;
  sectionsByBlockId: Map<string, string>;
};

const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const list = (value: unknown): Row[] => Array.isArray(value) ? value.filter(isRow) : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const textWords = (text: string): string[] => text.match(/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu) || [];
const sha256 = (value: string): string => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const asRecord = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

function preview(text: string, limit = 200): { wordCount: number; firstWords: string; truncated: boolean } {
  const words = textWords(text);
  return { wordCount: words.length, firstWords: words.slice(0, limit).join(' '), truncated: words.length > limit };
}

function entitySourceIds(entities: Row[]): string[] {
  return unique(entities.flatMap((entity) => [
    entity.documentId,
    entity.sourceReference?.documentId,
    entity.sourceReference?.sourceId,
    ...list(entity.provenance).map((entry) => entry.sourceId),
    ...list(entity.sourceSpans).map((entry) => entry.sourceId),
  ].filter((value): value is string => typeof value === 'string')));
}

function rowFactIds(row: Row): string[] {
  return unique([...strings(row.factIds), ...strings(row.relatedFactIds)]);
}

function rowClaimIds(row: Row): string[] {
  return unique([...strings(row.claimIds), ...strings(row.relatedClaimIds)]);
}

function rowEvidenceIds(row: Row): string[] {
  return unique([
    ...strings(row.evidenceIds), ...strings(row.evidenceMentionIds), ...strings(row.evidenceOfferIds),
    ...strings(row.relatedEvidenceIds),
  ]);
}

function overlaps(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function storedProviderText(row: Row): string | undefined {
  for (const key of ['rawOutput', 'providerOutput', 'responseText', 'outputText', 'content']) {
    if (typeof row[key] === 'string' && row[key].trim()) return row[key];
  }
  return undefined;
}

function reasonCodes(...values: unknown[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) result.push(value.trim());
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string' && item.trim()) result.push(item.trim());
    }
  }
  return unique(result);
}

function buildIssueRow(issue: Row, context: IssueTraceContext): Row {
  const { document, trace, finalBlocks, traceBlocks, assembledIds, sectionsByBlockId } = context;
  const taskIds = list(trace.generationTasks)
    .filter((task) => strings(task.legalIssueIds).includes(issue.id))
    .map((task) => task.taskId || task.id)
    .filter((id): id is string => typeof id === 'string');
  const tasks = list(trace.generationTasks).filter((task) => taskIds.includes(task.taskId || task.id));
  const attempts = list(trace.issueGenerationAttempts).filter((attempt) =>
    attempt.legalIssueId === issue.id || taskIds.includes(attempt.taskId),
  );
  const executions = list(trace.taskExecutions).filter((execution) => taskIds.includes(execution.taskId));

  const taskFactIds = unique([...strings(issue.factIds), ...tasks.flatMap((task) => strings(task.factIds))]);
  const taskClaimIds = unique([...strings(issue.claimIds), ...tasks.flatMap((task) => strings(task.claimIds))]);
  const taskEvidenceIds = unique([
    ...strings(issue.evidenceMentionIds), ...strings(issue.evidenceOfferIds),
    ...tasks.flatMap((task) => strings(task.evidenceIds)),
  ]);
  const taskCoverageIds = unique([...strings(issue.coverageItemIds), ...tasks.flatMap((task) => strings(task.coverageItemIds))]);

  const analysis = asRecord(document.caseAnalysis);
  const factEntities = list(analysis.facts).filter((entity) => taskFactIds.includes(entity.id));
  const claimEntities = [...list(analysis.claims), ...list(analysis.claimResponses)]
    .filter((entity) => taskClaimIds.includes(entity.id));
  const evidenceEntities = list(analysis.evidence).filter((entity) => taskEvidenceIds.includes(entity.id));
  const sourceDocumentIds = entitySourceIds([...factEntities, ...claimEntities, ...evidenceEntities]);

  const matrixItems = list(document.coverageMatrix?.items);
  const aliases = matrixItems.filter((item) => item.metadata?.compatibilityAlias === true
    && (taskFactIds.includes(item.metadata?.richSourceId)
      || taskClaimIds.includes(item.metadata?.richSourceId)
      || taskEvidenceIds.includes(item.metadata?.richSourceId)
      || overlaps(rowFactIds(item), taskFactIds)
      || overlaps(rowClaimIds(item), taskClaimIds)
      || overlaps(rowEvidenceIds(item), taskEvidenceIds)));
  const coverageItems = unique([...taskCoverageIds, ...aliases.map((item) => item.id)])
    .map((id) => matrixItems.find((item) => item.id === id))
    .filter((item): item is Row => Boolean(item));

  const attemptHashes = unique(attempts.flatMap((attempt) => [attempt.resultHash, attempt.rawOutputHash]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)));
  const knownBlockIds = new Set<string>([
    ...tasks.map((task) => task.finalBlockId).filter((value): value is string => typeof value === 'string'),
    ...traceBlocks.filter((block) => taskIds.includes(block.generationTaskId)).map((block) => block.id),
  ]);
  const directFinalBlocks = finalBlocks.filter((block) => {
    const linkedTasks = unique([block.generationTaskId, ...strings(block.generationTaskIds)].filter(Boolean));
    const resultHashes = unique([block.issueDraftResultHash, ...strings(block.issueDraftResultHashes)].filter(Boolean));
    return knownBlockIds.has(block.id)
      || linkedTasks.some((id) => taskIds.includes(id))
      || strings(block.legalIssueIds).includes(issue.id)
      || resultHashes.some((hash) => attemptHashes.includes(hash));
  });

  const issueFactIds = unique([...taskFactIds, ...aliases.flatMap(rowFactIds)]);
  const issueClaimIds = unique([...taskClaimIds, ...aliases.flatMap(rowClaimIds)]);
  const issueEvidenceIds = unique([...taskEvidenceIds, ...aliases.flatMap(rowEvidenceIds)]);
  const issueCoverageIds = unique([...taskCoverageIds, ...aliases.map((item) => item.id)]);
  const linkedFinalBlocks = finalBlocks.filter((block) => {
    if (directFinalBlocks.some((direct) => direct.id === block.id)) return true;
    // Expansion association is strictly by declared IDs. It does not assert that the text supports them.
    return overlaps(strings(block.coverageItemIds), issueCoverageIds)
      || overlaps(strings(block.factIds), issueFactIds)
      || overlaps(strings(block.claimIds), issueClaimIds)
      || overlaps(rowEvidenceIds(block), issueEvidenceIds);
  });
  const traceDraftBlocks = traceBlocks.filter((block) => {
    if (taskIds.includes(block.generationTaskId) || knownBlockIds.has(block.id)) return true;
    return overlaps(strings(block.coverageItemIds), issueCoverageIds)
      || overlaps(strings(block.factIds), issueFactIds)
      || overlaps(strings(block.claimIds), issueClaimIds)
      || overlaps(rowEvidenceIds(block), issueEvidenceIds);
  });
  const directTraceBlocks = traceDraftBlocks.filter((block) => taskIds.includes(block.generationTaskId) || knownBlockIds.has(block.id));
  const expansionFinalBlocks = linkedFinalBlocks.filter((block) => !directFinalBlocks.some((direct) => direct.id === block.id));
  const expansionTraceBlocks = traceDraftBlocks.filter((block) => !directTraceBlocks.some((direct) => direct.id === block.id));
  const materializedBlockIds = unique([...directTraceBlocks.map((block) => block.id), ...directFinalBlocks.map((block) => block.id)]);
  const assembledBlockIds = materializedBlockIds.filter((id) => assembledIds.has(id));

  const auditRecords = list(document.generationMetadata?.factualClaims)
    .filter((record) => directFinalBlocks.some((block) => block.id === record.blockId));
  const generatedTextBlocks = directFinalBlocks.filter((block) => block.generatedBy === 'AI' && typeof block.text === 'string' && block.text.trim());
  const factualSentenceCount = generatedTextBlocks.reduce((sum, block) =>
    sum + (block.text.match(/[^.!?;\n]+[.!?;]?/gu) || []).filter((sentence: string) => sentence.trim()).length, 0);

  const authorityIds = strings(issue.authorityMentionIds);
  const authorityUses = list(document.generationMetadata?.authorityUses)
    .filter((use) => authorityIds.includes(use.authorityMentionId) || authorityIds.includes(use.authorityId));
  const verifiedAuthorities = list(document.generationMetadata?.verifiedAuthorities)
    .filter((authority) => authorityIds.includes(authority.authorityMentionId) || authorityIds.includes(authority.id));

  const responseRows = attempts.map((attempt) => {
    const rawText = storedProviderText(attempt);
    const linkedBlocks = directFinalBlocks.filter((block) =>
      strings(block.issueDraftResultHashes).includes(attempt.resultHash)
      || block.issueDraftResultHash === attempt.resultHash
      || block.generationTaskId === attempt.taskId,
    );
    const linkedText = linkedBlocks.map((block) => String(block.text || '')).find((value) => value.trim()) || '';
    const previewSource = rawText || linkedText;
    return {
      taskId: attempt.taskId,
      provider: attempt.providerActuallyUsed || attempt.providerRequested || 'NO_ATRIBUIBLE',
      model: attempt.model || null,
      outcome: attempt.outcome || 'NO_ATRIBUIBLE',
      validationStatus: attempt.validationStatus || 'NO_ATRIBUIBLE',
      responseHash: attempt.resultHash || attempt.rawOutputHash || null,
      storedRawText: Boolean(rawText),
      textOrigin: rawText ? 'trace-provider-response' : linkedText ? 'linked-final-block-only' : 'not-stored',
      providerGeneratedWords: Number.isFinite(attempt.providerGeneratedWords) ? attempt.providerGeneratedWords : null,
      providerGeneratedChars: Number.isFinite(attempt.providerGeneratedChars) ? attempt.providerGeneratedChars : null,
      preview: previewSource ? preview(previewSource) : null,
      linkedFinalBlockIds: linkedBlocks.map((block) => block.id),
      reasonCodes: reasonCodes(attempt.error, attempt.evaluation?.hardFailReasons, attempt.evaluation?.deficiencies),
    };
  });

  const taskReasonCodes = reasonCodes(
    ...tasks.map((task) => task.error),
    ...tasks.map((task) => task.evaluation?.hardFailReasons),
    ...tasks.map((task) => task.evaluation?.deficiencies),
    ...executions.map((execution) => execution.error),
    ...executions.map((execution) => execution.evaluation?.hardFailReasons),
    ...executions.map((execution) => execution.evaluation?.deficiencies),
  );
  const validationStatuses = unique([
    ...attempts.map((attempt) => attempt.validationStatus),
    ...tasks.map((task) => task.responseStatus),
    ...directFinalBlocks.map((block) => block.issueDraftValidationStatus),
  ].filter((value): value is string => typeof value === 'string'));

  let lossStage = 'NO_ATRIBUIBLE';
  let lossReasonCodes = ['NO_ATRIBUIBLE'];
  if (tasks.length === 0) {
    // A block can be linked by source IDs, but the trace has no task-level transition for this issue.
    lossStage = linkedFinalBlocks.length ? 'coverage' : 'NO_ATRIBUIBLE';
    lossReasonCodes = linkedFinalBlocks.length ? ['NO_TASK_FOR_LINKED_BLOCK'] : ['NO_ATRIBUIBLE'];
  } else if (tasks.some((task) => task.responseStatus === 'FAILED' || task.responseStatus === 'REJECTED')) {
    lossStage = taskReasonCodes.some((code) => /INVALID_JSON|PROVIDER_|TRUNCATED/.test(code)) ? 'validation' : 'semantic-review';
    lossReasonCodes = taskReasonCodes.length ? taskReasonCodes : ['NO_ATRIBUIBLE'];
  } else if (materializedBlockIds.length === 0) {
    lossStage = 'NO_ATRIBUIBLE';
    lossReasonCodes = ['NO_ATRIBUIBLE'];
  } else if (assembledBlockIds.length === 0) {
    lossStage = 'assembly';
    lossReasonCodes = ['NO_ATRIBUIBLE'];
  } else {
    const openCoverage = coverageItems.filter((item) => item.status !== 'covered');
    if (openCoverage.length > 0) {
      lossStage = 'coverage';
      lossReasonCodes = reasonCodes(...openCoverage.map((item) => item.statusReason),
        ...openCoverage.map((item) => item.metadata?.coverageStatusReason));
      if (lossReasonCodes.length === 0) lossReasonCodes = ['NO_ATRIBUIBLE'];
    } else {
      lossStage = 'none';
      lossReasonCodes = [];
    }
  }

  const contentPreviews = [...directFinalBlocks, ...expansionFinalBlocks].map((block) => ({
    blockId: block.id,
    sectionId: sectionsByBlockId.get(block.id) || block.sectionId || null,
    validationStatus: block.issueDraftValidationStatus || 'NO_ATRIBUIBLE',
    declaredFactIds: strings(block.factIds),
    declaredClaimIds: strings(block.claimIds),
    declaredEvidenceIds: rowEvidenceIds(block),
    declaredCoverageIds: strings(block.coverageItemIds),
    textHash: typeof block.text === 'string' ? sha256(block.text) : null,
    preview: typeof block.text === 'string' ? preview(block.text) : null,
    expansionLinkOnly: !directFinalBlocks.some((direct) => direct.id === block.id),
  }));

  return {
    issueId: issue.id,
    taskIds,
    sourceDocumentIds,
    sourceEntityIds: { factIds: taskFactIds, claimIds: taskClaimIds, evidenceIds: taskEvidenceIds },
    factIds: {
      issue: strings(issue.factIds),
      task: unique(tasks.flatMap((task) => strings(task.factIds))),
      finalBlock: unique(directFinalBlocks.flatMap((block) => strings(block.factIds))),
      linkedExpansion: unique(expansionFinalBlocks.flatMap((block) => strings(block.factIds))),
    },
    claimIds: {
      issue: strings(issue.claimIds),
      task: unique(tasks.flatMap((task) => strings(task.claimIds))),
      finalBlock: unique(directFinalBlocks.flatMap((block) => strings(block.claimIds))),
      linkedExpansion: unique(expansionFinalBlocks.flatMap((block) => strings(block.claimIds))),
    },
    evidenceIds: {
      issue: unique([...strings(issue.evidenceMentionIds), ...strings(issue.evidenceOfferIds)]),
      task: unique(tasks.flatMap((task) => strings(task.evidenceIds))),
      finalBlock: unique(directFinalBlocks.flatMap(rowEvidenceIds)),
      linkedExpansion: unique(expansionFinalBlocks.flatMap(rowEvidenceIds)),
    },
    providerResponses: responseRows,
    validationStatuses,
    validationReasonCodes: taskReasonCodes,
    factualAudit: {
      recordCount: auditRecords.length,
      generatedBlockCount: generatedTextBlocks.length,
      generatedSentenceCount: factualSentenceCount,
      auditedSentenceCount: auditRecords.length,
      reasonCode: auditRecords.length < factualSentenceCount ? 'FACTUAL_CLAIM_AUDIT_MISSING' : null,
    },
    authorityAudit: {
      authorityIds,
      uses: authorityUses.map((use) => ({ authorityId: use.authorityId || use.authorityMentionId, status: use.status || use.verificationStatus || 'NO_ATRIBUIBLE' })),
      verifiedAuthorityIds: verifiedAuthorities.map((authority) => authority.id || authority.authorityId),
      reasonCode: authorityIds.length > 0 && verifiedAuthorities.length === 0 ? 'AUTHORITY_VERIFICATION_FAILED' : null,
    },
    coverage: coverageItems.map((item) => ({
      coverageId: item.id,
      status: item.status || 'NO_ATRIBUIBLE',
      reasonCode: item.statusReason || item.metadata?.coverageStatusReason || 'NO_ATRIBUIBLE',
      compatibilityAlias: item.metadata?.compatibilityAlias === true,
      required: item.required === true,
    })),
    materialized: materializedBlockIds.length > 0,
    materializedBlockIds,
    linkedExpansionBlockIds: unique([...expansionFinalBlocks.map((block) => block.id), ...expansionTraceBlocks.map((block) => block.id)]),
    assembled: assembledBlockIds.length > 0,
    assembledBlockIds,
    assembledSectionIds: unique(assembledBlockIds.map((id) => sectionsByBlockId.get(id) || '').filter(Boolean)),
    contentPreviews,
    lossStage,
    lossReasonCodes,
  };
}

export function buildGenerationChainTrace(document: Row, trace: Row): Row {
  const finalBlocks: Row[] = list(document.sections).flatMap((section) =>
    list(section.content).map((block): Row => ({ ...block, sectionId: section.id })),
  );
  const sectionsByBlockId = new Map<string, string>(finalBlocks.map((block): [string, string] => [String(block.id), String(block.sectionId)]));
  const assemblyBlocks = list(document.documentAssemblyResult?.orderedBlocks);
  const assembledIds = new Set<string>([
    ...strings(trace.documentAssembly?.orderedBlockIds),
    ...assemblyBlocks.map((block) => block.id).filter((id): id is string => typeof id === 'string'),
  ]);
  const issues = list(document.legalIssueMatrix?.issues);
  const context: IssueTraceContext = { document, trace, finalBlocks, traceBlocks: list(trace.draftBlocks), assembledIds, sectionsByBlockId };
  const issueRows = issues.map((issue) => buildIssueRow(issue, context));
  const accounting = list(trace.wordAccounting).map((row) => ({
    sectionId: row.sectionId || 'NO_ATRIBUIBLE',
    accountingSchemaVersion: row.accountingSchemaVersion ?? null,
    plannedWords: row.plannedWords ?? null,
    providerGeneratedWords: row.providerGeneratedWords ?? null,
    providerGeneratedChars: row.providerGeneratedChars ?? null,
    validatedWords: row.validatedWords ?? null,
    rejectedWords: row.rejectedWords ?? null,
    dedupRemovedWords: row.dedupRemovedWords ?? null,
    materializedWords: row.materializedWords ?? null,
    admittedWords: row.admittedWords ?? null,
    assembledWords: row.assembledWords ?? null,
    exportedWords: row.exportedWords ?? null,
    declaredLosses: list(row.losses).map((loss) => ({
      lossId: loss.lossId || null,
      stage: loss.stage || 'NO_ATRIBUIBLE',
      reasonCode: loss.reason || 'NO_ATRIBUIBLE',
      words: Number.isFinite(loss.words) ? loss.words : null,
      taskId: loss.taskId || null,
    })),
    reconciliation: reconcileSectionWordAccounting(row),
  }));
  const coverageItems = list(document.coverageMatrix?.items);
  const totals = {
    issues: issueRows.length,
    providerCalls: list(trace.issueGenerationAttempts).length,
    providerSuccesses: list(trace.issueGenerationAttempts).filter((attempt) => attempt.outcome === 'PROVIDER_SUCCESS').length,
    validNonFinal: list(trace.generationTasks).filter((task) => task.responseStatus === 'VALID_NON_FINAL').length,
    materializedIssues: issueRows.filter((row) => row.materialized).length,
    assembledIssues: issueRows.filter((row) => row.assembled).length,
    issuesWithIdLinkedExpansion: issueRows.filter((row) => row.linkedExpansionBlockIds.length > 0).length,
    factualClaimRecords: list(document.generationMetadata?.factualClaims).length,
    coverage: {
      total: coverageItems.length,
      required: coverageItems.filter((item) => item.required).length,
      compatibilityAliases: coverageItems.filter((item) => item.metadata?.compatibilityAlias === true).length,
      byStatus: Object.fromEntries([...new Set(coverageItems.map((item) => item.status || 'NO_ATRIBUIBLE'))]
        .map((status) => [status, coverageItems.filter((item) => (item.status || 'NO_ATRIBUIBLE') === status).length])),
    },
    accounting: accounting.reduce((sum, row) => {
      for (const key of ['plannedWords', 'providerGeneratedWords', 'providerGeneratedChars', 'validatedWords', 'rejectedWords', 'dedupRemovedWords', 'materializedWords', 'admittedWords', 'assembledWords', 'exportedWords'] as const) {
        sum[key] += typeof row[key] === 'number' ? row[key] : 0;
      }
      return sum;
    }, {
      plannedWords: 0, providerGeneratedWords: 0, providerGeneratedChars: 0, validatedWords: 0,
      rejectedWords: 0, dedupRemovedWords: 0, materializedWords: 0, admittedWords: 0,
      assembledWords: 0, exportedWords: 0,
    }),
    wordReconciliation: {
      sections: accounting.length,
      consistentSections: accounting.filter((row) => row.reconciliation.consistent).length,
      inconsistentSections: accounting.filter((row) => !row.reconciliation.consistent).length,
      missingCounterCount: accounting.reduce((sum, row) => sum + row.reconciliation.missingCounters.length, 0),
      errors: unique(accounting.flatMap((row) => row.reconciliation.errors)),
      transitionResiduals: accounting.flatMap((row) => row.reconciliation.transitions
        .filter((transition: Row) => transition.residualWords !== 0 || transition.reasonCode !== 'RECONCILED')
        .map((transition: Row) => ({ sectionId: row.sectionId, ...transition }))),
    },
  };

  return {
    schemaVersion: 'offline-generation-chain-trace/v1',
    generationId: trace.generationId || document.generationMetadata?.generationId || document.id || 'NO_ATRIBUIBLE',
    inputs: { documentId: document.id || null, sourceIds: strings(trace.sourceIds) },
    totals,
    issues: issueRows,
    wordAccounting: accounting,
    globalQuality: {
      passed: document.qualityGate?.passed ?? null,
      canMarkAsFinal: document.qualityGate?.canMarkAsFinal ?? null,
      canExport: document.validation?.canExport ?? null,
      readiness: document.__juridicoRadar?.readiness?.readiness || document.lifecycle?.readiness || null,
      criticalCodes: list(document.qualityGate?.criticalErrors).map((entry) => entry.checkId || entry.code || 'NO_ATRIBUIBLE'),
      verifiedAuthorityCount: document.qualityGate?.metrics?.verifiedAuthorityCount ?? null,
      unsupportedAuthorityCount: document.qualityGate?.metrics?.unsupportedLegalAuthorities ?? null,
      factualUnsupportedCount: document.qualityGate?.metrics?.unsupportedFactualClaimCount ?? null,
      factualUnverifiedCount: document.qualityGate?.metrics?.unverifiedFactualClaimCount ?? null,
    },
  };
}

function markdownReport(result: Row): string {
  const { totals, issues } = result;
  const lines = [
    `# Trazado offline de GenerationIssue — ${result.generationId}`,
    '',
    'El reporte se construyó únicamente con los JSON indicados. Los enlaces de expansión se atribuyen solo por IDs declarados y no prueban soporte semántico. `NO_ATRIBUIBLE` significa que el artefacto no conserva evidencia suficiente para localizar esa transición.',
    '',
    `Issues: ${totals.issues}; intentos provider registrados: ${totals.providerCalls}; éxitos de provider: ${totals.providerSuccesses}; issues con VALID_NON_FINAL: ${totals.validNonFinal}; materializados: ${totals.materializedIssues}; ensamblados: ${totals.assembledIssues}.`,
    `Coverage del snapshot: ${totals.coverage.total} items, ${totals.coverage.required} marcados required, ${totals.coverage.compatibilityAliases} aliases de compatibilidad. Estados: ${Object.entries(totals.coverage.byStatus).map(([state, count]) => `${state}=${count}`).join(', ')}.`,
    '',
    '| issueId | taskId | source IDs | provider / validación | bloque materializado | ensamblado | Coverage final | pérdida / razón |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const issue of issues) {
    const provider = issue.providerResponses.map((item: Row) => `${item.provider}/${item.validationStatus}`).join('<br>') || 'NO_ATRIBUIBLE';
    const coverage = issue.coverage.map((item: Row) => `${item.coverageId}:${item.status}${item.reasonCode !== 'NO_ATRIBUIBLE' ? ` (${item.reasonCode})` : ''}${item.compatibilityAlias ? ' [alias]' : ''}`).join('<br>') || 'NO_ATRIBUIBLE';
    lines.push(`| ${issue.issueId} | ${issue.taskIds.join('<br>') || 'NO_ATRIBUIBLE'} | ${issue.sourceDocumentIds.join('<br>') || 'NO_ATRIBUIBLE'} | ${provider} | ${issue.materializedBlockIds.join('<br>') || 'no'} | ${issue.assembledBlockIds.join('<br>') || 'no'} | ${coverage} | ${issue.lossStage}: ${issue.lossReasonCodes.join(', ') || '—'} |`);
  }
  lines.push('', '## Texto y trazabilidad por issue', '');
  for (const issue of issues) {
    lines.push(`### ${issue.issueId}`, '');
    lines.push(`- taskId: ${issue.taskIds.join(', ') || 'NO_ATRIBUIBLE'}`);
    lines.push(`- factIds (issue/task/bloque directo/expansión enlazada): ${issue.factIds.issue.join(', ') || '—'} / ${issue.factIds.task.join(', ') || '—'} / ${issue.factIds.finalBlock.join(', ') || '—'} / ${issue.factIds.linkedExpansion.join(', ') || '—'}`);
    lines.push(`- claimIds (issue/task/bloque directo/expansión enlazada): ${issue.claimIds.issue.join(', ') || '—'} / ${issue.claimIds.task.join(', ') || '—'} / ${issue.claimIds.finalBlock.join(', ') || '—'} / ${issue.claimIds.linkedExpansion.join(', ') || '—'}`);
    lines.push(`- evidenceIds (issue/task/bloque directo/expansión enlazada): ${issue.evidenceIds.issue.join(', ') || '—'} / ${issue.evidenceIds.task.join(', ') || '—'} / ${issue.evidenceIds.finalBlock.join(', ') || '—'} / ${issue.evidenceIds.linkedExpansion.join(', ') || '—'}`);
    lines.push(`- bloques de expansión enlazados por ID (sin atribuirles soporte semántico): ${issue.linkedExpansionBlockIds.join(', ') || '—'}`);
    lines.push(`- validación: ${issue.validationStatuses.join(', ') || 'NO_ATRIBUIBLE'}; códigos: ${issue.validationReasonCodes.join(', ') || 'NO_ATRIBUIBLE'}`);
    lines.push(`- auditoría factual: ${issue.factualAudit.recordCount} registros / ${issue.factualAudit.generatedSentenceCount} oraciones generadas; ${issue.factualAudit.reasonCode || 'sin faltante detectado'}`);
    lines.push(`- auditoría de autoridad: IDs ${issue.authorityAudit.authorityIds.join(', ') || '—'}; verificadas ${issue.authorityAudit.verifiedAuthorityIds.join(', ') || '0'}; ${issue.authorityAudit.reasonCode || 'sin relación atribuible'}`);
    lines.push(`- materializado: ${issue.materialized ? 'sí' : 'no'} (${issue.materializedBlockIds.join(', ') || '—'}); ensamblado: ${issue.assembled ? 'sí' : 'no'} (${issue.assembledSectionIds.join(', ') || '—'})`);
    lines.push(`- pérdida: ${issue.lossStage}; códigos exactos: ${issue.lossReasonCodes.join(', ') || '—'}`);
    for (const response of issue.providerResponses) {
      lines.push(`- provider ${response.provider} (${response.model || 'modelo no registrado'}), outcome=${response.outcome}, validation=${response.validationStatus}, hash=${response.responseHash || 'NO_ATRIBUIBLE'}, texto crudo conservado=${response.storedRawText ? 'sí' : 'no'}, origen preview=${response.textOrigin}, palabras reportadas=${response.providerGeneratedWords ?? 'NO_ATRIBUIBLE'}`);
      if (response.preview) lines.push(`  - preview (${response.preview.wordCount} palabras): ${response.preview.firstWords}${response.preview.truncated ? ' …' : ''}`);
    }
    for (const block of issue.contentPreviews) {
      lines.push(`- bloque ${block.blockId} (${block.sectionId || 'sección NO_ATRIBUIBLE'}), expansión enlazada solo por IDs=${block.expansionLinkOnly ? 'sí' : 'no'}, cobertura declarada=${block.declaredCoverageIds.join(', ') || '—'}, hash texto=${block.textHash || 'NO_ATRIBUIBLE'}`);
      if (block.preview) lines.push(`  - texto (${block.preview.wordCount} palabras): ${block.preview.firstWords}${block.preview.truncated ? ' …' : ''}`);
    }
    lines.push('');
  }
  lines.push('## Contabilidad por sección', '', `Conciliación: ${totals.wordReconciliation.consistentSections}/${totals.wordReconciliation.sections} secciones consistentes; errores de ID/registro: ${totals.wordReconciliation.errors.join(', ') || 'ninguno'}.`, '', '| sección | planeado | generado | validado | rechazado | dedup | materializado | admitido | ensamblado | exportado | residuo gen-valid-rech | reconciliación |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const row of result.wordAccounting) {
    const residue = [row.providerGeneratedWords, row.validatedWords, row.rejectedWords].every((value: unknown) => typeof value === 'number')
      ? row.providerGeneratedWords - row.validatedWords - row.rejectedWords : 'NO_ATRIBUIBLE';
    const transitionSummary = row.reconciliation.transitions.map((transition: Row) => `${transition.from}→${transition.to}:${transition.reasonCode}(${transition.residualWords ?? 'NO_ATRIBUIBLE'})`).join('<br>');
    lines.push(`| ${row.sectionId} | ${row.plannedWords ?? 'NO_ATRIBUIBLE'} | ${row.providerGeneratedWords ?? 'NO_ATRIBUIBLE'} | ${row.validatedWords ?? 'NO_ATRIBUIBLE'} | ${row.rejectedWords ?? 'NO_ATRIBUIBLE'} | ${row.dedupRemovedWords ?? 'NO_ATRIBUIBLE'} | ${row.materializedWords ?? 'NO_ATRIBUIBLE'} | ${row.admittedWords ?? 'NO_ATRIBUIBLE'} | ${row.assembledWords ?? 'NO_ATRIBUIBLE'} | ${row.exportedWords ?? 'NO_ATRIBUIBLE'} | ${residue} | ${transitionSummary || 'NO_ATRIBUIBLE'}; faltan contadores=${row.reconciliation.missingCounters.join(', ') || 'ninguno'}; errores=${row.reconciliation.errors.join(', ') || 'ninguno'} |`);
  }
  lines.push('', `Quality Gate: passed=${result.globalQuality.passed}; FINAL=${result.globalQuality.canMarkAsFinal}; canExport=${result.globalQuality.canExport}; readiness=${result.globalQuality.readiness}.`, `Errores críticos: ${result.globalQuality.criticalCodes.join(', ') || 'ninguno registrado'}.`, '');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): { documentPath: string; tracePath: string; outDir: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key?.startsWith('--')) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
      values.set(key, value);
      index += 1;
    }
  }
  const documentPath = values.get('--document');
  const tracePath = values.get('--trace');
  const outDir = values.get('--out');
  if (!documentPath || !tracePath || !outDir) {
    throw new Error('Usage: npx tsx scripts/audit/trace-generation-chain.ts --document <generated-document.json> --trace <generation-trace.json> --out <directory>');
  }
  return { documentPath: path.resolve(documentPath), tracePath: path.resolve(tracePath), outDir: path.resolve(outDir) };
}

if (process.argv[1] && path.basename(process.argv[1]).toLocaleLowerCase() === 'trace-generation-chain.ts') {
  const args = parseArgs(process.argv.slice(2));
  const document = JSON.parse(fs.readFileSync(args.documentPath, 'utf8')) as Row;
  const trace = JSON.parse(fs.readFileSync(args.tracePath, 'utf8')) as Row;
  if (document.generationMetadata?.generationId && trace.generationId
    && document.generationMetadata.generationId !== trace.generationId) {
    throw new Error('The document and trace generationId values do not match.');
  }
  const result = buildGenerationChainTrace(document, trace);
  result.inputs.documentPath = args.documentPath;
  result.inputs.tracePath = args.tracePath;
  result.inputs.documentSha256 = sha256(fs.readFileSync(args.documentPath, 'utf8'));
  result.inputs.traceSha256 = sha256(fs.readFileSync(args.tracePath, 'utf8'));
  fs.mkdirSync(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, 'generation-chain-trace.json');
  const markdownPath = path.join(args.outDir, 'generation-chain-trace.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, markdownReport(result), 'utf8');
  process.stdout.write(`Issues=${result.totals.issues}; JSON=${jsonPath}; Markdown=${markdownPath}\n`);
}
