import { readFile, writeFile } from 'node:fs/promises';
const directory = 'audit/final-pre-windows-readiness';
const inventory = JSON.parse(await readFile(`${directory}/controls-functional.json`, 'utf8'));
const classified = inventory.controls.map(control => {
  if (control.STATUS !== 'PARTIAL') return control;
  const text = `${control.ROUTE || ''} ${control.LABEL || ''} ${control.EXPECTED_ACTION || ''}`;
  const requiresRealCredential = /certificado|c[eé]dula.*valid|firmar electr[oó]nic|subir.*\.pfx/i.test(text);
  const substantiveFinal = ['control-182', 'control-186', 'control-187', 'control-204'].includes(control.inventoryId);
  return { ...control, REMAINING_CATEGORY: requiresRealCredential || substantiveFinal ? 'C' : 'A',
    CATEGORY_REASON: substantiveFinal ? 'FINAL requires confirmed client position and verified substantive support. Real DRAFT export returned 422; no promotion or guard bypass is permitted.' : requiresRealCredential ? 'Requires genuine lawyer credential/certificate; no fabricated credential is admissible.'
      : 'Conservative mandatory classification: visible local workflow has no per-control runtime effect proof. Unit/API or static reachability does not promote the control.',
    STATUS: 'PARTIAL', CATEGORY_EVIDENCE: 'controls-functional.json original row + current delta evidence; no unproven PASS promotion' };
});
const counts = {};
const categories = Object.fromEntries(['A','B','C','D','E','F'].map(key => [key, 0]));
for (const control of classified) { counts[control.STATUS] = (counts[control.STATUS] || 0) + 1; if (control.REMAINING_CATEGORY) categories[control.REMAINING_CATEGORY]++; }
const result = { generatedAt: new Date().toISOString(), source: `${directory}/controls-functional.json`, sourceSha256: inventory.sourceSha256,
  scope: 'Continuation only. No re-enumeration and no artificial promotion. Category A includes unresolved mandatory evidence, not an assertion every handler is broken.', counts, categories, controls: classified };
await writeFile(`${directory}/controls-classified.json`, JSON.stringify(result, null, 2));
const rows = classified.filter(control => control.STATUS === 'PARTIAL').map(control => `| ${control.inventoryId} | ${control.REMAINING_CATEGORY} | ${String(control.COMPONENT || '').replaceAll('|','/')} | ${String(control.LABEL || '').replaceAll('|','/').replaceAll('\n',' ')} | NOT_CERTIFIED |`);
await writeFile(`${directory}/controls-classified.md`, `# Remaining PARTIAL controls\n\nCounts: ${JSON.stringify(counts)}\n\nCategories: ${JSON.stringify(categories)}\n\nNo original status was promoted. A is conservative mandatory evidence still missing; C requires genuine credential data. No observed external blockage was assigned speculatively to B. No control was declared future or N/A to hide an unproven workflow.\n\n| ID | Category | Component | Control | Evidence |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
console.log(JSON.stringify({ counts, categories }));
