# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase3ActuacionConsent.spec.ts >> Fase 8 · actuación propuesta y consentimiento por operación >> DOCX de un auto mercantil: no propone contestar; el abogado corrige a revocación y se envía esa actuación
- Location: tests\browser\phase3ActuacionConsent.spec.ts:123:7

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /^Generar recurso/ })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - button "Ocultar menú de navegación" [expanded] [ref=e3] [cursor=pointer]
    - generic [ref=e6]:
      - 'generic "No hay proveedores de IA en la nube configurados: el borrador se arma con reglas locales y marcará lo que requiere tu redacción." [ref=e7]': Solo redacción local
      - generic [ref=e10]:
        - strong [ref=e11]: EXP-777/2025
        - generic [ref=e12]: JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL
      - link "Abrir alertas DOF y Boletín" [ref=e13] [cursor=pointer]:
        - /url: /machotes?tab=alertas
      - generic [ref=e16]:
        - generic [ref=e17]: YN
        - generic [ref=e18]:
          - strong [ref=e19]: Yahir
          - generic [ref=e20]: Abogado
  - complementary [ref=e24]:
    - generic [ref=e29]:
      - strong [ref=e30]: LEXPLANTILLAS
      - generic [ref=e31]: SISTEMA JURÍDICO MEXICANO
    - navigation "Navegación principal" [ref=e32]:
      - link "Inicio" [ref=e33] [cursor=pointer]:
        - /url: /machotes?tab=inicio
      - link "Motor Jurídico" [ref=e38] [cursor=pointer]:
        - /url: /machotes?tab=universal
      - link "Escritos Iniciales" [ref=e43] [cursor=pointer]:
        - /url: /machotes?tab=initial_writings
      - link "Contestaciones" [ref=e49] [cursor=pointer]:
        - /url: /machotes?tab=responses_resources
      - link "Mis Plantillas" [ref=e54] [cursor=pointer]:
        - /url: /machotes?tab=my-templates
      - link "Expedientes" [ref=e59] [cursor=pointer]:
        - /url: /machotes?tab=expedientes
      - link "Cómputo de Términos" [ref=e64] [cursor=pointer]:
        - /url: /machotes?tab=terminos
      - link "Jurisprudencia SCJN" [ref=e70] [cursor=pointer]:
        - /url: /machotes?tab=jurisprudencia
      - link "Biblioteca" [ref=e76] [cursor=pointer]:
        - /url: /machotes?tab=biblioteca
      - link "Alertas DOF y Boletín" [ref=e81] [cursor=pointer]:
        - /url: /machotes?tab=alertas
    - generic [ref=e86]:
      - link "Configuración" [ref=e88] [cursor=pointer]:
        - /url: /machotes?tab=configuracion
      - link "Ayuda" [ref=e94] [cursor=pointer]:
        - /url: /machotes?tab=ayuda
      - generic [ref=e104]:
        - strong [ref=e105]: Firma Electrónica
        - generic [ref=e106]: Estado no disponible
        - generic [ref=e108]: Configura el certificado en el despacho
  - generic [ref=e116]:
    - generic [ref=e117]:
      - generic [ref=e118]:
        - heading "Contestaciones y recursos" [level=1] [ref=e119]
        - paragraph [ref=e120]: Analiza el documento oficial y genera el escrito jurídico para revisión profesional.
      - generic [ref=e121]:
        - button "Asistente legal" [ref=e122] [cursor=pointer]
        - button "Ocultar panel de datos" [expanded] [ref=e123] [cursor=pointer]
    - list "Progreso" [ref=e124]:
      - listitem [ref=e125]:
        - generic [ref=e126]: ✓
        - generic [ref=e127]:
          - generic [ref=e128]: Documento fuente
          - generic [ref=e129]: Cargado
      - listitem [ref=e130]:
        - generic [ref=e131]: ✓
        - generic [ref=e132]:
          - generic [ref=e133]: Análisis
          - generic [ref=e134]: Información extraída
      - listitem [ref=e135]:
        - generic [ref=e136]: "3"
        - generic [ref=e137]:
          - generic [ref=e138]: Generación
          - generic [ref=e139]: Elige la actuación y genera
    - generic [ref=e140]:
      - main "Documento fuente" [ref=e141]:
        - generic [ref=e142]:
          - generic [ref=e143]:
            - generic [ref=e144]:
              - generic [aria-hidden] [ref=e145]: DOC
              - generic [ref=e146]:
                - paragraph [ref=e147]: auto-mercantil-sintetico.docx
                - paragraph [ref=e148]: 1 página · 8.6 KB · Cargado el 13 oct 2026, 05:31 p.m.
            - generic [ref=e149]:
              - group "Vista del documento" [ref=e150]:
                - button "Vista original" [pressed] [ref=e151]
                - button "Texto extraído" [ref=e152]
              - button "Reemplazar documento" [ref=e153] [cursor=pointer]
          - generic [ref=e154]:
            - generic [ref=e155]:
              - group "Páginas" [ref=e156]:
                - button "Página anterior" [disabled] [ref=e157]: ←
                - generic [ref=e158]: Página 1 de 1
                - button "Página siguiente" [disabled] [ref=e159]: →
              - group [ref=e160]:
                - generic "Más acciones del documento" [ref=e161] [cursor=pointer]: Más acciones
            - generic [ref=e164]:
              - generic [ref=e165]:
                - paragraph [ref=e166]: Texto extraído - Página 1
                - generic [ref=e167]: 430 caracteres
              - generic [ref=e168]: "JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL EXPEDIENTE: 777/2025 Guadalajara, Jalisco, a diez de septiembre de dos mil veinticinco. Visto el incidente de nulidad de actuaciones promovido por la parte demandada en el juicio ejecutivo mercantil, con fundamento en las constancias de autos, SE DESECHA el incidente planteado por improcedente. NOTIFÍQUESE. Así lo resolvió y firma el Juez Tercero de lo Mercantil."
      - complementary "Inspector del expediente" [ref=e169]:
        - generic [ref=e170]:
          - generic [ref=e171]:
            - heading "Configuración del escrito" [level=2] [ref=e173]
            - generic [ref=e174]:
              - generic [ref=e175]:
                - generic [ref=e176]: Tipo de escrito *
                - combobox "Tipo de escrito" [ref=e177]:
                  - option "Contestación de Demanda Civil"
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
                  - option "Recurso de revocación (mercantil)" [selected]
                  - option "Promoción (cumplimiento de requerimiento o petición de trámite)"
                  - option "Redacción Libre — Escribir directamente lo que quiero"
              - generic "Muestra también tipos aún no certificados; se generan solo como borrador asistido y no admiten versión FINAL." [ref=e178] [cursor=pointer]:
                - checkbox "En desarrollo (sin certificar)" [ref=e179]
                - generic [ref=e180]: En desarrollo (sin certificar)
              - group "Cómo redactar" [ref=e181]:
                - radiogroup "Cómo redactar" [ref=e183]:
                  - generic [ref=e184] [cursor=pointer]:
                    - radio "Automáticamente" [checked]
                    - generic [ref=e185]: Automáticamente
                  - generic [ref=e186] [cursor=pointer]:
                    - radio "Con mi plantilla"
                    - generic [ref=e187]: Con mi plantilla
            - generic [ref=e189]:
              - paragraph [ref=e190]: Extensión del escrito
              - radiogroup "Extensión del escrito" [ref=e191]:
                - generic "≈ 5 páginas" [ref=e192] [cursor=pointer]:
                  - radio "Breve, ≈ 5 páginas"
                  - generic [aria-hidden] [ref=e193]:
                    - text: Breve
                    - generic [ref=e194]: "5"
                - generic "≈ 10 páginas" [ref=e195] [cursor=pointer]:
                  - radio "Intermedio, ≈ 10 páginas"
                  - generic [aria-hidden] [ref=e196]:
                    - text: Intermedio
                    - generic [ref=e197]: "10"
                - generic "≈ 20 páginas" [ref=e198] [cursor=pointer]:
                  - radio "Detallado, ≈ 20 páginas" [checked]
                  - generic [aria-hidden] [ref=e199]:
                    - text: Detallado
                    - generic [ref=e200]: "20"
                - generic "≈ 40 páginas" [ref=e201] [cursor=pointer]:
                  - radio "Extenso, ≈ 40 páginas"
                  - generic [aria-hidden] [ref=e202]:
                    - text: Extenso
                    - generic [ref=e203]: "40"
                - generic "Número de páginas a elección" [ref=e204] [cursor=pointer]:
                  - radio "Personalizado, número de páginas a elección"
                  - generic [aria-hidden] [ref=e205]: Personalizado
              - paragraph [ref=e206]: La extensión es una meta aproximada; dependerá de la complejidad, los hechos disponibles, la evidencia y las reglas aplicables. El sistema no añadirá contenido para llenar páginas.
            - button "Más opciones ≈ 20 pp. ›" [ref=e207] [cursor=pointer]:
              - generic [ref=e208]: Más opciones
              - generic [ref=e209]: ≈ 20 pp.
              - text: ›
          - region [ref=e210]:
            - heading "Actuación propuesta" [level=2] [ref=e212]
            - paragraph [ref=e213]:
              - text: "Documento detectado:"
              - strong [ref=e214]: auto que resuelve un incidente
              - text: · materia mercantil · p. 1
            - paragraph [ref=e215]: "La actuación no puede determinarse con certeza. Elige la que corresponda: la decisión sobre la vía es tuya."
            - list "Actuaciones posibles" [ref=e216]:
              - listitem [ref=e217]:
                - 'button "Recurso de apelación (mercantil) Posible Auto que resuelve un incidente: puede ser apelable según el código aplicable." [ref=e218]':
                  - text: Recurso de apelación (mercantil) Posible
                  - generic [ref=e219]: "Auto que resuelve un incidente: puede ser apelable según el código aplicable."
              - listitem [ref=e220]:
                - button "Recurso de revocación (mercantil) Posible Si el auto no admite apelación, la vía usual es la revocación ante el mismo juez." [active] [pressed] [ref=e221]:
                  - text: Recurso de revocación (mercantil) Posible
                  - generic [ref=e222]: Si el auto no admite apelación, la vía usual es la revocación ante el mismo juez.
              - listitem [ref=e223]:
                - button "Demanda de amparo indirecto Posible Solo si el acto es de imposible reparación o ya se agotaron los recursos ordinarios." [ref=e224]:
                  - text: Demanda de amparo indirecto Posible
                  - generic [ref=e225]: Solo si el acto es de imposible reparación o ya se agotaron los recursos ordinarios.
              - listitem [ref=e226]:
                - button "Promoción (cumplimiento de requerimiento o petición de trámite) Posible Promoción de trámite relacionada con el documento." [ref=e227]:
                  - text: Promoción (cumplimiento de requerimiento o petición de trámite) Posible
                  - generic [ref=e228]: Promoción de trámite relacionada con el documento.
              - listitem [ref=e229]:
                - button "Incidente procesal / de nulidad Posible Si existe una cuestión incidental o una nulidad de actuaciones que plantear." [ref=e230]:
                  - text: Incidente procesal / de nulidad Posible
                  - generic [ref=e231]: Si existe una cuestión incidental o una nulidad de actuaciones que plantear.
              - listitem [ref=e232]:
                - button "Redacción libre con instrucción directa Posible Escrito con instrucción directa del abogado." [ref=e233]:
                  - text: Redacción libre con instrucción directa Posible
                  - generic [ref=e234]: Escrito con instrucción directa del abogado.
            - generic [ref=e235]:
              - paragraph [ref=e236]: "Antes de generar, verifica:"
              - list [ref=e237]:
                - listitem [ref=e238]: Fecha de la resolución y de su notificación
                - listitem [ref=e239]: Plazo para interponer (Cómputo de Términos)
                - listitem [ref=e240]: Que el recurso proceda contra esta resolución conforme al código aplicable
                - listitem [ref=e241]: Legitimación de quien recurre y autoridad ante quien se interpone
            - paragraph [ref=e242]: Actuación confirmada por el abogado.
          - region "Preparación y generación" [ref=e243]:
            - list [ref=e245]:
              - listitem [ref=e246]:
                - generic [ref=e250]: Documento fuente cargado y legible
              - listitem [ref=e251]:
                - generic [ref=e255]: Resumen del expediente completado
              - listitem [ref=e256]:
                - generic [ref=e260]: Análisis de la demanda revisado
              - listitem [ref=e261]:
                - generic [ref=e265]: Configuración de la contestación definida
            - generic [ref=e266]:
              - button "Continuar en editor jurídico" [ref=e267] [cursor=pointer]
              - button "Generar escrito" [ref=e268] [cursor=pointer]:
                - generic [aria-hidden] [ref=e270]: →
          - generic [ref=e271]:
            - generic [ref=e272]:
              - heading "Resumen del expediente" [level=2] [ref=e273]
              - button "Editar" [ref=e274]
            - generic [ref=e278]:
              - generic [ref=e279]:
                - term [ref=e280]: Tipo de documento
                - definition [ref=e281]:
                  - generic [ref=e282]: Sentencia o resolución
              - generic [ref=e283]:
                - term [ref=e284]: Expediente
                - definition [ref=e285]: 777/2025
              - generic [ref=e286]:
                - term [ref=e287]: Órgano jurisdiccional
                - definition [ref=e288]: JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL
              - generic [ref=e289]:
                - term [ref=e290]: Parte actora
                - definition [ref=e291]: Por identificar
              - generic [ref=e292]:
                - term [ref=e293]: Parte demandada
                - definition [ref=e294]: Por identificar
              - generic [ref=e295]:
                - term [ref=e296]: Materia
                - definition [ref=e297]:
                  - generic [ref=e298]: Mercantil
              - generic [ref=e299]:
                - term [ref=e300]: Estado
                - definition [ref=e301]:
                  - generic [ref=e302]: Listo para generar
          - generic [ref=e303]:
            - generic [ref=e304]:
              - heading "Análisis de la demanda" [level=2] [ref=e305]
              - generic [ref=e306]: Analizado
            - heading "Información relevante" [level=3] [ref=e307]
            - list [ref=e308]:
              - listitem [ref=e309]:
                - generic [aria-hidden] [ref=e310]: "!"
                - generic [ref=e311]: "No se identificaron hechos numerados: revisa el documento"
              - listitem [ref=e312]:
                - generic [aria-hidden] [ref=e313]: "!"
                - generic [ref=e314]: No se detectaron prestaciones
              - listitem [ref=e315]:
                - generic [aria-hidden] [ref=e316]: ✓
                - generic [ref=e317]: Documento completo (1 página)
  - button "Open Next.js Dev Tools" [ref=e323] [cursor=pointer]
  - alert [ref=e327]
