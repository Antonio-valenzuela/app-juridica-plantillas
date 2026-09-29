# Final Generator Coverage and Materialization Repair Plan

> **For agentic workers:** Execute each task in order in the current working tree. Keep every existing user change; do not commit or push.

**Goal:** Repair the seven evidenced failures in Case 01 generation so grounded planned content reaches the assembled and exported legal draft, then run the authorized Case 01 EXTENSIVE_40 E2E only after focused gates pass.

**Architecture:** Preserve the current provider chain, task planner, Prisma persistence, and generator boundaries. Trace existing coverage IDs through plans, tasks, outcomes, blocks, assembly, and exports; fix only proven loss boundaries, with non-final content retained for lawyer review rather than promoted to final legal truth.

**Tech Stack:** TypeScript, Vitest, existing legal-engine generation pipeline, existing DOCX/PDF exporters.

**Spec:** User-provided continuation prompt for `final-validation-01-EXTENSIVE_40-2026-09-28T19-21-51`.

## Global Constraints

- Do not change providers, models, provider order, quotas, Ollama configuration, or `maxCallsPerDocument`.
- Do not run another E2E until tasks 1–7 and focused tests/typecheck pass.
- Do not invent facts, authorities, client positions, or formal details; preserve fail-closed legal grounding and review states.
- Use the current dirty working tree; do not reset, commit, push, migrate to Windows, or perform a general app audit.
- Follow `RED → minimal fix → GREEN` for each proven behavior; only then run the single authorized Case 01 EXTENSIVE_40 validation.

---

### Task 1: Trace rich coverage from source item through export

**Files:** `lib/legal-engine/richCoverage.ts`, `lib/legal-engine/generationTasks.ts`, `lib/legal-engine/issueScopedGeneration.ts`, `lib/legal-engine/pipeline.ts`, `lib/legal-engine/documentAssembly.ts`; tests in `tests/legal-engine/richCoverageQualityTrace.test.ts`, `tests/legal-engine/richGenerationTasks.test.ts`, and `tests/legal-engine/documentAssemblyTrace.test.ts`.

- [ ] Use the existing completed run artifacts to create a diagnostic row for every CoverageItem with planned section, task, outcome, block, assembled/exported state, and exact drop reason.
- [ ] Add a regression assertion for the first evidenced broken edge in the CoverageItem-to-export chain and verify it fails before production edits.
- [ ] Make the minimal source-grounded correction at that edge; do not make pending coverage appear satisfied without valid substantive content.
- [ ] Run the focused coverage trace, task, and assembly tests; preserve the 87-item diagnostic as a test artifact/report.

### Task 2: Preserve valid non-final provider content through materialization

**Files:** `lib/legal-engine/issueScopedGeneration.ts`, `lib/legal-engine/pipeline.ts`, `lib/legal-engine/documentAssembly.ts`; tests in `tests/legal-engine/issueScopedGeneration.test.ts` and `tests/legal-engine/documentAssembly.test.ts`.

- [ ] Add a failing behavior test for a grounded `VALID_NON_FINAL` provider response reaching a visible draft block with its review status and source IDs intact.
- [ ] Fix only the transition that drops or loses that content; keep semantic failures, unsupported facts, and unresolved blockers fail-closed.
- [ ] Run the focused issue generation and assembly tests.

### Task 3: Continue incomplete supported sections when budget remains

**Files:** `lib/legal-engine/generationExpansion.ts`, `lib/legal-engine/generationExtension.ts`, and the actual pipeline call site in `lib/legal-engine/pipeline.ts`; tests in `tests/legal-engine/generationExpansionPhase3.red.test.ts`, `tests/legal-engine/generationExtension.test.ts`, and `tests/legal-engine/finalContentStopReason.test.ts`.

- [ ] Add a failing test where supported required content remains, a response is valid but incomplete, and both call and token budgets remain; assert a continuation is scheduled.
- [ ] Implement continuation based on the missing legal requirement and available budgets, not page count or a fabricated word target.
- [ ] Run the focused expansion, extension, and stop-reason tests.

