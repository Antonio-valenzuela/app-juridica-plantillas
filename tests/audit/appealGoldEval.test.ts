import { afterAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'appeal-gold-eval-'));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

it('computes adverse precision/recall and lists false positives/negatives from an external gold file', () => {
  const actualPath = join(tempDir, 'actual.json');
  const goldPath = join(tempDir, 'gold.json');
  writeFileSync(actualPath, JSON.stringify({ classifications: [
    { section: 'CONSIDERANDO PRIMERO', impact: 'ADVERSE' },
    { section: 'CONSIDERANDO SEGUNDO', impact: 'ADVERSE' },
  ] }));
  writeFileSync(goldPath, JSON.stringify({ sections: {
    adverse: ['CONSIDERANDO PRIMERO', 'CONSIDERANDO TERCERO'],
    favorable: [], neutral: ['CONSIDERANDO SEGUNDO'],
  } }));
  const output = execFileSync(process.execPath, [
    resolve('scripts/audit/appeal-gold-eval.mjs'), '--actual', actualPath, '--gold', goldPath,
  ], { encoding: 'utf8' });
  const result = JSON.parse(output);
  expect(result.adversePrecision).toBe(0.5);
  expect(result.adverseRecall).toBe(0.5);
  expect(result.falsePositiveSections).toEqual([{ section: 'CONSIDERANDO SEGUNDO', goldCategory: 'neutral' }]);
  expect(result.falseNegativeSections).toEqual(['considerando tercero']);
});
