# Implementation Plan — Generador universal de escritos jurídicos

> **Para ejecución posterior:** implementar solo después de aprobación humana explícita de este plan. El plan no autoriza cambios de código todavía.

**Goal:** Cubrir el inventario vigente de tipos con contratos familiares/tipados, preflight jurídico-documental antes de generación sustantiva, provenance y consistencia por proposición, y exportación DRAFT/FINAL con permisos separados y controles fail-closed.

**Architecture:** Extender el pipeline legal y los contratos actuales aditivamente. Un resolver determinista unifica configuración family/type y el resultado del preflight; la generación continúa por `RichCaseAnalysis → CoverageMatrix → LegalIssueMatrix → DocumentPlan → GenerationTask → DraftBlock → SemanticEvaluation → QualityGate → GenerationTrace`. Una política explícita separa DRAFT permitido sin aprobación de FINAL asociado a aprobación humana auditada y gates satisfechos; ambos formatos pasan por sus guards comunes.

**Tech Stack:** TypeScript, Next.js 16 App Router, Vitest, Playwright solo si una aceptación UI requiere navegador, renderizadores DOCX/PDF existentes. Sin providers, dependencias, base de datos ni migraciones nuevas.

**Spec:** `specs/001-generador-universal-escritos/spec.md`

## Restricciones globales

- La aprobación de este plan debe preceder a cualquier edición o prueba de implementación.
- Repetir y guardar baseline de working tree y censo inmediatamente antes de implementación; nunca usar `reset`, `clean`, checkout, stash, reemplazo amplio ni commits.
- No tocar providers, provider configuration, Prisma/schema, migraciones ni persistencia nueva; si aprobación auditada requiere almacenamiento fuera de capacidades existentes, FINAL permanece bloqueado y se solicita autorización aparte.
- No relajar `QualityGate`, Coverage, authority/provenance, factual claim audit, lifecycle, request contract ni source-only guards.
- Admitir por proposición/claim, nunca eliminar una sección entera por un finding localizado.
- Mantener interfaz general; reutilizar `RequirementsDialog` y componentes existentes después de inspeccionar sus diffs locales.
- DRAFT solo si el preflight de generación es `READY_FOR_DRAFT` o `DRAFT_LIMITED`; `BLOCKED_SUBSTANTIVE` bloquea ambas exportaciones y toda ruta/renderizador.
- FINAL requiere approval server-side de la revisión/hash exacta, actor autenticado, hora del servidor y reevaluación de todos los gates en cada exportación.
- Los tests usan datos sintéticos/offline; no ejecutar providers reales ni utilizar expedientes del usuario como fixture.
- Sin commits: la constitución prohíbe commit sin instrucción expresa del titular.

---

## Resultado del baseline que guía el orden

Snapshot al 2026-10-15, HEAD `273618365167ed9c66fe346de50954e03621e155`, rama `codex/version-2`: 278 tipos visibles, 222 canonical, 56 variant, 3 aliases, 26 `familyIdentifiers` (IDs de nodos `FAMILY` de otro nivel), 91 valores distintos de `familyId` (agrupaciones de tipos), 266 DRAFT-capable/functional PASS y 12 no certificados/functional FAIL; 278 `humanReview=PENDING`. No hay relación padre-hijo declarada entre `familyId` y `familyIdentifiers`; los contratos por familia se basarán en los 91 `familyId`. Working tree y diffs íntegros: `specs/001-generador-universal-escritos/working-tree-baseline-2026-10-15.md`; inventario por tipo: `specs/001-generador-universal-escritos/catalog-baseline-2026-10-15.json`.

La fase 1 de código tomará cada uno de los 91 `familyId` como agrupación para su contrato. Los 26 `familyIdentifiers` son IDs de nodos `FAMILY` de otro nivel, sin relación padre-hijo declarada; no se inferirá ni requerirá un mapeo entre ellos. Blueprints y engines se contrastarán como registros separados. El baseline no cubre cambios posteriores al timestamp ni prueba end-to-end.

