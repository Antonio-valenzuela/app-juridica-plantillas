# QA funcional — recorrido como abogado (Paso 1)

- **Fecha:** 2026-10-16 · **Rama:** `qa/revision-funcional` · **App:** `http://localhost:3200` (dev local)
- **Método:** Playwright (Chrome headless, viewport 1440×900) recorriendo la app como abogado.
  - **Nunca se envió nada a un proveedor de IA**: `/api/health/providers` y `/api/legal-engine/generate` (+ `/status`, `/cancel`) se interceptaron con respuestas simuladas. Los únicos documentos fuente fueron **demandas sintéticas** generadas por script.
  - **No se tocó código** durante esta revisión.
- **Evidencia:** `audit/qa-funcional-2026-10-16/capturas/` (capturas por paso) y los `flujo*-result.json` de la misma carpeta (payloads POST, consola, errores HTTP).

## Resumen

| Flujo | Veredicto |
| --- | --- |
| 1. Escritos Iniciales (6 pasos, Demanda ordinaria civil, Extenso 40 pp., POST) | **OK** — genera y envía lo esperado. **1 FALLA menor UX** en la variante sin pretensiones (ver F1-b) |
| 2. Universal + modal generador | **OK** |
| 3. Contestaciones (demanda sintética → ficha → 20 pp. → generar) | **OK** |
| 4. Editor (editar párrafo, guardar, páginas, anexo) | **OK** |
| 5. Export borrador DOCX/PDF + FINAL bloqueado | **OK** |
| 6. Cancelar generación | **FALLA menor UX** — el estado «Generación cancelada» en la barra es inalcanzable (solo toast) |
| 7. Las pestañas | **OK** (12/12; único ruido: 405 intencional de agenda web en «Términos») |
| 8. Consola + terminal | **PARCIAL** — consola sin fallos (0 pageErrors, 0 errores 5xx); terminal del servidor no observable desde la sesión automatizada |

---

## Flujo 1 — Escritos Iniciales

**Qué hice:** formulario de 6 pasos: `Materia=civil`, `Tipo de Escrito=demanda_ordinaria_civil`, promovente/demandado/hechos/pretensiones/pruebas/instrucciones sintéticas; extensión **Extenso (40 p.p.)**; «Generar Escrito Inicial»; autorizar el diálogo de proveedores.
**Qué esperaba:** que tras autorizar saliera la petición de generación con `pageTarget.pages = 40`.
**Qué pasó:** POST a `/api/legal-engine/generate` con `selectedDocumentType=demanda_ordinaria_civil`, `pageTarget {preset:'EXTENSO', pages:40}`, `externalProviderOptIn:true`, `authorizedExternalProviders:['groq','nvidia']`, `idempotencyKey`, `caseParties` (actor/demandado). Aparece la barra «Generando escrito jurídico… 0/40» con botón Cancelar.
**Evidencia:** `flujo1-01…05`, `flujo1-result.json`. **Veredicto: OK.**

### F1-b (variante sin objetivo/pretensiones) — FALLA menor UX

**Qué hice:** mismos 6 pasos pero dejando vacíos hechos/pretensiones; Generar → autorizar.
**Qué esperaba:** o bien que el sistema avisara **antes** de pedir consentimiento, o bien que tras autorizar bloqueara visiblemente indicando el paso faltante.
**Qué pasó:** el diálogo de consentimiento se pide **primero**; tras «Autorizar esta generación» **no sale ninguna petición** (correcto: falta un dato esencial) pero **no se marca el paso 4** y solo queda un aviso efímero: «Faltan datos esenciales para generar: objetivo o pretensión.». El consentimiento se consumió sin enviar nada.
**Causa técnica:** `app/machotes/page.tsx` — el consentimiento se solicita en `handleRunPipeline` (~1424) **antes** de la validación `writingIntake.readiness === 'BLOCKED'` (~1460-1467, retorno temprano con toast).
**Evidencia:** `flujo1-05-varianteB-tras-autorizar.png`, `flujo1B-01/02`, `flujo1b-result.json`. **Veredicto: FALLA menor UX** (candidata a la primera corrección del Paso 2; es frontend).

## Flujo 2 — Universal + modal generador

