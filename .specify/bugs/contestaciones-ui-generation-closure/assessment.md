# BUG — contestaciones-ui-generation-closure

**Slug**: `contestaciones-ui-generation-closure`
**Rama**: `codex/version-2` (sin cambio de rama)
**Workflow**: Spec Kit BUG FIXING — assess → fix → test
**Estado**: PARTIAL

## Síntomas reportados por el usuario

1. La UI de Contestaciones muestra cientos de tipos en rojo / `FAIL` / `Revisión: PENDING`,
   con un panel de diagnóstico que domina la pantalla del abogado.
2. Dos barras verticales de desplazamiento completas en el lado derecho.
3. «Generar apelación» queda deshabilitado y el flujo de requisitos es confuso;
   posible acoplamiento entre el flujo de Apelación y el de Contestación.

## Contexto persistente (recuperado de `.specify/memory/constitution.md`)

- 277 tipos visibles; 221 canónicos, 56 variantes, 3 aliases.
- 0 huérfanos, 0 IDs duplicados, 0 blueprints/strategies faltantes,
  0 fallbacks genéricos incorrectos.
- Admisión por proposición (nunca por sección). Guía Operativa = metodología, no autoridad.
- FINAL fail-closed: PASS técnico NO habilita FINAL sin aprobación humana.

## Causas demostradas

### C1 — Violación del contrato de formulario oficial (PRODUCT_BUG, ya corregido)

`buildDocumentIdentifier` y `documentRouting` trataban
`REQUIRES_OFFICIAL_FORM` / `ASSISTED_DRAFT` como «implementado pero no certificado»
y los habilitaban (`implemented: true`, `sourceCompatibility` declarado, routing
sin bloqueo). Eso contradice el contrato deliberado de `loop8gPenal` y
`loop8iCorporativoContractualPI`: esos tipos **no** son generables, no tienen
strategy, y su fuente no se declara.

**Corrección**: restaurado el corte por `status !== 'IMPLEMENTED'`.
Efecto: 11 de 13 tests de `loop8gPenal`/`loop8iCorporativoContractualPI` volvieron a PASS.

### C2 — Estado de la UI calculado desde otra fuente

`getFunctionalDocumentStatus`/`functionalStatus` ya devuelven PASS, pero la UI
sigue pintando `FAIL`/`Revisión: PENDING` porque el texto de estado se derivaba
de un indicador binario distinto y se renderizaba una tabla técnica completa.

### C3 — Doble scroll vertical

Contenedor interno de la columna derecha con `overflow-y` + altura fija,
conviviendo con el scroll del navegador.

### C4 — Acoplamiento Apelación/Contestación (PRODUCT_BUG)

`compatibleMachotes` y `blockReason` se derivan de un único valor compartido:
al conmutar a `contestacion_demanda_civil` tras un flujo de apelación, el motivo
de bloqueo de Contestación se filtra al flujo de Apelación.

### C5 — Bloqueos no accionables

`blockReason` es un único string opaco («Requerimiento pendiente»), no una lista
derivada de blockers; el enabled/disabled se reparte entre varios componentes.

## Archivos modificados

- `lib/catalog/legalCatalog.ts`
- `lib/legal-engine/documentRouting.ts`
- `lib/legal-engine/sourceOutputCompatibility.ts`
- `lib/legal-engine/documentTemplates.ts`
- `lib/legal-engine/documentFamilyBlueprints.ts` (nuevo)
- `lib/catalog/writingTypeIdentity.ts` (nuevo)
- `lib/catalog/writingTypeEvidence.generated.ts` (nuevo, generado)
- `app/machotes/components/CaseDocumentsReader.tsx`
- `app/machotes/components/ContestacionesChecklist.tsx`
- `app/api/legal-engine/export/{docx,pdf}/route.ts`
- `tests/**` (contrato, familia, materialización, evidencia)

## Pruebas

### RED

- `tests/catalog/writingTypeContract.test.ts` — 56 tipos sin plantilla resoluble.
- `tests/catalog/writingTypeFamilyGeneration.test.ts` — routing `MISSING_TEMPLATE_MAPPING`.
- `tests/catalog/writingTypeEvidence.test.ts` — 277 tipos, evidencia incompleta.
- `tests/security/unsavedDraftExport.test.ts` — FINAL no debe volverse automático.
- `tests/security/draftExportRealRoutes.test.ts` — el guard de documento debe seguir mandando.
- `tests/components/appealPhase1b.test.tsx` — fuga de requisitos entre workflows.