## Arquitectura y contratos a implementar

### Contrato family/type

Un registro tipado por `canonicalTypeId` referencia su configuración de familia. La config define purpose, régimen compatible, estrategia, blueprint y secciones; el tipo define diferencias, required/conditional fields, anexos, fuentes aceptables/incompatibles, peticiones permitidas, capabilities y versión. Cada regla valida `applicability`, `obligation`, `completion`, `severity`, fuente/version, evidencia, aceptación y resolución responsable. El código no introduce defaults jurídicos inferidos por nombre.

### Preflight y gating

El preflight informa resolución del régimen y cada assessment; las dimensiones DRAFT y FINAL son ortogonales. `READY_FOR_DRAFT` y `DRAFT_LIMITED` autorizan únicamente contenido permitido. `BLOCKED_SUBSTANTIVE` cierra generación/export DRAFT. `BLOCKED_FINAL` nunca revoca por sí solo la autorización DRAFT ni habilita FINAL. Gates existentes siguen siendo autoridad; nuevos findings se conectan como controles aditivos y trazables.

### Aprobación/export

DRAFT: sin aprobación; DOCX/PDF cuando soportados; cuerpo renderizado con `BORRADOR — PENDIENTE DE REVISIÓN`, warnings y campos pendientes; no cambia lifecycle. FINAL: cada ruta prueba aprobación persistida, actor, timestamp server-side, revisión/hash y autorización; luego vuelve a evaluar los gates. Si no hay mecanismo durable actual, no crear persistencia nueva: mantener FINAL bloqueado. Nunca pasar documentos crudos por un renderer que eluda `prepareUniversalDocumentForExport`.

## Estructura y ownership de archivos

Los nombres de módulos nuevos son condicionales a que no exista una implementación equivalente al iniciar ejecución. La lista final se cotejará con los diffs actuales y CodeGraph; detener tareas de archivos compartidos si una edición local no permite un merge quirúrgico.

### Candidatos a crear

- `lib/legal-engine/writingTypeRequirements.ts`: tipos y registry versionado de contratos/rules por family/type si no cabe de forma limpia en `writingContract.ts`/catálogo.
- `lib/legal-engine/documentPreflight.ts`: evaluación pura del régimen, applicability/completion y permisos de operación si no existe seam equivalente.
- `tests/catalog/writingTypeFamilyContracts.test.ts`: exhaustividad y relaciones contractuales para cada ID/familia del censo.
- `tests/legal-engine/documentPreflight.test.ts`: estados, predicate allowlist, fuentes, unknown/N/A, fechas y operación permitida.
- `tests/legal-engine/draftFinalExportPolicy.test.ts`: contrato unitario transversal de autorización y estados.
- `tests/security/finalExportApprovalRoutes.test.ts`: rutas reales server-side DOCX/PDF con mocks de auth/ownership, auditoría y gates.
- `tests/legal-engine/universalWritingSyntheticFixtures.ts`: fixtures solo sintéticos por familia, preflight y salida exportable.

### Candidatos a modificar

