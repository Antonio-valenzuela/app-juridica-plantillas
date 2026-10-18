import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchDesktopLocal } from '../desktop/local-launcher.mjs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const root = process.cwd();
const out = path.join(root, 'audit/generator-master/v5-e2e-ui/closure-2026-10-04');
await mkdir(out, { recursive: true });
process.env.LEXPLANTILLAS_STORAGE_ROOT = path.join(out, 'synthetic-store');
for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) process.env[key] = '';

const report = {
  engine: 'Playwright Chromium chrome',
  mode: 'CURRENT_TREE_DEVELOPMENT',
  fixture: 'synthetic source text created in memory; no personal data',
  providersReal: false,
  productionExportRoutes: true,
  navigation: { contestaciones: 'NOT_RUN', initialWritings: 'NOT_RUN', universal: 'NOT_RUN' },
  typePassSelection: 'NOT_RUN',
  typeFailBlocked: 'NOT_RUN',
  draftGeneration: 'NOT_RUN',
  draftDocx: 'NOT_RUN',
  draftPdf: 'NOT_RUN',
  finalBlock: 'NOT_RUN',
  uiErrorMessage: 'NOT_RUN',
};

let session;
let browser;
let context;
let page;
try {
  session = await launchDesktopLocal({ projectDir: root, development: true, onOutput: (line) => process.stdout.write(`${line}\n`), readinessTimeoutMs: 120000 });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const exchange = await context.request.post(`${session.baseUrl}/api/desktop-local/session`, {
    headers: { 'x-lex-desktop-capability': session.capability },
  });
  assert.equal(exchange.status(), 204, 'desktop-local session exchange must succeed');
  page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${session.baseUrl}/machotes?tab=responses_resources`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.getByRole('heading', { name: 'Contestaciones y recursos' }).waitFor({ timeout: 30000 });
  report.navigation.contestaciones = 'PASS';
  await page.screenshot({ path: path.join(out, '01-contestaciones.png') });

  await page.getByRole('link', { name: 'Escritos Iniciales' }).click();
  await page.getByRole('heading', { name: 'Escritos Iniciales' }).waitFor({ timeout: 30000 });
  report.navigation.initialWritings = 'PASS';
  await page.screenshot({ path: path.join(out, '02-escritos-iniciales.png') });

  await page.getByRole('link', { name: 'Motor Jurídico' }).click();
  await page.getByRole('heading', { name: 'Redacción Jurídica' }).waitFor({ timeout: 30000 });
  report.navigation.universal = 'PASS';
  report.generationAvailabilityMessage = await page.getByTestId('writing-availability-universal').innerText();
  await page.screenshot({ path: path.join(out, '03-universal.png') });

  const typeSelect = page.getByLabel('Tipo de escrito');
  const availableTypes = await typeSelect.locator('option').evaluateAll((options) => options.map((option) => ({ value: option.value, label: option.textContent?.trim() || '' })));
  const passType = availableTypes.find((option) => option.value && option.value !== 'otro');
  report.typePassSelection = passType ? `AVAILABLE:${passType.value}` : 'FAIL_NO_FUNCTIONAL_PASS_TYPE_AVAILABLE';
  const candidateFail = 'contestacion_demanda_civil';
  let failTypeRejected = false;
  try {
    await typeSelect.selectOption(candidateFail);
  } catch {
    failTypeRejected = true;
  }
  const runButton = page.getByRole('button', { name: /Ejecutar análisis/ });
  report.typeFailBlocked = failTypeRejected && await runButton.isDisabled()
    ? 'PASS_TYPE_FAIL_NOT_SELECTABLE_AND_GENERATION_DISABLED'
    : 'FAIL_TYPE_FAIL_NOT_BLOCKED';
  report.availableTypeCount = availableTypes.length;
  report.availableTypes = availableTypes;
  report.draftGeneration = passType && !await runButton.isDisabled()
    ? 'READY_TO_TEST'
    : 'BLOCKED_NO_FUNCTIONAL_PASS_TYPE';
  await page.screenshot({ path: path.join(out, '04-type-gate.png') });

  const sourceMarker = 'TEXTO SINTETICO V5 PARA VERIFICAR EL EDITOR Y LA EXPORTACION';
  const sourceText = [
    'ESCRITO SINTETICO DE PRUEBA. SIN DATOS PERSONALES.',
    'Materia: civil.',
    'Expediente de prueba: V5-SINTETICO-01.',
    sourceMarker,
    'La informacion se utiliza unicamente para verificar carga local y exportacion de borrador.',
  ].join('\n');
  await page.getByRole('link', { name: 'Contestaciones' }).click();
  await page.getByRole('heading', { name: 'Contestaciones y recursos' }).waitFor({ timeout: 30000 });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'v5-synthetic-source.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(sourceText, 'utf8'),
  });
  await page.getByText('v5-synthetic-source.txt', { exact: false }).first().waitFor({ timeout: 60000 });
  await page.getByText(sourceMarker, { exact: false }).first().waitFor({ timeout: 60000 });
  report.syntheticUpload = 'PASS_UI_FILE_INPUT_AND_LOCAL_ANALYSIS';

  const continueEditor = page.getByRole('button', { name: 'Continuar en editor jurídico' });
  await continueEditor.waitFor({ timeout: 30000 });
  await continueEditor.click();
  await page.locator('.workspace-editor-shell').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  const toolbar = page.getByTestId('editor-toolbar');
  report.editor = {
    status: 'PASS_VIEW_OPENED',
    toolbarCount: await toolbar.count(),
    toolbarVisible: await toolbar.isVisible().catch(() => false),
    toolbarText: await toolbar.innerText().catch(() => ''),
    shellText: await page.locator('.workspace-editor-shell').innerText().catch(() => ''),
    documentMarkerVisible: await page.getByText(sourceMarker, { exact: false }).count() > 0,
    exportButtonCount: await page.getByRole('button', { name: /^Exportar/ }).count(),
    pageContentStyle: await page.locator('.legal-document-content').first().evaluate((element) => {
      const target = element.querySelector('section, p, div') || element;
      const style = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      return {
        text: target.textContent?.trim().slice(0, 240) || '',
        color: style.color,
        visibility: style.visibility,
        display: style.display,
        opacity: style.opacity,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }).catch((error) => ({ error: error.message })),
    pageErrors: [...pageErrors],
  };
  const toolbarBounds = await toolbar.boundingBox();
  const editorMarker = page.locator('#page-sheet-1').getByText(sourceMarker, { exact: false });
  const editorMarkerBounds = await editorMarker.boundingBox();
  report.editor.windowScrollY = await page.evaluate(() => window.scrollY);
  report.editor.workspaceScrollTop = await page.locator('.machotes-shell .machotes-main-scroll').evaluate((element) => element.scrollTop);
  report.editor.toolbarBounds = toolbarBounds;
  report.editor.contentMarkerBounds = editorMarkerBounds;
  report.editor.contentMarkerInViewport = Boolean(
    editorMarkerBounds
    && editorMarkerBounds.y < (page.viewportSize()?.height ?? 0)
    && editorMarkerBounds.y + editorMarkerBounds.height > 64,
  );
  assert.ok(toolbarBounds && toolbarBounds.y >= 60, 'editor toolbar must remain in the initial viewport after opening');
  assert.equal(report.editor.workspaceScrollTop, 0, 'workspace scroll must reset when entering the editor');
  assert.ok(report.editor.contentMarkerInViewport, 'uploaded document text must be visible in the editor viewport');
  await page.screenshot({ path: path.join(out, '05-editor.png') });

  const exportButton = page.getByTitle('Elegir exportación de borrador o final');
  await exportButton.waitFor({ state: 'visible', timeout: 5000 });
  for (const extension of ['docx', 'pdf']) {
    await exportButton.click();
    await page.screenshot({ path: path.join(out, `06-${extension}-menu.png`) });
    const control = `${extension.toUpperCase()} borrador`;
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: new RegExp(control, 'i') }).first().click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    const file = path.join(out, `ui-click-draft.${extension}`);
    await download.saveAs(file);
    const bytes = await readFile(file);
    assert.ok((await stat(file)).size > 500, `${extension} download must be non-empty`);
    let validation;
    if (extension === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      assert.ok(value.includes(sourceMarker), 'DOCX must contain current editor content');
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
      const header = zip.file('word/header1.xml');
      const headerText = header ? await header.async('string') : '';
      assert.ok(/BORRADOR/i.test(headerText) || /BORRADOR/i.test(value), 'DOCX must preserve DRAFT warning');
      validation = 'OOXML ZIP CRC valid; current source content and BORRADOR warning present';
      report.draftDocx = { status: 'PASS', control, downloadDetected: true, suggestedFilename: download.suggestedFilename(), file, bytes: bytes.length, validation };
    } else {
      assert.equal(bytes.subarray(0, 4).toString(), '%PDF', 'PDF signature must be valid');
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      try {
        const parsed = await parser.getText();
        assert.ok(parsed.text.includes(sourceMarker), 'PDF must contain current editor content');
        assert.ok(/BORRADOR/i.test(parsed.text), 'PDF must preserve DRAFT warning');
        report.pdfPages = parsed.pages.length;
        validation = `PDF parsed; ${parsed.pages.length} page(s), current source content and BORRADOR warning present`;
      } finally {
        await parser.destroy();
      }
      report.draftPdf = { status: 'PASS', control, downloadDetected: true, suggestedFilename: download.suggestedFilename(), file, bytes: bytes.length, validation };
    }
    await page.screenshot({ path: path.join(out, `07-after-${extension}.png`) });
  }

  await exportButton.click();
  const finalOptions = page.getByRole('button', { name: /^(DOCX|PDF) final$/i });
  const finalOptionCount = await finalOptions.count();
  const finalExplanation = page.getByText('Disponible cuando se resuelvan los pendientes de revisión.', { exact: true });
  const explanationVisible = await finalExplanation.isVisible().catch(() => false);
  const bodyAfterFinal = await page.locator('body').innerText();
  report.finalBlock = {
    status: finalOptionCount === 0 && explanationVisible ? 'PASS_FINAL_OPTIONS_OMITTED_WHILE_REVIEW_PENDING' : 'FAIL_FINAL_OPTIONS_NOT_BLOCKED',
    finalOptionCount,
    explanationVisible,
    downloadProduced: false,
    observed: bodyAfterFinal.match(/.{0,60}(?:pendientes de revisión|bloquead[oa]|revisión del abogado).{0,100}/ig)?.slice(0, 3) || [],
  };
  await page.screenshot({ path: path.join(out, '08-final-state.png') });

  report.uiErrorMessage = /0 tipos acreditados|tipos en desarrollo|no se seleccionan para generar/i.test(report.generationAvailabilityMessage || '')
    ? 'PASS_GENERATION_UNAVAILABLE_EXPLAINED_IN_UI'
    : 'NOT_OBSERVED';
  report.pageErrors = pageErrors;
  report.overall = report.navigation.contestaciones === 'PASS'
    && report.navigation.initialWritings === 'PASS'
    && report.navigation.universal === 'PASS'
    && report.typeFailBlocked.startsWith('PASS_')
    && report.draftDocx?.status === 'PASS'
    && report.draftPdf?.status === 'PASS'
    && report.finalBlock.status.startsWith('PASS_')
    && report.typePassSelection.startsWith('AVAILABLE:')
    && report.draftGeneration === 'READY_TO_TEST'
    ? 'PASS'
    : 'FAIL';
  if (report.overall === 'FAIL') process.exitCode = 1;
} catch (error) {
  report.overall = 'FAIL';
  report.error = error.message;
  process.exitCode = 1;
  if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
  await browser?.close();
  await session?.close();
  report.backendClosed = true;
  await writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
