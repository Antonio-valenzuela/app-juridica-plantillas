import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.join(process.cwd(), 'audit/final-pre-windows-readiness');
const file = path.join(root, 'controls-functional.json');
const inventory = JSON.parse(await readFile(file, 'utf8'));
const runtime = JSON.parse(await readFile(path.join(root, 'functional-desktop/runtime.json'), 'utf8'));
const passed = new Map();
function mark(ids, effect, evidence) {
  for (const id of ids) passed.set(`control-${String(id).padStart(3, '0')}`, { effect, evidence });
}
mark([1, 2], 'Period selection/retry/error states; real local API dataset excludes sensitive text', 'AnalyticsPanel.test.tsx; desktopWorkspacePersistence.test.ts; runtime analytics-api-ui-reload');
mark([159,160,161,166,167,168,170,189,190,194,195,196,197,180,181,201,203], 'Actual document/view state changes or real quality/pending modal, not only callback dispatch', 'WorkspaceDocumentEditorBehavior.test.tsx; 16 cases');
if (runtime.steps.some(step => step.name === 'backend-restart-durable' && step.status === 'PASS')) {
  mark([176,177,253,256,258], 'Existing record selected, edited, saved by PATCH, reopened from disk after backend restart with the same id', 'functional-desktop/runtime.json; reopenedDraftBinding.test.ts');
}
if (runtime.exports?.length === 2 && runtime.exports.every(item => item.status === 'PASS')) {
  mark([183,184,185], 'Actual Chrome download of DOCX/PDF DRAFT binaries from owned local record; FINAL remains blocked', 'functional-desktop/runtime.json; desktopWorkspacePersistence.test.ts');
}
if (runtime.steps.some(step => step.name === 'manual-rule-http' && step.status === 200)) mark([198,199], 'Authenticated rule/PDF HTTP accessible; version/page/source hash preserved', 'functional-desktop/runtime.json');
if (runtime.steps.some(step => step.name === 'agenda-document-ui-reload')) mark([259,260,267,270,272,273], 'Computed date selection and source-derived event priority/completion preserved after browser reload', 'functional-desktop/runtime.json; WorkspaceAgenda.test.tsx');
for (const control of inventory.controls) {
  const proof = passed.get(control.inventoryId);
  if (proof) Object.assign(control, { STATUS: 'PASS', EFFECT: proof.effect, TEST: proof.evidence, CLASSIFICATION: 'BEHAVIOR_PROVEN_WITH_STATED_SCOPE' });
  if (control.STATUS === 'PARTIAL') {
    control.REMAINING_REASON = control.REMAINING_REASON || 'NOT_FULLY_PROVEN: behavior, integration, persistence or actual UI effect still requires evidence';
    control.NON_BLOCKING = false; // Unknown is never reclassified as harmless to improve the verdict.
  }
  if ([182,186,187,204].map(id => `control-${id}`).includes(control.inventoryId)) {
    control.REMAINING_REASON = 'FINAL_REVIEW_BLOCKED_BY_DESIGN: no fixture or user confirmation proving that promotion is permitted; guard not relaxed';
    control.NON_BLOCKING = true;
  }
}
inventory.counts = inventory.controls.reduce((counts, control) => ({ ...counts, [control.STATUS]: (counts[control.STATUS] || 0) + 1 }), {});
inventory.functionalCheckpointAt = new Date().toISOString();
inventory.functionalRuntimeStatus = runtime.status;
inventory.scope += ' Continued existing IDs only. PASS states an observed effect and its scope; unknown PARTIAL remains potentially blocking. No zero-dead-controls claim.';
await writeFile(file, JSON.stringify(inventory, null, 2));
await writeFile(path.join(root, 'controls-functional.md'), `# Existing functional inventory — continued\n\nTotal ${inventory.controls.length}; ${JSON.stringify(inventory.counts)}. Source inventory/hash unchanged. No new enumeration.\n\n| ID | Status | Control | Evidence or remaining reason |\n|---|---|---|---|\n` + inventory.controls.map(c => `| ${c.inventoryId} | ${c.STATUS} | ${String(c.LABEL).replaceAll('|','/')} | ${String(c.REMAINING_REASON || c.TEST).replaceAll('|','/').replaceAll('\n',' ')} |`).join('\n'));
console.log(JSON.stringify({ total: inventory.controls.length, counts: inventory.counts, runtime: runtime.status }));