- Catálogo/identidad/blueprints: `lib/catalog/legalCatalog.ts`, `lib/catalog/writingTypeIdentity.ts`, `lib/legal-engine/documentFamilyBlueprints.ts`, `documentTemplates.ts`, `documentStrategies.ts`, `writingContract.ts`; contratos por cada `familyId` (91), comparando cobertura contra blueprints/engines sin inferir relación con los 26 `familyIdentifiers` y sin editar `writingTypeEvidence.generated.ts` a mano.
- Régimen y fuentes: `lib/legal-engine/legal-research/types.ts`, `regimeResolution.ts`, verificación de autoridad y contrato de evidence/versiones existentes; no sumar adapters/providers.
- Preflight/generación: `writingContractStage.ts`, `writingContractValidator.ts`, `caseDossier.ts`, `documentPlan.ts`, `coverageMatrix.ts`, `legalIssueMatrix.ts`, `generationTasks.ts`, `issueScopedGeneration.ts`, `pipeline.ts`; revisar cambios locales actuales primero.
- Findings/provenance: `factualClaimGate.ts`, `authorityVerificationGate.ts`, `authorityPropositionGate.ts`, `documentAssembly*`, `qualityGate.ts`, `generationTrace.ts`, sanitizer y validators; cambios aditivos por proposition/claim.
- Exportación: `exportModes.ts`, `exportGuards.ts`, `draftDocumentMaterialization.ts`, `documentLifecycle.ts`, `exportDocxUniversal.ts`, `exportPdfUniversal.ts`, `app/api/legal-engine/export/docx/route.ts`, `app/api/legal-engine/export/pdf/route.ts`; centralizar decisiones de modo sin alterar gates de renderer final.
- UI acotada: `RequirementsDialog.tsx`, `CaseDossierPanel.tsx`, `CaseDocumentsReader.tsx` y `ReviewAnnexPanel.tsx` solo si flujo de campos/avisos exige un cambio. Todas estas rutas contienen cambios locales; primero ownership y comparación de diff. No cambiar shell o sistema visual.
- Tests existentes a ampliar: `tests/catalog/writingTypeContract.test.ts`, `writingTypeFamilyGeneration.test.ts`, `writingTypeEvidence.test.ts`, `tests/legal-engine/writingContractAndDossier.test.ts`, tests de regime/research/authority/Coverage/assembly/trace, `tests/legal-engine/exportReviewOverride.test.ts`, `exportMode.test.ts`, `documentLifecycle.test.ts`, `draftExportRecovery.test.ts`, `exportFormatParity.test.ts`, `exportRouteContracts.test.ts`, `compatibilityExport.test.ts`, `tests/security/draftExportRealRoutes.test.ts` y `unsavedDraftExport.test.ts`.

### Fuera de ownership

- `prisma/schema.prisma`, `prisma/migrations/**`, provider/adapters, `.env*` y configuraciones de acceso a provider.
- Los archivos locales listados en el baseline salvo que formen parte de ownership explícito después de revisar el diff con el titular. No “limpiar” pruebas/fixtures en `tests/tmp/`.

## Fases y dependencias

### Fase 0 — Baseline e inventario del catálogo

1. Capturar otra vez `git status --short --untracked-files=all`, diff stat, HEAD y SHA-256 de archivos relevantes; guardar lista de archivos existentes antes de tocar código. Comparar con `working-tree-baseline-2026-10-15.md` y no modificar archivos ajenos.
2. Regenerar `visibleWritingTypes()`/`writingTypeCensus()` y JSON por ID; reportar delta vs 278 y no arrastrar supuestos de 277 ni 278.
3. Fijar los 91 `familyId` como agrupaciones base de los contratos. Registrar aparte los 26 `familyIdentifiers` como IDs de nodos `FAMILY` de otro nivel: el catálogo no declara relación padre-hijo entre ambos. Contrastar cada `familyId` con family registry/blueprint/engine como registro separado; documentar faltantes o cobertura múltiple sin inventar mapeos ni cambiar el catálogo.
4. Matriz estática para cada ID: canonical, area, familyId, estrategia, secciones, fields, annex/source compatibility, capabilities, product/functional/human status, prueba evidencia y motivo de bloqueo. Aislar 12 no certificados y que no haya PASS ni capability implícita.
5. Construir baseline de gates/export existentes por code y outcome DRAFT/FINAL. No ejecutar ni editar producción como parte de esta fase documental.

**Salida/gate:** tablas reproducibles + owners y todos los tipos mapeados. Si hay ID no trazable, relación de family no consensuada o diff local conflictivo, detener esa rama y presentarla para decisión; no declarar cobertura completa.

### Fase 1 — Contratos de tipo/familia y evaluador de requisitos

