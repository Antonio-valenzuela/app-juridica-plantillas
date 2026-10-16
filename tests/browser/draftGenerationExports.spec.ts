import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { acceptExternalConsentOnce } from '../helpers/externalConsent';
import { readDocxPackage } from '../helpers/docxPackageReader';

const evidenceDirectory = path.join(process.cwd(), 'audit', 'draft-export-recovery', 'e2e-ui');

function makeDraftDocument(documentType: string, title: string) {
  const sections = [
    { title: 'PROEMIO', text: 'PROEMIO\n\nComparezco en el expediente de prueba y solicito que se tenga por presentado este escrito.' },
    { title: 'HECHOS', text: 'HECHOS\n\nLos hechos deberán cotejarse con la fuente antes de su presentación.' },
    { title: 'EXCEPCIONES Y DEFENSAS', text: 'EXCEPCIONES Y DEFENSAS\n\n[PENDIENTE: incorporar únicamente defensas sustentadas en el expediente y revisar su fundamento].' },
    { title: 'PRUEBAS', text: 'PRUEBAS\n\n[PENDIENTE: identificar las pruebas ofrecidas en la fuente].' },
    { title: 'PETITORIOS', text: 'PETITORIOS\n\nPRIMERO. Tener por presentado este borrador para revisión.' },
  ];
  return {
    id: `e2e-draft-${documentType}`,
    title,
    documentType,
    documentTypeLabel: title,
    matter: 'civil',
    jurisdiction: 'local',
    category: 'civil',
    legalBasis: [],
    parties: {},
    caseRefs: { expediente: 'E2E-LOCAL-01' },
    variables: {},
    status: 'draft',
    sections: sections.map((section, index) => ({
      id: `e2e-section-${index + 1}`,
      type: 'body',
      title: section.title,
      order: index + 1,
      content: [{ id: `e2e-block-${index + 1}`, text: section.text, generationStatus: 'generated' }],
      isRepeatable: false,
      isEditable: true,
      isGenerated: true,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    })),
    sourceDocuments: [],
    classification: {},
    validation: { isValid: false, errors: ['PENDIENTE_DE_REVISION'], warnings: ['Borrador asistido'] },
    generationMetadata: { readiness: 'REQUIRES_REVIEW', qualityGate: false, validation: false, aiProvider: 'e2e-simulado' },
    createdAt: '2026-10-04T12:00:00.000Z',
    updatedAt: '2026-10-04T12:00:00.000Z',
  };
}

function assertNoEmptySections(text: string) {
  const headings = ['PROEMIO', 'HECHOS', 'EXCEPCIONES Y DEFENSAS', 'PRUEBAS', 'PETITORIOS'];
  const positions = headings.map((heading) => ({ heading, index: text.indexOf(heading) }));
  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i];
    expect(current.index, `exportación debe incluir ${current.heading}`).toBeGreaterThanOrEqual(0);
    const nextIndex = positions.slice(i + 1).find((item) => item.index > current.index)?.index ?? text.length;
    const sectionBody = text.slice(current.index + current.heading.length, nextIndex).trim();
    expect(sectionBody, `la sección ${current.heading} debe tener texto`).not.toBe('');
  }
}

