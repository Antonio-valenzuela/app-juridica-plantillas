import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

it.skipIf(process.env.LEX_SANITIZED_PROVIDER_SMOKE !== '1')('one explicitly authorized real-provider synthetic smoke', async () => {
  const script='../../scripts/audit/real-provider-sanitized-smoke.mts';
  await import(script);
  const report=JSON.parse(await readFile('audit/final-pre-windows-readiness/real-provider-smoke.json','utf8'));
  expect(report.frozenUnchanged).toBe(true);
  expect(['PASS','FAIL']).toContain(report.status);
}, 180000);
