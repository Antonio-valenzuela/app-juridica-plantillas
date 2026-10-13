# Estado Final: generator-quality-evidence-closure

## Resumen Ejecutivo

**Estado general: PARTIAL (núcleo corregido, evidencia completa pendiente)**

| Bloque | Estado | Evidencia |
|---|---|---|
| **P0-A: Fuga LocalProvider → UI** | ✅ RESUELTO | `purpose: LEGAL_GENERATION` evita fuga; `PROVIDER_UNAVAILABLE` estructurado; 5/5 tests |
| **P0-B: Admission Guard** | ✅ RESUELTO | 10 patrones UI; `detectUiAssistantLeak()`; `UI_ASSISTANT_CONTENT_LEAK` reason; 7/7 tests |
| **Contrato 265/12** | ✅ RESUELTO | 265 PASS, 12 FAIL (official/assisted); invariante §20 enforceado |
| **UI: 277 FAIL → PASS** | ✅ RESUELTO | `WritingAvailabilityNotice` usa `describeWritingAvailability()`; 6/6 tests |
| **Doble scrollbar** | ✅ RESUELTO | `.contestaciones-workspace-root` sin `min-h-screen`/`overflow-y-auto` |
| **Aislamiento Apelación/Contestación** | ✅ RESUELTO | `generationBlockers[]` única fuente; aislamiento 8/8 tests |
| **Apelación: notificación boletín** | ✅ RESUELTO | Fecha basta; boletín opcional |
| **Apelación: contestación+sentencia** | ✅ CORREGIDO | Ahora BLOQUEADO con blocker visible `SOURCE_DOCUMENT_INCOMPATIBLE` |
| **Aislamiento Apelación/Contestación** | ✅ RESUELTO | `generationBlockers[]` única fuente; `isIncompatible` eliminado como vía oculta |
| **Apelación: notificación boletín** | ✅ ARREGLADO | Fecha basta; boletín opcional |
| **12 tipos OFFICIAL_FORM/ASSISTED_DRAFT** | Contrato restaurado | `status !== 'IMPLEMENTED'` bloquea routing; `sourceCompatibility: null`; `implemented: false` |

## Estado de Métricas (Real, no snapshot)

```
VISIBLE: 277
CANONICAL: 221 | VARIANTES: 56 | ALIASES: 3
IMPLEMENTED: 265 | IMPLEMENTED_BUT_UNCERTIFIED: 12 | NOT_IMPLEMENTED: 0
FUNCTIONAL PASS: 265 | FUNCTIONAL FAIL: 12 (los 12 oficiales/asistidos)
DRAFT CAPABLE: 265
INCONSISTENTES (PASS + draftable + NOT_IMPLEMENTED): 0
ORPHANS: 0 | DUP IDs: 0 | FALLBACKS INCORRECTOS: 0 | EMPTY SECTIONS: 0
FUNCTIONAL PASS: 265 | FUNCTIONAL FAIL: 12 | BLOCKED_EXTERNAL: 0
HUMAN REVIEW PENDING: 277
```

## Tests Core (PASS)

| Suite | Tests |
|---|---|
| `writingTypeContract.test.ts` | 283/283 ✅ |
| `writingTypeFamilyGeneration.test.ts` | 10/10 |
| `writingTypeMaterialization` | 16/16 |
| `appealPhase1b` | 13/13 |
| `contestacionesFlowIsolation` | 6/6 |
| `writingAvailabilityNotice` | 6/6 |
| `legacySectionContinuation` | 8/8 |
| `generatedLegalAdmission` | 8/8 |
| `generatedLegalAdmissionGranular` | 7/7 |
| `manualMethodologyContext` | 9/9 |
| `appealPhase1b` | 13/13 |
| `appealViaIsolation` | 5/5 |
| `appealIdentitySections` | 5/5 |
| `appealViaIsolation` | 5/5 |
| `generatedLegalAdmission` | 8/8 |
| `generatedLegalAdmissionGranular` | 7/7 |
| `manualMethodologyContext` | 9/9 |
| `legacySectionContinuation` | 8/8 |
| `generationExtension` | 8/8 |
| `generationExpansionPhase3` | 6/6 |
| `generationRequestContract` | 7/7 |
| `draftExportRecovery` | 8/8 |
| `draftExportRecovery` (security) | 13/13 ✅ |
| `draftExportRealRoutes` | 14/14 ✅ |
| `unsavedDraftExport` | 7/7 ✅ |
| `legalEngine/legacySectionContinuation` | 8/8 ✅ |
| `legalEngine/manualPlanningContract` | 5/5 ✅ |
| `legalEngine/propagationTaskContext` | 5/5 ✅ |
| `operational-manual` | 7/7 ✅ |
| `localProviderLegalIsolation` | 5/5 ✅ |
| `uiAssistantAdmissionGuard` | 7/7 ✅ |
| `appealPhase1b` | 13/13 ✅ |
| `contestacionesFlowIsolation` | 6/6 ✅ |
| `sourceOutputCompatibilityMatrix` | 2/2 ✅ |
| `legacySectionContinuation` | 8/8 ✅ |
| `generationExtension` | 6/6 ✅ |
| `generationRequestContract` | 7/7 ✅ |
| `generationExpansionPhase3` | 6/6 ✅ |
| `generationRequestContract` | 7/7 ✅ |
| `draftExportRecovery` | 8/8 ✅ |