async function mockUploadAnalysis(page: Page, sourceKind: 'DEMANDA_CIVIL' | 'SENTENCIA_CIVIL' = 'DEMANDA_CIVIL') {
  const sourceText = sourceKind === 'DEMANDA_CIVIL'
    ? 'DEMANDA CIVIL SINTÉTICA. La parte actora solicita el cumplimiento de un contrato. Hecho primero: existe una relación contractual que deberá verificarse en autos.'
    : 'SENTENCIA CIVIL SINTÉTICA. Se resuelve la controversia en el expediente de prueba.';
  const result = {
    ok: true,
    sourceFileName: 'demanda-sintetica.txt',
    mimeType: 'text/plain',
    extractedText: sourceText,
    needsOcr: false,
    sourceValidated: true,
    sourceQualityStatus: 'READY',
    sourceValidationMethod: 'native_text',
    qualityScore: { confidence: 100, qualityLabel: 'Alta', pageCount: 1, textLength: sourceText.length, avgCharsPerPage: sourceText.length, status: 'READY', ocrUsed: false, emptyPages: 0 },
    sourceQuality: { pageCount: 1, characterCount: sourceText.length, charactersPerPage: sourceText.length, emptyPageRatio: 0, extractionMethod: 'native_text', ocrUsed: false, confidence: 100 },
    pages: [{ page: 1, text: sourceText, chars: sourceText.length }],
    classification: {
      es_juridico: true,
      tipo_documento: sourceKind === 'DEMANDA_CIVIL' ? 'Demanda' : 'Sentencia',
      sourceDocumentType: sourceKind,
      materia: 'Civil',
      confianza: 100,
      razon: 'Clasificación simulada para E2E',
      secciones_detectadas: [],
    },
    analysis: { facts: [{ id: 'synthetic-fact-1', number: 1, text: 'La fuente sintética refiere una relación contractual que requiere cotejo.', page: 1, confidence: 1 }], claims: ['Cumplimiento contractual'], evidence: [], risks: [], missingData: ['Verificar documentos de la relación contractual'] },
    templateAnalysis: {},
    generationEligibility: 'eligible',
    structureJson: null,
    warnings: [],
    pipelineStatus: 'READY',
    lifecycle: { entityKind: 'SOURCE_DOCUMENT', originClass: 'user', creationIntent: 'SOURCE_DOCUMENT' },
    analysisMetrics: { documentAnalysisDurationMs: 1, nativeExtractionDurationMs: 1, ocrPreparationDurationMs: 0, ocrDurationMs: 0, ocrPages: 0, totalPages: 1, cacheHit: false, extractionStatus: 'READY', concurrency: 1 },
  };
  await page.route('**/api/templates/analyze-upload', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, analysisJobId: 'e2e-upload-job', status: 'processing', cacheHit: false }) });
  });
  await page.route('**/api/templates/analyze-upload/status?jobId=e2e-upload-job', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, analysisJobId: 'e2e-upload-job', status: 'completed', percentage: 100, result }) });
  });
}

async function mockGenerationApi(page: Page, documentType: string) {
  let generationCalls = 0;
  const generatedDocument = makeDraftDocument(documentType, `Borrador E2E ${documentType}`);
  await page.route('**/api/legal-engine/generate', async (route) => {
    generationCalls += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(JSON.stringify(body)).toContain(documentType);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-ui-generation', total: 5, completed: 0, percentage: 0, stage: 'Generación simulada' }) });
  });
  await page.route('**/api/legal-engine/generate/status?jobId=e2e-ui-generation', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      ok: true,
      jobId: 'e2e-ui-generation',
      status: 'completed',
      terminalStatus: 'NEEDS_REVIEW',
      total: 5,
      completed: 5,
      percentage: 100,
      stage: 'Borrador disponible para revisión',
      documentReadiness: 'REQUIRES_REVIEW',
      document: generatedDocument,
    }) });
  });
  return () => generationCalls;
}

async function acceptExternalProviderNotice(page: Page) {
  void acceptExternalConsentOnce(page);
}

const INITIAL_FORM = {
  promovente: 'PERSONA SINTÉTICA ACTORA',
  demandado: 'EMPRESA FICTICIA DEMANDADA, S.A. DE C.V.',
  hechos: 'El contrato sintético se celebró y la demandada no cumplió la obligación pactada.',
  pretension: 'El cumplimiento del contrato sintético y el pago de la prestación reclamada.',
  pruebas: 'Contrato sintético y constancias de pago sintéticas.',
  instrucciones: 'Usar exclusivamente los hechos y documentos aportados; señalar los datos pendientes.',
};

