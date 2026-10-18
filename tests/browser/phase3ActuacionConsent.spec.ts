import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Document, Packer, Paragraph } from 'docx';
import { buildSyntheticPdf } from '../helpers/syntheticPdf';
import { CIVIL_ARRENDAMIENTO_DEMAND, demandToPdf } from '../helpers/syntheticDemandPdf';

/**
 * Fase 8 — Contestaciones y recursos de punta a punta en el navegador, con documentos SINTÉTICOS.
 * Servidor AISLADO (copia del árbol, claves vacías, base temporal). Red externa bloqueada; la generación
 * se intercepta: nunca llega a un proveedor. Cubre: carga PDF/DOCX, propuesta y corrección manual de la
 * actuación, consentimiento por operación (cancelar sin transmisión; proveedores nombrados y lista
 * autorizada enviada), consentimiento nuevo al regenerar un apartado y la métrica de envíos.
 */
const SHOTS = 'audit/fase8/capturas';

async function isolate(context: BrowserContext) {
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
}

function draft(documentType: string) {
  return {
    id: `e2e-doc-${documentType}`, title: 'Borrador sintético', documentType, documentTypeLabel: documentType,
    matter: 'civil', jurisdiction: 'local', category: 'civil', legalBasis: [], parties: {}, caseRefs: { expediente: '1450/2025' }, variables: {},
    status: 'draft', sourceDocuments: [], classification: {}, validation: { isValid: true, errors: [], warnings: [] },
    sections: [
      { id: 's1', type: 'argument', title: 'CONTESTACIÓN A LOS HECHOS', order: 1, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', text: 'AL HECHO 1.- [REQUIERE POSTURA DEL ABOGADO].', generationStatus: 'generated' }] },
    ],
    generationMetadata: { readiness: 'READY', qualityGate: true, validation: true },
    createdAt: '2026-10-13T12:00:00.000Z', updatedAt: '2026-10-13T12:00:00.000Z',
  };
}

/** Intercepta la generación: registra lo que se ENVIARÍA y responde un borrador simulado. */
async function captureGeneration(page: Page, documentType = 'contestacion_demanda_civil') {
  const generate: Array<Record<string, any>> = [];
  const sections: Array<Record<string, any>> = [];
  await page.route('**/api/legal-engine/generate', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    generate.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f8', total: 1, completed: 0, percentage: 0, stage: 'Preparando el borrador…' }) });
  });
  await page.route('**/api/legal-engine/generate/status?jobId=e2e-job-f8', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f8', status: 'completed', terminalStatus: 'COMPLETED', total: 1, completed: 1, percentage: 100, stage: 'Completado', documentReadiness: 'READY', document: draft(documentType) }) }));
  await page.route('**/api/legal-engine/generate-section', async (route) => {
    sections.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE' }) });
  });
  return { generate, sections };
}

async function mockConfiguredProviders(page: Page) {
  await page.route('**/api/health/providers', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    ok: true, chain: ['groq', 'nvidia', 'local'],
    providers: [{ id: 'gemini', available: true }, { id: 'groq', available: true }, { id: 'nvidia', available: true }, { id: 'local', available: true }],
  }) }));
}

async function openResponses(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/machotes?tab=responses_resources');
  await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.getByTestId('actuacion-proposal')).toBeVisible({ timeout: 45_000 });
}

const typeSelect = (page: Page) => page.getByRole('combobox').filter({ has: page.locator('option[value="redaccion_libre"]') });
const consent = (page: Page) => page.getByTestId('external-provider-consent');

const AUTO_MERCANTIL = [
  'JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL',
  'EXPEDIENTE: 777/2025',
  'Guadalajara, Jalisco, a diez de septiembre de dos mil veinticinco.',
  'Visto el incidente de nulidad de actuaciones promovido por la parte demandada en el juicio ejecutivo mercantil,',
  'con fundamento en las constancias de autos, SE DESECHA el incidente planteado por improcedente.',
  'NOTIFÍQUESE. Así lo resolvió y firma el Juez Tercero de lo Mercantil.',
];

