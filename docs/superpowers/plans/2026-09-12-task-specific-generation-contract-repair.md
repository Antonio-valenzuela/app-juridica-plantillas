# Plan: TASK-SPECIFIC GENERATION CONTRACT REPAIR

## Goal

Repair the task-specific generation contract so that a descriptive `FACT_DISPUTE` backed by an `ESTABLISHED_FACT` in a `FACT_RESPONSE` section can materialize a source-backed descriptive block without inventing client position or argumentative fields, while preserving the existing fail-closed argumentative contract.

## Architecture

Reuse the existing `SectionContract.contentRole` derived by `documentSectionContracts.ts`. Propagate that derived role into the issue context pack, select a contract deterministically from section role plus issue semantics, emit a contract-specific JSON schema/prompt, validate/materialize against that contract, and evaluate/render descriptive blocks without applying argument-only requirements. Unknown or mixed semantics remain blocked before provider invocation.

## Tech Stack

- TypeScript, Vitest, Next.js/Node runtime
- Existing legal-engine pipeline, rich `LegalIssueMatrix`, `CoverageMatrix`, `SectionContract`, `IssuePrompt`, and issue-scoped trace
- Controlled provider invoker for RED/GREEN and synthetic E2E
- Exactly one real NVIDIA attempt against the supplied real PDF/task after GREEN, with no model, timeout, retry, or temperature changes

## Spec

### Contract selection

1. `FACT_RESPONSE` + `FACT_DISPUTE` + one or more linked facts all marked `ESTABLISHED_FACT` selects `DESCRIPTIVE`.
2. Existing issue/argument/evidence/petition/procedural paths retain `ARGUMENTATIVE` unless their semantic inputs are unknown or mixed.
3. A source assertion/unknown fact without a confirmed client position, a mixed fact set, formal/closing/custom issue generation, or an unresolvable section role fails closed before the model call.
4. No new `GenerationTask` property is added when the role is derivable from the document section and coverage matrix.

### Model contract

- `ARGUMENTATIVE`: preserve required `thesis`, `application`, and `conclusion`, plus the existing required arrays and strict allowlists.
- `DESCRIPTIVE`: require non-empty source-backed `factualDevelopment` and allowlisted `sourceEntityIds`; permit empty `evidentiaryDevelopment`/`legalDevelopment` only when the linked context does not require them; exclude argument-only fields from the schema and validator.
- System-owned IDs, coverage IDs, issue type, generation metadata, and context hash remain derived/immutable.
- Unknown fields, out-of-scope IDs, placeholders, unsupported semantics, and unresolved substantive requirements continue to fail closed.

### Semantic evaluation and rendering

- Keep the existing argumentative completeness/application checks unchanged for `ARGUMENTATIVE`.
- Evaluate descriptive factual grounding and linked-source coverage conditionally, without `APPLICATION_MISSING` or argument-only completeness failures.
- Render descriptive blocks as source-backed factual/evidentiary/legal development without `CUESTIÓN`, `APLICACIÓN`, or `CONCLUSIÓN` labels; preserve trace, provenance, and assembly gates.

## Global constraints

- Do not edit `generationTasks.ts` unless a fresh causal regression proves it is required.
- Do not globally make `thesis`, `application`, or `conclusion` optional.
- Do not change NVIDIA model, timeout, retry, temperature, fallback, or `.env` configuration.
- Do not touch deferred Antecedentes coverage binding, evidence true mentions/offers, or historical F5B failures.
- Do not add an UltraReview workflow; `.github/workflows/ultrareview.yml` is not configured.
- Do not claim whole-document completion from one repaired section.

## Implementation sequence

### Task 1 — RED contract regression

Add a focused test fixture to `tests/legal-engine/issueScopedGeneration.test.ts` with a `FACT_RESPONSE` section, linked `ESTABLISHED_FACT`, `FACT_DISPUTE` in `READY` state, and a controlled provider returning only source-backed descriptive fields. Expect acceptance under `DESCRIPTIVE`; run it before production changes and record the current rejection caused by empty argument fields. Add/retain a companion regression proving an argumentative task missing `thesis`/`application`/`conclusion` still fails.

### Task 2 — Propagate and select the contract

Export the existing section-role derivation through `documentSectionContracts.ts`. Add the derived role to `IssueContextPack` and implement a pure contract selector in `issueScopedGeneration.ts` (or the nearest existing issue-contract module). Return a blocked outcome for unresolved/mixed semantics before provider invocation.

### Task 3 — Make validation/schema contract-specific

Extend `IssuePrompt` and `buildIssuePrompt` with `draftContract`, emitting the strict descriptive schema/directive only for the selected descriptive case. Extend `IssueDraftModelOutput` validation and materialization in `issueDraftResult.ts` with a discriminated contract while keeping the canonical result fields stable for compatibility. Preserve system-owned identity/metadata and strict allowlists.

### Task 4 — Contract-aware semantic evaluation and rendering

Update `semanticEvaluator.ts` and `issueDraftResult.ts` so descriptive validation/evaluation requires source-backed factual content and uses conditional completeness, while argumentative behavior remains unchanged. Render descriptive blocks without argument-only labels and retain existing `DraftBlock`, trace, readiness, and assembly behavior.

### Task 5 — GREEN and synthetic E2E

Run the focused unit/E2E suite with deterministic provider settings, then the synthetic real-PDF path with the existing marker and assertions through provider request, JSON/schema validation, materialization, semantic evaluation, `DraftBlock`, editor, and assembly. Verify the argumentative regression and all existing issue-scoped tests.

### Task 6 — One real NVIDIA retry and verification

Using the same real PDF and `fact-1`/`SENTENCIA RECURRIDA` target, perform one real NVIDIA attempt only after GREEN. Capture field state/character counts, contract/schema/JSON/validation/semantic/materialization/assembly evidence without exposing legal content or secrets. If the repaired block reaches the editor, run the requested global verification commands and report historical failures separately.

### Task 7 — Review and Napkin curation

Perform an inline diff/guard review, verify no unrelated production files changed, and add only reusable causal guidance to `.claude/napkin.md`. Report exact `contract → file → test → PASS`, direct versus inherited evidence, deferred gaps, UltraReview configuration status, and the permitted final verdict.