/** Recorre los seis pasos del formulario de Escritos Iniciales con datos sintéticos y se queda en el paso 6. */
async function fillInitialWritingForm(page: Page) {
  const next = () => page.getByRole('button', { name: /Siguiente/ }).click();
  await next();
  await page.getByPlaceholder('Nombre completo o razón social').fill(INITIAL_FORM.promovente);
  await page.getByPlaceholder('Nombre o autoridad señalada').fill(INITIAL_FORM.demandado);
  await next();
  await page.getByPlaceholder(/Relata cronológicamente/).fill(INITIAL_FORM.hechos);
  await next();
  await page.getByPlaceholder(/Indica qué solicitas/).fill(INITIAL_FORM.pretension);
  await next();
  await page.getByPlaceholder(/Describe las pruebas/).fill(INITIAL_FORM.pruebas);
  await next();
  await page.getByPlaceholder(/Énfasis en suplencia de la queja/).fill(INITIAL_FORM.instrucciones);
}

/**
 * «Confirma los datos del caso»: la ficha es un paso obligatorio de Contestaciones (nada se infiere). La fuente
 * sintética no trae órgano, lugar, expediente ni partes, así que la parte que se representa y los datos de la
 * ficha se capturan aquí con valores sintéticos, igual que lo haría el abogado.
 */
async function confirmCaseDossier(page: Page) {
  const dialog = page.getByTestId('requirements-dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const panel = dialog.getByTestId('case-dossier-panel');
  await panel.getByLabel('Parte que representas').selectOption('__otra__');
  await panel.getByLabel('Nombre de la parte representada').fill('EMPRESA FICTICIA DEMANDADA, S.A. DE C.V.');
  await panel.getByLabel('Órgano jurisdiccional').fill('JUZGADO PRIMERO DE LO CIVIL SINTÉTICO');
  await panel.getByLabel('Lugar de presentación').fill('Zapopan, Jalisco');
  await panel.getByLabel('Número de expediente de la ficha').fill('0001/2026');
  await panel.getByLabel('Confirmar ficha del caso').check();
  await expect(panel.getByLabel('Confirmar ficha del caso')).toBeChecked();
  // El diálogo se cierra solo al confirmar; si sigue abierto, se cierra como lo haría el abogado.
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('case-dossier-summary')).toContainText('Confirmada');
}

async function exportAndValidateDraft(page: Page, prefix: string) {
  await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('PROEMIO', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('HECHOS', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('PETITORIOS', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/\[PENDIENTE:/).first()).toBeVisible();

  await mkdir(evidenceDirectory, { recursive: true });
  const toolbar = page.locator('button[title="Elegir exportación de borrador o final"]');
  await expect(toolbar).toBeVisible();

  await toolbar.click();
  const docxDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /DOCX borrador$/ }).click();
  const docxDownload = await docxDownloadPromise;
  expect(docxDownload.suggestedFilename().toLowerCase()).toMatch(/\.docx$/);
  const docxPath = path.join(evidenceDirectory, `${prefix}-draft.docx`);
  await docxDownload.saveAs(docxPath);
  const docxStats = await stat(docxPath);
  expect(docxStats.size).toBeGreaterThan(0);
  const docxText = (await mammoth.extractRawText({ buffer: await readFile(docxPath) })).value;
  expect(docxText.trim().length).toBeGreaterThan(100);
  // El aviso de borrador va en el encabezado del DOCX (mammoth solo extrae el cuerpo).
  const docxPackage = await readDocxPackage(await readFile(docxPath));
  const headerXml = (await Promise.all(docxPackage.entryNames.filter((name) => /^word\/header\d*\.xml$/.test(name)).map((name) => docxPackage.readText(name)))).join(' ');
  expect(headerXml).toContain('BORRADOR');
  expect(docxText).toContain('PROEMIO');
  expect(docxText).toContain('EXCEPCIONES Y DEFENSAS');
  expect(docxText).toContain('[PENDIENTE:');
  assertNoEmptySections(docxText);

  await toolbar.click();
  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /PDF borrador$/ }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename().toLowerCase()).toMatch(/\.pdf$/);
  const pdfPath = path.join(evidenceDirectory, `${prefix}-draft.pdf`);
  await pdfDownload.saveAs(pdfPath);
  const pdfBytes = await readFile(pdfPath);
  expect(pdfBytes.length).toBeGreaterThan(500);
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
  const parser = new PDFParse({ data: pdfBytes });
  try {
    const parsedPdf = await parser.getText();
    const pdfText = parsedPdf.text;
    expect(pdfText.trim().length).toBeGreaterThan(100);
    expect(pdfText).toContain('BORRADOR');
    expect(pdfText).toContain('PROEMIO');
    expect(pdfText).toContain('[PENDIENTE:');
    assertNoEmptySections(pdfText);
  } finally {
    await parser.destroy();
  }

  return { docxBytes: docxStats.size, pdfBytes: pdfBytes.length, docxPath, pdfPath };
}