test.describe('Fase 8 · actuación propuesta y consentimiento por operación', () => {
  test('PDF de demanda: propone la contestación; «No enviar» deja la operación bloqueada y no transmite nada', async ({ page, context }) => {
    await isolate(context);
    const sent = await captureGeneration(page);
    await openResponses(page);
    await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
    await expect(page.getByTestId('actuacion-detected')).toContainText(/demanda/i);
    await expect(typeSelect(page)).toHaveValue('contestacion_demanda_civil');
    await page.screenshot({ path: `${SHOTS}/01-demanda-actuacion-propuesta.png` });

    await page.getByRole('button', { name: /^Generar contestación/ }).click();
    await expect(consent(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/02-consentimiento.png` });
    await consent(page).getByRole('button', { name: 'No enviar' }).click();
    await expect(consent(page)).toBeHidden();
    await expect(page.getByText(/No se envió ningún dato/)).toBeVisible();
    await page.waitForTimeout(1000);
    expect(sent.generate).toHaveLength(0);
  });

  test('con proveedores configurados nombra a quién se envía y solo autoriza esa lista', async ({ page, context }) => {
    await isolate(context);
    await mockConfiguredProviders(page);
    const sent = await captureGeneration(page);
    await openResponses(page);
    await expect(page.getByText('IA en la nube configurada')).toBeVisible({ timeout: 15_000 });
    await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
    await page.getByRole('button', { name: /^Generar contestación/ }).click();
    await expect(consent(page).getByTestId('external-consent-providers')).toHaveText('Groq, y si no responde, NVIDIA');
    await expect(consent(page)).toContainText('queda sujeto a sus políticas de uso y conservación de datos');
    await page.screenshot({ path: `${SHOTS}/03-consentimiento-proveedores.png` });
    // Escape también cancela.
    await page.keyboard.press('Escape');
    await expect(consent(page)).toBeHidden();
    expect(sent.generate).toHaveLength(0);

    await page.getByRole('button', { name: /^Generar contestación/ }).click();
    await consent(page).getByRole('button', { name: 'Autorizar esta generación' }).click();
    await expect.poll(() => sent.generate.length, { timeout: 15_000 }).toBe(1);
    expect(sent.generate[0]).toMatchObject({ externalProviderOptIn: true, authorizedExternalProviders: ['groq', 'nvidia'], selectedDocumentType: 'contestacion_demanda_civil' });
  });

  test('DOCX de un auto mercantil: no propone contestar; el abogado corrige a revocación y se envía esa actuación', async ({ page, context }) => {
    await isolate(context);
    const sent = await captureGeneration(page, 'revocacion_mercantil');
    await openResponses(page);
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: AUTO_MERCANTIL.map((line) => new Paragraph(line)) }] }));
    await upload(page, { name: 'auto-mercantil-sintetico.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx });
    await expect(page.getByTestId('actuacion-detected')).toContainText(/auto/i);
    await expect(page.getByTestId('actuacion-candidate-contestacion_demanda_mercantil')).toHaveCount(0);
    await page.getByTestId('actuacion-candidate-revocacion_mercantil').click();
    await expect(typeSelect(page)).toHaveValue('revocacion_mercantil');
    await page.screenshot({ path: `${SHOTS}/04-docx-correccion-manual.png` });
    await page.getByRole('button', { name: /^Generar recurso/ }).click();
    await expect(consent(page)).toBeVisible();
    // El servidor aislado no tiene claves: el panel lo dice y permite seguir solo en local.
    await expect(consent(page).getByTestId('external-consent-no-remote')).toBeVisible();
    await consent(page).getByRole('button', { name: 'Continuar sin enviar' }).click();
    await expect.poll(() => sent.generate.length, { timeout: 15_000 }).toBe(1);
    expect(sent.generate[0]).toMatchObject({ selectedDocumentType: 'revocacion_mercantil', authorizedExternalProviders: [] });
  });

  test('PDF con varias resoluciones y páginas sin texto: lo informa y exige confirmar la actuación', async ({ page, context }) => {
    await isolate(context);
    await openResponses(page);
    const pdf = buildSyntheticPdf([AUTO_MERCANTIL, [''], ['SENTENCIA DEFINITIVA', 'JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL', 'EXPEDIENTE: 777/2025', 'VISTOS para resolver el juicio ejecutivo mercantil.', 'RESULTANDO. Primero. La actora demandó el pago.', 'CONSIDERANDO. Primero. Este juzgado es competente.', 'SE RESUELVE:', 'PRIMERO. Se condena al demandado al pago.', 'NOTIFÍQUESE.']]);
    await upload(page, { name: 'expediente-mixto.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(page.getByTestId('actuacion-detected')).toContainText(/sentencia definitiva/i);
    await expect(page.getByTestId('actuacion-proposal')).toContainText(/También contiene/);
    await expect(page.getByTestId('actuacion-extraction-notice')).toContainText(/No se pudo leer texto en 1 de 3 páginas/);
    await expect(page.getByRole('button', { name: /^Generar apelación/ })).toBeDisabled();
    await page.getByTestId('actuacion-confirm').click();
    await expect(page.getByRole('button', { name: /^Generar apelación/ })).toBeEnabled();
    await page.screenshot({ path: `${SHOTS}/05-expediente-mixto.png` });
  });

  test('regenerar un apartado pide un consentimiento NUEVO; cancelarlo no transmite', async ({ page, context }) => {
    await isolate(context);
    await mockConfiguredProviders(page);
    const sent = await captureGeneration(page);
    await openResponses(page);
    await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
    await page.getByRole('button', { name: /^Generar contestación/ }).click();
    await consent(page).getByRole('button', { name: 'Autorizar esta generación' }).click();
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Editar contestación/ }).click();
    await page.getByText('CONTESTACIÓN A LOS HECHOS').first().click();
    const reformular = page.getByTitle('Reformular el apartado activo');
    await expect(reformular).toBeEnabled({ timeout: 10_000 });
    await reformular.click();
    await expect(consent(page)).toBeVisible();
    await consent(page).getByRole('button', { name: 'No enviar' }).click();
    await page.waitForTimeout(1000);
    expect(sent.sections).toHaveLength(0);
  });

  test('Analíticas muestra la métrica «Envíos a IA en la nube» (sin envíos en el servidor aislado)', async ({ page, context }) => {
    await isolate(context);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/machotes?tab=configuracion');
    const panel = page.getByTestId('analytics-ai-egress');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText('Envíos a IA en la nube');
    await expect(panel.getByTestId('analytics-ai-egress-empty')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/06-analiticas-envios.png` });
  });
});
