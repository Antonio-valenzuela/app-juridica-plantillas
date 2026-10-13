# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase3Flow.spec.ts >> a. carga y navegación del PDF largo >> 44 páginas, navegación y vistas
- Location: tests\browser\phase3Flow.spec.ts:83:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/44 páginas ·/)
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/44 páginas ·/) with timeout 30000ms
  - waiting for getByText(/44 páginas ·/)

```

```yaml
- banner:
  - button "Ocultar menú de navegación" [expanded]
  - text: Generación no disponible
  - strong: Sin expediente seleccionado
  - text: Sin órgano jurisdiccional
  - link "Abrir alertas DOF y Boletín":
    - /url: /machotes?tab=alertas
  - text: YN
  - strong: Yahir
  - text: Abogado
- complementary:
  - strong: LEXPLANTILLAS
  - text: SISTEMA JURÍDICO MEXICANO
  - navigation "Navegación principal":
    - link "Inicio":
      - /url: /machotes?tab=inicio
    - link "Motor Jurídico":
      - /url: /machotes?tab=universal
    - link "Escritos Iniciales":
      - /url: /machotes?tab=initial_writings
    - link "Contestaciones":
      - /url: /machotes?tab=responses_resources
    - link "Mis Plantillas":
      - /url: /machotes?tab=my-templates
    - link "Expedientes":
      - /url: /machotes?tab=expedientes
    - link "Cómputo de Términos":
      - /url: /machotes?tab=terminos
    - link "Jurisprudencia SCJN":
      - /url: /machotes?tab=jurisprudencia
    - link "Biblioteca":
      - /url: /machotes?tab=biblioteca
    - link "Alertas DOF y Boletín":
      - /url: /machotes?tab=alertas
  - link "Configuración":
    - /url: /machotes?tab=configuracion
  - link "Ayuda":
    - /url: /machotes?tab=ayuda
  - strong: Firma Electrónica
  - text: Estado no disponible Configura el certificado en el despacho
- heading "Contestaciones y recursos" [level=1]
- paragraph: Analiza el documento oficial y genera el escrito jurídico para revisión profesional.
- button "Asistente legal"
- button "Ocultar panel de datos" [expanded]
- list "Progreso":
  - listitem: 1 Documento fuente Carga el documento
  - listitem: 2 Análisis Pendiente
  - listitem: 3 Generación Pendiente
- main "Documento fuente":
  - img
  - heading "Arrastra o selecciona el documento base" [level=3]
  - paragraph: Sube una demanda, acuerdo, notificación o escrito inicial en PDF o DOCX para iniciar el análisis jurídico automático.
  - button "Subir documento →"
- complementary "Inspector del expediente":
  - heading "Configuración de la contestación" [level=2]
  - text: Tipo de escrito *
  - combobox "Tipo de escrito":
    - option "Contestación de Demanda Civil" [selected]
    - option "Contestación de Demanda Laboral"
    - option "Contestación de Demanda Mercantil"
    - option "Apelación Civil"
    - option "Apelación Mercantil"
    - option "Apelación Familiar"
    - option "Demanda de Amparo Directo"
    - option "Demanda de Amparo Indirecto"
    - option "Recurso de Revisión en Amparo Directo"
    - option "Recurso de Revisión en Amparo"
    - option "Recurso de Queja en Amparo"
    - option "Recurso de Reclamación"
    - option "Incidente Procesal / de Nulidad"
    - option "Redacción Libre — Escribir directamente lo que quiero"
  - checkbox "En desarrollo (sin certificar)"
  - text: En desarrollo (sin certificar)
  - group "Cómo redactar":
    - text: Cómo redactar
    - radiogroup "Cómo redactar":
      - radio "Automáticamente" [checked]
      - text: Automáticamente
      - radio "Con mi plantilla"
      - text: Con mi plantilla
  - paragraph: Extensión del escrito
  - radiogroup "Extensión del escrito":
    - radio "Breve, ≈ 5 páginas"
    - radio "Intermedio, ≈ 10 páginas"
    - radio "Detallado, ≈ 20 páginas" [checked]
    - radio "Extenso, ≈ 40 páginas"
    - radio "Personalizado, número de páginas a elección"
  - paragraph: La extensión es una meta aproximada; dependerá de la complejidad, los hechos disponibles, la evidencia y las reglas aplicables. El sistema no añadirá contenido para llenar páginas.
  - group: Más opciones ≈ 20 pp. ▾
  - region "Preparación y generación":
    - list:
      - listitem: Documento fuente cargado y legible
      - listitem: Resumen del expediente completado
      - listitem: Análisis de la demanda revisado
      - listitem: Configuración de la contestación definida
    - status:
      - strong: "Antes de generar:"
      - text: Carga un documento fuente para habilitar la generación.
    - button "Revisar datos para continuar"
    - button "Generar contestación" [disabled]
  - region "Sin documento":
    - heading "Sin documento cargado" [level=2]
    - paragraph: Carga la demanda o resolución en PDF o DOCX. Aquí verás el expediente, las partes, el órgano y lo que requiere revisión.
