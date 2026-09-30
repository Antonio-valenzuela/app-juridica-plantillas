import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
it('records current evidence without treating stale files as regenerated exports', async () => {
  const scriptPath = '../../scripts/audit/legal-quality-evidence.mts';
  await import(scriptPath);
  const results = JSON.parse(await readFile('audit/final-pre-windows-readiness/legal-quality-causal/comparison.json', 'utf8'));
  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result.sourceUnchanged).toBe(true);
    expect(result.QUALITY_GATE.passed).toBe(false);
    expect(result.DOCUMENT_STATUS.readiness).toBe('REVIEW_REQUIRED');
    if (result.exports.docx.status !== 'EXPORTED_DRAFT') expect(result.DOCX).toBe('BLOCKED_NO_CURRENT_ARTIFACT');
  }
});