1. Añadir primero tests rojos para exhaustividad de ID, family/type compatibility, predicados allowlisted, estados REQUIRED/CONDITIONAL/N/A/UNKNOWN y `UNKNOWN != NOT_APPLICABLE`.
2. Implementar contratos/registry puros donde encaje con catálogo y `writingContract`; tipo no configurado falla de forma estable, sin fallback a `escrito_libre`.
3. Agregar entradas de contrato solo con fuentes operativas o jurídicas justificadas y versionadas; no fabricar requisitos legales para los 278. Por cada regla jurídica, enlazar autoridad oficial, vigencia, ámbito y aceptación; pedir abogado para reglas materiales.
4. Verificar dinámicamente que cada visible ID tenga un contrato de tipo, familia, strategy/blueprint y outputs explícitos, o un estado bloqueado que explique por qué.

**Dependencia:** inventario de Fase 0 con los 91 `familyId` delimitados como agrupaciones de contrato.  
**Salida:** registry determinista y cobertura catalogada; sin providers/DB.

### Fase 2 — Régimen, preflight y generación controlada

1. Testear régimen desconocido/conflictivo, jurisdicción/etapa/órgano mismatched y reglas de temporalidad/transitorio sin fuentes verificadas.
2. Implementar evaluador puro de cada RequirementRule y `PreflightReport`; resultados separados por draft readiness y final blockers.
3. Conectar intake actual y pipeline directo/background al mismo evaluador pre-provider; validar inputs requeridos por tipo/familia y bloquear únicamente las proposiciones/operaciones dependientes.
4. `BLOCKED_SUBSTANTIVE` previene invocación que redactaría contenido sustantivo y, sin excepción, su export. `DRAFT_LIMITED` envía al plan solo IDs/partes seguras y conserva campos pendientes marcados.
5. Implementar deadlines como assessments deterministas con fuente, trigger, regla temporal, cálculo y estado; sin resolver todas las premisas no se exhibe plazo afirmativo.

**Dependencia:** Fase 1.  
**Salida:** preflight con comportamiento idéntico en rutas directas/job y sin cambiar proveedor.

### Fase 3 — Provenance, consistencia, gates y trace

1. Add tests para afirmaciones clasificadas, `EvidenceMention` vs `EvidenceOffer`, claims con source spans y contradicciones cruzadas.
2. Mapear finding codes a proposición/claim/issue y extender `DocumentAssembly`/QualityGate/trace aditivamente. Nunca eliminar sección entera por un finding local; tests demuestran supervivencia de bloques adyacentes válidos.
3. Añadir consistencia hechos-defensa-prueba-autoridad-petición-actuación y statuses reproducibles. Cero findings nuevos alteran gates existentes a PASS de forma manual.
4. Verificar eventos e inputs de trace sanitizados, hashes/versiones, tiempos de consulta y ledger de deadline sin guardar texto confidencial innecesario.

**Dependencia:** Fases 1 y 2.  
**Salida:** diagnóstico reproducible conectado a los gates actuales.

### Fase 4 — Autorización de exportación DRAFT/FINAL