```

# Test source

```ts
  1   | import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
  2   | import { appealPdf, autoFamiliarPdf } from '../helpers/syntheticPdf';
  3   | 
  4   | /**
  5   |  * Fase 3 · Parte 2 — flujo de «Contestaciones y recursos» validado en el navegador.
  6   |  *
  7   |  * Contra un servidor AISLADO (copia del árbol, sin claves de proveedores, base SQLite temporal).
  8   |  * Red externa bloqueada; la generación se SIMULA con respuestas deterministas (nunca un proveedor real).
  9   |  * Guardado, reapertura y exportación usan las rutas reales del servidor local.
  10  |  * Capturas sintéticas en audit/fase3-capturas/.
  11  |  */
  12  | const SHOTS = 'audit/fase3-capturas';
  13  | const TECHNICAL_NOISE = [/pending-upload/i, /Resoluciones detectadas/, /Conflicto OCR/i, /resoluciones encontradas/i, /Detectada automáticamente/, /NEEDS_USER_INPUT/, /SOURCE_DOCUMENT/, /CONFIRMED\b/, /\{\s*"/, /\bundefined\b/, /\[object Object\]/, /e2e-/i];
  14  | const HELP = 'La extensión es una meta aproximada; dependerá de la complejidad, los hechos disponibles, la evidencia y las reglas aplicables. El sistema no añadirá contenido para llenar páginas.';
  15  | 
  16  | function draftDocument(extra: Record<string, unknown> = {}) {
  17  |   return {
  18  |     id: 'e2e-doc-fase3', title: 'Apelación para revisión', documentType: 'apelacion_familiar', documentTypeLabel: 'Apelación Familiar',
  19  |     matter: 'familiar', jurisdiction: 'local', category: 'familiar', legalBasis: [], parties: {}, caseRefs: { expediente: '1234/2025' }, variables: {},
  20  |     status: 'draft', sourceDocuments: [], classification: {}, validation: { isValid: true, errors: [], warnings: [] },
  21  |     sections: [
  22  |       { id: 's1', type: 'argument', title: 'AGRAVIOS', order: 1, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', text: 'Primer agravio: la resolución recurrida carece de fundamentación suficiente.', generationStatus: 'generated' }] },
  23  |       { id: 's2', type: 'petition', title: 'PUNTOS PETITORIOS', order: 2, isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], content: [{ id: 'b2', layer: 'GENERATED_ARGUMENT', text: 'PRIMERO. Tener por interpuesto el recurso.', generationStatus: 'generated' }] },
  24  |     ],
  25  |     generationMetadata: {
  26  |       readiness: 'READY', qualityGate: true, validation: true, aiProvider: 'simulado',
  27  |       pageTargetResult: { requestedPages: 20, preset: 'DETALLADO', actualPages: 3, outcome: 'BELOW_TARGET', notice: 'No se alcanzó la extensión solicitada (20 páginas; resultado: 3): la información disponible no sostiene más contenido sin redundancia. No se añadió texto de relleno.', measuredWith: 'PDF_RENDERER' },
  28  |     },
  29  |     createdAt: '2026-10-12T12:00:00.000Z', updatedAt: '2026-10-12T12:00:00.000Z', ...extra,
  30  |   };
  31  | }
  32  | 
  33  | async function isolate(context: BrowserContext) {
  34  |   // Red externa bloqueada: solo el servidor local responde.
  35  |   await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  36  | }
  37  | 
  38  | type GenerationMode = 'ok' | 'fail' | 'slow';
  39  | async function mockGeneration(page: Page, mode: GenerationMode = 'ok') {
  40  |   const sent: Array<Record<string, any>> = [];
  41  |   let polls = 0;
  42  |   await page.route('**/api/legal-engine/generate', async (route) => {
  43  |     const request: Request = route.request();
  44  |     if (request.method() !== 'POST') return route.continue();
  45  |     sent.push(JSON.parse(request.postData() || '{}'));
  46  |     if (mode === 'fail') {
  47  |       return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE', message: 'Servicio de redacción no disponible (prueba simulada).' }) });
  48  |     }
  49  |     return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', total: 4, completed: 0, percentage: 0, stage: 'Preparando el borrador…' }) });
  50  |   });
  51  |   await page.route('**/api/legal-engine/generate/status?jobId=e2e-job-f3', async (route) => {
  52  |     polls += 1;
  53  |     if (mode === 'slow' && polls <= 3) {
  54  |       return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', status: 'processing', total: 4, completed: 1, percentage: 35, currentBlock: 'AGRAVIOS', stage: 'Redactando agravios…' }) });
  55  |     }
  56  |     return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f3', status: 'completed', terminalStatus: 'COMPLETED', total: 4, completed: 4, percentage: 100, currentBlock: null, stage: 'Completado', documentReadiness: 'READY', document: draftDocument() }) });
  57  |   });
  58  |   return sent;
  59  | }
  60  | 
  61  | /** Abre la pestaña y espera a que React la haya hidratado: sin esto, el archivo se asigna antes de que exista el manejador. */
  62  | async function gotoResponses(page: Page) {
  63  |   await page.goto('/machotes?tab=responses_resources');
  64  |   await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
  65  |   await expect(page.getByTestId('page-target-selector')).toBeVisible();
  66  |   await page.waitForLoadState('networkidle');
  67  |   await page.waitForTimeout(1500);
  68  | }
  69  | 
  70  | async function openWithPdf(page: Page, buffer: Buffer = autoFamiliarPdf(44), name = 'auto-familiar-44.pdf') {
  71  |   await page.setViewportSize({ width: 1440, height: 900 });
  72  |   await gotoResponses(page);
  73  |   await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer });
> 74  |   await expect(page.getByText(/44 páginas ·/)).toBeVisible({ timeout: 30_000 });
      |                                                ^ Error: expect(locator).toBeVisible() failed
  75  |   await expect(page.getByTestId('page-target-selector')).toBeVisible({ timeout: 30_000 });
  76  | }
  77  | 
  78  | const docTypeSelect = (page: Page) => page.getByRole('combobox').filter({ has: page.locator('option[value="apelacion_civil"]') });
  79  | const pageTargetLabel = (page: Page, text: string) => page.getByTestId('page-target-selector').locator('label', { hasText: text });
  80  | const generateButton = (page: Page) => page.getByRole('button', { name: /^Generar |Revisar datos para continuar/ });
  81  | 
  82  | test.describe('a. carga y navegación del PDF largo', () => {
  83  |   test('44 páginas, navegación y vistas', async ({ page, context }) => {
  84  |     await isolate(context);
  85  |     await openWithPdf(page);
  86  |     await expect(page.getByText('Página 1 de 44')).toBeVisible();
  87  |     await page.getByRole('button', { name: '→' }).first().click();
  88  |     await expect(page.getByText('Página 2 de 44')).toBeVisible();
  89  |     await page.getByRole('button', { name: '←' }).first().click();
  90  |     await expect(page.getByText('Página 1 de 44')).toBeVisible();
  91  |     await page.getByRole('button', { name: 'Texto extraído' }).click();
  92  |     await expect(page.getByText(/SE DESECHA el incidente/).first()).toBeVisible();
  93  |     await page.getByRole('button', { name: 'Vista original' }).click();
  94  |     await page.screenshot({ path: `${SHOTS}/01-pdf-largo-44-paginas.png` });
  95  |   });
  96  | });
  97  | 
  98  | test.describe('b. actuación elegida y mensaje de compatibilidad (caso del auto familiar)', () => {
  99  |   test('Apelación Civil sobre un auto familiar se acepta con aviso de materia; contestar sin demanda se bloquea con mensaje propio', async ({ page, context }) => {
  100 |     await isolate(context);
  101 |     await openWithPdf(page);
  102 |     const select = docTypeSelect(page);
  103 | 
  104 |     // El sistema sugiere la apelación familiar; elegir otra actuación no se revierte en silencio.
  105 |     await expect(select).toHaveValue('apelacion_familiar');
  106 |     await select.selectOption('apelacion_civil');
  107 |     await expect(select).toHaveValue('apelacion_civil');
  108 |     const advisory = page.getByTestId('compatibility-advisory').filter({ hasText: /materia familiar/i });
  109 |     await expect(advisory).toBeVisible();
  110 |     await expect(advisory).toContainText(/c[oó]digo procesal aplicable sea el civil/i);
  111 |     const body = await page.locator('body').innerText();
  112 |     expect(body).not.toMatch(/una contestaci[oó]n requiere la demanda/i);
  113 |     expect(body).not.toMatch(/SOURCE_DOCUMENT_INCOMPATIBLE/);
  114 |     await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
  115 |     await page.screenshot({ path: `${SHOTS}/02-apelacion-civil-aviso-materia.png` });
  116 | 
  117 |     // Contestar exige la demanda: mensaje concreto de esa actuación y Generar deshabilitado.
  118 |     await select.selectOption('contestacion_demanda_civil');
  119 |     await expect(select).toHaveValue('contestacion_demanda_civil');
  120 |     await expect(page.getByTestId('source-incompatible-notice')).toContainText(/resolución judicial, no una demanda/i);
  121 |     await expect(page.getByRole('button', { name: /Generar contestación|Revisar datos para continuar/ }).first()).toBeDisabled();
  122 |     await page.screenshot({ path: `${SHOTS}/03-contestacion-sin-demanda-bloqueada.png` });
  123 | 
  124 |     // Volver a la variante familiar: sin aviso de materia y de nuevo habilitado.
  125 |     await select.selectOption('apelacion_familiar');
  126 |     await expect(page.getByTestId('compatibility-advisory').filter({ hasText: /materia familiar/i })).toHaveCount(0);
  127 |     await expect(page.getByRole('button', { name: /Generar apelación/ })).toBeEnabled();
  128 |   });
  129 | });
  130 | 
  131 | test.describe('c. selector de extensión', () => {
  132 |   test('visible sin abrir «Más opciones», accesible por teclado y con ayuda', async ({ page, context }) => {
  133 |     await isolate(context);
  134 |     await openWithPdf(page);
  135 |     const selector = page.getByTestId('page-target-selector');
  136 |     await expect(selector).toBeVisible();
  137 |     await expect(page.locator('details.lex-disclosure[open]')).toHaveCount(0);
  138 |     await expect(selector).toContainText(HELP);
  139 |     await expect(page.getByRole('radiogroup', { name: 'Extensión del escrito' })).toBeVisible();
  140 |     await expect(page.getByRole('radio', { name: /Detallado/ })).toBeChecked();
  141 |     // Teclado: foco en la opción activa y flechas para cambiar.
  142 |     await page.getByRole('radio', { name: /Detallado/ }).focus();
  143 |     await page.keyboard.press('ArrowRight');
  144 |     await expect(page.getByRole('radio', { name: /Extenso/ })).toBeChecked();
  145 |     await page.keyboard.press('ArrowLeft');
  146 |     await expect(page.getByRole('radio', { name: /Detallado/ })).toBeChecked();
  147 |     await page.screenshot({ path: `${SHOTS}/04-selector-extension.png` });
  148 |   });
  149 | 
  150 |   test('personalizado validado, elección enviada al servidor y recordada tras recargar', async ({ page, context }) => {
  151 |     await isolate(context);
  152 |     const sent = await mockGeneration(page, 'ok');
  153 |     await openWithPdf(page);
  154 | 
  155 |     await pageTargetLabel(page, 'Personalizado').click();
  156 |     const custom = page.getByLabel('Páginas aproximadas');
  157 |     await expect(custom).toBeVisible();
  158 |     for (const invalid of ['1', '100', '2.5']) {
  159 |       await custom.fill(invalid);
  160 |       await expect(page.getByRole('alert').filter({ hasText: /entero de 2 a 60 páginas/ })).toBeVisible();
  161 |     }
  162 |     await page.screenshot({ path: `${SHOTS}/05-extension-personalizada-invalida.png` });
  163 |     await custom.fill('33');
  164 |     await expect(page.getByRole('alert').filter({ hasText: /entero de 2 a 60/ })).toHaveCount(0);
  165 | 
  166 |     // Recargar y volver a cargar el expediente: la elección se recuerda.
  167 |     await page.reload();
  168 |     await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
  169 |     await page.waitForLoadState('networkidle');
  170 |     await page.waitForTimeout(1500);
  171 |     await page.locator('input[type="file"]').first().setInputFiles({ name: 'auto-familiar-44.pdf', mimeType: 'application/pdf', buffer: autoFamiliarPdf(44) });
  172 |     await expect(page.getByTestId('page-target-selector')).toBeVisible({ timeout: 30_000 });
  173 |     await expect(page.getByRole('radio', { name: /Personalizado/ })).toBeChecked();
  174 |     await expect(page.getByLabel('Páginas aproximadas')).toHaveValue('33');
```