### Task 4: Retain the required Derecho section when legally applicable

**Files:** `lib/legal-engine/contestacionStructure.ts`, `lib/legal-engine/legalDocumentPlan.ts`, `lib/legal-engine/documentRouting.ts`, and the relevant planning/assembly call sites; tests in `tests/legal-engine/contestacionStructure.test.ts` and `tests/legal-engine/legalDocumentPlanPhase3.red.test.ts`.

- [ ] Add a failing test that a contestación requiring legal grounds plans and assembles a `DERECHO` section with only verified authorities and explicit rule/application/conclusion content.
- [ ] Fix the narrowly proven omission while preserving authority verification and never pasting unsupported jurisprudence.
- [ ] Run the focused structure and document-plan tests.

### Task 5: Prevent secondary unresolved formal fields from deleting whole sections

**Files:** `lib/legal-engine/contestacionStructure.ts`, `lib/legal-engine/documentAssembly.ts`, and the actual formal-block construction path in `lib/legal-engine/pipeline.ts`; tests in `tests/legal-engine/contestacionStructure.test.ts` and `tests/legal-engine/documentAssembly.test.ts`.

- [ ] Add failing tests for Proemio, Comparecencia, and Objeto when party/court data is present but a secondary formal field is unresolved.
- [ ] Propagate source-present values; where a secondary field is genuinely absent, retain safe reviewable formal text and disclose only that missing field instead of excluding the entire section.
- [ ] Run the focused structure and assembly tests.

### Task 6: Account for words at generation, validation, materialization, assembly, and export boundaries

**Files:** `lib/legal-engine/generationTasks.ts`, `lib/legal-engine/issueScopedGeneration.ts`, `lib/legal-engine/pipeline.ts`, `lib/legal-engine/documentAssembly.ts`, `lib/legal-engine/finalDocumentMaterialization.ts`, and the existing generation trace/report builder; tests in `tests/legal-engine/pipelineTrace.test.ts` and the focused coverage/assembly tests.

- [ ] Add a failing test with a fixed text fixture that asserts exact per-section word counts and an explicit loss reason at each boundary.
- [ ] Record actual text counts for generated, validated, materialized, assembled, and exported content; distinguish provider text from deterministic fallback and never infer counts from token or page budgets.
- [ ] Run the focused trace/assembly tests and produce the requested per-section accounting table from existing run artifacts where fields are available.

### Task 7: Make the stop reason reflect unresolved work and exhausted resources

**Files:** `lib/legal-engine/generationExpansion.ts`, `lib/legal-engine/pipeline.ts`; tests in `tests/legal-engine/finalContentStopReason.test.ts` and `tests/legal-engine/generationExpansionPhase3.red.test.ts`.

- [ ] Add a failing test that pending supported content plus available continuation/call budget cannot return `CONTENT_LIMIT_REACHED`.
- [ ] Return `RESOURCE_LIMIT`, `PROVIDER_UNAVAILABLE`, or another existing precise reason when generation stopped for a technical/resource cause; allow `CONTENT_LIMIT_REACHED` only after supported content and reasonable continuation resources are exhausted.
- [ ] Run focused stop-reason tests, the relevant test groups, and `npm run typecheck`.

### Final Case 01 validation gate

- [ ] Confirm all seven focused regression groups and typecheck pass in the current tree.
- [ ] Run only `CASE=01 DEPTH=EXTENSIVE_40 npx vitest run tests/e2e/finalGeneratorValidation.test.ts` using the unchanged configured provider chain.
- [ ] Inspect its immutable report, full trace, generated JSON, DOCX, and actual PDF; mark `CASE_01_GENERATOR_PASS` only if structural, grounding, authority, and professional-output criteria pass. Otherwise report only which of the seven blockers remains broken, with evidence.