1. TDD para tabla finding→`FATAL_BOTH`, `FINAL_ONLY`, `WARNING_RETAINED_DRAFT`; auditoría de cada código actual de `validateForExport` y checks comerciales/contestación/civil antes de cambiar guards.
2. Actualizar aviso DRAFT visible a `BORRADOR — PENDIENTE DE REVISIÓN`; asegurar que el contenido completo de avisos/pending se serializa y se presenta en Word y PDF, incluso en export DRAFT limitado. Confirmar el formato de aviso sin depender de headers.
3. Implementar un `exportMode` explícito en guard común y rutas. DRAFT se descarga solo si `READY_FOR_DRAFT`/`DRAFT_LIMITED`, documento no vacío/generado y ningún finding fatal; export no promociona lifecycle.
4. Mantener renderizadores low-level aislados: reciben un documento guard-preparado, no una vía para convertir `BLOCKED_SUBSTANTIVE` o raw source en binario. Mantener rechazo de `renderedSections` legacy y source-only guard en DOCX/PDF.
5. Investigar ownership y persistencia actuales del documento para auditoría FINAL. Intentar reaprovechar solo un canal durable existente que pueda registrar actor autenticado, server time, hash exacto y evento no falsificable por payload. No tocar tablas ni Prisma. Si no hay canal, presentar bloqueo FINAL sin implementar persistencia nueva.
6. Con mecanismo existente verificado, requerir aprobación antes de transicionar a FINAL y reevaluar documento/revisión, actor, permiso y TODOS los gates a exportar. Aprobar no neutraliza gate faltante/fallido; hashes distintos invalidan approval.
7. Crear pruebas unit/integration de F1–F4 y D1–D4 primero en DOCX y PDF; inspeccionar el contenido extraído del DOCX y texto/objeto renderizado real de PDF.

**Dependencia:** preflight disponible; fase 0 baseline de guards.  
**Salida:** matriz de autorización independiente y fail-closed. Sin aprobación auditable disponible, únicamente DRAFT llega a done y FINAL permanece bloqueado.

### Fase 5 — Catálogo por familia, fixtures sintéticos y recorrido por familia

1. Para cada familia conciliada, generar al menos un caso sintético `READY_FOR_DRAFT` y, donde proceda, uno `DRAFT_LIMITED` o explícitamente bloqueado. Los contratos específicos de tipo con variación material tienen prueba propia.
2. Ejecutar e2e determinista de pipeline desde tipo seleccionado a plan/tasks/gates, trazas y exportaciones. Todos los IDs quedan contados; los no-certificados generan el error de producto esperado, no fallback.
3. Pruebas multi-jurisdicción solo para reglas configuradas y fuente oficial que pueda verificarse offline mediante fixture con consulta/version/source/date explícitos; fixtures no simulan evidencias como reales.
4. Reporte de porcentajes por familia/type, capabilities/gates, DRAFT vs FINAL y diferencias frente al baseline; PASS solo con output real de tests y artefactos inspeccionados.

**Dependencia:** fases 1–4, gate de export resuelto.  
**Salida:** censo completo y pruebas por familia/tipo, sin afirmar que presencia equivale a calidad jurídica.

### Fase 6 — Compatibilidad, regresión y cierre para revisión

1. Correr suite focal por componente y baseline comparativo de tests/gates. No editar o borrar pruebas no relacionadas para lograr verde.
2. Ejecutar `npm run typecheck`, suite offline acordada y `npm run build` solo según AGENTS (detener servidor dev antes build y no matar proceso DLL); guardar cada comando/resultado. Visual UI limitada a campos de preflight si se tocaron.
3. Verificar hashes/estado de todo cambio local baseline, registrar los nuevos archivos de manera separada y confirmar ningún provider/Prisma/migración/archivo no autorizado cambió.
4. Actualizar audit/spec con PASS/FAIL/BLOCKED/NOT RUN por cada family y caso DRAFT/FINAL DOCX/PDF. Si la aprobación auditable queda bloqueada, declarar FINAL NO CUBIERTO.

**Dependencia:** fases anteriores.  
**Salida:** evidencia y reporte para review; no commit. El documento oficial no se habilita si algún gate/approval queda sin evidencia.

## Matriz de pruebas prevista

