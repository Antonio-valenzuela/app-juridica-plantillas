import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { appealPdf, autoFamiliarPdf } from '../helpers/syntheticPdf';
import { acceptExternalConsentOnce } from '../helpers/externalConsent';

/**
 * Fase 3 · Parte 2 — flujo de «Contestaciones y recursos» validado en el navegador.
 *
 * Contra un servidor AISLADO (copia del árbol, sin claves de proveedores, base SQLite temporal).
 * Red externa bloqueada; la generación se SIMULA con respuestas deterministas (nunca un proveedor real).
 * Guardado, reapertura y exportación usan las rutas reales del servidor local.
 * Capturas sintéticas en audit/fase3-capturas/.
 */
const SHOTS = 'audit/fase3-capturas';
const TECHNICAL_NOISE = [/pending-upload/i, /Resoluciones detectadas/, /Conflicto OCR/i, /resoluciones encontradas/i, /Detectada automáticamente/, /NEEDS_USER_INPUT/, /SOURCE_DOCUMENT/, /CONFIRMED\b/, /\{\s*"/, /\bundefined\b/, /\[object Object\]/, /e2e-/i];
const HELP = 'La extensión es un objetivo de generación: el sistema planifica las secciones, mide el PDF y amplía con análisis respaldado por el expediente hasta alcanzarla. Si los hechos, la evidencia y las fuentes verificables no lo permiten sin repetir ni inventar, el resultado se marca «por debajo del objetivo» con el motivo. Alcanzar las páginas no valida jurídicamente el escrito.';

function draftDocument(extra: Record<string, unknown> = {}) {
  return {
    id: 'e2e-doc-fase3', title: 'Apelación para revisión', documentType: 'apelacion_familiar', documentTypeLabel: 'Apelación Familiar',
    matter: 'familiar', jurisdiction: 'local', category: 'familiar', legalBasis: [], parties: {}, caseRefs: { expediente: '1234/2025' }, variables: {},
    status: 'draft', sourceDocuments: [], classification: {}, validation: { isValid: true, errors: [], warnings: [] },
    sections: [
      { id: 's1', type: 'argument', title: 'AGRAVIOS', order: 1, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', text: 'Primer agravio: la resolución recurrida carece de fundamentación suficiente.', generationStatus: 'generated' }] },
      { id: 's2', type: 'petition', title: 'PUNTOS PETITORIOS', order: 2, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b2', layer: 'GENERATED_ARGUMENT', text: 'PRIMERO. Tener por interpuesto el recurso.', generationStatus: 'generated' }] },
    ],
    generationMetadata: {
      readiness: 'READY', qualityGate: true, validation: true, aiProvider: 'simulado',
      pageTargetResult: { requestedPages: 20, preset: 'DETALLADO', actualPages: 3, outcome: 'BELOW_TARGET', measuredWith: 'PDF_RENDERER' },
    },
    createdAt: '2026-10-12T12:00:00.000Z', updatedAt: '2026-10-12T12:00:00.000Z', ...extra,
  };
}

async function isolate(context: BrowserContext) {
  // Red externa bloqueada: solo el servidor local responde.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}

type GenerationMode = 'ok' | 'fail' | 'slow';
async function mockGeneration(page: Page, mode: GenerationMode = 'ok') {
  const sent: Array<Record<string, any>> = [];
  let polls = 0;
  await page.route('**/api/legal-engine/generate', async (route) => {
    const request: Request = route.request();
    if (request.method() !== 'POST') return route.continue();
    sent.push(JSON.parse(request.postData() || '{}'));
    if (mode === 'fail') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE', message: 'Servicio de redacción no disponible (prueba simulada).' }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', total: 4, completed: 0, percentage: 0, stage: 'Preparando el borrador…' }) });
  });
  await page.route('**/api/legal-engine/generate/status?jobId=e2e-job-f3', async (route) => {
    polls += 1;
    if (mode === 'slow' && polls <= 3) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', status: 'processing', total: 4, completed: 1, percentage: 35, currentBlock: 'AGRAVIOS', stage: 'Redactando agravios…' }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', status: 'completed', terminalStatus: 'COMPLETED', total: 4, completed: 4, percentage: 100, currentBlock: null, stage: 'Completado', documentReadiness: 'READY', document: draftDocument() }) });
  });
  return sent;
}