**Qué hice:** (2a) Motor Universal: tipo `demanda`, civil, local, instrucción con «Objetivo y pretensiones: …»; «Ejecutar análisis»; autorizar; verificar POST y apertura del editor. (2b) Dentro del editor: «Plantillas y archivo» → «Generar con Machote» → preset «Amparo directo», instrucción, **Extenso (40)** → «Generar Escrito Completo»; autorizar; verificar POST.
**Qué pasó:** 2a POST con `selectedDocumentType:'demanda'`, `pages:40`, editor abre con documento simulado. 2b POST con `selectedDocumentType:'demanda_amparo_directo'`, `pages:40`, `referenceDocumentText` (215 chars de la plantilla), editor abre.
**Observaciones (no fallas):** el selector «Tipo de escrito» del Universal solo ofrece tipos legacy (`demanda`); la `demanda_ordinaria_civil` canónica solo es alcanzable por «Explorar catálogo profesional» (no ejercitado). El modal generador solo se abre desde el editor («Generar con Machote»); el prop `onTriggerNewDraftModal` de `WorkspaceDocumentEditor` es código muerto (declarado pero nunca usado). El modal exige preset o plantilla para fijar el tipo (con solo texto libre no hay `documentType`).
**Evidencia:** `flujo2-01…05`, `flujo2-result.json`. **Veredicto: OK.**

## Flujo 3 — Contestaciones

**Qué hice:** subí una **demanda civil sintética** (PDF generado por script); revisé la actuación propuesta y la **ficha del caso** (se abre sola); confirmé a la parte representada; dejé **Detallado 20 p.p.**; «Generar contestación»; autoricé.
**Qué pasó:** detectó «demanda · materia civil · pp. 1–3» y propuso «Contestación de demanda civil (Corresponde)». La ficha mostró partes detectadas (actora/demandada) y se confirmó como representante de la demandada. POST con `selectedDocumentType='contestacion_demanda_civil'`, `pageTarget {DETALLADO, 20}`, `caseDossier` (representada «INMOBILIARIA LOS FRESNOS», expediente 1450/2025), `sourceDocuments`=1, `externalProviderOptIn:true`. El editor abrió con el documento simulado.
**Evidencia:** `flujo3-01…07`, `flujo3-result.json`. **Veredicto: OK.**

## Flujo 4 — Editor

**Qué hice:** con el documento generado del flujo 3: leí el resultado de extensión y el aviso de páginas; expandí el **anexo de revisión**; desbloqueé la edición («Editar contestación»), edité un párrafo («Editar texto directamente» → textarea → «Guardar cambios») y verifiqué que el cambio quedara visible.
**Qué pasó:** resultado de páginas visible: «Objetivo: 20 páginas · Resultado: 18 páginas (por debajo del objetivo)». Anexo: «Anexo de revisión para el abogado (4 puntos; fuera del escrito)» con hallazgos del validador, cita omitida, pendientes y notas. La edición se guardó y se ve en el documento.
**Evidencia:** `flujo45-01-editor-con-anexo.png`, `flujo45-02-edicion-guardada.png`, `flujo45-result.json`. **Veredicto: OK.**

## Flujo 5 — Exportaciones

**Qué hice:** menú «Exportar»: revisé el estado de FINAL; descargué **DOCX borrador** y **PDF borrador**; abrí ambos y busqué la edición.
**Qué pasó:** FINAL bloqueado con mensaje claro («Exportación FINAL no disponible: la revisión jurídica de este tipo de escrito sigue pendiente. Puedes descargar un borrador.») y **0 botones FINAL**. DOCX (10 457 bytes) abre y **contiene la edición**. PDF válido (`%PDF`, 1 722 bytes) y su texto extraído muestra el aviso «BORRADOR PARA REVISIÓN DEL ABOGADO» y la edición (la comparación exacta de cadena falla solo por espacios de extracción del PDF).
**Evidencia:** `flujo45-03-menu-exportacion.png`, descargas en `downloads/` (temporales de la sesión), `flujo45-result.json`. **Veredicto: OK.**

## Flujo 6 — Cancelar generación

**Qué hice:** inicié una generación (Universal) que se quedó «en curso»; pulsé **Cancelar** en la barra de estado.
**Qué esperaba:** estado «cancelado» visible, nunca «completado».
**Qué pasó:** el POST de cancelación sale (`/api/legal-engine/generate/cancel`, 1 llamada) y el servidor reporta `cancelled`; aparece el **toast** «Generación cancelada.». Pero la **barra de estado se desmonta de inmediato** y el texto «Generación cancelada» **nunca se ve**: el estado se apaga antes (`setIsUniversalGenerating(false)` en `page.tsx:496`) y la barra solo se renderiza si esa bandera está activa (`page.tsx:2598`), así que el temporizador de 2.5 s que iba a mostrar «cancelled» (`page.tsx:499-503`) es **inalcanzable**. Lo importante se cumple: **no se marca como completado** y el editor no se abre.
**Evidencia:** línea de tiempo en `flujo6-result.json`, `flujo6-01-generando.png`, `flujo6-02-cancelada.png`. **Veredicto: FALLA menor UX** (frontend).

