import { expect, test, type Page, type Request } from '@playwright/test';
import { appealPdf } from '../helpers/syntheticPdf';

/**
 * Flujo directo de apelación en la aplicación real: PDF de 44 páginas → tipo elegido → Generar → borrador.
 * La API de generación se SIMULA: nunca se llama a un proveedor de IA real ni se envía contenido a terceros.
 */
const TECHNICAL_NOISE = [/pending-upload/i, /Resoluciones detectadas/, /Conflicto OCR/i, /\bOCR\b/, /resoluciones encontradas/i, /Detectada automáticamente/, /NEEDS_USER_INPUT/];

const documentFixture = {
  id: 'e2e-appeal-document', title: 'Apelación para revisión', documentType: 'apelacion_familiar', documentTypeLabel: 'Apelación Familiar',
  matter: 'familiar', jurisdiction: 'local', category: 'familiar', legalBasis: [], parties: {}, caseRefs: { expediente: 'ANON-01' }, variables: {},
  status: 'draft', sourceDocuments: [], classification: {}, validation: { isValid: true, errors: [], warnings: [] },
  sections: [{ id: 's1', type: 'header', title: 'Encabezado', order: 1, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b1', text: 'Contenido del borrador para revisión.', generationStatus: 'generated' }] }],
  generationMetadata: { readiness: 'READY', qualityGate: true, validation: true, aiProvider: 'test' },
  createdAt: '2026-10-12T12:00:00.000Z', updatedAt: '2026-10-12T12:00:00.000Z',
};

async function openWithPdf(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/machotes?tab=responses_resources');
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'apelacion44.pdf', mimeType: 'application/pdf', buffer: appealPdf(44) });
  await expect(page.getByRole('region', { name: 'Resolución a impugnar' })).toBeVisible({ timeout: 20_000 });
}

async function mockGeneration(page: Page, mode: 'ok' | 'fail') {
  const sent: Array<Record<string, any>> = [];
  await page.route('**/api/legal-engine/generate', async (route) => {
    const request: Request = route.request();
    if (request.method() === 'POST') sent.push(JSON.parse(request.postData() || '{}'));
    if (mode === 'fail') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE', message: 'Servicio de redacción no disponible (prueba simulada).' }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-appeal-job', total: 1, completed: 0, percentage: 0, stage: 'Preparando el borrador…' }) });
  });
  await page.route('**/api/legal-engine/generate/status?jobId=e2e-appeal-job', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-appeal-job', status: 'completed', terminalStatus: 'COMPLETED', total: 1, completed: 1, percentage: 100, currentBlock: null, stage: 'Completado', documentReadiness: 'READY', document: documentFixture }) });
  });
  return sent;
}

test.describe('apelación: del PDF de 44 páginas al borrador', () => {
  test('el panel derecho muestra una sola resolución principal sin ruido técnico', async ({ page }) => {
    await openWithPdf(page);
    const inspector = page.getByTestId('document-inspector');
    await expect(inspector.getByTestId('appeal-primary-resolution')).toContainText('Sentencia definitiva');
    await expect(inspector.getByText('Expediente: ANON-01')).toBeVisible();
    const text = (await inspector.innerText());
    for (const noise of TECHNICAL_NOISE) expect(text, String(noise)).not.toMatch(noise);
    // Sin lista de candidatas: ningún botón de opción representa una resolución (los radios restantes son del modo de generación).
    await expect(inspector.getByRole('radio', { name: /Sentencia|Auto ·|resoluci[óo]n/i })).toHaveCount(0);
    // El visor conserva las 44 páginas del PDF como una única fuente.
    await expect(page.getByText(/^44 páginas ·/)).toBeVisible();
  });

  test('Generar envía el PDF completo con la confirmación provisional y llega al borrador editable', async ({ page }) => {
    const sent = await mockGeneration(page, 'ok');
    await openWithPdf(page);
    page.once('dialog', async (dialog) => {
      // Consentimiento de privacidad obligatorio: NO es una confirmación redundante.
      expect(dialog.message()).toContain('se enviará contenido del expediente');
      expect(dialog.message()).not.toMatch(/contestación/i);
      await dialog.accept();
    });
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
    const body = sent[0];
    expect(body.sourceDocuments).toHaveLength(1);
    expect(body.sourceDocuments[0].pages).toHaveLength(44);
    expect(body.selectedDocumentType).toMatch(/^apelacion_/);
    expect(body.documentTypeLabel).toMatch(/^Apelación/);
    expect(body.userInstruction).not.toMatch(/contestaci[óo]n/i);
    expect(body.appealConfirmation).toMatchObject({ provisional: true, confirmed: false, representedNames: [], recipient: 'JUZGADO QUINTO EN MATERIA FAMILIAR', expediente: 'ANON-01' });
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Contenido del borrador para revisión.')).toBeVisible();
  });

  test('un fallo recuperable muestra un mensaje claro y conserva los datos introducidos', async ({ page }) => {
    const sent = await mockGeneration(page, 'fail');
    await openWithPdf(page);
    const instruction = 'Impugnar la sentencia por indebida valoración de la prueba documental.';
    // La instrucción directa vive en «Opciones de redacción», desplegable.
    await page.getByText('Opciones de redacción').click();
    await page.getByPlaceholder(/Ej\. Elabora recurso/).fill(instruction);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect.poll(() => sent.length, { timeout: 15_000 }).toBe(1);
    await expect(page.getByText(/Fallo en la generación/)).toBeVisible({ timeout: 10_000 });
    // Nada se pierde: la resolución, la instrucción y la posibilidad de reintentar siguen ahí.
    await expect(page.getByRole('region', { name: 'Resolución a impugnar' })).toBeVisible();
    await expect(page.getByPlaceholder(/Ej\. Elabora recurso/)).toHaveValue(instruction);
    await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
    const visible = await page.locator('body').innerText();
    // Mensaje claro (categoría + causa); el código de soporte de la lista segura es aceptable.
    // (La superposición de errores de Next.js existe solo en modo desarrollo; se acota al aviso del producto.)
    await expect(page.getByText(/Fallo en la generación: Proveedor de IA no disponible: .*reintenta/)).toBeVisible();
    const unresolved = visible.match(/.{0,60}(undefined|\[object Object\]|Traceback|stack|at \w+ \()/i);
    expect(unresolved?.[0], 'no debe mostrarse un valor sin resolver ni una traza').toBeUndefined();
  });

  test('si el abogado no autoriza el envío a proveedores externos no sale ninguna petición', async ({ page }) => {
    const sent = await mockGeneration(page, 'ok');
    await openWithPdf(page);
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByRole('button', { name: /Generar apelación/ }).click();
    await expect(page.getByText(/Generación cancelada: no se autorizó/)).toBeVisible({ timeout: 10_000 });
    expect(sent).toHaveLength(0);
  });
});