/** Abre la pestaña y espera a que React la haya hidratado: sin esto, el archivo se asigna antes de que exista el manejador. */
async function gotoResponses(page: Page) {
  await page.goto('/machotes?tab=responses_resources');
  await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
  await expect(page.getByTestId('page-target-selector')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function openWithPdf(page: Page, buffer: Buffer = autoFamiliarPdf(44), name = 'auto-familiar-44.pdf') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoResponses(page);
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
  await expect(page.getByText(/44 páginas ·/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('page-target-selector')).toBeVisible({ timeout: 30_000 });
  await confirmCaseDossierIfAsked(page);
}

/**
 * Contrato vigente desde a4e6aa2: si el escrito exige representación, al cargar la fuente (o cambiar de actuación)
 * se abre solo el diálogo «Confirma los datos del caso» y Generar queda bloqueado hasta confirmar la ficha.
 * Se confirma como lo haría el abogado: elige una parte compatible con el rol del escrito y marca la confirmación;
 * el diálogo se cierra solo al quedar confirmada.
 */
async function confirmCaseDossierIfAsked(page: Page) {
  const dialog = page.getByTestId('requirements-dialog');
  try { await dialog.waitFor({ state: 'visible', timeout: 5_000 }); } catch { return; }
  const select = dialog.getByLabel('Parte que representas');
  const confirm = dialog.getByLabel('Confirmar ficha del caso');
  const detected = await select.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter((value) => value && value !== '__otra__'));
  for (const value of detected) {
    await select.selectOption(value);
    if (await confirm.isEnabled()) break;
  }
  if (!(await confirm.isEnabled())) {
    await select.selectOption('__otra__');
    await dialog.getByLabel('Nombre de la parte representada').fill('Parte Representada de Prueba');
  }
  await confirm.check();
  await expect(dialog).toBeHidden();
}

/**
 * Contrato vigente desde 2026-10-13: ante una resolución caben varias vías (apelación, amparo, promoción…) y la
 * elección final es del abogado. La actuación propuesta se preselecciona, pero Generar exige confirmarla.
 */
async function confirmProposedActuacion(page: Page) {
  const confirm = page.getByTestId('actuacion-confirm');
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await confirm.click();
  await expect(page.getByTestId('actuacion-confirmed')).toBeVisible();
  await confirmCaseDossierIfAsked(page);
}

const docTypeSelect = (page: Page) => page.getByRole('combobox').filter({ has: page.locator('option[value="apelacion_civil"]') });
const pageTargetLabel = (page: Page, text: string) => page.getByTestId('page-target-selector').locator('label', { hasText: text });
const generateButton = (page: Page) => page.getByRole('button', { name: /^Generar |Revisar datos para continuar/ });

test.describe('a. carga y navegación del PDF largo', () => {
  test('44 páginas, navegación y vistas', async ({ page, context }) => {
    await isolate(context);
    await openWithPdf(page);
    await expect(page.getByText('Página 1 de 44')).toBeVisible();
    await page.getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByText('Página 2 de 44')).toBeVisible();
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByText('Página 1 de 44')).toBeVisible();
    await page.getByRole('button', { name: 'Texto extraído' }).click();
    await expect(page.getByText(/SE DESECHA el incidente/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Vista original' }).click();
    await page.screenshot({ path: `${SHOTS}/01-pdf-largo-44-paginas.png` });
  });
});

test.describe('b. actuación elegida y mensaje de compatibilidad (caso del auto familiar)', () => {
  test('Apelación Civil sobre un auto familiar se acepta con aviso de materia; contestar sin demanda se bloquea con mensaje propio', async ({ page, context }) => {
    await isolate(context);
    await openWithPdf(page);
    const select = docTypeSelect(page);

    // El sistema sugiere la apelación familiar; elegir otra actuación no se revierte en silencio.
    await expect(select).toHaveValue('apelacion_familiar');
    await select.selectOption('apelacion_civil');
    await confirmCaseDossierIfAsked(page);
    await expect(select).toHaveValue('apelacion_civil');
    const advisory = page.getByTestId('compatibility-advisory').filter({ hasText: /materia familiar/i });
    await expect(advisory).toBeVisible();
    await expect(advisory).toContainText(/c[oó]digo procesal aplicable sea el civil/i);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/una contestaci[oó]n requiere la demanda/i);
    expect(body).not.toMatch(/SOURCE_DOCUMENT_INCOMPATIBLE/);
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/02-apelacion-civil-aviso-materia.png` });

    // Contestar exige la demanda: mensaje concreto de esa actuación y Generar deshabilitado.
    await select.selectOption('contestacion_demanda_civil');
    await confirmCaseDossierIfAsked(page);
    await expect(select).toHaveValue('contestacion_demanda_civil');
    await expect(page.getByTestId('source-incompatible-notice')).toContainText(/resolución judicial, no una demanda/i);
    await expect(page.getByRole('button', { name: /^Generar contestación/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Revisar datos para continuar' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/03-contestacion-sin-demanda-bloqueada.png` });

    // Volver a la variante familiar: sin aviso de materia y de nuevo habilitado.
    await select.selectOption('apelacion_familiar');
    await confirmCaseDossierIfAsked(page);
    await expect(page.getByTestId('compatibility-advisory').filter({ hasText: /materia familiar/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
  });
});

test.describe('c. selector de extensión', () => {
  test('visible sin abrir «Más opciones», accesible por teclado y con ayuda', async ({ page, context }) => {
    await isolate(context);
    await openWithPdf(page);
    const selector = page.getByTestId('page-target-selector');
    await expect(selector).toBeVisible();
    await expect(page.locator('details.lex-disclosure[open]')).toHaveCount(0);
    await expect(selector).toContainText(HELP);
    await expect(page.getByRole('radiogroup', { name: 'Extensión objetivo del escrito' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Detallado/ })).toBeChecked();
    // Teclado: foco en la opción activa y flechas para cambiar.
    await page.getByRole('radio', { name: /Detallado/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /Extenso/ })).toBeChecked();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: /Detallado/ })).toBeChecked();
    await page.screenshot({ path: `${SHOTS}/04-selector-extension.png` });
  });

  test('personalizado validado, elección enviada al servidor y recordada tras recargar', async ({ page, context }) => {
    await isolate(context);
    const sent = await mockGeneration(page, 'ok');
    await openWithPdf(page);

    await pageTargetLabel(page, 'Personalizado').click();
    const custom = page.getByRole('spinbutton', { name: 'Objetivo de páginas' });
    await expect(custom).toBeVisible();
    for (const invalid of ['1', '100', '2.5']) {
      await custom.fill(invalid);
      await expect(page.getByRole('alert').filter({ hasText: /entero de 2 a 60 páginas/ })).toBeVisible();
    }
    await page.screenshot({ path: `${SHOTS}/05-extension-personalizada-invalida.png` });
    await custom.fill('33');
    await expect(page.getByRole('alert').filter({ hasText: /entero de 2 a 60/ })).toHaveCount(0);

    // Recargar y volver a cargar el expediente: la elección se recuerda.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'auto-familiar-44.pdf', mimeType: 'application/pdf', buffer: autoFamiliarPdf(44) });
    await expect(page.getByTestId('page-target-selector')).toBeVisible({ timeout: 30_000 });
    await confirmCaseDossierIfAsked(page);
    await expect(page.getByRole('radio', { name: /Personalizado/ })).toBeChecked();
    await expect(page.getByRole('spinbutton', { name: 'Objetivo de páginas' })).toHaveValue('33');

    // El parámetro viaja al servidor tal como se eligió.
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(1);
    expect(sent[0].pageTarget).toEqual({ preset: 'PERSONALIZADO', pages: 33 });
  });

  test('cada preset se envía con su número de páginas', async ({ page, context }) => {
    await isolate(context);
    const sent = await mockGeneration(page, 'ok');
    await openWithPdf(page);
    await pageTargetLabel(page, 'Breve').click();
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(1);
    expect(sent[0].pageTarget).toEqual({ preset: 'BREVE', pages: 5 });
  });
});