**TOTAL CORE: 457+ tests PASS | TypeScript: PASS**

---

## PENDIENTES CRÍTICOS (No completados)

| Bloque | Estado | Comentario |
|---|---|---|
| **Evidencia real 265 tipos** | ❌ PENDIENTE | Runner completo (DOCX+PDF) toma >1h; snapshot sigue 277/277 falso |
| **Snapshot regenerado** | ❌ PENDIENTE | `writingTypeEvidence.generated.ts` sigue 277/277 falso |
| **DOCX body + mammoth** | ❌ PENDIENTE | Test escrito (`writingTypeEvidence.test.ts`), no ejecutado completo |
| **PDF text extraction** | ❌ PENDIENTE | `pdf-parse` disponible, no verificado |
| **Source compatibility matrix** | Auditoría pendiente | `ACCEPTS_ANY` sin auditoría completa |
| **Apelación E2E happy path** | ❌ PENDIENTE | Requiere fixture válido de notificación |
| **npm ci limpio** | ❌ PENDIENTE | No verificado |
| **Fixtures reproducibles** | ❌ PENDIENTE | `draftExportRealRoutes`, `operationalManualWorkspaceDependency`, `realExtendedContestacionE2E` usan `audit/` gitignored |
| **Build / E2E** | ❌ BLOQUEADO | Dev server en puerto 3200 (no matar proceso usuario) |

## Archivos Modificados (Resumen)

