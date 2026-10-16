# Baseline de catálogo y working tree — 2026-10-15

Generado: 2026-10-15 13:07:13 -06:00  
Rama: codex/version-2  
Commit HEAD: 273618365167ed9c66fe346de50954e03621e155  
Fuente del censo: visibleWritingTypes() y writingTypeCensus() en lib/catalog/writingTypeIdentity.ts. Snapshot íntegro: audit/catalog-visible-inventory-2026-10-15.json.

## Censo vigente al iniciar especificación/plan

- Tipos visibles/canónicos: 278 (222 identidad canonical + 56 variantes materializadas por familia).
- Aliases registrados aparte: 3; `familyIdentifiers`: 26 IDs de nodos `FAMILY` de otro nivel. Los 91 `familyId` son agrupaciones de tipos; no hay relación padre-hijo declarada entre ambos. Los contratos por familia se basarán en los 91 `familyId`.
- Generables/DRAFT-capable y functional PASS: 266.
- Implemented but uncertified / functional FAIL: 12; no implementados: 0.
- IDs duplicados, huérfanos, blueprints faltantes, strategies faltantes, fallbacks incorrectos y secciones requeridas vacías: 0.
- Los 278 tienen humanReview=PENDING; finalEligible no se habilita por el tipo.

Estos conteos describen el catálogo actual; no prueban cobertura jurídica ni exportación end-to-end.

## Working tree capturado antes de planificar cambios de código

Comando: git status --short --untracked-files=all

----- STATUS BEGIN -----
 M .env.example
 M README.md
 M app/globals.css
 M app/machotes/components/CaseDocumentsReader.tsx
 M app/machotes/components/CaseDossierPanel.tsx
 M app/machotes/components/ReviewAnnexPanel.tsx
 M app/machotes/page.tsx
 M docs/extension-del-escrito.md
 M lib/ai/localRulesProvider.ts
 M lib/ai/router.ts
 M lib/legal-engine/caseContext.ts
 M lib/legal-engine/caseDossier.ts
 M lib/legal-engine/caseFichaDetection.ts
 M lib/legal-engine/contestacionStructure.ts
 M lib/legal-engine/factsSeed.ts
 M lib/legal-engine/legalDocumentSanitizer.ts
 M lib/legal-engine/partyExtraction.ts
 M lib/legal-engine/pipeline.ts
 M lib/legal-engine/reviewAnnex.ts
 M tests/legal-engine/factsSeed.test.ts
 M tests/ui/documentEditorScrollFrame.test.ts
?? app/machotes/components/RequirementsDialog.tsx
?? docs/blueprints/generador-universal-escritos-blueprint-2026-10-15.md
?? lib/legal-engine/sourceNoise.ts
?? tests/components/requirementsDialogFlow.test.tsx
?? tests/fixtures/sentenciaAmparoDirectoSintetica.ts
?? tests/legal-engine/dossierExtractionGeneral.test.ts
?? tests/tmp/dbg.test.ts
?? tests/tmp/repro.test.ts
----- STATUS END -----

Estadística de diffs tracked (git diff --stat):

----- DIFF STAT BEGIN -----
 .env.example                                    | 23 +++++--
 README.md                                       | 52 +++++++++++----
 app/globals.css                                 | 88 ++++++++++++++++++++++++-
 app/machotes/components/CaseDocumentsReader.tsx | 36 ++++++++--
 app/machotes/components/CaseDossierPanel.tsx    | 78 +++++++++++++---------
 app/machotes/components/ReviewAnnexPanel.tsx    |  6 +-
 app/machotes/page.tsx                           | 25 +++----
 docs/extension-del-escrito.md                   |  2 +-
 lib/ai/localRulesProvider.ts                    |  2 +-
 lib/ai/router.ts                                |  2 +-
 lib/legal-engine/caseContext.ts                 |  3 +-
 lib/legal-engine/caseDossier.ts                 | 88 +++++++++++++++++++++----
 lib/legal-engine/caseFichaDetection.ts          |  6 +-
 lib/legal-engine/contestacionStructure.ts       | 41 ++++++++++--
 lib/legal-engine/factsSeed.ts                   |  3 +-
 lib/legal-engine/legalDocumentSanitizer.ts      |  5 +-
 lib/legal-engine/partyExtraction.ts             | 77 ++++++++++++++++++++--
 lib/legal-engine/pipeline.ts                    | 10 ++-
 lib/legal-engine/reviewAnnex.ts                 | 32 ++++++++-
 tests/legal-engine/factsSeed.test.ts            |  6 +-
 tests/ui/documentEditorScrollFrame.test.ts      | 19 ++++++
 21 files changed, 492 insertions(+), 112 deletions(-)
----- DIFF STAT END -----

El estado incluye archivos modificados y no rastreados observables por Git. No muestra archivos ignorados; tampoco había entradas staged en esta captura. Los artefactos bajo audit/ son ignorados por la regla existente de .gitignore; no se cambió esa regla. No se modificó, movió, limpió ni guardó nada del trabajo local preexistente; no se hicieron commits.
