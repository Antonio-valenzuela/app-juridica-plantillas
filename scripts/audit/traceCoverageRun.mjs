import fs from 'node:fs';
import path from 'node:path';

const [runDirectory, outputFile] = process.argv.slice(2);
if (!runDirectory || !outputFile) {
  throw new Error('Usage: node scripts/audit/traceCoverageRun.mjs <run-directory> <output.md>');
}

const runPath = path.resolve(runDirectory);
const outputPath = path.resolve(outputFile);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const evidencePath = path.join(runPath, 'evidence');
const trace = readJson(path.join(evidencePath, 'generation-trace.json'));
const document = readJson(path.join(evidencePath, 'generated-document.json'));
const runId = trace.generationId || path.basename(runPath);
const coverageItems = trace.coverageMatrixAfterGeneration?.items || [];
const fullCoverageById = new Map((document.coverageMatrix?.items || []).map((item) => [item.id, item]));
const reconciliationById = new Map(
  (document.documentAssemblyResult?.coverageReconciliation?.items || []).map((item) => [item.coverageItemId, item]),
);
const plans = document.draftingPlan?.sections || [];
const generationTasks = trace.generationTasks || [];
const executions = trace.taskExecutions || [];
const traceBlocks = trace.draftBlocks || [];
const assembledIds = new Set(trace.documentAssembly?.orderedBlockIds || []);
const excludedIds = new Set(trace.documentAssembly?.excludedDraftBlockIds || []);
const findings = document.documentAssemblyResult?.findings || [];
const finalBlocks = (document.sections || []).flatMap((section) =>
  (section.content || []).map((block) => ({ ...block, sectionId: section.id })),
);
const finalBlockIds = new Set(finalBlocks.map((block) => block.id));
const finalBlockById = new Map(finalBlocks.map((block) => [block.id, block]));
const taskIdsForCoverage = (item) => generationTasks
  .filter((task) => (task.coverageItemIds || []).includes(item.id))
  .map((task) => task.taskId || task.id);
const blockIdsForCoverage = (item) => traceBlocks
  .filter((block) => (block.coverageItemIds || []).includes(item.id))
  .map((block) => block.id);
const escapeCell = (value) => String(value || '—').replaceAll('|', '\\|').replaceAll('\n', ' ');
const joinCell = (values) => values.length ? values.map(escapeCell).join('<br>') : '—';

function exactDropReason(item, fullItem, taskRows, blockIds, assembledBlockIds, plannedSectionIds) {
  if (assembledBlockIds.length > 0) return '—';
  if (fullItem?.metadata?.compatibilityAlias === true) return 'COMPATIBILITY_ALIAS_HAS_NO_CANONICAL_TASK';
  if (fullItem?.requiresClientPosition || item.statusAfter === 'needs_client_position') {
    return fullItem?.statusReason || item.reason || 'CLIENT_POSITION_REQUIRED';
  }
  if (item.statusAfter === 'not_applicable' || fullItem?.status === 'not_applicable') return 'NOT_APPLICABLE';

  const failed = taskRows.find((task) => ['FAILED', 'REJECTED'].includes(task.responseStatus));
  if (failed) return failed.error || failed.fallbackReason || `TASK_${failed.responseStatus}`;

  const excluded = blockIds.find((blockId) => excludedIds.has(blockId));
  if (excluded) {
    const finding = findings.find((entry) => (entry.blockIds || []).includes(excluded));
    return finding?.code || 'BLOCK_EXCLUDED_DURING_ASSEMBLY';
  }

  if (taskRows.length > 0 && blockIds.length === 0) {
    return taskRows[0].error || taskRows[0].fallbackReason || `NO_DRAFT_BLOCK:${taskRows[0].responseStatus || 'UNKNOWN'}`;
  }
  if (plannedSectionIds.length > 0 && taskRows.length === 0) return 'PLANNED_BUT_NO_GENERATION_TASK';
  if (taskRows.length === 0) return item.reason || fullItem?.statusReason || 'NO_TASK_OR_DRAFT_BLOCK_IN_TRACE';
  const reconciliation = reconciliationById.get(item.id);
  return reconciliation?.reason || item.reason || 'NO_ASSEMBLED_BLOCK';
}