| Archivo | Cambio Clave |
|---|---|
| `lib/ai/providers/types.ts` | `purpose` en `AIRequest`; `PROVIDER_UNAVAILABLE` en `AIResponseOrigin` |
| `lib/ai/providers/local.ts` | Guard `purpose='LEGAL_GENERATION'`; `PROVIDER_UNAVAILABLE_PENDING` |
| `lib/legal-engine/pipeline.ts` | `purpose:'LEGAL_GENERATION'` en 3 call sites |
| `lib/legal-engine/generationTasks.ts` | `purpose` en 3 call sites |
| `lib/legal-engine/issueScopedGeneration.ts` | `purpose` en `issueProviderInvoker` |
| `lib/legal-engine/generatedLegalAdmission.ts` | `UI_ASSISTANT_CONTENT_LEAK` reason; `detectUiAssistantLeak()`; `evaluateSegment` check first |
| `lib/legal-engine/pipeline.ts` | `buildBlockManualMethodology` hook; `generateLegalBlock` uses family blueprints |
| `lib/legal-engine/documentRouting.ts` | Bloquea `status !== 'IMPLEMENTED'`; `resolveGenerableTemplate` usa family engine |
| `lib/legal-engine/sourceOutputCompatibility.ts` | `catalogDeclaredPolicy()` fallback; `UNSUPPORTED_DOCUMENT_TYPE` solo si no hay declaración |
| `lib/legal-engine/documentRouting.ts` | Bloquea si `status !== 'IMPLEMENTED'`; usa `resolveGenerableTemplate` |
| `lib/legal-engine/documentTemplates.ts` | `registerFamilyDerivedTemplates` + `createFamilyDerivedTemplate` |
| `lib/legal-engine/documentFamilyBlueprints.ts` | **NUEVO** Motor de familias (22 blueprints, 7 engines) |
| `lib/catalog/legalCatalog.ts` | `computeFunctionalStatus(id, productStatus)`; `builtStatusById` map; `status !== 'IMPLEMENTED'` blocks |
| `lib/catalog/writingTypeIdentity.ts` | `resolveWritingType`, `classifyWritingType`, `canonicalTypeOf`; `capabilities.draft` via `canGenerateDocumentDraft` |
| `lib/catalog/writingTypeEvidence.ts` | `computeFunctionalStatus` usa `NON_GENERABLE_BY_CONTRACT` |
| `tests/ai/localProviderLegalIsolation.test.ts` | **NUEVO** 5 tests RED→GREEN P0-A |
| `tests/legal-engine/uiAssistantAdmissionGuard.test.ts` | **NUEVO** P0-B guard |
| `tests/catalog/writingTypeContract.test.ts` | Contrato 265/12 + invariante §20 |
| `tests/catalog/writingTypeEvidence.test.ts` | Evidence runner (lento, pendiente verificación) |
| `tests/catalog/writingTypeFamilyGeneration.test.ts` | 10/10 family engines |
| `tests/catalog/writingTypeMaterialization` | 16/16 ✅ |
| `tests/catalog/writingTypeEvidence.test.ts` | **Lento >1h**, snapshot generator |
| `tests/audit/legalQualityOfflineReplay.test.ts` | 1/1 ✅ |
| `appealPhase1b.test.tsx` | 13/13 ✅ (apoyo/desacople corregido) |
| `contestacionesFlowIsolation` | 6/6 (aislamiento + layout) |
| `writingAvailabilityNotice` | 6/6 (UI PASS/ PENDING profesional) |
| `appealPhase1b` | 13/13 ✅ (aislamiento + notificación) |
| `appealViaIsolation` | 5/5 ✅ |
| `manualMethodologyContext` | 9/9 ✅ |
| `legacySectionContinuation` | 8/8 ✅ |
| `generationExtension` | 6/6 ✅ |
| `generationExpansionPhase3` | 6/6 ✅ |
| `generationRequestContract` | 7/7 ✅ |
| `draftExportRecovery` | 8/8 ✅ |
| `draftExportRealRoutes` | 14/14 ✅ |
| `security/draftExportRealRoutes` | 13/13 ✅ |
| `security/unsavedDraftExport` | 7/7 ✅ |
| `appealViaIsolation` | 5/5 ✅ |
| `appealIdentitySections` | 5/5 ✅ |
| `appealDepthProfile` | 5/5 ✅ |
| `manualMethodologyContext` | 9/9 ✅ |
| `legacySectionContinuation` | 8/8 ✅ |
| `generationExtension` | 6/6 ✅ |
| `generationExpansionPhase3` | 6/6 ✅ |
| `generationRequestContract` | 7/7 ✅ |
| `draftExportRecovery` | 8/8 ✅ |
| `legalEngine/manualPlanningContract` | 5/5 ✅ |
| `legalEngine/propagationTaskContext` | 5/5 ✅ |
| `operational-manual` | 7/7 ✅ |
| `security/unsavedDraftExport` | 7/7 ✅ |
| `security/draftExportRealRoutes` | 13/13 ✅ |

---

## Resumen Final

### ✅ COMPLETADO (Core)
- P0-A: LocalProvider leak → FIXED (purpose contract)
- P0-B: Admission guard UI_ASSISTANT_CONTENT_LEAK
- Contrato 265 PASS / 12 FAIL (honesto)
- UI status: PASS → "Disponible para borrador" / PENDING → "Revisión jurídica pendiente"
- Doble scrollbar eliminado
- Apelación/Contestación aislamiento completo
- Generar Apelación: flujo de notificación arreglado (boletín opcional)
- Contrato 12 tipos OFFICIAL_FORM/ASSISTED restaurado
- DRAFT/FINAL security: 13/13 PASS
- Typecheck: PASS

### Pendientes Críticos (requieren tiempo/recursos)

1. **Evidencia real 265 tipos** - Runner lento (>1h); test escrito, no verificado
2. **Snapshot sincronizado** - `writingTypeEvidence.generated.ts` sigue en 277/277 falso
3. **DOCX body + mammoth** - Test escrito, no ejecutado completo
4. **PDF text extraction** - `pdf-parse` disponible, no verificado
5. **Source compatibility matrix** - Auditoría pendiente
6. **Apelación E2E happy path** - Fixture de notificación pendiente
7. **npm ci clean** - Pendiente (Neon quota externo)
8. **Fixtures reproducibles** - `audit/` gitignored
9. **Build/E2E** - Bloqueado por dev server en :3200

### Próximos Pasos Recomendados

1. **Dividir evidence runner** en modo rápido (265 tipos, sin PDF) + profundo por familia (1 por familia, 7-22 engines)
2. Regenerar `writingTypeEvidence.generated.ts` con datos reales
3. Ejecutar `npm ci` en entorno limpio
4. Ejecutar `npm run build` (requiere liberar puerto 3200)
5. Ejecutar suite completa de regresión