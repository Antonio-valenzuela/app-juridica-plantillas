import { expect, test, type Page, type Route } from '@playwright/test';

const analyticsFixture = {
  ok: true,
  rangeDays: 30,
  hasActivity: true,
  totals: {
    total: 3,
    documentsGenerated: 3,
    completed: 1,
    needsReview: 1,
    failed: 1,
    cancelled: 0,
    generatedPages: 69,
    averageGenerationMs: 2_400,
  },
  daily: [{ date: '2026-09-24', count: 3 }],
  statuses: [
    { status: 'COMPLETED', count: 1 },
    { status: 'NEEDS_REVIEW', count: 1 },
    { status: 'FAILED', count: 1 },
    { status: 'CANCELLED', count: 0 },
  ],
  byType: [{ label: 'Apelación Civil', count: 3 }],
  byMatter: [{ label: 'Civil', count: 3 }],
  extension: { achieved: 1, unmet: 1, targetPages: 40, actualPages: 27 },
  quality: { qualityGatePass: 1, qualityGateFail: 2, validationPass: 1, validationFail: 2, warnings: 2, errors: 1 },
  recent: [
    { status: 'NEEDS_REVIEW', documentType: 'Apelación Civil', matter: 'Civil', createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:00:00.000Z', actualPages: 27, targetPages: 40, extensionTargetUnmet: true, qualityGate: false, validation: false, warningCount: 2, errorCount: 0, sourcePages: 44, durationMs: 2_400 },
    { status: 'FAILED', documentType: 'Contestación', matter: 'Civil', createdAt: '2026-09-23T12:00:00.000Z', updatedAt: '2026-09-23T12:00:00.000Z', actualPages: null, targetPages: null, extensionTargetUnmet: false, qualityGate: null, validation: null, warningCount: 0, errorCount: 1, sourcePages: 0, durationMs: null },
  ],
  advanced: { ocrSuccessRate: 100, sourceReady: 2, sourceReview: 1, extractionFailures: 0, providerAttempts: 3, providerFallbacks: 1, timeoutCount: 0, httpErrors: 1, averageGenerationMs: 2_400, extensionAverageMs: 1_200, averageStageDurationsMs: { extraction: 700 } },
};

const documentFixture = {
  id: 'e2e-document',
  title: 'Borrador jurídico para revisión',
  documentType: 'demanda',
  documentTypeLabel: 'Demanda Civil',
  matter: 'civil',
  jurisdiction: 'local',
  category: 'civil',
  legalBasis: [],
  parties: {},
  caseRefs: { expediente: '12/2026' },
  variables: {},
  status: 'draft',
  sections: [{ id: 'section-1', type: 'header', title: 'Encabezado', order: 1, content: [{ id: 'block-1', text: 'Contenido para revisión.', generationStatus: 'generated' }], isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [] }],
  sourceDocuments: [],
  classification: {},
  validation: { isValid: true, errors: [], warnings: [] },
  generationMetadata: { readiness: 'READY', qualityGate: true, validation: true, aiProvider: 'test' },
  createdAt: '2026-09-24T12:00:00.000Z',
  updatedAt: '2026-09-24T12:00:00.000Z',
};

function makeGenerationStatus(readiness: string, terminalStatus = 'COMPLETED') {
  return { ok: true, jobId: 'e2e-job', status: 'completed', terminalStatus, total: 1, completed: 1, percentage: 100, currentBlock: null, stage: 'Completado', documentReadiness: readiness, document: { ...documentFixture, generationMetadata: { readiness, qualityGate: readiness === 'READY', validation: readiness === 'READY' } } };
}

async function mockAnalytics(page: Page) {
  await page.route('**/api/workspace/analytics*', async (route) => {
    const url = new URL(route.request().url());
    const rangeDays = Number(url.searchParams.get('rangeDays')) || 30;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...analyticsFixture, rangeDays, daily: [{ date: `2026-09-${String(rangeDays).padStart(2, '0')}`, count: 3 }] }) });
  });
}

async function mockGeneration(page: Page, outcome: { readiness: string; terminalStatus?: string } | { error: true }) {
  await page.route('**/api/legal-engine/generate', async (route) => {
    if ('error' in outcome) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'GENERATION_FAILED' }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job', total: 1, completed: 0, percentage: 0, stage: 'Preparando documento' }) });
  });
  await page.route('**/api/legal-engine/generate/status?jobId=e2e-job', async (route) => {
    if ('error' in outcome) return;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(makeGenerationStatus(outcome.readiness, outcome.terminalStatus)) });
  });
}

async function startUniversalGeneration(page: Page) {
  await page.goto('/machotes?tab=universal');
  await expect(page.getByRole('heading', { name: 'Redacción Jurídica' })).toBeVisible();
  await page.locator('textarea').first().fill('Redacta una demanda civil. Tipo: demanda. Materia: civil. Objetivo: obtener el cumplimiento del contrato. Expediente: 12/2026.');
  await page.getByRole('button', { name: 'Ejecutar análisis' }).click();
}

