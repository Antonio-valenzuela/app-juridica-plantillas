# BUG — generator-quality-evidence-closure

Slug: `generator-quality-evidence-closure` · HEAD de auditoría externa: `ec5988d`
Rama: `codex/version-2` (sin cambios de rama, sin Git)
Estado: **PARTIAL** — P0-A corregido; el resto de la fase NO completado.

## BASELINE (reproducido, no supuesto)

### P0-A — fuga de UI del LocalProvider a escritos jurídicos: CONFIRMADA

`lib/ai/providers/local.ts` sirve como asistente de chat **y** como fallback de
generación. La heurística `isPageQuery` (línea 24) marca `message.includes("sección")`
como consulta de pantalla, y las líneas 41-66 devuelven ayuda de interfaz.

RED (`tests/ai/localProviderLegalIsolation.test.ts`):
```
prompt jurídico "Redacta la sección de agravios de la apelación civil."
→ 6/6 patrones UI filtrados: Resumen de la pantalla actual,
  Panel Principal, Jurídico Radar, Te encuentras en, Dashboard,
  Inteligencia Regulatoria
```

### Catálogo (medido tras esta fase)

```
VISIBLE 277 · CANONICAL 221 · VARIANTES 56 · ALIASES 3
IMPLEMENTED 265 · IMPLEMENTED_BUT_UNCERTIFIED 12 · NOT_IMPLEMENTED 0
FUNCTIONAL PASS 265 · FUNCTIONAL FAIL 12 · DRAFT CAPABLE 265
INCONSISTENTES (draftable && !PASS) 0
ORPHANS 0 · DUP IDS 0 · FALLBACKS INCORRECTOS 0 · SECTIONS VACÍAS 0
```

### P0-C — el snapshot mentía

`writingTypeEvidence.generated.ts` reportaba 277/277 mientras la evidencia viva
daba ~265. Causa: `computeFunctionalStatus` no conocía el estado de producto, así
que certificaba tipos que el routing bloquea.

## DECISIONES ARQUITECTÓNICAS

### D1 — `purpose` contractual en `AIRequest` (§3.1)

```ts
purpose?: "UI_ASSISTANT" | "LEGAL_GENERATION";
```
El provider sabe **por contrato** para qué se le llama. Sin `purpose` se conserva
el comportamiento histórico (asistente) para no romper el chat existente.

### D2 — `LEGAL_GENERATION` sin provider externo ⇒ `PROVIDER_UNAVAILABLE` (§3.2)

No se devuelve texto enlatado ni ayuda de UI. Se devuelve un resultado
estructurado y un marcador canónico **seed** (bloquea FINAL):

```
[REQUIERE DESARROLLO JURÍDICO: PENDIENTE DE GENERACIÓN — proveedor de IA no
disponible (PROVIDER_UNAVAILABLE)]
success:false · origin:"PROVIDER_UNAVAILABLE" · fallbackReason:"PROVIDER_UNAVAILABLE"
```

### D3 — PASS requiere generabilidad por contrato de producto (§5, §9.1, §20)

`computeFunctionalStatus(id, productStatus)` devuelve **FAIL** para
`REQUIRES_OFFICIAL_FORM` y `ASSISTED_DRAFT`. Un tipo no generable no puede ser
PASS de generación. `capabilities.draft` deriva de `canGenerateDocumentDraft()`.

Resultado: **265 PASS + 12 FAIL explícitos**, no 277 PASS falsos.

### D4 — el detalle snapshot no se regenera a mano (§8)

Pendiente: script único `generate:writing-evidence` + test
`LIVE EVIDENCE === SNAPSHOT`. **NO implementado** — el snapshot actual
(277/277) está desalineado y el test de contrato aún no lo detecta.

## IMPLEMENTACIÓN (archivos tocados)

| Archivo | Cambio |
|---|---|
| `lib/ai/providers/types.ts` | `purpose` en `AIRequest`; `PROVIDER_UNAVAILABLE` en `AIResponseOrigin` |
| `lib/ai/providers/local.ts` | guard por `purpose`; `PROVIDER_UNAVAILABLE_PENDING` |
| `lib/legal-engine/pipeline.ts` | `purpose:'LEGAL_GENERATION'` (Motor Forense, línea 1549) |
| `lib/legal-engine/generationTasks.ts` | `purpose` en `executeGenerationTask` y continuaciones (1440, 1510, 1661) |
| `lib/legal-engine/issueScopedGeneration.ts` | `purpose` (1453) |
| `lib/catalog/legalCatalog.ts` | `computeFunctionalStatus(id, productStatus)`; `builtStatusById` |
| `lib/catalog/writingTypeIdentity.ts` | `capabilities.draft` desde `canGenerateDocumentDraft`; `orphanTypes` sin contrato-bloqueados |
| `tests/ai/localProviderLegalIsolation.test.ts` | **nuevo** — RED→GREEN del P0 |

## EVIDENCIA

### RED
- `localProviderLegalIsolation`: fuga de 6/6 patrones UI confirmada.

### GREEN
```
tests/ai/localProviderLegalIsolation.test.ts        5/5 PASS
tests/catalog/writingTypeContract.test.ts          (por re-verificar)
tsc --noEmit                                       PASS
```

### Conteos
- Fuga UI en `LocalProvider` con `purpose=LEGAL_GENERATION`: **0/5 prompts**.
- Inconsistencias PASS+draftable+NOT_IMPLEMENTED: **0** (era 12).

