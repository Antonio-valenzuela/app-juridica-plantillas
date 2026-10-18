import { chromium } from '@playwright/test';
import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = path.resolve('audit/final-pre-windows-readiness/delta-ui');
const roots = (await readdir(dir)).filter(name => name.startsWith('synthetic-copy-')).sort();
assert.ok(roots.length);
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(dir, roots.at(-1));
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
let session, browser;
const result = { scope: 'Two changed screens only; no provider execution', checks: [], status: 'FAIL' };
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200 });
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  assert.equal((await context.request.post(`${session.baseUrl}/api/desktop-local/session`, { headers: { 'x-lex-desktop-capability': session.capability } })).status(), 204);
  await context.route('**/api/legal-engine/generate**', route => route.abort('blockedbyclient'));
  const page = await context.newPage();
  await page.goto(`${session.baseUrl}/machotes?tab=inicio`);
  await page.getByText('Almacenamiento local disponible', { exact: true }).waitFor();
  const zeroBars = page.locator('[title$=": 0"] > div');
  const zeroHeights = await zeroBars.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  if (zeroHeights.length) assert.ok(zeroHeights.every(height => height === 0));
  result.checks.push({ name: 'dashboard-zero-bars', zeroHeights });
  await page.screenshot({ path: path.join(dir, 'dashboard-final-1920x1080.png') });
  await page.goto(`${session.baseUrl}/machotes?tab=configuracion`);
  await page.getByText('No medido', { exact: true }).first().waitFor();
  const bars = page.locator('[style*="height:"][style*="px"]');
  const heights = await bars.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  assert.ok(heights.some(height => height > 0));
  result.checks.push({ name: 'visible-height-elements', heights });
  await page.screenshot({ path: path.join(dir, 'configuracion-final-1920x1080.png') });
  await page.goto(`${session.baseUrl}/machotes?tab=expedientes`);
  await page.getByLabel('Buscar expedientes').fill('SYN-CIV-001');
  await page.getByRole('row').filter({ hasText: 'CASO DELTA SINTETICO' }).getByRole('button', { name: 'Abrir ficha' }).click();
  await page.getByRole('button', { name: 'Abrir borrador asociado' }).click();
  await page.getByText('Paginación estimada; el PDF puede variar', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(dir, 'editor-final-1920x1080.png') });
  result.checks.push({ name: 'estimated-pagination-explicit', status: 'PASS' });
  result.status = 'PASS_SCOPED';
} catch (error) { result.error = error.message; process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (session) await session.close();
  await assertPortAvailable(3200);
  await writeFile(path.join(dir, 'metrics-final.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
