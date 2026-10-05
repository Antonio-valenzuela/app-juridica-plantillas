import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

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
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
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
  await page.getByRole('button', { name: 'DOCX borrador', exact: true }).click();
  const docxDownload = await docxDownloadPromise;
  expect(docxDownload.suggestedFilename().toLowerCase()).toMatch(/\.docx$/);
  const docxPath = path.join(evidenceDirectory, `${prefix}-draft.docx`);
  await docxDownload.saveAs(docxPath);
  const docxStats = await stat(docxPath);
  expect(docxStats.size).toBeGreaterThan(0);
  const docxText = (await mammoth.extractRawText({ buffer: await readFile(docxPath) })).value;
  expect(docxText.trim().length).toBeGreaterThan(100);
  expect(docxText).toContain('BORRADOR');
  expect(docxText).toContain('PROEMIO');
  expect(docxText).toContain('EXCEPCIONES Y DEFENSAS');
  expect(docxText).toContain('[PENDIENTE:');
  assertNoEmptySections(docxText);

  await toolbar.click();
  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF borrador', exact: true }).click();
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
    await page.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }).check();
    const documentTypeSelect = page.getByLabel('Tipo de escrito');
    await expect(documentTypeSelect.locator('option[value="contestacion_demanda_civil"]')).toHaveCount(1);
    await documentTypeSelect.selectOption('contestacion_demanda_civil');
    await expect(page.getByRole('status').filter({ hasText: 'Borrador asistido: revisión obligatoria' })).toBeVisible();
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
    for (let step = 1; step < 6; step += 1) await page.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByPlaceholder(/Énfasis en suplencia de la queja/).fill('Usar exclusivamente los hechos y documentos aportados; señalar los datos pendientes.');
    await acceptExternalProviderNotice(page);
    await page.getByRole('button', { name: 'Generar Escrito Inicial' }).click();
    const downloads = await exportAndValidateDraft(page, 'escritos-iniciales');
    expect(generationCalls()).toBe(1);
    expect(downloads.docxBytes).toBeGreaterThan(0);
    expect(downloads.pdfBytes).toBeGreaterThan(500);
  });

  test('Universal: genera por Redacción Jurídica y exporta el borrador', async ({ page }) => {
    const generationCalls = await mockGenerationApi(page, 'demanda_ordinaria_civil');
    await page.goto('/machotes?tab=universal');
    await page.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }).check();
    await page.getByPlaceholder(/Elabora recurso de apelación contra el Auto/).fill('Redacta una demanda ordinaria civil con la información disponible; identifica de forma expresa toda información faltante.');
    await page.getByLabel('Materia').selectOption('civil');
    await page.getByLabel('Tipo de escrito').selectOption('demanda_ordinaria_civil');
    await acceptExternalProviderNotice(page);
    await page.getByRole('button', { name: 'Ejecutar análisis' }).click();
    const downloads = await exportAndValidateDraft(page, 'universal');
    expect(generationCalls()).toBe(1);
    expect(downloads.docxBytes).toBeGreaterThan(0);
    expect(downloads.pdfBytes).toBeGreaterThan(500);
  });
});
