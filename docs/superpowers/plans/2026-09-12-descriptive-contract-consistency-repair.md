# DESCRIPTIVE Contract Consistency Repair Implementation Plan

> **For agentic workers:** Execute this plan inline with TDD checkpoints; keep the task-specific generation contract fail-closed.

**Goal:** Reconcile the DESCRIPTIVE model-output contract with the demonstrated semantics of an established fact response, then verify the same real PDF task through one controlled run and one real NVIDIA attempt.

**Architecture:** Derive field requirements from the existing `IssueContextPack` semantics rather than adding a `GenerationTask` property. A small canonical requirement descriptor will drive the descriptive prompt text, JSON schema, model validator, canonical materialization, and semantic checks; the argumentative contract remains unchanged.

**Tech Stack:** TypeScript, Vitest, Next.js legal-engine modules, NVIDIA provider seam, PowerShell verification.

**Spec:** `C:/Users/yahir/.codex/attachments/acf35a15-be0d-4fc3-bcde-4d9554addd9f/pasted-text.txt`

## Global Constraints

- Preserve `documentIndex.ts`, `candidateSegmentation.ts`, `conflicts.ts`, `facts.ts`, `generationTasks.ts`, FASE 6, FASE 7, UI, export, and Windows/Desktop.
- Keep `legalIssueId`, `coverageItemIds`, `issueType`, `generationMetadata`, and `contextHash` system-owned.
- Keep source, authority, verified-authority, research, and unresolved-requirement validation fail-closed.
- Keep `thesis`, `application`, `conclusion`, and existing legal-development requirements strict for ARGUMENTATIVE tasks.
- Do not add or modify UltraReview configuration.
- Use the existing PDF/task and make at most one real NVIDIA call after GREEN.

---

### Task 1: Audit semantic requirements and capture the current RED

**Files:**
- Read: `lib/legal-engine/richCoverage.ts`, `lib/legal-engine/legalIssueMatrix.ts`, `lib/legal-engine/issueScopedGeneration.ts`, `lib/legal-engine/issueDraftResult.ts`, `lib/legal-engine/semanticEvaluator.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`
- Evidence: `scratch/real-pdf-descriptive-contract-retry.mts`

- [x] Verify the target Coverage item, section role, linked facts/evidence/arguments/authorities, and `requiresClientPosition` without printing legal content.
- [x] Record the exact prior unresolved-requirement enum from an available receipt; if the old receipt only has a count, capture the enum during the single new real attempt.
- [x] Write a failing test proving that an established-fact DESCRIPTIVE payload may omit a semantically non-applicable legal-development array while an empty factual development still fails.
- [x] Run the focused test and confirm the failure is the current `REQUIRED_ARRAY_INVALID:legalDevelopment` path.

### Task 2: Define one canonical descriptive field-requirement descriptor

**Files:**
- Modify: `lib/legal-engine/issueDraftResult.ts`
- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

- [x] Represent the demonstrated requirements as: factual development required and non-empty; evidentiary development required only when linked evidence exists and otherwise not applicable; legal development required only when linked authorities/source arguments exist and otherwise not applicable; source IDs required and allowlisted; authority IDs and unresolved requirements remain allowlisted status arrays.
- [x] Reuse that descriptor for descriptive prompt wording, schema `required`, model validation, and canonical materialization (`[]` only for a semantically non-applicable absent array).
- [x] Keep argumentative schema/validator/materializer behavior unchanged.
- [x] Add tests for absent/empty factual development, conditional legal/evidentiary development, unknown fields, identity protection, and unresolved-requirement handling.

### Task 3: Reconcile semantic evaluation and renderer

**Files:**
- Modify: `lib/legal-engine/semanticEvaluator.ts`
- Modify: `lib/legal-engine/issueDraftResult.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

- [x] Make descriptive semantic evaluation require source grounding, specificity, Coverage relevance, and no invention without treating non-applicable arrays as missing.
- [x] Preserve existing non-final/review behavior for allowed unresolved requirements; do not create a new permissive PASS path.
- [x] Render only non-empty descriptive headings.
- [x] Run focused GREEN checks.

### Task 4: Verify the real-PDF synthetic E2E

**Files:**
- Modify: `tests/e2e/generationTaskGranularityRealPdf.test.ts`

- [x] Use the exact minimal reconciled descriptive payload and marker `TEST-DESCRIPTIVE-CONTRACT-CONSISTENCY-XYZ`.
- [x] Verify provider → schema → validator → materializer → semantic → DraftBlock → assembly → editor with one scoped task.
- [x] Run the E2E test, typecheck, and focal lint.

### Task 5: One real NVIDIA retry and terminal classification

**Files:**
- Modify: `scratch/real-pdf-descriptive-contract-retry.mts`

- [x] Capture field presence, character counts, array lengths, exact unresolved enum values, selected schema, validation/materialization status, semantic status, DraftBlock, assembly, and editor status without storing secrets or full legal text.
- [x] Invoke the same real task exactly once with unchanged provider configuration.
- [x] If structurally valid, continue through DraftBlock/editor; if the consistent contract is violated, stop and classify the model behavior without another prompt tweak or retry.

### Task 6: Final verification and review

- [x] Run focused tests, typecheck, and focal/global lint as permitted by the real-provider terminal state.
- [x] Confirm frozen files and deferred work are untouched.
- [x] Confirm `.github/workflows/ultrareview.yml` is absent and report `NOT CONFIGURED`.
- [x] Complete inline code review and report exact contract → file/function → test → result evidence.