## Flujo 7 — Pestañas

**Qué hice:** visité las 12 pestañas válidas (`inicio`, `universal`, `initial_writings`, `responses_resources`, `my-templates`, `expedientes`, `terminos`, `jurisprudencia`, `biblioteca`, `alertas`, `configuracion`, `ayuda`), esperando carga completa, encabezado correcto, acciones visibles y estados vacíos.
**Qué pasó:** las 12 cargan con `data-active-tab` correcto, encabezado propio y botones visibles; **0 pageErrors**. Estados vacíos informativos (p. ej. Contestaciones: «Antes de generar: Carga un documento fuente…»). Único ruido: en «Términos», 2× `GET /api/workspace/agenda` → **405** (ver Hallazgos).
**Evidencia:** `tab-*.png` (12 capturas), `flujo7-result.json`. **Veredicto: OK.**

## Flujo 8 — Consola y terminal

**Qué hice:** recopilé consola del navegador y errores HTTP en los 7 recorridos.
**Qué pasó:** **0 errores de página** y **0 respuestas 5xx**. Todo el ruido de consola (2 en flujo 2, 3 en flujo 3, 4 en flujo 4/5, 2 en «Términos») es «Failed to load resource: 405» de `/api/workspace/agenda` — comportamiento **intencional en modo web**: la agenda es local/desktop y el cliente cae a almacenamiento local al recibir 405 (`lib/workspace/agendaClient.ts:9-11`; `app/api/workspace/agenda/route.ts:22` responde `WEB_AGENDA_NOT_AVAILABLE`).
**Limitación:** la terminal del servidor de desarrollo no es observable desde esta sesión automatizada; se requiere que la compartas al validar.
**Veredicto: PARCIAL** (consola OK; terminal pendiente de confirmar contigo).

---

## Hallazgos técnicos para el Paso 2 (propuesta de orden)

1. **Cancelación sin estado visible** (flujo 6, `page.tsx:493-505` + gate `2598`): mostrar la barra en «Generación cancelada» aunque la generación haya terminado, o notificar de forma persistente.
2. **Consentimiento antes de validar datos esenciales** (flujo 1-b, `page.tsx:~1424` vs `~1460-1467`): validar primero y, si falta algo, resaltar el paso pendiente; pedir consentimiento solo cuando la operación vaya a enviarse.
3. **Ruido 405 de agenda** (flujos 2-7): es por diseño; si se desea, silenciar la llamada en web antes de intentarla.
4. Observaciones menores: `onTriggerNewDraftModal` código muerto; selector del Universal solo con tipos legacy.

## Cómo se reproduce

- Scripts: `%TEMP%\opencode\qa-lex\` (`synthetic.js`, `flujo1.js`, `flujo1b.js`, `flujo2.js`, `flujo3.js`, `flujo45.js`, `flujo6.js`, `flujo7.js`); requieren el dev server en `localhost:3200`. Nunca contactan proveedores reales (rutas interceptadas).
- Evidencia consolidada: `audit/qa-funcional-2026-10-16/`.

## Correcciones aplicadas (Paso 2) — rama `qa/revision-funcional`

| Hallazgo | Commit | Corrección |
|---|---|---|
| F6 cancelación sin estado visible | `4b30d4d` | La barra global muestra «Generación cancelada» antes de desmontarse. |
| F6 backend: llamadas tras abort | `0ebaabb`, `3f20d67` | `GenerationCancelledError` se relanza en los loops de expansión y en `executeGenerationTask` (sin fallback, `throwIfCancelled` + `withAbort` en pase 1, continuación y revisión). Prueba de ruta determinista con reloj falso; `afterAbortCalls === 0`. |
| F1-b consentimiento antes de validar | `f6cef6e` | Se validan datos esenciales primero y se señala el paso faltante. |
| Ruido 405 de agenda | `dc69f4e`, `e93321a` | La agenda web consulta la API y trata el 405 en silencio. |
| Prop muerto `onTriggerNewDraftModal` | `8d71ffd` | Retirado del editor. |

**Validación final (2026-10-17):** `npx vitest run --config vitest.offline.config.ts` → 455/455 archivos, 5024 pruebas aprobadas, 2 omitidas, 0 fallidas. `npx tsc --noEmit` → sin errores. Sin proveedores de IA reales.