test.describe('E2E-10 borrador y exportaciones reales con generación simulada', () => {
  test('Contestaciones: sube demanda, analiza, genera borrador en editor y descarga DOCX/PDF', async ({ page }) => {
    await mockUploadAnalysis(page);
    const generationCalls = await mockGenerationApi(page, 'contestacion_demanda_civil');
    await page.goto('/machotes?tab=responses_resources');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'demanda-sintetica.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('DEMANDA CIVIL SINTÉTICA PARA PRUEBA LOCAL. Sin datos personales.'),
    });
    await expect(page.getByText('demanda-sintetica.txt').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/DEMANDA CIVIL SINTÉTICA/).first()).toBeVisible({ timeout: 10_000 });
    await confirmCaseDossier(page);
    await page.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }).check();
    const documentTypeSelect = page.getByLabel('Tipo de escrito');
    await expect(documentTypeSelect.locator('option[value="contestacion_demanda_civil"]')).toHaveCount(1);
    await documentTypeSelect.selectOption('contestacion_demanda_civil');
    // contestacion_demanda_civil ya tiene evidencia técnica (PASS), así que no es un «tipo en desarrollo» y no lleva el
    // aviso de borrador asistido; su FINAL sigue bloqueado por la revisión jurídica pendiente (se comprueba al exportar).
    await expect(page.getByRole('status').filter({ hasText: 'Borrador asistido: revisión obligatoria' })).toHaveCount(0);
    const generate = page.getByRole('button', { name: 'Generar contestación', exact: false });
    await expect(generate).toBeEnabled();
    await acceptExternalProviderNotice(page);
    await generate.click();
    const downloads = await exportAndValidateDraft(page, 'contestaciones');
    expect(generationCalls()).toBe(1);
    await expect(page.getByRole('button', { name: /DOCX final|PDF final/ })).toHaveCount(0);
    expect(downloads.docxBytes).toBeGreaterThan(0);
    expect(downloads.pdfBytes).toBeGreaterThan(500);
  });

  test('Escritos Iniciales: genera por el formulario guiado y exporta el borrador', async ({ page }) => {
    const generationCalls = await mockGenerationApi(page, 'demanda_ordinaria_civil');
    await page.goto('/machotes?tab=initial_writings');
    await page.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }).check();
    await page.getByLabel('Materia').selectOption('civil');
    await page.getByLabel('Tipo de Escrito').selectOption('demanda_ordinaria_civil');
    // Las pretensiones son un dato jurídico obligatorio: sin ellas la generación se bloquea (ver la prueba de validación).
    await fillInitialWritingForm(page);
    await acceptExternalProviderNotice(page);
    const requestPromise = page.waitForRequest('**/api/legal-engine/generate');
    await page.getByRole('button', { name: 'Generar Escrito Inicial' }).click();
    // Lo capturado en el formulario viaja en la petición de generación.
    const sent = (await requestPromise).postDataJSON() as { userInstruction: string; caseParties?: Array<{ role: string; name: string }> };
    expect(sent.userInstruction).toContain('Objetivo y pretensiones: El cumplimiento del contrato sintético');
    expect(sent.caseParties?.map((party) => party.role)).toEqual(['actor', 'demandado']);
    const downloads = await exportAndValidateDraft(page, 'escritos-iniciales');
    expect(generationCalls()).toBe(1);
    expect(downloads.docxBytes).toBeGreaterThan(0);
    expect(downloads.pdfBytes).toBeGreaterThan(500);
  });

  test('Escritos Iniciales: sin pretensión no genera, avisa y conserva lo escrito', async ({ page }) => {
    const generationCalls = await mockGenerationApi(page, 'demanda_ordinaria_civil');
    await page.goto('/machotes?tab=initial_writings');
    await page.getByLabel('Materia').selectOption('civil');
    await page.getByLabel('Tipo de Escrito').selectOption('demanda_ordinaria_civil');
    const next = () => page.getByRole('button', { name: /Siguiente/ }).click();
    await next();
    await page.getByPlaceholder('Nombre completo o razón social').fill('PERSONA SINTÉTICA ACTORA');
    await next();
    await page.getByPlaceholder(/Relata cronológicamente/).fill('Hecho sintético que no debe perderse.');
    for (let step = 3; step < 6; step += 1) await next();
    const instructions = 'Instrucción sintética que no debe perderse.';
    await page.getByPlaceholder(/Énfasis en suplencia de la queja/).fill(instructions);
    await acceptExternalProviderNotice(page);
    await page.getByRole('button', { name: 'Generar Escrito Inicial' }).click();
    await expect(page.getByText(/Faltan datos esenciales para generar: .*objetivo o pretensión/)).toBeVisible();
    expect(generationCalls()).toBe(0);
    // El botón se rehabilita y nada de lo capturado se pierde.
    await expect(page.getByRole('button', { name: 'Generar Escrito Inicial' })).toBeEnabled();
    await expect(page.getByPlaceholder(/Énfasis en suplencia de la queja/)).toHaveValue(instructions);
    await page.getByRole('button', { name: /Anterior/ }).click();
    await page.getByRole('button', { name: /Anterior/ }).click();
    await page.getByRole('button', { name: /Anterior/ }).click();
    await expect(page.getByPlaceholder(/Relata cronológicamente/)).toHaveValue('Hecho sintético que no debe perderse.');
  });

  test('Escritos Iniciales: un error del servicio de generación se informa y conserva lo capturado', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/legal-engine/generate', async (route) => {
      calls += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'GENERATION_FAILED', error: 'Fallo sintético del servicio de generación.' }) });
    });
    await page.goto('/machotes?tab=initial_writings');
    await page.getByLabel('Materia').selectOption('civil');
    await page.getByLabel('Tipo de Escrito').selectOption('demanda_ordinaria_civil');
    await fillInitialWritingForm(page);
    await acceptExternalProviderNotice(page);
    await page.getByRole('button', { name: 'Generar Escrito Inicial' }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(page.getByText(/no se pudo|error|falló|fallo/i).first()).toBeVisible();
    // Sin estado de carga colgado y sin pérdida de datos: el abogado puede reintentar.
    await expect(page.getByRole('button', { name: 'Generar Escrito Inicial' })).toBeEnabled();
    await expect(page.getByPlaceholder(/Énfasis en suplencia de la queja/)).toHaveValue(INITIAL_FORM.instrucciones);
    await page.getByRole('button', { name: /Anterior/ }).click();
    await page.getByRole('button', { name: /Anterior/ }).click();
    await expect(page.getByPlaceholder(/Indica qué solicitas/)).toHaveValue(INITIAL_FORM.pretension);
  });

  test('Escritos Iniciales con el motor local (sin interceptar la generación): edita un bloque y exporta el borrador con la edición', async ({ page }) => {
    await page.goto('/machotes?tab=initial_writings');
    await page.getByLabel('Materia').selectOption('civil');
    await page.getByLabel('Tipo de Escrito').selectOption('demanda_ordinaria_civil');
    await fillInitialWritingForm(page);
    await page.getByRole('button', { name: 'Generar Escrito Inicial' }).click();
    // Solo se continúa si el servidor aislado no tiene proveedores externos: la prueba nunca autoriza un envío.
    const consent = page.getByTestId('external-provider-consent');
    await expect(consent).toBeVisible();
    await expect(consent.getByTestId('external-consent-no-remote')).toBeVisible();
    await consent.getByRole('button', { name: 'Continuar sin enviar' }).click();
    const toolbar = page.locator('button[title="Elegir exportación de borrador o final"]');
    await expect(toolbar).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i).first()).toBeVisible();
    await expect(page.getByText(/PERSONA SINTÉTICA ACTORA/).first()).toBeVisible();

    // Revisar y editar: se desbloquea la edición, se edita un bloque y se guarda el cambio.
    await page.getByRole('button', { name: /Editar contestación/ }).click();
    const block = page.locator('div.group\\/block').filter({ hasText: /Comparece PERSONA SINTÉTICA ACTORA/ }).first();
    await block.hover();
    await block.getByTitle('Editar texto directamente').click();
    const edited = 'EDICION SINTETICA DEL ABOGADO: comparece la parte actora por su propio derecho.';
    const editor = page.locator('[data-block-editor]');
    await editor.locator('textarea').fill(edited);
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(edited).first()).toBeVisible();

    // El borrador exportado conserva la edición; FINAL sigue bloqueado y la interfaz lo explica.
    await toolbar.click();
    await expect(page.getByText(/Exportación FINAL no disponible/)).toBeVisible();
    await expect(page.getByRole('button', { name: /DOCX final|PDF final/ })).toHaveCount(0);
    const docxPromise = page.waitForEvent('download');
    const exportRequestPromise = page.waitForRequest('**/api/legal-engine/export/docx');
    await page.getByRole('button', { name: /DOCX borrador$/ }).click();
    const exportRequest = await exportRequestPromise;
    const docxPath = path.join(evidenceDirectory, 'escritos-iniciales-local-draft.docx');
    await mkdir(evidenceDirectory, { recursive: true });
    await (await docxPromise).saveAs(docxPath);
    const docxText = (await mammoth.extractRawText({ buffer: await readFile(docxPath) })).value;
    expect(docxText).toContain(edited);
    const headerXml = await (await readDocxPackage(await readFile(docxPath))).readText('word/header1.xml');
    expect(headerXml).toContain('BORRADOR');

    // FINAL contra el servidor real: el mismo documento (guardado o no) no se exporta sin la aprobación jurídica del
    // catálogo, aunque el cliente afirme lo contrario. La decisión no depende de ningún dato enviado por el cliente.
    const { document } = exportRequest.postDataJSON() as { document: Record<string, unknown> };
    const unsaved = exportRequest.headers()['x-unsaved-draft-export'] === 'true';
    for (const route of ['docx', 'pdf']) {
      for (const forged of [{}, { humanReview: 'APPROVED', approved: true, allowReviewOverride: true }]) {
        const response = await page.request.post(`/api/legal-engine/export/${route}`, {
          data: { document: { ...document, humanReview: 'APPROVED' }, exportMode: 'FINAL', ...forged },
          headers: unsaved ? { 'x-unsaved-draft-export': 'true' } : {},
        });
        expect(response.status(), `${route} FINAL`).toBeGreaterThanOrEqual(400);
        expect(response.headers()['content-type'] ?? '', `${route} FINAL`).not.toMatch(/wordprocessingml|application\/pdf/);
        // Guardado: 422 por el guard documental (campos pendientes) o por la aprobación jurídica pendiente; nunca 200.
        if (!unsaved) expect(response.status(), `${route} FINAL guardado`).toBe(422);
      }
    }
  });

  test('Universal: genera por Redacción Jurídica y exporta el borrador', async ({ page }) => {
    const generationCalls = await mockGenerationApi(page, 'demanda');
    await page.goto('/machotes?tab=universal');
    await page.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }).check();
    await page.getByPlaceholder(/Elabora una demanda de amparo directo/).fill('Redacta una demanda ordinaria civil. Objetivo: obtener el cumplimiento de un contrato sintético. Identifica de forma expresa toda información faltante.');
    // Universal ofrece el tipo genérico «Demanda»; la demanda ordinaria civil específica se elige en Escritos Iniciales.
    await page.getByLabel('Materia', { exact: true }).selectOption('civil');
    await page.getByLabel('Tipo de escrito', { exact: true }).selectOption('demanda');
    await acceptExternalProviderNotice(page);
    await page.getByRole('button', { name: 'Ejecutar análisis' }).click();
    const downloads = await exportAndValidateDraft(page, 'universal');
    expect(generationCalls()).toBe(1);
    expect(downloads.docxBytes).toBeGreaterThan(0);
    expect(downloads.pdfBytes).toBeGreaterThan(500);
  });
});