```

# Test source

```ts
  34  |   const generate: Array<Record<string, any>> = [];
  35  |   const sections: Array<Record<string, any>> = [];
  36  |   await page.route('**/api/legal-engine/generate', async (route) => {
  37  |     if (route.request().method() !== 'POST') return route.continue();
  38  |     generate.push(JSON.parse(route.request().postData() || '{}'));
  39  |     return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f8', total: 1, completed: 0, percentage: 0, stage: 'Preparando el borrador…' }) });
  40  |   });
  41  |   await page.route('**/api/legal-engine/generate/status?jobId=e2e-job-f8', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, jobId: 'e2e-job-f8', status: 'completed', terminalStatus: 'COMPLETED', total: 1, completed: 1, percentage: 100, stage: 'Completado', documentReadiness: 'READY', document: draft(documentType) }) }));
  42  |   await page.route('**/api/legal-engine/generate-section', async (route) => {
  43  |     sections.push(JSON.parse(route.request().postData() || '{}'));
  44  |     return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errorCode: 'PROVIDER_UNAVAILABLE' }) });
  45  |   });
  46  |   return { generate, sections };
  47  | }
  48  | 
  49  | async function mockConfiguredProviders(page: Page) {
  50  |   await page.route('**/api/health/providers', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
  51  |     ok: true, chain: ['groq', 'nvidia', 'local'],
  52  |     providers: [{ id: 'gemini', available: true }, { id: 'groq', available: true }, { id: 'nvidia', available: true }, { id: 'local', available: true }],
  53  |   }) }));
  54  | }
  55  | 
  56  | async function openResponses(page: Page) {
  57  |   await page.setViewportSize({ width: 1440, height: 900 });
  58  |   await page.goto('/machotes?tab=responses_resources');
  59  |   await expect(page.getByRole('heading', { name: 'Contestaciones y recursos' })).toBeVisible();
  60  |   await page.waitForLoadState('networkidle');
  61  |   await page.waitForTimeout(1500);
  62  | }
  63  | 
  64  | async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  65  |   await page.locator('input[type="file"]').first().setInputFiles(file);
  66  |   await expect(page.getByTestId('actuacion-proposal')).toBeVisible({ timeout: 45_000 });
  67  | }
  68  | 
  69  | const typeSelect = (page: Page) => page.getByRole('combobox').filter({ has: page.locator('option[value="redaccion_libre"]') });
  70  | const consent = (page: Page) => page.getByTestId('external-provider-consent');
  71  | 
  72  | const AUTO_MERCANTIL = [
  73  |   'JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL',
  74  |   'EXPEDIENTE: 777/2025',
  75  |   'Guadalajara, Jalisco, a diez de septiembre de dos mil veinticinco.',
  76  |   'Visto el incidente de nulidad de actuaciones promovido por la parte demandada en el juicio ejecutivo mercantil,',
  77  |   'con fundamento en las constancias de autos, SE DESECHA el incidente planteado por improcedente.',
  78  |   'NOTIFÍQUESE. Así lo resolvió y firma el Juez Tercero de lo Mercantil.',
  79  | ];
  80  | 
  81  | test.describe('Fase 8 · actuación propuesta y consentimiento por operación', () => {
  82  |   test('PDF de demanda: propone la contestación; «No enviar» deja la operación bloqueada y no transmite nada', async ({ page, context }) => {
  83  |     await isolate(context);
  84  |     const sent = await captureGeneration(page);
  85  |     await openResponses(page);
  86  |     await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
  87  |     await expect(page.getByTestId('actuacion-detected')).toContainText(/demanda/i);
  88  |     await expect(typeSelect(page)).toHaveValue('contestacion_demanda_civil');
  89  |     await page.screenshot({ path: `${SHOTS}/01-demanda-actuacion-propuesta.png` });
  90  | 
  91  |     await page.getByRole('button', { name: /^Generar contestación/ }).click();
  92  |     await expect(consent(page)).toBeVisible();
  93  |     await page.screenshot({ path: `${SHOTS}/02-consentimiento.png` });
  94  |     await consent(page).getByRole('button', { name: 'No enviar' }).click();
  95  |     await expect(consent(page)).toBeHidden();
  96  |     await expect(page.getByText(/No se envió ningún dato/)).toBeVisible();
  97  |     await page.waitForTimeout(1000);
  98  |     expect(sent.generate).toHaveLength(0);
  99  |   });
  100 | 
  101 |   test('con proveedores configurados nombra a quién se envía y solo autoriza esa lista', async ({ page, context }) => {
  102 |     await isolate(context);
  103 |     await mockConfiguredProviders(page);
  104 |     const sent = await captureGeneration(page);
  105 |     await openResponses(page);
  106 |     await expect(page.getByText('IA en la nube configurada')).toBeVisible({ timeout: 15_000 });
  107 |     await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
  108 |     await page.getByRole('button', { name: /^Generar contestación/ }).click();
  109 |     await expect(consent(page).getByTestId('external-consent-providers')).toHaveText('Groq, y si no responde, NVIDIA');
  110 |     await expect(consent(page)).toContainText('queda sujeto a sus políticas de uso y conservación de datos');
  111 |     await page.screenshot({ path: `${SHOTS}/03-consentimiento-proveedores.png` });
  112 |     // Escape también cancela.
  113 |     await page.keyboard.press('Escape');
  114 |     await expect(consent(page)).toBeHidden();
  115 |     expect(sent.generate).toHaveLength(0);
  116 | 
  117 |     await page.getByRole('button', { name: /^Generar contestación/ }).click();
  118 |     await consent(page).getByRole('button', { name: 'Autorizar esta generación' }).click();
  119 |     await expect.poll(() => sent.generate.length, { timeout: 15_000 }).toBe(1);
  120 |     expect(sent.generate[0]).toMatchObject({ externalProviderOptIn: true, authorizedExternalProviders: ['groq', 'nvidia'], selectedDocumentType: 'contestacion_demanda_civil' });
  121 |   });
  122 | 
  123 |   test('DOCX de un auto mercantil: no propone contestar; el abogado corrige a revocación y se envía esa actuación', async ({ page, context }) => {
  124 |     await isolate(context);
  125 |     const sent = await captureGeneration(page, 'revocacion_mercantil');
  126 |     await openResponses(page);
  127 |     const docx = await Packer.toBuffer(new Document({ sections: [{ children: AUTO_MERCANTIL.map((line) => new Paragraph(line)) }] }));
  128 |     await upload(page, { name: 'auto-mercantil-sintetico.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx });
  129 |     await expect(page.getByTestId('actuacion-detected')).toContainText(/auto/i);
  130 |     await expect(page.getByTestId('actuacion-candidate-contestacion_demanda_mercantil')).toHaveCount(0);
  131 |     await page.getByTestId('actuacion-candidate-revocacion_mercantil').click();
  132 |     await expect(typeSelect(page)).toHaveValue('revocacion_mercantil');
  133 |     await page.screenshot({ path: `${SHOTS}/04-docx-correccion-manual.png` });
> 134 |     await page.getByRole('button', { name: /^Generar recurso/ }).click();
      |                                                                  ^ Error: locator.click: Test timeout of 90000ms exceeded.
  135 |     await expect(consent(page)).toBeVisible();
  136 |     // El servidor aislado no tiene claves: el panel lo dice y permite seguir solo en local.
  137 |     await expect(consent(page).getByTestId('external-consent-no-remote')).toBeVisible();
  138 |     await consent(page).getByRole('button', { name: 'Continuar sin enviar' }).click();
  139 |     await expect.poll(() => sent.generate.length, { timeout: 15_000 }).toBe(1);
  140 |     expect(sent.generate[0]).toMatchObject({ selectedDocumentType: 'revocacion_mercantil', authorizedExternalProviders: [] });
  141 |   });
  142 | 
  143 |   test('PDF con varias resoluciones y páginas sin texto: lo informa y exige confirmar la actuación', async ({ page, context }) => {
  144 |     await isolate(context);
  145 |     await openResponses(page);
  146 |     const pdf = buildSyntheticPdf([AUTO_MERCANTIL, [''], ['SENTENCIA DEFINITIVA', 'JUZGADO TERCERO DE LO MERCANTIL DEL PRIMER PARTIDO JUDICIAL', 'EXPEDIENTE: 777/2025', 'VISTOS para resolver el juicio ejecutivo mercantil.', 'RESULTANDO. Primero. La actora demandó el pago.', 'CONSIDERANDO. Primero. Este juzgado es competente.', 'SE RESUELVE:', 'PRIMERO. Se condena al demandado al pago.', 'NOTIFÍQUESE.']]);
  147 |     await upload(page, { name: 'expediente-mixto.pdf', mimeType: 'application/pdf', buffer: pdf });
  148 |     await expect(page.getByTestId('actuacion-detected')).toContainText(/sentencia definitiva/i);
  149 |     await expect(page.getByTestId('actuacion-proposal')).toContainText(/También contiene/);
  150 |     await expect(page.getByTestId('actuacion-extraction-notice')).toContainText(/No se pudo leer texto en 1 de 3 páginas/);
  151 |     await expect(page.getByRole('button', { name: /^Generar apelación/ })).toBeDisabled();
  152 |     await page.getByTestId('actuacion-confirm').click();
  153 |     await expect(page.getByRole('button', { name: /^Generar apelación/ })).toBeEnabled();
  154 |     await page.screenshot({ path: `${SHOTS}/05-expediente-mixto.png` });
  155 |   });
  156 | 
  157 |   test('regenerar un apartado pide un consentimiento NUEVO; cancelarlo no transmite', async ({ page, context }) => {
  158 |     await isolate(context);
  159 |     await mockConfiguredProviders(page);
  160 |     const sent = await captureGeneration(page);
  161 |     await openResponses(page);
  162 |     await upload(page, { name: 'demanda-sintetica.pdf', mimeType: 'application/pdf', buffer: demandToPdf(CIVIL_ARRENDAMIENTO_DEMAND) });
  163 |     await page.getByRole('button', { name: /^Generar contestación/ }).click();
  164 |     await consent(page).getByRole('button', { name: 'Autorizar esta generación' }).click();
  165 |     await expect(page.getByText(/BORRADOR PARA REVISIÓN DEL ABOGADO/i)).toBeVisible({ timeout: 20_000 });
  166 | 
  167 |     await page.getByRole('button', { name: /Editar contestación/ }).click();
  168 |     await page.getByText('CONTESTACIÓN A LOS HECHOS').first().click();
  169 |     const reformular = page.getByTitle('Reformular el apartado activo');
  170 |     await expect(reformular).toBeEnabled({ timeout: 10_000 });
  171 |     await reformular.click();
  172 |     await expect(consent(page)).toBeVisible();
  173 |     await consent(page).getByRole('button', { name: 'No enviar' }).click();
  174 |     await page.waitForTimeout(1000);
  175 |     expect(sent.sections).toHaveLength(0);
  176 |   });
  177 | 
  178 |   test('Analíticas muestra la métrica «Envíos a IA en la nube» (sin envíos en el servidor aislado)', async ({ page, context }) => {
  179 |     await isolate(context);
  180 |     await page.setViewportSize({ width: 1440, height: 900 });
  181 |     await page.goto('/machotes?tab=configuracion');
  182 |     const panel = page.getByTestId('analytics-ai-egress');
  183 |     await expect(panel).toBeVisible({ timeout: 20_000 });
  184 |     await expect(panel).toContainText('Envíos a IA en la nube');
  185 |     await expect(panel.getByTestId('analytics-ai-egress-empty')).toBeVisible();
  186 |     await page.screenshot({ path: `${SHOTS}/06-analiticas-envios.png` });
  187 |   });
  188 | });
  189 | 
```