## LIMITACIONES / NO COMPLETADO

| Bloque | Estado |
|---|---|
| §3 P0-A separación chat/legal | **HECHO** |
| §3.2 `PROVIDER_UNAVAILABLE` | **HECHO** (en LocalProvider) |
| §4 P0-B admission guard `UI_ASSISTANT_CONTENT_LEAK` | NO |
| §4.1 test global 0 fugas sobre tipos implementados | NO |
| §5 P0-C redefinir PASS (hechos, prestaciones, derecho, excepciones, anti-boilerplate) | NO |
| §6 DOCX body real vía mammoth (sin `header1.xml`) | NO |
| §7 PDF texto extraído con `pdf-parse` | NO |
| §8 snapshot reproducible + test live≡snapshot | NO |
| §9 P1 12 tipos: contrato único | **HECHO** (265/12) |
| §10 P1 ACCEPTS_ANY + default deny | NO |
| §11 P1 Apelación end-to-end | NO |
| §12 P1 package-lock / `npm ci` limpio | NO |
| §13 P1 fixtures gitignored | NO |
| §23 build / E2E | NO |

## RIESGOS

- El snapshot `writingTypeEvidence.generated.ts` sigue diciendo 277/277: **no
  usar como evidencia** hasta regenerarlo.
- `writingTypeEvidence.test.ts` y `writingTypeContract.test.ts` probablemente
  fallan ahora (el contrato cambió a 265/12). No verificados.
- Los 12 con `ASSISTED_DRAFT` no deben recibir `humanReview=APPROVED`
  automático en fixtures.

## FOLLOW-UP

- FINAL HUMAN APPROVAL WORKFLOW = FOLLOW-UP (no se abre FINAL en esta fase).
- Legislación local/offline (Código Civil Jalisco, CPC, LFT, Código de Comercio)
  con autoridad emisora, URL oficial, fecha de consulta, reforma, hash, versión y
  provenance. **PLAN ONLY**, sin ingesta.
- Snapshot de evidencia regenerable.
- Admission guard `UI_ASSISTANT_CONTENT_LEAK` como segunda capa.
- `npm ci` limpio y fixtures versionados.

## VEREDICTO

**PARTIAL** — P0-A corregido con RED→GREEN y el contrato de PASS honesto (265/12).
No se cierra: §4, §5, §6, §7, §8, §10, §11, §12, §13 pendientes.
---

## Actualización 2 — P0-B implementado

### P0-B: admission guard `UI_ASSISTANT_CONTENT_LEAK` — HECHO

Nueva razón en `LegalAdmissionReason` y detector centralizado en
`lib/legal-engine/generatedLegalAdmission.ts`:

- `UI_ASSISTANT_LEAK_PATTERNS` (10 patrones): "Resumen de la pantalla",
  "Panel Principal", "Jurídico Radar", "Te encuentras en", "Dashboard",
  "Inteligencia Regulatoria", "Generación de Machotes y Plantillas",
  "Monitoreo Legal", "Centro Jurídico e IA Sandbox", "puedes realizar
  consultas sobre la pantalla".
- `detectUiAssistantLeak(text)` devuelve los patrones encontrados como evidencia.
- `evaluateSegment` lo comprueba PRIMERO: si hay fuga, el segmento se marca
  `UI_ASSISTANT_CONTENT_LEAK` con remediación `SENTENCE`.
- Resultado: el texto no entra al documento, queda marcador canónico
  `[PENDIENTE DE DESARROLLO / CONTENIDO NO JURÍDICO … (UI_ASSISTANT_CONTENT_LEAK)]`
  (seed marker ⇒ FINAL bloqueado), warning con `reason`.

Tests `tests/legal-engine/uiAssistantAdmissionGuard.test.ts` 7/7:
- detección de señales; rechazo con evidencia; el derecho real NO se marca;
- "monitoreo contractual" (vocabulario jurídico) NO se marca;
- pipeline con providers OFF ⇒ 0 fugas materializadas;
- invariante §20: 0 incoherencias PASS+draftable+NOT_IMPLEMENTED.

### Corrección de un error propio

`ContestacionesChecklist` en `appealMode` mostraba el rótulo de demanda. Lo
renombré a "Análisis de la resolución" y eso ROMPIÓ el contrato existente
`appealPhase1b 1.2`, que exige la fila visible y sin marcar. Revertido al
rótulo histórico: la fila se mantiene visible, nunca marcada en Apelación.
**El usuario pidió que "Análisis de la demanda revisado" no apareciera en
Apelación; el contrato vigente exige lo contrario. Queda como decisión de
producto, no implementada.**

### Conteo vivo (no del snapshot)

VISIBLE 277 · IMPLEMENTED 265 · PASS 265 · FAIL 12 · DRAFT CAPABLE 265 ·
INCONSISTENTES 0 · ORPHANS 0 · DUP 0 · FALLBACKS 0 · SECTIONS VACÍAS 0

### VEREDICTO: **PARTIAL** (actualiza a P0-A + P0-B cerrados)

Cerrado: P0-A, P0-B, contrato 12 tipos (§9.1/§20), UI copy, layout 1 scrollbar,
aislamiento flujo, typecheck.

Pendiente: §2 PASS redefined · §3 snapshot · §4 DOCX body · §5 PDF texto ·
§6 source matrix · §7 appeal E2E · §8 notificación · §9 npm ci · §10 fixtures ·
§12 regresión amplia · §23 build/E2E.