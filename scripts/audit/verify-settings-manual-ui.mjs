import { chromium } from '@playwright/test';
import { launchDesktopLocal } from '../desktop/local-launcher.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = path.resolve('audit/ui-final/settings-manual-compact', `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(dir, { recursive: true });
const frozen = ['lib/operational-manual/core.ts', 'lib/operational-manual/store.ts', 'lib/legal-engine/pipeline.ts', 'lib/legal-engine/qualityGate.ts', 'app/api/operational-manual/route.ts', 'app/api/operational-manual/original/route.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(frozen.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const report = { status: 'FAIL', startedAt: new Date().toISOString(), views: [], frozenBefore: await hashes() };
let session, browser;
try {
  const existingUrl = process.env.SETTINGS_QA_BASE_URL;
  if (!existingUrl) session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200 });
  const baseUrl = existingUrl || session.baseUrl;
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const context = await browser.newContext({ viewport });
    try {
      if (session) {
        const exchanged = await context.request.post(`${baseUrl}/api/desktop-local/session`, { headers: { 'x-lex-desktop-capability': session.capability } });
        assert.equal(exchanged.status(), 204);
      }
      const metadata = await context.request.get(`${baseUrl}/api/operational-manual`);
      assert.equal(metadata.status(), 200);
      report.manualVersion = (await metadata.json()).manifest.version;
      await context.route('**/api/legal-engine/generate**', route => route.abort('blockedbyclient'));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/machotes?tab=configuracion`);
      await page.getByRole('heading', { name: 'Configuración', exact: true }).waitFor();
      const resources = page.getByRole('region', { name: 'Recursos internos' });
      await resources.getByText('Versión 1.0 · Activa', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Guardar perfil', exact: true }).waitFor();
      // Wait for real profile/analytics responses, not fixture replacement.
      const dataSettled = await page.waitForFunction(() => !document.body.innerText.includes('Cargando perfil persistido') && !document.body.innerText.includes('Cargando analíticas'), null, { timeout: 15000 }).then(() => true).catch(() => false);
      const positions = await page.locator('[data-workspace-module="settings"]').evaluate(root => {
        const node = name => [...root.querySelectorAll('h1,h2')].find(el => el.textContent === name);
        const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
        return { title: box(node('Configuración')), analytics: box(node('Analíticas')), profile: box(node('Perfil del despacho')), resources: box(root.querySelector('[aria-label="Recursos internos"]')), metadataVisible: /SHA-256|páginas físicas|Importada:|Secciones identificadas:/.test(root.innerText), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(positions.title.top < positions.analytics.top && positions.analytics.top < positions.profile.top && positions.profile.top < positions.resources.top);
      assert.ok(positions.resources.height <= 110);
      assert.equal(positions.metadataVisible, false); assert.equal(positions.overflow, false);
      assert.equal(errors.length, 0);
      const filename = `settings-${viewport.width}x${viewport.height}.png`;
      await page.screenshot({ path: path.join(dir, filename), fullPage: false });
      await page.screenshot({ path: path.join(dir, `settings-full-${viewport.width}x${viewport.height}.png`), fullPage: true });
      await resources.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(dir, `resources-${viewport.width}x${viewport.height}.png`), fullPage: false });
      const pdf = await context.request.get(`${baseUrl}/api/operational-manual/original`);
      assert.equal(pdf.status(), 200);
      assert.ok((pdf.headers()['content-type'] || '').includes('application/pdf'));
      report.pdfSha256 = createHash('sha256').update(await pdf.body()).digest('hex');
      report.views.push({ viewport, status: 'PASS', scope: 'PRESENTATION_ONLY_REAL_HTTP_NO_MOCKS', dataSettled, positions, screenshot: filename, pageErrors: errors });
    } finally { await context.close(); }
  }
  report.status = 'PASS';
} catch (error) { report.error = String(error.message).replaceAll(session?.capability || 'NO_SECRET', '[REDACTED]'); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (session) await session.close();
  report.frozenAfter = await hashes();
  assert.deepEqual(report.frozenAfter, report.frozenBefore);
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(dir, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
