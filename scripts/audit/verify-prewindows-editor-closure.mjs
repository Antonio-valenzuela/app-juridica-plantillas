import { chromium } from '@playwright/test';
import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const dir = path.resolve('audit/final-pre-windows-readiness/editor-closure');
await mkdir(dir, { recursive: true });
const store = path.join(dir, `synthetic-copy-${Date.now()}`);
await cp('audit/final-pre-windows-readiness/eligible-draft-journey/run-2026-10-02T02-02-48.001Z/synthetic-store', store, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = store;
process.env.LEGAL_CASES_USER_EMAIL = ''; process.env.LEGAL_CASES_ORG_SLUG = ''; process.env.DEMO_MODE_ENABLED = 'false';
let session, browser, context, page; const logs = [];
const report = { status: 'PARTIAL', checks: [], store, reformulations: 0 };
const add = (name, detail = {}) => report.checks.push({ name, ...detail });
async function api(url, method = 'GET', data, expected = 200) {
  const response = await context.request.fetch(`${session.baseUrl}${url}`, { method, ...(data ? { data } : {}) });
  const value = await response.json(); assert.equal(response.status(), expected, `${url}: ${JSON.stringify(value)}`); return value;
}
async function attach() {
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  assert.equal((await context.request.post(`${session.baseUrl}/api/desktop-local/session`, { headers: { 'x-lex-desktop-capability': session.capability } })).status(), 204);
  await context.route('**/api/legal-engine/generate', route => route.abort());
  await context.route('**/api/legal-engine/generate-section', route => { report.reformulations++; return report.reformulations === 1 ? route.continue() : route.abort(); });
  page = await context.newPage();
}
async function open(title) {
  await page.goto(`${session.baseUrl}/machotes?tab=expedientes`);
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Abrir ficha' }).click();
  await page.getByRole('button', { name: 'Abrir borrador asociado' }).click();
  await page.getByTitle('Revisión de calidad jurídica del documento').waitFor();
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
try {
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) });
  browser = await chromium.launch({ headless: true, channel: 'chrome' }); await attach();
  const a = (await api('/api/legal-drafts')).drafts[0]; assert.ok(a);
  const documentB = { ...a.structuredDoc, id: randomUUID(), title: 'DOCUMENTO B SINTETICO INDEPENDIENTE' };
  const b = await api('/api/legal-drafts', 'POST', { title: documentB.title, documentType: documentB.documentType, matter: 'civil', structuredDoc: documentB, formData: {}, generationMetadata: { origin: 'MANUAL_SYNTHETIC_FIXTURE' } }, 201);
  const bid = b.draft?.id || b.id;
  assert.ok(bid, 'DOCUMENT_B_ID_MISSING');
  await api('/api/workspace/cases', 'POST', { title: 'CIERRE EXPEDIENTE A', expediente: 'SYN-LIBRE-001', draftIds: [a.id] }, 201);
  await api('/api/workspace/cases', 'POST', { title: 'CIERRE EXPEDIENTE B', expediente: 'SYN-B-001', draftIds: [bid] }, 201);
  await api('/api/workspace/agenda', 'POST', { title: 'REVISION SINTETICA CONFIRMADA', dueDate: '2026-10-06' }, 201);
  await page.goto(`${session.baseUrl}/machotes?tab=inicio`);
  await page.getByText('Almacenamiento local disponible', { exact: true }).waitFor(); await screenshot('dashboard');
  await page.goto(`${session.baseUrl}/machotes?tab=configuracion`);
  await page.getByText('Diagnóstico avanzado', { exact: true }).click();
  await page.getByText('Tokens globales: No medido', { exact: true }).waitFor(); await screenshot('analytics');
  await open('CIERRE EXPEDIENTE A');
  for (const format of ['DOCX', 'PDF']) {
    await page.getByRole('button', { name: /Exportar/ }).first().click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: new RegExp(`${format} borrador`) }).click();
    const download = await downloadPromise; await download.saveAs(path.join(dir, `ui-draft.${format.toLowerCase()}`));
    assert.ok((await readFile(path.join(dir, `ui-draft.${format.toLowerCase()}`))).length > 500);
    add(`UI_EXPORT_${format}`, { status: 'PASS' });
  }
  await page.getByRole('button', { name: /Editar contestación/ }).click();
  await page.getByTitle('Editar texto directamente').first().click();
  const textarea = page.locator('[data-block-editor] textarea'); const originalText = await textarea.inputValue();
  await textarea.fill('CAMBIO CANCELADO SINTETICO'); await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByTitle('Editar texto directamente').first().click(); assert.equal(await textarea.inputValue(), originalText);
  await textarea.fill(`${originalText}\nNOTA DE REVISION SINTETICA.`); await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByTitle('Descartar todos los cambios de esta sesión de edición').click();
  await page.getByTitle('Editar texto directamente').first().click(); assert.equal(await textarea.inputValue(), originalText);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); add('CANCEL_DISCARD', { status: 'PASS' });
  const before = (await api(`/api/legal-drafts/${a.id}`)).draft.structuredDoc;
  const section = before.sections.find(value => value.type === 'legal_grounds' && value.content?.some(block => block.text)); assert.ok(section);
  await page.locator(`[id="sec-${section.id}"]`).click();
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/legal-engine/generate-section'));
  await page.getByTitle('Reformular el apartado activo').click();
  const response = await responsePromise; const result = await response.json();
  add('REFORMULATION_PROVIDER', { http: response.status(), result });
  if (response.ok()) {
    await page.getByText('Apartado reformulado.', { exact: true }).waitFor();
    await page.getByRole('button', { name: '💾 Guardar', exact: true }).click();
    await page.getByText('✓ Guardado', { exact: true }).waitFor();
    const after = (await api(`/api/legal-drafts/${a.id}`)).draft.structuredDoc;
    assert.equal(after.id, before.id); assert.notEqual(after.status, 'final');
    assert.deepEqual(after.sections.filter(value => value.id !== section.id), before.sections.filter(value => value.id !== section.id));
    add('REFORMULATION_ISOLATION', { status: 'PASS', sectionId: section.id });
  }
  await screenshot('editor');
  await open('CIERRE EXPEDIENTE B'); await page.getByText('DOCUMENTO B SINTETICO INDEPENDIENTE', { exact: true }).first().waitFor();
  assert.deepEqual((await api(`/api/legal-drafts/${bid}`)).draft.structuredDoc.sections, documentB.sections);
  await open('CIERRE EXPEDIENTE A'); add('SWITCH_DOCUMENT_CASE', { status: 'PASS', documentA: before.id, documentB: documentB.id });
  const persisted = (await api(`/api/legal-drafts/${a.id}`)).draft.structuredDoc;
  await context.close(); await session.close(); session = undefined; await assertPortAvailable(3200);
  session = await launchDesktopLocal({ projectDir: process.cwd(), port: 3200, onOutput: line => logs.push(line) }); await attach();
  await open('CIERRE EXPEDIENTE A'); assert.deepEqual((await api(`/api/legal-drafts/${a.id}`)).draft.structuredDoc, persisted);
  add('RESTART_REOPEN', { status: 'PASS' }); await screenshot('editor-reopened');
  report.status = response.ok() ? 'PASS_SCOPED' : 'PARTIAL_REFORMULATION_BLOCKED';
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  if (browser) await browser.close(); if (session) await session.close(); await assertPortAvailable(3200);
  await writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(path.join(dir, 'backend.log'), logs.join('\n')); console.log(JSON.stringify(report));
}