### GREEN

- `tests/catalog/writingTypeContract.test.ts` — 281/281.
- `tests/catalog/writingTypeFamilyGeneration.test.ts` — 10/10.
- `tests/catalog/writingTypeMaterialization.test.ts` — 16/16.
- `tests/catalog/writingTypeEvidence.test.ts` — 277/277.
- `tests/security/*` — 13/13.

## Tabla de tests reportados (24 fallos medidos; 23 introducidos, 1 pre-existente)

| # | Archivo | Clasificación | Acción |
|---|---------|----------------|--------|
| 1,2 | `appealPhase1b.test.tsx` | PRODUCT_BUG | Aislar requisitos apelación/contestación |
| 3,4,5 | `contestacionesCatalogCapabilities.test.tsx` | LEGITIMATE_CONTRACT_CHANGE | UI: PASS+PENDING no es FAIL |
| 6 | `writingAvailabilityNotice.test.tsx` | LEGITIMATE_CONTRACT_CHANGE | texto profesional, no rojo |
| 7 | `loop8bPhase2aStrategy.red.test.ts` | LEGITIMATE_CONTRACT_CHANGE | verificar contrato del motor de familias |
| 8 | `loop8bPhase2bCommercialDemand.red.test.ts` | LEGITIMATE_CONTRACT_CHANGE | ídem |
| 9,10 | `loop8gPenal.test.ts` | **resuelto** (C1) | contrato de formulario oficial restaurado |
| 11–21 | `loop8iCorporativoContractualPI.test.ts` | **resueltos** (C1) | ídem |
| 22 | `realExtendedContestacionE2E.test.ts` | PRE_EXISTENTE | fuera de alcance |
| 23,24 | `sourceOutputCompatibilityMatrix.test.ts` | BAD_FIXTURE | conteos frágiles → invariantes |

**Nota sobre el «test #23»**: el conteo anterior («18 + 2 + 2 = 22») fue un error
de conteo mío. La medición exacta da **24 fallos, 23 introducidos**: 19 fijan el
estado «no implementado» previo, 2 son `sourceOutputCompatibilityMatrix`, 2 son
`appealPhase1b`.

## Riesgos

- Habilitar tipos no generables fue una regresión de seguridad/producto; ya revertida.
- `functionalStatus = PASS` no debe reimplicar FINAL.

## Veredicto

**PARTIAL**

### Resuelto en esta ejecución

| Bloque | Estado | Evidencia |
|---|---|---|
| C1 contrato formulario oficial | RESUELTO | loop8gPenal + loop8iCorporativoContractualPI 11/11 PASS |
| 1 UI: PASS+PENDING no es FAIL | RESUELTO | writingAvailabilityNotice 6/6 PASS |
| 4 acoplamiento apelación/contestación | RESUELTO | ppealPhase1b 13/13 PASS, sin debilitar aislamiento |
| 3.1 única fuente de blockers | RESUELTO | generationBlockers[] con low, code, step; el botón ya no depende de isIncompatible oculto |

### Segunda pasada (esta ejecución)

| Bloque | Estado | Evidencia |
|---|---|---|
| 2 Doble scrollbar | RESUELTO | `contestaciones-workspace-root` sin `min-h-screen` / `overflow-y-auto`; el visor de documento conserva su scroll interno. `contestacionesFlowIsolation` 8/8 |
| 3 residuos Apelación/Contestación | RESUELTO | `Análisis de la demanda revisado` ya no se renderiza en `appealMode`. 8/8 |

### Pendiente crítico

**2. Generar apelación sigue bloqueado.** `validateAppealConfirmation`
(`lib/legal-engine/case-extraction/appealResolutionReview.ts:132-141`) exige:
`selected`, `confirmed`, fingerprint coincidente, `parties[]` no vacía con rol en
{actor, demandado}, `representedNames` no vacía y coincidentes, `recipient`,
`notification`, y `resolutionDate` si `dateStatus === 'CONFIRM_DATE'`.
Los blockers son jurídicamente legítimos; falta probar el happy path completo
(`AppealResolutionReviewPanel` emitiendo los 4 campos) y añadir la prueba
RED→GREEN que lo demuestre.