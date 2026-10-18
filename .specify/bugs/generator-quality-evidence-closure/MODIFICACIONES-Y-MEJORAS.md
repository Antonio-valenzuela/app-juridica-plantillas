# Modificaciones y mejoras — Motor de generación jurídica

Rama `codex/version-2` · Sin commits · Spec Kit: `.specify/bugs/generator-quality-evidence-closure/`
Fecha: 2026-10-05

---

## 1. Resumen ejecutivo

Se corrigió una fuga **P0** por la que ayuda de pantalla del asistente interno
terminaba dentro de escritos juridicos, se anadio una segunda defensa en la capa de
admisión, y se eliminó una **mentira del catálogo** que anunciaba 277 tipos
funcionales cuando sólo 265 lo son.

**El generador NO está completo.** 7 de los 14 bloques de la auditoría externa
siguen abiertos. Este documento dice exactamente cuáles.

---

## 2. Fuga P0: LocalProvider servía chat de UI como generador jurídico

### Causa

`lib/ai/providers/local.ts` es a la vez el asistente de chat de la app y el
fallback de generación. Su heurística `isPageQuery` (línea 24) trataba
`message.includes("sección")` como consulta de pantalla, y las líneas 41-66
devolvían ayuda de interfaz. Los prompts jurídicos de generación contienen
"sección", "página" y "pantalla" de forma natural, así que el pipeline aceptaba
ayuda de pantalla como si fuera redacción jurídica.

Reproducido: un prompt de agravios filtraba **6/6** patrones
("Resumen de la pantalla actual", "Panel Principal", "Jurídico Radar",
"Te encuentras en", "Dashboard", "Inteligencia Regulatoria").

### Mejora aplicada

Distinción **por contrato**, no por heurística:

```ts
// lib/ai/providers/types.ts
purpose?: "UI_ASSISTANT" | "LEGAL_GENERATION";
```

Con `LEGAL_GENERATION` el LocalProvider **nunca** devuelve UI. Sin proveedor
externo devuelve un resultado estructurado:

```
success: false · origin: 'PROVIDER_UNAVAILABLE' · fallbackReason: 'PROVIDER_UNAVAILABLE'
[PENDIENTE DE DESARROLLO JURÍDICO: PENDIENTE DE GENERACIÓN — proveedor de IA no
 disponible (PROVIDER_UNAVAILABLE)]
```

Marcado con `purpose` en los 5 call sites jurídicos
(`pipeline.ts:1549`, `generationTasks.ts:1440/1510/1661`,
`issueScopedGeneration.ts:1453`). Sin `purpose` el chat conserva su
comportamiento: cero riesgo de regresión en la UI.

### Evidencia

- `tests/ai/localProviderLegalIsolation.test.ts` — **5/5**
- Fuga con `purpose=LEGAL_GENERATION`: **0/5 prompts**

---

## 3. Admission guard `UI_ASSISTANT_CONTENT_LEAK` (segunda defensa)

### Mejora aplicada

En `lib/legal-engine/generatedLegalAdmission.ts`:

- Nueva razón `UI_ASSISTANT_CONTENT_LEAK` en `LegalAdmissionReason`.
- `UI_ASSISTANT_LEAK_PATTERNS`: 10 señales (las 6 auditadas + "Generación de
  Machotes y Plantillas", "Monitoreo Legal", "Centro Jurídico e IA Sandbox",
  "puedes realizar consultas sobre la pantalla").
- `detectUiAssistantLeak(text)` devuelve los patrones hallados como **evidencia**.
- `evaluateSegment` lo comprueba **primero**: si hay fuga, el segmento se
  rechaza con remediación `SENTENCE`.

El resultado no es borrado silencioso: queda marcador canónico **seed**
(`[PENDIENTE DE DESARROLLO / CONTENIDO NO JURÍDICO … ]`), que además mantiene
FINAL bloqueado, y warning con el `reason`.

No es un blacklist ingenuo: «monitoreo contractual» (vocabulario jurídico
legítimo) **no** se marca. Hay prueba explícita de eso.

### Evidencia

`tests/legal-engine/uiAssistantAdmissionGuard.test.ts` — **7/7**
Pipeline real con providers OFF ⇒ **0 fugas** materializadas.

---

## 4. El catálogo dejó de mentir: 265 PASS + 12 no generables

### Problema

`functionalStatus` no conocía el estado de producto, así que certificaba como
PASS tipos que el routing bloquea. Resultado: `functionalStatus=PASS` +
`canGenerateDocumentDraft=true` + `routing=DOCUMENT_TYPE_NOT_IMPLEMENTED` en 12
tipos: tres verdades incompatibles.

### Mejora aplicada

```ts
computeFunctionalStatus(id, productStatus)  // FAIL si REQUIRES_OFFICIAL_FORM / ASSISTED_DRAFT
capabilities.draft = canGenerateDocumentDraft(canonicalId, true)
```

Un tipo **no generable por contrato de producto** no puede ser PASS de
generación. Además restauré el corte de `buildDocumentIdentifier` y
`documentRouting` que yo había relajado en la fase de tipos: esos 12 Volcan
`status !== 'IMPLEMENTED'` ⇒ sin strategy, sin fuente declarada, sin ruta.

### Estado real (medido, no del snapshot)

