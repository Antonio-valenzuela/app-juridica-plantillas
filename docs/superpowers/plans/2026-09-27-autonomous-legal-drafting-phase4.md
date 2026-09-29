# Autonomous Legal Drafting Phase 4 Implementation Plan

> **For agentic workers:** Execute task-by-task with RED, minimal GREEN, verification, and a review of the real output. Do not commit or publish case data.

**Goal:** Produce source-grounded, non-fabricated review drafts from a plaintiff-only expediente and distinguish real depth between two modes when evidence permits.

**Architecture:** Extend the existing `runGenerationPipeline`, CaseAnalysis, plan, section generation, research, validation and exporters. Keep Prisma and existing legal gates. Add an explicit neutral allegation-analysis path while reserving assertions of client fact or legal authority for confirmed/verifiable material.

**Tech Stack:** Next.js 16.3.4, TypeScript, React 19, PostgreSQL/Prisma 6, Vitest, existing DOCX/PDF exporters.

**Spec:** `docs/blueprints/autonomous-legal-drafting-phase4.md`.

## Global constraints

- One local lawyer; no Windows installer, roles, teams or SaaS billing.
- No production database writes from `Datos.zip`; the six hash-pinned inputs stay in `audit/`.
- No case-document upload to external model providers in automated tests. Keys must be suppressed before imports, not merely within tests.
- Source allegation is not an admitted client fact. Secondary legal sources are discovery, not verified citations.
- DRAFT may require review; FINAL stays fail-closed. Page targets never justify padding.
- Preserve current working-tree changes and existing exporter/UI contracts.

## Task 1 — Classified allegations and neutral draft treatment

**Files:** `lib/legal-engine/legalDocumentPlan.ts`, `lib/legal-engine/pipeline.ts`, `tests/legal-engine/legalDocumentPlanPhase3.red.test.ts`, new `tests/legal-engine/autonomousAllegationDraft.phase4.test.ts`.

**Produces:** a fact row that names source role and neutral-analysis eligibility without `lawyerPosition`; section text that quotes the relevant allegation and states its evidentiary status, with no invented response. Explicit `lawyerPosition` remains authoritative.

- [ ] Test with a plaintiff-source fact: no `ADMIT`/`DENY` or client assertion appears; source/page are retained; a review item remains.
- [ ] Run the test and record its expected failure.
- [ ] Implement the smallest source-role/neutral-text change in the existing matrix/generation path.
- [ ] Run focused old and new tests; inspect diff for leak of source text as instructions.

## Task 2 — Coverage without false admissions

**Files:** `lib/legal-engine/generationExpansion.ts`, `lib/legal-engine/coverageMatrix.ts`, corresponding tests.

**Produces:** eligible legal analysis of unresolved allegations only if linked to source and section, while `requiresClientPosition` remains unresolved for factual response/FINAL. No coverage item becomes `covered` merely by printing source text.

- [ ] RED: plaintiff-only source supports an analysis packet but cannot mark a client-position item complete.
- [ ] GREEN: add typed support category and packet consumption; preserve deduplication and provider limits.
- [ ] Verify synthetic end-to-end DRAFT and unchanged FINAL failure.

## Task 3 — CaseModel, multiple sources, issue context

**Files:** `lib/legal-engine/caseAnalysis.ts`, `sourceGrounding.ts`, `sectionContextAssembly.ts`, tests.

**Produces:** immutable source-role/fact/evidence/claim-element links with stable IDs and contradiction flags. Existing single-source inputs still work.

- [ ] RED: two documents with incompatible accounts retain each provenance and an unresolved contradiction.
- [ ] GREEN: build a serializable model from existing rich analysis, without altering source material.
- [ ] Verify source-to-output consistency and multi-document rerun.

## Task 4 — Verified official research in real flow

**Files:** `lib/legal-engine/pipeline.ts`, existing `legal-research` adapters/contracts, tests.

**Produces:** issue-scoped official candidates and verified authority objects in the real generation path, or an explicit `NOT_VERIFIED` result. Sanitized research queries must not contain client PII.

- [ ] RED: a source-mentioned but unverified statute cannot be cited as verified or export FINAL.
- [ ] GREEN: wire the existing adapter chain and verification with trace; record unavailable official service.
- [ ] Verify only against official test fixtures and an explicitly separated live availability check.

## Task 5 — Different substantive depths and checkpointing

**Files:** existing `draftDepth.ts`, `generationExpansion.ts`, `sectionGeneration.ts`, `generationJobPersistence.ts`, tests.

**Produces:** mode 40 consumes additional unique issue/evidence/authority packets; mode 20 stays concise. Resume reuses completed sections only when input hash and plan version match.

- [ ] RED: same supported synthetic case differs in material issues without duplication; timeout-late-complete is rejected.
- [ ] GREEN: adapt existing budgets and checkpoints rather than add an engine.
- [ ] Verify no padded pages and stable terminal job status.

## Task 6 — UI, twelve real runs, visual review, report

**Files:** existing `CaseDocumentsReader.tsx`, `ContestacionesConfigPanel.tsx`, audit runner, `PHASE4_AUTONOMOUS_LEGAL_DRAFTING_REPORT.md`.

**Produces:** straightforward upload→generate→review; six `EXTENSIVE_40` then same six `PROFESSIONAL_20`, DOCX/PDF/renders, timing and gate evidence.

- [ ] Test visible needs-review/error/cancel/resume states and mode selection.
- [ ] Run six+six with provider keys disabled before module loading and database isolated. Record one JSON/MD result per case and hashes of source/output.
- [ ] Render every DOCX/PDF page; inspect typography, hierarchy, markers, parity, and compare the two supplied reference documents for style only.
- [ ] Run focused/global Vitest, typecheck, lint, build and browser workflow; document exact pass/fail/skips.
- [ ] Write report with BEFORE/AFTER, files, RED/GREEN, per-case matrix, unresolved risks and explicit readiness decision. Do not claim the attorney has approved it.