const rows = coverageItems.map((item) => {
  const fullItem = fullCoverageById.get(item.id);
  const sectionIds = fullItem?.targetSectionIds || item.sectionIds || [];
  const plannedSectionIds = plans
    .filter((section) => (section.coverageItemIds || []).includes(item.id))
    .map((section) => section.templateSectionId || section.sectionId || section.id);
  const taskIds = Array.from(new Set([
    ...taskIdsForCoverage(item),
    ...(item.taskIds || []),
  ]));
  const taskRows = taskIds
    .map((taskId) => executions.find((execution) => execution.taskId === taskId)
      || generationTasks.find((task) => (task.taskId || task.id) === taskId))
    .filter(Boolean);
  const blockIds = Array.from(new Set([
    ...blockIdsForCoverage(item),
    ...(item.draftBlockIds || []),
    ...taskRows.map((task) => task.finalBlockId).filter(Boolean),
  ]));
  const assembledBlockIds = blockIds.filter((blockId) => assembledIds.has(blockId));
  const serializedBlockIds = blockIds.filter((blockId) => finalBlockIds.has(blockId));
  const outcomes = taskRows.map((task) => {
    const responseStatus = task.responseStatus || task.status || 'UNKNOWN';
    const verdict = task.evaluation?.verdict || task.semanticEvaluation?.verdict;
    return `${task.taskId || task.id}:${responseStatus}${verdict ? `/${verdict}` : ''}`;
  });
  const validated = taskRows.some((task) =>
    ['VALID_ACCEPTED', 'VALID_NON_FINAL'].includes(task.responseStatus)
    || task.evaluation?.verdict === 'PASS'
    || task.semanticEvaluation?.verdict === 'PASS',
  ) || blockIds.some((blockId) => {
    const block = finalBlockById.get(blockId);
    return ['VALID_ACCEPTED', 'VALID_NON_FINAL'].includes(block?.issueDraftValidationStatus);
  });
  const generated = blockIds.length > 0 || taskRows.some((task) =>
    ['VALID_ACCEPTED', 'VALID_NON_FINAL', 'FALLBACK'].includes(task.responseStatus),
  );
  const reached = [];
  if (plannedSectionIds.length > 0) reached.push('PLANNED');
  if (taskRows.length > 0) reached.push('TASK_CREATED');
  if (generated) reached.push('GENERATED');
  if (validated) reached.push('VALIDATED');
  if (assembledBlockIds.length > 0) reached.push('ASSEMBLED');
  let status;
  if (assembledBlockIds.length > 0) status = 'ASSEMBLED';
  else if (excludedIds.size > 0 && blockIds.some((blockId) => excludedIds.has(blockId))) status = 'DROPPED';
  else if (taskRows.some((task) => ['FAILED', 'REJECTED'].includes(task.responseStatus))) status = 'DROPPED';
  else if (validated) status = 'VALIDATED';
  else if (generated) status = 'GENERATED';
  else if (taskRows.length > 0) status = 'TASK_CREATED';
  else if (plannedSectionIds.length > 0) status = 'PLANNED';
  else status = 'DROPPED';

  const reconciliation = reconciliationById.get(item.id);
  return {
    id: item.id,
    type: item.type || fullItem?.category || 'UNKNOWN',
    required: fullItem?.required === true,
    compatibilityAlias: fullItem?.metadata?.compatibilityAlias === true,
    status,
    reached,
    sectionIds,
    plannedSectionIds,
    taskIds,
    outcomes,
    blockIds,
    assembledBlockIds,
    serializedBlockIds,
    coverageStatus: item.statusAfter || fullItem?.status || 'UNKNOWN',
    coverageReason: reconciliation?.reason || item.reason || fullItem?.statusReason || '—',
    dropReason: exactDropReason(item, fullItem, taskRows, blockIds, assembledBlockIds, plannedSectionIds),
  };
});

if (rows.length !== coverageItems.length || new Set(rows.map((row) => row.id)).size !== rows.length) {
  throw new Error(`Coverage trace must contain one unique row per item; got ${rows.length} rows for ${coverageItems.length} items.`);
}

const statusCounts = Object.groupBy(rows, (row) => row.status);
const lines = [
  `# Coverage lifecycle trace — ${runId}`,
  '',
  `Source: immutable completed-run snapshots in \`${runPath}\`. Rows: ${rows.length}. This diagnostic records IDs and stage states only; it does not copy source allegations or document text.`,
  '',
  `Status totals: ${Object.entries(statusCounts).map(([status, values]) => `${status}=${values.length}`).join(', ')}.`,
  '',
  'A block can be assembled while its legal Coverage remains open. `CoverageReason` records that distinction; `DropReason` is populated only when the item or its content did not reach assembly.',
  '',
  '| CoverageItem | Type | Required / canonicality | Stage | Reached | Target section | SectionPlan | GenerationTask | Outcome / validation | DraftBlock | Assembled | Final JSON block | Coverage status / reason | Drop reason |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
];

for (const row of rows) {
  lines.push(`| ${[
    row.id,
    row.type,
    `${row.required ? 'required' : 'optional'}${row.compatibilityAlias ? ' / compatibility alias' : ' / canonical'}`,
    row.status,
    joinCell(row.reached),
    joinCell(row.sectionIds),
    joinCell(row.plannedSectionIds),
    joinCell(row.taskIds),
    joinCell(row.outcomes),
    joinCell(row.blockIds),
    joinCell(row.assembledBlockIds),
    joinCell(row.serializedBlockIds),
    `${escapeCell(row.coverageStatus)} / ${escapeCell(row.coverageReason)}`,
    escapeCell(row.dropReason),
  ].join(' | ')} |`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
process.stdout.write(`Wrote ${rows.length} coverage lifecycle rows for ${runId}: ${outputPath}\n`);