| Grupo | Herramientas/archivos | Fixture/variantes | Resultado requerido |
|---|---|---|---|
| Catálogo 278 | `tests/catalog/writingTypeContract.test.ts`, nuevo family contracts test, snapshot inventory | todo ID, alias, variantes, family/blueprint, status | 100% clasificado; 0 huérfano/dup/fallback; delta reportado; 12 no certificados permanecen bloqueados según capability vigente |
| Requisitos y preflight | nuevo `documentPreflight.test.ts`, `writingContractAndDossier.test.ts` | REQUIRED, conditional true/false/unknown, N/A, unknown, conflictos, jurisdicción/órgano/etapa | outputs reproducibles; unknown nunca N/A; decisión por operation explícita |
| Régimen/ley/plazos | tests research/readiness/authority/deadline existentes y fixtures sintéticos | fuente oficial/versiones vigente/histórica/transitoria, invalidez/no consultable, trigger incompleto | citas y fechas sin fuente completa UNKNOWN/UNVERIFIED y sin afirmación definitiva |
| Facts/Coverage/consistency | tests fact claim, rich coverage, authority gates, assembly y trace | documented/source allegation/inference/pending; mention/offer; contradicción entre entities | solo claims sustentados pasan; finding puntual; bloque adyacente válido se conserva |
| DRAFT DOCX | `draftExportRealRoutes`, `unsavedDraftExport`, `exportReviewOverride`, `exportFormatParity`, nuevo synthetic fixture | READY/LIMITED antes de approval; pending warnings; gate FINAL-only false; BLOCKED_SUBSTANTIVE; source-only; empty/truncated | binario descargable READY/LIMITED con aviso exacto/pending; bloqueos no bypass; sin lifecycle promotion |
| DRAFT PDF | mismas rutas más `pdfExport`, `exportFormatParity`, `draftExportRecovery` | mismas variantes que DOCX | mismos permisos, texto de aviso visible dentro del PDF, mismas advertencias/pending y fatality |
| FINAL DOCX | nueva route test + `documentLifecycle`, `finalDocumentMaterializationGate`, `compatibilityExport` | no approval, wrong actor, wrong hash/revision, any pending gate, valid approval | falla fail-closed salvo revisión aprobada exacta y todos gates; no DRAFT stamp en success |
| FINAL PDF | misma route test y tests PDF materiales | no approval, wrong actor/hash, gates pendientes, approval válida | política idéntica a DOCX; aprobación no salta gates; bytes PDF reales |
| Renderer/legacy boundary | `loop8bPhase2aExportGuards`, `legacyExportBoundary`, new format parity | DRAFT guard-prepared frente a raw document; `renderedSections`; source document | raw bypass bloqueado; public route controla modo; no regress final-only materializer |
| Regresión/integración | suites focales + Vitest offline + typecheck/build autorizados | working baseline contra after; UI solo si change | cero degradación atribuible; fallos preexistentes y ambientales diferenciados |

## Decisiones o desbloqueos que pueden requerir aprobación separada

1. Si se confirma que actor/time/hash requieren nuevas tablas/campos, Prisma o cambios a la persistence boundary, pedir autorización por separado; mientras tanto FINAL permanece bloqueado.
2. Cualquier provider, nuevo adapter de fuentes, endpoint externo o transferencia de expediente queda fuera de scope y requiere autorización.
3. Borrar/renombrar/fusionar tipos o cambiar capabilities para los 278 requiere aprobación después de ver la matriz; el plan no infiere que se deba hacer ni deriva esas acciones de los 26 `familyIdentifiers`.
4. Reglas sustantivas de familia/tipo que requieran juicio jurídico deben ser revisadas/confirmadas por abogado; el plan no adopta códigos, plazos ni petitorios del informe de origen.
5. Si un archivo con cambios locales (sobre todo `pipeline.ts`, UI/intake y `.env.example`) es imprescindible y no se puede editar en un diff quirúrgico, detener esa tarea y pedir dirección; no copiar versión upstream ni reorganizar el archivo.

## Criterio de salida de este plan

Entregar todas las etapas con resultados trazables por ID y formato; mantener el archivo oficial fail-closed cuando aprobación auditable o cualquier gate no esté demostrado; presentar únicamente después de completar verificación y revisión para nueva aprobación humana. Este plan queda pendiente de aprobación y **no autoriza implementación**.