test.describe('E2E-01 navegación del espacio de trabajo', () => {
  test('abre los módulos principales sin errores de página', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const routes = [
      ['/machotes?tab=inicio', 'Inicio'],
      ['/machotes?tab=terminos', 'Cómputo de Términos'],
      ['/machotes?tab=configuracion', 'Configuración'],
      ['/machotes?tab=biblioteca', 'Biblioteca Jurídica'],
      ['/machotes?tab=my-templates', 'Mis Plantillas'],
    ] as const;
    for (const [url, heading] of routes) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
    expect(pageErrors).toEqual([]);
  });
});

test.describe('E2E-02 generación controlada', () => {
  test('inicia el job y llega al editor con documento completado', async ({ page }) => {
    await mockGeneration(page, { readiness: 'READY' });
    await startUniversalGeneration(page);
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('E2E-03 NEEDS_REVIEW', () => {
  test('conserva el documento como borrador revisable, no como fallo', async ({ page }) => {
    await mockGeneration(page, { readiness: 'REQUIRES_REVIEW', terminalStatus: 'NEEDS_REVIEW' });
    await startUniversalGeneration(page);
    await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/requiere revisión del abogado/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('E2E-04 error de backend', () => {
  test('muestra un error entendible y termina el estado de carga', async ({ page }) => {
    await mockGeneration(page, { error: true });
    await startUniversalGeneration(page);
    await expect(page.getByText(/Fallo al iniciar generación/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ejecutar análisis')).toBeVisible();
  });
});

test.describe('E2E-05 agenda automática', () => {
  test('abre el día, muestra prioridad y conserva atendido tras recarga', async ({ page }) => {
    const now = new Date();
    const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    await page.addInitScript(({ dueDate }) => {
      if (!window.localStorage.getItem('workspace-agenda:v1')) window.localStorage.setItem('workspace-agenda:v1', JSON.stringify([{ id: 'agenda-e2e', documentId: 'doc-e2e', dueDate, title: 'Término procesal', priority: 'HIGH', status: 'PENDING', needsReview: true, source: 'DOCUMENT', sourceText: 'Presentar el término el lunes.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
    }, { dueDate });
    await page.goto('/machotes?tab=terminos');
    await expect(page.getByRole('heading', { name: 'Agenda del expediente' })).toBeVisible();
    await page.getByRole('button', { name: `Seleccionar eventos del ${dueDate}` }).click();
    await expect(page.getByText('Término procesal')).toBeVisible();
    await expect(page.getByText('Revisar fecha derivada del documento.')).toBeVisible();
    await page.getByRole('button', { name: 'Marcar como atendido' }).click();
    await expect(page.getByRole('button', { name: 'Reabrir evento' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: `Seleccionar eventos del ${dueDate}` }).click();
    await expect(page.getByRole('button', { name: 'Reabrir evento' })).toBeVisible();
  });
});

test.describe('E2E-06 analíticas', () => {
  test('muestra KPIs reales, estados separados y cambia de periodo', async ({ page }) => {
    await mockAnalytics(page);
    await page.goto('/machotes?tab=configuracion');
    await expect(page.getByRole('heading', { name: 'Analíticas' })).toBeVisible();
    await expect(page.getByText('Documentos generados')).toBeVisible();
    await expect(page.getByText('Requiere revisión', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Fallido', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Objetivo de extensión no alcanzado')).toBeVisible();
    const rangeRequest = page.waitForRequest((request) => request.url().includes('/api/workspace/analytics?rangeDays=7'));
    await page.getByRole('button', { name: '7 días' }).click();
    await rangeRequest;
    await expect(page.getByText('7 días', { exact: true }).last()).toBeVisible();
  });
});

test.describe('E2E-07 importador local', () => {
  test('analiza, selecciona e incorpora sólo el archivo importable', async ({ page }) => {
    const record = { id: 'record-e2e', name: 'acuerdo.pdf', relativePath: 'acuerdo.pdf', sizeBytes: 1024, category: 'ACUERDO', matter: 'CIVIL', status: 'IMPORTABLE', imported: false, templateStatus: 'NO_ES_PLANTILLA' };
    await page.route('**/api/workspace/local-import', async (route: Route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items: [] }) });
        return;
      }
      const body = route.request().postDataJSON() as { action?: string };
      if (body.action === 'analyze') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, scanId: 'scan-e2e', source: { kind: 'ZIP', name: 'Datos.zip', limited: false }, summary: { analyzed: 1, importable: 1, duplicates: 0, excluded: 0, damaged: 0, review: 0, unclassified: 0, categoryCounts: { ACUERDO: 1 }, matterCounts: { CIVIL: 1 } }, records: [record] }) });
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, imported: [{ ...record, imported: true }], skipped: [] }) });
      }
    });
    await page.goto('/machotes?tab=biblioteca');
    await page.getByLabel('Ruta local de carpeta o ZIP').fill('C:\\Users\\yahir\\Desktop\\Datos.zip');
    await page.getByRole('button', { name: 'Analizar fuente local' }).click();
    await expect(page.getByText('Importables', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Seleccionar importables' }).click();
    await page.getByRole('button', { name: 'Importar seleccionados (1)' }).click();
    await expect(page.getByText(/1 documento\(s\) incorporado/)).toBeVisible();
  });
});