test.describe('d. reglas de habilitación de Generar', () => {
  test('sin documento no se puede generar; con una resolución y una actuación compatible sí', async ({ page, context }) => {
    await isolate(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoResponses(page);
    await expect(page.getByText(/Sube una demanda, acuerdo, notificación o escrito inicial/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Generar contestación/ })).toBeDisabled();
    await page.screenshot({ path: `${SHOTS}/06-estado-vacio.png` });

    await openWithPdf(page, appealPdf(44), 'apelacion44.pdf');
    // Varias vías posibles: hasta que el abogado confirma, Generar no se habilita.
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeDisabled();
    await confirmProposedActuacion(page);
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
  });
});

test.describe('e. panel derecho sin datos técnicos', () => {
  test('el inspector no muestra identificadores, JSON ni códigos internos', async ({ page, context }) => {
    await isolate(context);
    await openWithPdf(page);
    const inspector = page.getByTestId('document-inspector');
    await expect(inspector).toBeVisible();
    const text = await inspector.innerText();
    for (const noise of TECHNICAL_NOISE) expect(text, String(noise)).not.toMatch(noise);
    await page.screenshot({ path: `${SHOTS}/07-panel-derecho-sin-datos-tecnicos.png` });
  });
});

test.describe('f. edición, guardado, reapertura y recuperación del borrador', () => {
  test('editar un bloque, guardar (SQLite local), reabrir desde Inicio y recuperarse de un fallo de guardado', async ({ page, context }) => {
    await isolate(context);
    await mockGeneration(page, 'ok');
    await openWithPdf(page);
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('page-target-result')).toContainText('Objetivo: 20 páginas · Resultado: 3 páginas (por debajo del objetivo)');
    await expect(page.getByTestId('page-target-result')).not.toContainText('No se alcanzó');
    // El documento generado se puede recorrer: el lienzo tiene su propio scroll y llega al final.
    const canvas = page.locator('.legal-document-canvas').first();
    await expect(canvas).toBeVisible();
    const dims = await canvas.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    expect(dims.client).toBeGreaterThan(200);
    await canvas.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    expect(await canvas.evaluate((el) => el.scrollTop > 0 || el.scrollHeight <= el.clientHeight)).toBe(true);

    // Edición del primer bloque.
    await page.getByRole('button', { name: /Editar contestación/ }).click();
    await page.getByRole('button', { name: '✏️', exact: true }).first().click();
    const block = page.locator('textarea').first();
    await block.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' EDICION-E2E-UNO');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/EDICION-E2E-UNO/).first()).toBeVisible();

    // Fallo de guardado: mensaje claro y el texto editado se conserva en pantalla.
    await page.route('**/api/legal-drafts', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'DRAFT_SAVE_FAILED', error: 'No se pudo guardar el borrador en la base local. Se conservó una copia de recuperación en la carpeta de datos y el texto sigue abierto en el editor.' }) })
      : route.continue());
    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await expect(page.getByText(/NO GUARDADO/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/EDICION-E2E-UNO/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/08-fallo-de-guardado-conserva-texto.png` });
    await page.unroute('**/api/legal-drafts');

    // Reintento: se guarda y no se duplica.
    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await expect.poll(async () => {
      const response = await page.request.get('/api/legal-drafts');
      const { drafts } = await response.json();
      return drafts.filter((draft: any) => JSON.stringify(draft.structuredDoc).includes('EDICION-E2E-UNO')).length;
    }, { timeout: 15_000 }).toBe(1);
    await page.getByRole('button', { name: /Guardar/ }).first().click();
    await page.waitForTimeout(1500);
    const all = (await (await page.request.get('/api/legal-drafts')).json()).drafts as any[];
    // La base e2e es compartida entre corridas: se verifica que el borrador editado no se duplique.
    expect(all.filter((draft) => JSON.stringify(draft.structuredDoc).includes('EDICION-E2E-UNO'))).toHaveLength(1);

    // Cierre y reapertura desde Inicio.
    await page.goto('/machotes');
    await page.getByRole('button', { name: /Apelación para revisión/ }).first().click();
    const editedId = all.find((draft) => JSON.stringify(draft.structuredDoc).includes('EDICION-E2E-UNO')).id as string;
    await page.getByRole('row', { name: /Apelación para revisión/ }).first().waitFor();
    const rows = await page.getByRole('row', { name: /Apelación para revisión/ }).count();
    for (let index = 0; index < rows; index += 1) {
      await page.getByRole('row', { name: /Apelación para revisión/ }).nth(index).getByRole('button', { name: 'Abrir ficha' }).click();
      if (await page.getByText(`ID real: ${editedId}`).count()) break;
      // La ficha es un panel modal (PATRON-DETALLE.md): se cierra antes de abrir la siguiente fila.
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Abrir borrador asociado' }).click();
    await expect(page.getByText(/EDICION-E2E-UNO/).first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `${SHOTS}/09-borrador-reabierto.png` });
  });
});

test.describe('g. exportación DOCX y PDF desde la interfaz', () => {
  test('DOCX y PDF reales del borrador, sin red externa', async ({ page, context }) => {
    await isolate(context);
    await mockGeneration(page, 'ok');
    await openWithPdf(page);
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 20_000 });

    for (const [label, route, magic] of [['DOCX borrador', 'docx', 'PK'], ['PDF borrador', 'pdf', '%PDF']] as const) {
      await page.getByRole('button', { name: /Exportar/ }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.getByRole('button', { name: new RegExp(label) }).click(),
      ]);
      const filePath = await download.path();
      const bytes = (await import('node:fs')).readFileSync(filePath);
      expect(download.suggestedFilename().toLowerCase().endsWith(`.${route}`), download.suggestedFilename()).toBe(true);
      expect(bytes.subarray(0, magic.length).toString('latin1'), route).toBe(magic);
      expect(bytes.length, route).toBeGreaterThan(1000);
    }
    await page.screenshot({ path: `${SHOTS}/10-exportacion.png` });
  });
});

test.describe('h. estados de carga, vacío, error y éxito', () => {
  test('carga: muestra el avance; éxito: resultado de extensión; error: mensaje claro y datos conservados', async ({ page, context }) => {
    await isolate(context);
    await mockGeneration(page, 'slow');
    await openWithPdf(page);
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect(page.getByText(/Redactando agravios/)).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${SHOTS}/11-estado-de-carga.png` });
    await expect(page.getByTestId('page-target-result')).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/12-estado-de-exito.png` });
  });

  test('error: fallo del servicio de redacción', async ({ page, context }) => {
    await isolate(context);
    await mockGeneration(page, 'fail');
    await openWithPdf(page);
    await confirmProposedActuacion(page);
    void acceptExternalConsentOnce(page);
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect(page.getByText(/Fallo en la generación: Proveedor de IA no disponible/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
    await expect(page.getByTestId('page-target-selector')).toBeVisible();
    const visible = await page.locator('body').innerText();
    expect(visible).not.toMatch(/\[object Object\]|Traceback|\bundefined\b/);
    await page.screenshot({ path: `${SHOTS}/13-estado-de-error.png` });
  });
});
