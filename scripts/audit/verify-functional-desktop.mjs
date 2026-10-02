import { chromium } from '@playwright/test';
import { launchDesktopLocal, assertPortAvailable } from '../desktop/local-launcher.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const project = process.cwd();
const evidence = path.join(project, 'audit/final-pre-windows-readiness/functional-desktop');
await mkdir(evidence, { recursive: true });
// An isolated, explicit synthetic workspace; never writes to the lawyer's profile.
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(evidence, `synthetic-store-${Date.now()}`);
process.env.LEGAL_CASES_USER_EMAIL = '';
process.env.LEGAL_CASES_ORG_SLUG = '';
process.env.DEMO_MODE_ENABLED = 'false';
process.env.NVIDIA_API_KEY = '';
process.env.NVIDIA_REAL_TEST = 'false';
const report = { startedAt: new Date().toISOString(), classification: 'REAL_LOCAL', externalProviderCalls: 0, steps: [], screenshots: [], status: 'FAIL' };
const logs = [];
let session, browser, activePage;
const step = (name, details) => report.steps.push({ name, ...details });
const frozen = ['lib/ai/providerChain.ts', 'lib/ai/providerRouter.ts', 'lib/legal-engine/qualityGate.ts', 'lib/legal-engine/documentCoverage.ts', 'lib/legal-engine/coverageMatrix.ts', 'lib/security/lawyerAuth.ts', 'lib/cases/access.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(frozen.map(async file => [file, createHash('sha256').update(await readFile(path.join(project, file))).digest('hex')])));
const assertStatus = (actual, expected, name) => assert.equal(actual, expected, name);
report.protectedBefore = await hashes();
try {
  session = await launchDesktopLocal({ projectDir: project, port: 3200, onOutput: line => logs.push(line) });
  const listeners = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' }).split(/\r?\n/).filter(line => /:3200\s/.test(line) && /LISTENING/.test(line));
  assert.ok(listeners.length > 0 && listeners.every(line => /127\.0\.0\.1:3200/.test(line)));
  step('listener', { listeners });
  const headers = { 'x-lex-desktop-capability': session.capability, 'content-type': 'application/json' };
  const base = session.baseUrl;
  const analytics = async (rangeDays = 30) => {
    const response = await fetch(`${session.baseUrl}/api/workspace/analytics?rangeDays=${rangeDays}`, { headers });
    assertStatus(response.status, 200, 'analytics'); return response.json();
  };
  assertStatus((await fetch(`${base}/api/legal-drafts`)).status, 403, 'unauthorized');
  step('unauthenticated', { status: 403 });
  assertStatus((await fetch(`${base}/api/legal-drafts`, { headers: { 'x-lex-desktop-capability': '0'.repeat(64) } })).status, 403, 'incorrect capability');
  assertStatus((await fetch(`${base}/api/legal-drafts`, { method: 'POST', headers: { ...headers, origin: 'https://outside.invalid' }, body: '{}' })).status, 403, 'cross origin');
  step('invalid-session-origin', { incorrectCapability: 403, crossOrigin: 403 });
  const manualResponse = await fetch(`${base}/api/operational-manual`, { headers });
  assertStatus(manualResponse.status, 200, 'manual');
  const manual = await manualResponse.json();
  assert.equal(manual.manifest.version, '1.0');
  assert.equal(manual.manifest.pageCount, 212);
  assert.equal(manual.manifest.fragmentCount, 6860);
  step('manual-metadata', { status: 200, version: manual.manifest.version, pageCount: manual.manifest.pageCount, fragmentCount: manual.manifest.fragmentCount });
  const original = await fetch(`${base}/api/operational-manual/original`, { headers });
  assertStatus(original.status, 200, 'manual PDF');
  const manualHash = createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex');
  assert.equal(manualHash, 'b3910bb8a0b44bd1a38d3fe9edbd32984ade48b6b66c7bf62b01db3e79348f25');
  step('manual-pdf', { status: 200, contentType: original.headers.get('content-type'), sha256: manualHash });
  assert.equal((await analytics()).totals.total, 0);
  step('analytics-empty', { total: 0 });
  const document = JSON.parse(await readFile(path.join(project, 'audit/final-pre-windows-readiness/legal-propagation/cases/contestacion/produced-document.json'), 'utf8'));
  document.title = 'EXPEDIENTE SINTÉTICO — PRUEBA FUNCIONAL';
  document.caseRefs = { ...document.caseRefs, expediente: 'SINTETICO-01' };
  const postDraft = async (body) => {
    const response = await fetch(`${base}/api/legal-drafts`, { method: 'POST', headers, body: JSON.stringify(body) });
    assertStatus(response.status, 201, 'save draft'); return (await response.json()).draft;
  };
  const body = { title: document.title, documentType: document.documentType, matter: 'Civil', jurisdiction: 'local', structuredDoc: document,
    sourceDocuments: document.sourceDocuments, validationResults: document.validation,
    generationMetadata: { ...document.generationMetadata, persistence: { terminalStatus: 'NEEDS_REVIEW' } },
  };
  const draft = await postDraft(body);
  assert.equal((await analytics()).totals.total, 1);
  step('analytics-one', { total: 1, draftId: draft.id });
  await postDraft({ ...body, title: 'SEGUNDO SINTÉTICO', documentType: 'apelacion_civil', structuredDoc: { ...document, id: 'synthetic-second' } });
  await postDraft({ title: 'NOTA SINTÉTICA SIN GENERACIÓN' });
  const multiple = await analytics();
  assert.equal(multiple.totals.total, 2);
  assert.equal(multiple.totals.needsReview, 2);
  step('analytics-multiple', { total: 2, types: multiple.byType, observations: multiple.observations });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const exchange = await context.request.post(`${base}/api/desktop-local/session`, { headers });
  assertStatus(exchange.status(), 204, 'exchange');
  const cookies = await context.cookies();
  const cookie = cookies.find(item => item.name === 'lex_desktop_workspace_cap');
  assert.ok(cookie?.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/api');
  step('exchange-cookie', { status: 204, httpOnly: true, sameSite: 'Strict', path: '/api' });
  let page = await context.newPage();
  activePage = page;
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/api/legal-drafts') && ['POST', 'PATCH'].includes(response.request().method())) {
      const body = await response.text().catch(() => 'UNREADABLE');
      const requestHeaders = await response.request().allHeaders();
      step('draft-save-http', { method: response.request().method(), status: response.status(), origin: requestHeaders.origin, host: requestHeaders.host, secFetchSite: requestHeaders['sec-fetch-site'], response: response.ok() ? 'OK' : body.slice(0, 2000) });
    }
    if (response.url().includes('/api/legal-engine/export/')) {
      step('export-http', { endpoint: new URL(response.url()).pathname, status: response.status(), response: response.ok() ? 'BINARY' : (await response.text()).slice(0, 2000) });
    }
  });
  // Never permit the test to reach an external legal-generation route.
  await context.route('**/api/legal-engine/generate**', route => route.abort('blockedbyclient'));
  await page.goto(`${base}/machotes?tab=configuracion`);
  await page.getByText('Documentos generados', { exact: true }).waitFor();
  const documentsCard = page.locator('article').filter({ has: page.getByText('Documentos generados', { exact: true }) });
  assert.equal((await documentsCard.locator('strong').textContent()).trim(), '2');
  await page.reload();
  await page.getByText('Documentos generados', { exact: true }).waitFor();
  assert.equal((await documentsCard.locator('strong').textContent()).trim(), '2');
  step('analytics-api-ui-reload', { visibleDocuments: 2, mockedAnalytics: false });
  await page.goto(`${base}/machotes?tab=expedientes`);
  await page.getByLabel('Buscar expedientes').fill('SINTETICO-01');
  const row = page.getByRole('row').filter({ hasText: 'EXPEDIENTE SINTÉTICO — PRUEBA FUNCIONAL' });
  await row.getByRole('button', { name: 'Abrir ficha' }).click();
  await page.getByRole('button', { name: 'Abrir borrador asociado' }).click();
  await page.getByTitle('Revisión de calidad jurídica del documento').waitFor();
  await page.getByRole('button', { name: /Editar contestación/ }).click();
  await page.getByTitle('Editar texto directamente').first().click();
  const editedText = 'EDICIÓN SINTÉTICA CONSERVADA TRAS REINICIO. No acredita hechos ni autoridades.';
  await page.locator('[data-block-editor] textarea').fill(editedText);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('button', { name: '💾 Guardar', exact: true }).click();
  await page.getByText('✓ Guardado', { exact: true }).waitFor();
  step('editor-edit-save', { draftId: draft.id, storage: 'REAL_LOCAL', text: editedText });
  const criteria = page.locator('details').filter({ hasText: 'Criterios aplicados' });
  if (await criteria.count()) {
    await criteria.locator('summary').click();
    const text = await criteria.innerText();
    assert.ok(text.includes('Página') && text.includes('v1.0'));
    const ruleHref = await criteria.locator('a[href*="ruleId="]').first().getAttribute('href');
    const ruleResponse = await context.request.get(`${base}${ruleHref}`);
    assertStatus(ruleResponse.status(), 200, 'manual selected rule');
    const selectedRule = (await ruleResponse.json()).fragment;
    assert.ok(selectedRule.stableRuleId && selectedRule.physicalPage && selectedRule.section && selectedRule.originalText);
    step('manual-rule-http', { status: 200, id: selectedRule.stableRuleId, page: selectedRule.physicalPage, section: selectedRule.section });
    step('manual-criteria-ui', { text: text.slice(0, 2500), rules: await criteria.locator('a[href*="ruleId="]').count() });
    await page.screenshot({ path: path.join(evidence, 'manual-criteria.png'), fullPage: false });
    await criteria.locator('summary').click();
  } else step('manual-criteria-ui', { status: 'NOT_PRESENT_IN_REOPENED_DOCUMENT' });
  report.exports = [];
  for (const label of ['📄 DOCX borrador', '🖨️ PDF borrador']) {
    try {
      await page.getByTitle('Elegir exportación de borrador o final').click();
      await page.screenshot({ path: path.join(evidence, `export-menu-${report.exports.length}.png`), fullPage: false });
      const downloadPromise = page.waitForEvent('download', { timeout: 25000 });
      await page.getByRole('button', { name: label, exact: true }).click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      await download.saveAs(path.join(evidence, `export-${filename}`));
      report.exports.push({ label, status: 'PASS', filename });
    } catch (error) {
      report.exports.push({ label, status: 'FAIL', error: String(error.message) });
    }
  }
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    const filename = `editor-${size.width}x${size.height}.png`;
    await page.screenshot({ path: path.join(evidence, filename), fullPage: false });
    report.screenshots.push(filename);
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert.ok(widths.scroll <= widths.viewport + 1);
  }
  // Deliberate negative integrity fixture, only in the isolated synthetic store.
  // First export the valid draft above; then prove this unsupported edit cannot
  // be exported even as DRAFT. It also exercises the existing agenda extraction.
  const agendaText = `${editedText} La audiencia de prueba se celebrará el 5 de octubre de 2026.`;
  await page.getByTitle('Editar texto directamente').first().click();
  await page.locator('[data-block-editor] textarea').fill(agendaText);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('button', { name: '💾 Guardar', exact: true }).click();
  await page.getByText('✓ Guardado', { exact: true }).waitFor();
  const unsupportedRecord = (await (await fetch(`${base}/api/legal-drafts/${draft.id}`, { headers })).json()).draft;
  const negativeExport = await context.request.post(`${base}/api/legal-engine/export/docx`, {
    headers, data: { document: unsupportedRecord.structuredDoc, exportMode: 'DRAFT' },
  });
  assertStatus(negativeExport.status(), 422, 'unsupported edit DRAFT');
  assert.ok(JSON.stringify(await negativeExport.json()).includes('UNSUPPORTED_FACTUAL_CLAIM'));
  step('unsupported-edit-export-rejected', { status: 422, reason: 'UNSUPPORTED_FACTUAL_CLAIM', intentionallyNegative: true });
  await page.goto(`${base}/machotes?tab=terminos`);
  const selectComputedDay = async () => {
    await page.getByLabel('Fecha inicial', { exact: true }).fill('2026-10-04');
    await page.getByLabel('Días', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Calcular', exact: true }).click();
    await page.getByRole('button', { name: 'Fecha calculada 2026-10-05. Seleccionar eventos del 2026-10-05', exact: true }).click();
  };
  await selectComputedDay();
  await page.locator('select[aria-label^="Prioridad de"]').first().selectOption('HIGH');
  await page.getByRole('button', { name: 'Marcar como atendido', exact: true }).first().click();
  await page.reload();
  await selectComputedDay();
  await page.getByRole('button', { name: 'Reabrir evento', exact: true }).first().waitFor();
  const agenda = await page.evaluate(() => JSON.parse(localStorage.getItem('workspace-agenda:v1') || '[]'));
  assert.ok(agenda.some(event => event.documentId === document.id && event.dueDate === '2026-10-05' && event.priority === 'HIGH' && event.status === 'COMPLETED'));
  step('agenda-document-ui-reload', { source: 'UI_EDIT_OF_SYNTHETIC_DOCUMENT', dueDate: '2026-10-05', priority: 'HIGH', status: 'COMPLETED', manualCrud: 'NOT_IMPLEMENTED', mockedStore: false });
  await page.screenshot({ path: path.join(evidence, 'agenda-real-interaction.png'), fullPage: false });
  const oldCapability = session.capability;
  await context.close();
  await session.close(); session = undefined;
  await assertPortAvailable(3200);
  session = await launchDesktopLocal({ projectDir: project, port: 3200, onOutput: line => logs.push(line) });
  assert.ok(session.capability !== oldCapability);
  assertStatus((await fetch(`${session.baseUrl}/api/legal-drafts`, { headers })).status, 403, 'old capability');
  headers['x-lex-desktop-capability'] = session.capability;
  const reopen = await fetch(`${session.baseUrl}/api/legal-drafts/${draft.id}`, { headers });
  assertStatus(reopen.status, 200, 'restart/reopen');
  const reopened = (await reopen.json()).draft;
  const editedTextPreserved = reopened.structuredDoc.sections.some(section => section.content.some(block => block.text === agendaText));
  const restartedTotal = (await analytics()).totals.total;
  step('backend-restart-durable', { status: editedTextPreserved && restartedTotal === 2 ? 'PASS' : 'FAIL', sameDraftId: draft.id, editedTextPreserved, total: restartedTotal, expectedTotal: 2, oldCapabilityStatus: 403 });
  context = await browser.newContext();
  await context.request.post(`${session.baseUrl}/api/desktop-local/session`, { headers });
  page = await context.newPage();
  activePage = page;
  page.on('pageerror', error => pageErrors.push(error.message));
  for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(size);
    for (const tab of ['inicio', 'universal', 'initial_writings', 'responses_resources', 'my-templates', 'expedientes', 'terminos', 'jurisprudencia', 'biblioteca', 'alertas', 'configuracion', 'ayuda']) {
      await page.goto(`${session.baseUrl}/machotes?tab=${tab}`);
      await page.locator('.lex-sidebar').waitFor();
      await page.waitForLoadState('networkidle');
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(width.scroll <= width.viewport + 1, `${tab} overflow ${size.width}`);
      const filename = `${tab}-${size.width}x${size.height}.png`;
      await page.screenshot({ path: path.join(evidence, filename), fullPage: false });
      report.screenshots.push(filename);
      assert.equal(await page.getByText(/PB JURÍDICO|EDGARDO PALACIOS/i).count(), 0);
    }
  }
  step('layout-captures', { screenshots: report.screenshots.length, pageErrors });
  assert.deepEqual(pageErrors, []);
  // Diagnose remaining guarded APIs; do not supply mock identities or invoke providers.
  report.remainingApis = [];
  for (const endpoint of ['/api/workspace/lawyer-profile', '/api/templates/custom', '/api/legal-engine/parties?caseKey=SINTETICO-01', '/api/workspace/dashboard', '/api/workspace/library', '/api/legal-engine/generate']) {
    const response = await fetch(`${session.baseUrl}${endpoint}`, { headers });
    report.remainingApis.push({ endpoint, status: response.status });
  }
  assert.ok(logs.every(line => !line.includes(oldCapability) && !line.includes(session.capability)));
  assert.ok(!page.url().includes(oldCapability) && !page.url().includes(session.capability));
  step('capability-privacy', { fullSecretInLogs: false, secretInPageUrl: false, rotated: true });
  report.status = report.steps.some(item => item.status === 'FAIL') || report.exports.some(item => item.status === 'FAIL') ? 'FAIL' : 'PASS_SCOPED_NOT_PRODUCT_READY';
  if (report.status === 'FAIL') process.exitCode = 1;
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(evidence, 'first-divergence.png'), fullPage: false }).catch(() => undefined);
  report.error = String(error.message).replaceAll(session?.capability ?? 'NEVER_A_SECRET', '[REDACTED]');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (session) await session.close();
  report.protectedAfter = await hashes();
  report.protectedUnchanged = JSON.stringify(report.protectedBefore) === JSON.stringify(report.protectedAfter);
  assert.ok(report.protectedUnchanged);
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(evidence, 'runtime.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(evidence, 'runtime.log'), logs.join('\n'));
  console.log(JSON.stringify(report, null, 2));
}
