import { chromium } from '@playwright/test';
import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const evidence = path.resolve('audit/final-pre-windows-readiness/delta-ui');
const original = path.resolve('audit/final-pre-windows-readiness/generation-journey/run-2026-10-01T14-09-45.471Z/synthetic-store');
await mkdir(evidence, { recursive: true });
const storage = path.join(evidence, `synthetic-copy-${Date.now()}`);
await cp(original, storage, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = storage;
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
const report = { scope: 'DELTA_ONLY_REAL_LOCAL_REAL_GENERATED_DOCUMENT', startedAt: new Date().toISOString(), stages: [], screenshots: [], status: 'FAIL', externalProviderCalls: 0 };
const logs = []; let session, browser, page, context;
const step = (name, details = {}) => report.stages.push({ name, ...details });
async function api(endpoint, method = 'GET', body, expected = 200) {
  const response = await context.request.fetch(`${session.baseUrl}${endpoint}`, { method, ...(body ? { data: body } : {}) });
  const value = await response.json(); assert.equal(response.status(), expected, `${endpoint}: ${value.error || value.errorCode || ''}`); return value;
}
async function capture(tab) {
  await page.goto(`${session.baseUrl}/machotes?tab=${tab}`);
  await page.locator('main').waitFor({ state: 'visible' }).catch(() => undefined);
  await page.waitForLoadState('networkidle');
  const filename = `${tab}-1920x1080.png`; await page.screenshot({ path: path.join(evidence, filename), fullPage: false });
  report.screenshots.push(filename);
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  step(`viewport-${tab}`, { ...dimensions, status: dimensions.scroll <= dimensions.viewport + 1 ? 'PASS' : 'FAIL' });
}
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  assert.equal((await context.request.post(`${session.baseUrl}/api/desktop-local/session`, { headers: { 'x-lex-desktop-capability': session.capability } })).status(), 204);
  page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  // UI delta must not accidentally spend provider quota or regenerate the certified fixture.
  await context.route('**/api/legal-engine/generate**', route => route.abort('blockedbyclient'));
  const drafts = (await api('/api/legal-drafts')).drafts;
  assert.equal(drafts.length, 1); const draft = drafts[0];
  const { case: item } = await api('/api/workspace/cases', 'POST', { title: 'CASO DELTA SINTETICO', expediente: 'SYN-CIV-001', draftIds: [draft.id] }, 201);
  const input = path.join(storage, 'small-import-fixture'); await mkdir(input);
  await writeFile(path.join(input, 'demanda-civil-sintetica.txt'), 'DEMANDA CIVIL SINTETICA. Documento sin fecha procesal, solo manifestaciones del ejercicio.');
  const scan = await api('/api/workspace/local-import', 'POST', { action: 'analyze', sourcePath: input });
  const imported = await api('/api/workspace/local-import', 'POST', { action: 'import', scanId: scan.scanId, recordIds: [scan.records[0].id], caseId: item.id });
  assert.equal(imported.imported.length, 1); step('real-local-import', { caseId: item.id, recordId: imported.imported[0].id, classification: imported.imported[0].category });
  await api('/api/workspace/agenda', 'POST', { title: 'FECHA CONFIRMADA SOLO ENSAYO', dueDate: '2026-10-06', caseId: item.id }, 201);
  const sync = { action: 'SYNC_DOCUMENT', documentId: draft.structuredDoc.id, text: 'Audiencia el 10 de octubre de 2026.', referenceDate: '2026-10-01' };
  await Promise.all([api('/api/workspace/agenda', 'POST', sync), api('/api/workspace/agenda', 'POST', sync)]);
  assert.equal((await api('/api/workspace/agenda')).events.filter(value => value.source === 'DOCUMENT').length, 1);
  step('real-http-concurrent-agenda', { status: 'PASS' });
  const analytics = await api('/api/workspace/analytics?rangeDays=30'); assert.equal(analytics.totals.total, 1);
  await writeFile(path.join(evidence, 'analytics.json'), JSON.stringify(analytics, null, 2));
  for (const tab of ['inicio', 'configuracion', 'terminos', 'biblioteca', 'expedientes']) await capture(tab);
  await page.getByLabel('Buscar expedientes').fill('SYN-CIV-001');
  await page.getByRole('row').filter({ hasText: 'CASO DELTA SINTETICO' }).getByRole('button', { name: 'Abrir ficha' }).click();
  await page.getByRole('button', { name: 'Abrir borrador asociado' }).click();
  await page.getByTitle('Revisión de calidad jurídica del documento').waitFor();
  await page.getByRole('button', { name: /Editar contestación/ }).click();
  await page.getByTitle('Editar texto directamente').first().click();
  const textarea = page.locator('[data-block-editor] textarea');
  const initialText = await textarea.inputValue();
  await textarea.fill('CAMBIO CANCELADO SOLO ENSAYO');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTitle('Editar texto directamente').first().click();
  assert.equal(await textarea.inputValue(), initialText); step('editor-cancel', { status: 'PASS' });
  await textarea.fill(`${initialText}\nNOTA SINTETICA DE EDICION PARA PRUEBA.`);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByTitle('Descartar todos los cambios de esta sesión de edición').click();
  await page.getByTitle('Editar texto directamente').first().click();
  assert.equal(await textarea.inputValue(), initialText); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  step('editor-discard', { status: 'PASS' });
  await page.getByRole('button', { name: '💾 Guardar', exact: true }).click();
  await page.getByText('✓ Guardado', { exact: true }).waitFor(); step('editor-save', { status: 'PASS' });
  await page.screenshot({ path: path.join(evidence, 'editor-1920x1080.png'), fullPage: false }); report.screenshots.push('editor-1920x1080.png');
  const stored = (await api(`/api/legal-drafts/${draft.id}`)).draft;
  for (const format of ['docx', 'pdf']) {
    const response = await context.request.post(`${session.baseUrl}/api/legal-engine/export/${format}`, { data: { document: stored.structuredDoc, exportMode: 'DRAFT' } });
    if (response.ok()) { const bytes = await response.body(); await writeFile(path.join(evidence, `real-generated-draft.${format}`), bytes); step(`export-${format}`, { status: 'PASS', bytes: bytes.length }); }
    else step(`export-${format}`, { status: 'BLOCKED', http: response.status(), detail: await response.json() });
  }
  const job = JSON.parse(await readFile('audit/final-pre-windows-readiness/generation-journey/run-2026-10-01T14-09-45.471Z/job-after-restart.json', 'utf8'));
  await context.close(); await session.close(); session = undefined; await assertPortAvailable(3200);
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.request.post(`${session.baseUrl}/api/desktop-local/session`, { headers: { 'x-lex-desktop-capability': session.capability } });
  const recoveredCases = (await api('/api/workspace/cases')).cases;
  assert.equal(recoveredCases.find(value => value.id === item.id).importedRecords[0].id, imported.imported[0].id);
  assert.equal((await api('/api/workspace/local-import')).items.length, 1);
  assert.equal((await api(`/api/legal-engine/generate/status?jobId=${job.jobId}`)).documentId, job.documentId);
  assert.equal((await api('/api/workspace/analytics?rangeDays=30')).totals.total, 1);
  step('final-restart', { status: 'PASS', importedCaseRecovered: true, jobRecovered: true, analyticsTotal: 1 });
  report.pageErrors = errors;
  report.status = report.stages.some(value => value.status === 'FAIL') || errors.length ? 'FAIL' : 'PASS_SCOPED_WITH_RECORDED_BLOCKERS';
} catch (error) {
  report.error = String(error.message).replaceAll(session?.capability || 'NO_SECRET', '[REDACTED]'); process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(evidence, 'first-divergence.png'), fullPage: false }).catch(() => undefined);
} finally {
  if (browser) await browser.close(); if (session) await session.close();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(evidence, 'runtime.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(evidence, 'backend.log'), logs.join('\n'));
  console.log(JSON.stringify(report, null, 2));
}