```
VISIBLE 277 · CANONICAL 221 · VARIANTES 56 · ALIASES 3
IMPLEMENTED 265 · IMPLEMENTED_BUT_UNCERTIFIED 12 · NOT_IMPLEMENTED 0
FUNCTIONAL PASS 265 · FUNCTIONAL FAIL 12 · DRAFT CAPABLE 265
INCONSISTENTES (draftable && !PASS) = 0
ORPHANS 0 · DUP IDS 0 · FALLBACKS INCORRECTOS 0 · SECTIONS VACÍAS 0
```

Los 12 se presentan honestamente como *requiere formulario oficial* /
*borrador asistido*, no como generadores.

### Evidencia

`tests/catalog/writingTypeContract.test.ts` — **283/283**, con las dos ramas
del contrato codificadas explícitamente y el invariante §20 como aserción
permanente.

---

## 5. Otros defectos corregidos en esta fase

| Defecto | Archivo | Corrección |
|---|---|---|
| UI pintaba `FAIL`/`Revisión: PENDING` en rojo y listaba los 277 tipos | `WritingAvailabilityNotice.tsx` | `describeWritingAvailability()`: PASS+PENDING → «Disponible para borrador»; detalle por tipo sólo en `showTechnicalDetails` |
| Doble scrollbar vertical | `app/machotes/page.tsx:2663` | `.contestaciones-workspace-root` sin `min-h-screen`/`overflow-y-auto`; el visor de documento conserva su scroll |
| Bloqueo oculto del botón Generar | `ContestacionesChecklist.tsx`, `CaseDocumentsReader.tsx` | `generationBlockers[]` única fuente, con `flow`/`code`/`step`; `isIncompatible` ya no es vía oculta |
| Fuga de requisitos Apelación↔Contestación | `CaseDocumentsReader.tsx` | `appealReview` y blockers con scope por flujo; la fuente judicial en Contestación es asesor, no bloqueo |

Tests: `appealPhase1b` 13/13, `contestacionesFlowIsolation` 6/6,
`writingAvailabilityNotice` 6/6.

**Error propio corregido:** renombré el ítem del checklist en Apelación y eso
rompió `appealPhase1b 1.2`, que exige la fila visible y sin marcar. Revertido.
El usuario pidió que ese rótulo no apareciera en Apelación; el contrato vigente
exige lo contrario. Queda como decisión de producto.

---

## 6. Lo que NO está hecho

| Bloque | Estado | Motivo |
|---|---|---|
| Evidencia real de los 265 (corrida completa) | **PENDIENTE** | El recorrido con mammoth + pdf-parse para 265 tipos excede 1 h. Test escrito, **no verificado**. |
| Snapshot regenerado | **PENDIENTE — CRÍTICO** | `writingTypeEvidence.generated.ts` sigue diciendo **277/277**, que es falso. No usarlo como evidencia. |
| DOCX certificado con `document.xml` + mammoth | **PENDIENTE** | Test escrito, no ejecutado. |
| PDF certificado por texto extraído | **PENDIENTE** | Test escrito, no ejecutado. |
| Matriz de `ACCEPTS_ANY` | **PENDIENTE** | No auditado. |
| Apelación E2E (confirmar→API→DRAFT→DOCX/PDF) | **PENDIENTE** | Falta happy path con `appealConfirmation` real. |
| Notificación de apelación (fecha + boletín) | **PENDIENTE** | Sin auditar si el boletín es obligatorio. |
| `npm ci` limpio | **PENDIENTE** | No reproducido. |
| Fixtures reproducibles desde clon limpio | **PENDIENTE** | `draftExportRealRoutes`, `operationalManualWorkspaceDependency`, `realExtendedContestacionE2E` siguen dependiendo de `audit/` gitignored. |
| Build / E2E navegador | **NO EJECUTADO** | — |

---

## 7. Recomendación técnica

El recorrido de evidencia debe **partirse en dos** para ser viable en CI:

- **Rápido (todos los generables, 265):** contrato + pipeline +
  requiredSections + hechos + fuga UI + DOCX `word/document.xml` (sin
  `header1.xml`) + FINAL bloqueado. Sin render PDF.
- **Profundo (1 representante por familia/engine):** + `mammoth` + texto de PDF
  extraído con `PDFParse`.

Certificar el PDF real de los 265 en cada corrida es lo que hace el suite
inviable. `mammoth@^1.12.0` y `pdf-parse@^2.4.5` ya son dependencias: no hace
falto añadir nada.

---

## 8. Estado final

```
Fuga de texto UI              ✅ ARREGLADA
Admission guard               ✅ ARREGLADO
Contrato 265/12               ✅ ARREGLADO
UI copy + 1 scrollbar         ✅ ARREGLADO
Aislamiento de flujos         ✅ ARREGLADO
DRAFT/FINAL security          ✅ 13/13
Typecheck                     ✅ PASS

Evidencia real por tipo       ❌ PENDIENTE
Snapshot honesto              ❌ PENDIENTE (sigue 277/277)
DOCX validado por contenido   ❌ PENDIENTE
PDF validado por contenido    ❌ PENDIENTE
Compatibilidad de fuentes     ❌ PENDIENTE
Apelación E2E                 ❌ PENDIENTE
npm ci reproducible           ❌ PENDIENTE

GENERADOR COMPLETO            ❌ NO
```
