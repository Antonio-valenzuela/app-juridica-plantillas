# FASE 6 — Document Assembly and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task, inline in the current workspace. Do not dispatch subagents, create worktrees, run Git operations, call providers, run research adapters, or run the full test suite.

**Goal:** Convert accepted FASE 5B blocks plus permitted formal/manual blocks into a deterministic, cross-block-validated and traceable legal-document candidate without adding research, provider calls, persistence, UI or DOCX/PDF rendering.

**Architecture:** Add a pure FASE 6 assembly layer beside the existing legal-engine modules. `DocumentPlanResult` remains the section-order authority; `ContentBlock` remains the runtime DraftBlock representation; existing Coverage policy, semantic evaluations, document validator, structural QualityGate and GenerationTrace are composed rather than replaced. Assembly and validation return new artifacts and never mutate FASE 5B inputs.

**Tech Stack:** TypeScript, existing Next.js legal engine, existing `DocumentPlan`, `CoverageMatrix`, `LegalIssueMatrix`, `ContentBlock`, `GenerationTask`, `IssueDraftValidationStatus`, `BlockQualityEvaluation`, `runQualityGateCheck`, `validateDocument`, `isCoverageSatisfied`, `GenerationTrace`, and Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-document-assembly-validation-spec.md`

## Global Constraints

- FASE 5B is closed. Do not change eligibility, research, adapters, provider execution, retries, semantic thresholds, `IssueDraftResult` validation, or `LegalIssueMatrix` construction.
- Do not re-audit FASE 0–5B except for the exact interfaces named in the spec.
- `DocumentPlanResult.sections` and `DocumentTemplate.estructura` are the canonical section order; `GenerationTask.order`/`orderInParent` and declarative plan indexes are the canonical block order.
- Never order by `createdAt`, `generatedAt`, `retrievedAt`, completion timestamp, provider completion order, or async array arrival order.
- Only `VALID_ACCEPTED` blocks with semantic `PASS` and no hard fail may satisfy substantive Coverage.
- `VALID_NON_FINAL`, `INVALID_*`, fallback, placeholder, seed, truncated, unresolved-dependency and substantive deterministic blocks never satisfy substantive Coverage.
- Deterministic blocks are allowed only where the section contract marks a formal requirement and the Coverage policy is `FORMAL_DETERMINISTIC_ALLOWED`.
- Preserve manual blocks; never overwrite a manual edit. Manual content is not substantive Coverage merely because it is present.
- `EvidenceMention` and `EvidenceOffer` remain separate. `SOURCE_CITED` remains unverified.
- Assembly performs zero provider, research, adapter, web, RAG, database, Prisma, Neon, NVIDIA, LocalProvider, DOCX, PDF or UI operations.
- New shared FASE 6 modules must contain zero imports of Node builtins (`node:crypto`, `crypto`, `node:fs`, `fs`, `node:path`, `path` or equivalent). Inspect and reuse the existing pure/browser-safe `stableResearchId`; if its input normalization is insufficient, use a small local canonical helper with no dependency or Node builtin. Fingerprints must ignore transient metadata, provider completion order and accidental order of semantically unordered collections, while preserving semantic document order.
- Capture FASE 5B accepted outputs into a non-destructive snapshot before any sanitizer. FASE 6 receives the original accepted/manual blocks and their issue/Coverage identity; the sanitizer may run only later on the authorized assembly copy with `dedupeBlocks: false` and may not decide legal identity, Coverage satisfaction or block survival.
- Final pipeline completeness is gated by the final FASE 6 result: `BLOCKED`, `INCOMPLETE`, `REQUIRES_REVIEW` and `INVALID` cannot produce final completeness or `READY_TO_EXPORT`; no lifecycle transition is automatic.
- Use the existing `isCoverageSatisfied`, `getCoverageResolutionBlockReason`, `getMissingRequiredSectionIds`, `validateDocument`, `runQualityGateCheck` and `GenerationTrace` contracts where applicable.
- Do not call `ensureCanonicalSections` on input objects because the current implementation merges content and mutates section objects.
- The FASE 6 functions must return new objects and leave `RichCaseAnalysis`, `LegalIssueMatrix`, `CoverageMatrix`, research bundles, issue results, tasks, plan nodes and candidate blocks structurally unchanged.
- Legacy and non-labor paths must not throw because rich-only IDs are absent. They may return `REQUIRES_REVIEW` when the rich contract cannot be proven.
- Do not run `npm test`, `npm run build`, `npm run lint`, release-gate, real providers, real adapters or an unscoped Vitest suite. Use focal Vitest commands and `npm run typecheck` only.
- This plan intentionally contains no Git/commit step because the requested execution boundary forbids Git operations.

## File Map and Responsibilities

### New production files

- `lib/legal-engine/documentAssemblyTypes.ts` — immutable FASE 6 input/output contracts, findings, section contracts, Coverage reconciliation and readiness values.
- `lib/legal-engine/documentAssembly.ts` — deterministic filtering, placement, section/block ordering, cloning and stable fingerprints.
- `lib/legal-engine/documentSectionContracts.ts` — declarative section contracts derived from the existing template/plan/Coverage structure.
- `lib/legal-engine/documentConsistency.ts` — proposition ledger, fact/stance/posture checks and controlled no-new-fact detection.
- `lib/legal-engine/documentEvidence.ts` — mention/offer/link/section validation.
- `lib/legal-engine/documentAuthority.ts` — authority allowlist, verification-status and issue-scope validation.
- `lib/legal-engine/documentRedundancy.ts` — duplicate keys and non-destructive repetition findings.
- `lib/legal-engine/documentCoverage.ts` — immutable final Coverage reconciliation.
- `lib/legal-engine/documentReadiness.ts` — petition cross-section checks and readiness classification.
- `lib/legal-engine/documentAssemblyQualityGate.ts` — composed document-level gate over existing structural checks and FASE 6 findings.

### Existing production files to modify only at integration

- `lib/legal-engine/generationTrace.ts` — additive `documentAssembly` metadata and `recordDocumentAssembly` method.
- `lib/legal-engine/pipeline.ts` — capture existing generated task metadata before sanitization, invoke FASE 6 over the non-destructive snapshot, sanitize only the authorized assembly copy with deduplication disabled, compose the final gate/completeness decision, preserve legacy/formal paths, and avoid provider calls during assembly.
- `lib/legal-engine/index.ts` — export the public FASE 6 contracts/functions.

### Explicitly unchanged

- `lib/legal-engine/issueDraftResult.ts`.
- `lib/legal-engine/issueScopedGeneration.ts`.
- `lib/legal-engine/legalIssueMatrix.ts`.
- `lib/legal-engine/coverageMatrix.ts`.
- `lib/legal-engine/coveragePolicy.ts`, except imports are not required; use its public functions.
- `lib/legal-engine/semanticEvaluator.ts`.
- `lib/ai/orchestrator.ts` and all provider/adapters.
- DB, Prisma, UI, export/rendering files and `.env`.

### New test files

- `tests/legal-engine/documentAssemblyContracts.test.ts`
- `tests/legal-engine/documentAssembly.test.ts`
- `tests/legal-engine/documentSectionContracts.test.ts`
- `tests/legal-engine/documentConsistency.test.ts`
- `tests/legal-engine/documentEvidence.test.ts`
- `tests/legal-engine/documentAuthority.test.ts`
- `tests/legal-engine/documentRedundancy.test.ts`
- `tests/legal-engine/documentCoverage.test.ts`
- `tests/legal-engine/documentReadiness.test.ts`
- `tests/legal-engine/documentAssemblyQualityGate.test.ts`
- `tests/legal-engine/documentAssemblyTrace.test.ts`
- `tests/legal-engine/documentAssemblyIntegration.test.ts`

## Contract Allocation

The 42 permanent contracts from the spec are allocated as follows:

| Task | Contracts |
|---|---|
| 1 | contract fixtures, public type shape, 38 |
| 2 | 1–6, 22–23, 31, 37 |
| 3 | 5, 25 |
| 4 | 7–12 |
| 5 | 13–15 |
| 6 | 16–18, 29, 35 |
| 7 | 3, 24 |
| 8 | 19–24, 31 |
| 9 | 26, 32–34 |
| 10 | 19–26, 30, 34, 36 |
| 11 | 27, 35–36 |
| 12 | 30–34, 37, 39–42 |
| 13 | regression evidence for 31–34 and 38–42 plus focal suite closure |

The integration tasks must use the existing FASE 5B outputs as read-only inputs. They must not move validation back into issue generation.

---

### Task 1: Define FASE 6 contracts and immutable fixtures

**Objective:** Create the shared type surface and deterministic fixture builders before implementing any assembly behavior.

**Files:**

- Create: `lib/legal-engine/documentAssemblyTypes.ts`
- Create: `tests/legal-engine/documentAssemblyContracts.test.ts`
- Test reference: `lib/legal-engine/types.ts:504` `UniversalLegalDocument`, `lib/legal-engine/generationTasks.ts:68` `GenerationTask`, `lib/legal-engine/documentPlan.ts:36` `DocumentPlanResult`

**Interfaces:**

- Consumes: existing `UniversalLegalDocument`, `DocumentNode`, `ContentBlock`, `GenerationTask`, `CoverageMatrix`, `LegalIssueMatrix`, `RichCaseAnalysis`, `GenerationTrace` and `QualityGateResult` types.
- Produces: `DocumentAssemblyInput`, `DocumentAssemblyResult`, `DocumentAssemblyFinding`, `SectionContract`, `CoverageReconciliation`, `DocumentAssemblyTraceMetadata`, readiness/status unions and fixture factories used by later tasks.

- [ ] **Step 1: Write the failing contract tests.**

Add runtime constants and readonly-shape tests so this task fails until the new module exists:

```ts
import {
  DOCUMENT_ASSEMBLY_READINESS,
  type DocumentAssemblyResult,
} from '@/lib/legal-engine/documentAssemblyTypes';

it('exposes the five document readiness states', () => {
  expect(DOCUMENT_ASSEMBLY_READINESS).toEqual([
    'READY', 'INCOMPLETE', 'BLOCKED', 'REQUIRES_REVIEW', 'INVALID',
  ]);
});

it('represents immutable section, block, finding and trace collections', () => {
  const result = makeEmptyAssemblyResult();
  expect(result.sections).toEqual([]);
  expect(result.orderedBlocks).toEqual([]);
  expect(result.findings).toEqual([]);
  expect(result.trace.orderedSectionIds).toEqual([]);
});

it('keeps every new shared FASE 6 module free of Node builtin imports', () => {
  expect(readNewFase6SharedModuleSources()).not.toMatch(
    /(?:from\s+['"](?:node:crypto|crypto|node:fs|fs|node:path|path)['"]|require\(['"](?:node:crypto|crypto|node:fs|fs|node:path|path)['"]\))/,
  );
});
```

Create local fixture helpers with these exact names and contracts for later tasks: `makeDocumentFixture`, `makePlanFixture`, `makeRichAnalysisFixture`, `makeCoverageItem`, `makeTask`, `makeAcceptedBlock`, `makeNonFinalBlock`, `makeFormalBlock`, `makeManualBlock`, `makeAssemblyInput`, and `makeEmptyAssemblyResult`. Each helper must return fresh objects; no helper may mutate a shared fixture. `makeEmptyAssemblyResult()` must return a valid `DocumentAssemblyResult` with `assemblyStatus: 'ASSEMBLED'`, `validationStatus: 'NOT_VALIDATED'`, `readiness: 'INCOMPLETE'`, empty ordered collections, and a deterministic empty fingerprint.

- [ ] **Step 2: Run the focused tests and verify RED.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAssemblyContracts.test.ts
```

Expected: FAIL because `documentAssemblyTypes.ts` and the runtime readiness constants do not exist.

- [ ] **Step 3: Define the shared contracts.**

Implement the types from the spec. The core signatures must be equivalent to:

```ts
export const DOCUMENT_ASSEMBLY_READINESS = [
  'READY', 'INCOMPLETE', 'BLOCKED', 'REQUIRES_REVIEW', 'INVALID',
] as const;

export type DocumentAssemblyReadiness = typeof DOCUMENT_ASSEMBLY_READINESS[number];
export type AssemblyStatus = 'ASSEMBLED' | 'BLOCKED';
export type AssemblyValidationStatus = 'NOT_VALIDATED' | 'VALID' | 'REQUIRES_REVIEW' | 'INVALID';

export interface DocumentAssemblyInput {
  document: UniversalLegalDocument;
  documentPlan: DocumentPlanResult;
  draftingPlan?: DraftingPlan;
  candidateSections: readonly DocumentNode[];
  candidateBlocks: readonly { sectionId: string; block: ContentBlock }[];
  generationTasks: readonly GenerationTask[];
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  richCaseAnalysis?: RichCaseAnalysis;
  baseSemanticEvaluation?: DocumentSemanticEvaluation;
  baseQualityGate?: QualityGateResult;
  generationTrace?: Pick<GenerationTrace, 'generationId' | 'issueGenerationAttempts' | 'draftBlocks'>;
}
```

Use `readonly` on all result collections. Define `CoverageReconciliation` with per-item final block IDs, final section IDs, satisfied/reason/duplicated/lost flags and aggregate missing/duplicated/lost IDs. Define findings with `code`, `severity`, `message`, `reason`, affected block/issue/Coverage/section IDs. The source-inspection fixture for contract 38 must include every new shared FASE 6 module and allow the existing pure `stableResearchId` helper, but must reject Node builtin imports.

- [ ] **Step 4: Run the contract tests and verify GREEN.**

Run the same focused command. Expected: PASS.

- [ ] **Step 5: Run the typecheck.**

Run:

```powershell
npm run typecheck
```

Expected: exit code 0. Do not run build, lint or the full suite.

- [ ] **Step 6: PASS criterion.**

The new types compile, readiness values are exact, fixtures are fresh per call, the new shared path has zero Node builtin imports, and no existing production file has changed.

### Task 2: Implement deterministic block and section assembly

**Objective:** Produce the first immutable `DocumentAssemblyResult` with canonical ordering, accepted-block filtering, stable identity and no provider boundary.

**Files:**

- Create: `lib/legal-engine/documentAssembly.ts`
- Modify: `tests/legal-engine/documentAssembly.test.ts`
- Consume unchanged: `lib/legal-engine/documentPlan.ts:36` and `:60`, `lib/legal-engine/generationTasks.ts:1494`, `lib/legal-engine/issueScopedGeneration.ts:609`, `lib/legal-engine/issueDraftResult.ts:41`

**Interfaces:**

- Consumes: `DocumentAssemblyInput` and existing block/task metadata.
- Produces: `assembleLegalDraft(input): DocumentAssemblyResult` and deterministic canonicalization/fingerprint helpers kept private unless a test needs a named pure helper.

- [ ] **Step 1: Write RED tests for ordering and admission.**

Add tests with these names and assertions:

```ts
it('orders sections from DocumentPlan and blocks from task plan order', () => {
  const input = makeAssemblyInput({ candidateBlocks: [blockB, blockA] });
  const result = assembleLegalDraft(input);
  expect(result.sections.map((section) => section.sectionId)).toEqual(['sec-hechos', 'sec-defensas']);
  expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-a', 'blk-b']);
});

it('is invariant under provider completion order', () => {
  const first = assembleLegalDraft(makeAssemblyInput({ candidateBlocks: [slowBlock, fastBlock] }));
  const second = assembleLegalDraft(makeAssemblyInput({ candidateBlocks: [fastBlock, slowBlock] }));
  expect(second.trace.assemblyId).toBe(first.trace.assemblyId);
  expect(second.trace.orderedBlockIds).toEqual(first.trace.orderedBlockIds);
});

it('keeps same-semantic fingerprints stable and changes them for material input', () => {
  const first = assembleLegalDraft(makeAssemblyInput({ generatedAt: '2026-01-01T00:00:00Z' }));
  const sameSemantics = assembleLegalDraft(makeAssemblyInput({ generatedAt: '2026-01-02T00:00:00Z' }));
  const materiallyDifferent = assembleLegalDraft(makeAssemblyInput({ issueIds: ['issue-materially-different'] }));
  expect(sameSemantics.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
  expect(sameSemantics.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
  expect(materiallyDifferent.trace.outputFingerprint).not.toBe(first.trace.outputFingerprint);
});

it('keeps equal text from different issues', () => {
  const result = assembleLegalDraft(makeAssemblyInput({ candidateBlocks: [issueA, issueB] }));
  expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-issue-a', 'blk-issue-b']);
});

it('excludes INVALID and VALID_NON_FINAL blocks from the final list', () => {
  const result = assembleLegalDraft(makeAssemblyInput({ candidateBlocks: [accepted, invalid, nonFinal] }));
  expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-accepted']);
  expect(result.excludedDraftBlockIds).toEqual(expect.arrayContaining(['blk-invalid', 'blk-non-final']));
});

it('preserves manual blocks without rewriting their text', () => {
  const input = makeAssemblyInput({ candidateBlocks: [makeManualBlock('original manual wording')] });
  const result = assembleLegalDraft(input);
  expect(result.orderedBlocks[0].text).toBe('original manual wording');
  expect(input.candidateBlocks[0].block.text).toBe('original manual wording');
});
```

- [ ] **Step 2: Run the focused assembly tests and verify RED.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAssembly.test.ts -t "orders|completion order|equal text|INVALID|VALID_NON_FINAL|manual"
```

Expected: FAIL because `assembleLegalDraft` does not exist.

- [ ] **Step 3: Implement the minimum deterministic assembly.**

Implement these rules in order:

1. Clone plan sections and build a `sectionId → canonical plan index/path` map without calling `ensureCanonicalSections`.
2. Reject duplicate section IDs, missing plan sections and ambiguous canonical orders with `BLOCKER` findings.
3. Admit issue blocks only when `issueDraftValidationStatus === 'VALID_ACCEPTED'`, text is non-empty, `generationStatus !== 'truncated'`, no seed/unresolved factual dependency is present, and `semanticEvaluation?.verdict === 'PASS'` with no hard fail.
4. Admit deterministic blocks only for formal contracts; Task 3 will add the contract lookup, so Task 2 must conservatively classify them as formal candidates and leave the definitive formal check to validation.
5. Admit manual blocks when `isManuallyEdited === true`; never alter text or metadata.
6. Exclude invalid/non-final/fallback substantive blocks and emit findings with their IDs.
7. Sort by section plan index, recursive child order, task order, task parent order, class rank and stable block ID. A missing substantive task placement emits `MISSING_CANONICAL_PLACEMENT`.
8. Create fresh section/block objects, aggregate issue/Coverage IDs, and compute canonical fingerprints excluding timestamps, provider completion metadata and accidental order of semantically unordered collections. Preserve order only where it is semantic for the document.

Before adding a helper, inspect and reuse `stableResearchId` from `lib/legal-engine/legal-research/canonical.ts`. It is pure/browser-safe, excludes the repository's transient metadata keys and sorts `*Ids`/`*IDs` arrays. Build the FASE 6 fingerprint payload so unordered collections use those canonical ID keys or explicitly sorted records, while ordered section/block sequences remain ordered. If a required payload cannot be represented safely with that helper, add a small local canonicalization helper with no dependency and no Node builtin; do not import `node:crypto`, `crypto`, `node:fs`, `node:path`, use `randomUUID` or use current time for `assemblyId`.

- [ ] **Step 4: Run the focused tests and verify GREEN.**

Run the same focused Vitest command. Expected: PASS, including equal-text blocks from different issues and manual-text preservation.

- [ ] **Step 5: Run typecheck.**

Run `npm run typecheck`. Expected: exit code 0.

- [ ] **Step 6: PASS criterion.**

The function is pure, deterministic, excludes non-final blocks, preserves manual blocks, produces the same IDs/fingerprints for the same semantic input and different fingerprints for materially different focal inputs, and performs no external call. Contract 38 is checked against every new shared FASE 6 module.

### Task 3: Derive declarative section contracts

**Objective:** Validate section shape/order and formal-versus-substantive permissions from existing templates and plans, without hardcoding a legal document.

**Files:**

- Create: `lib/legal-engine/documentSectionContracts.ts`
- Create/modify: `tests/legal-engine/documentSectionContracts.test.ts`
- Reuse: `lib/legal-engine/documentTemplates.ts:128`, `lib/legal-engine/exportGuards.ts:577`, `lib/legal-engine/documentPlan.ts:36`

**Interfaces:**

- Consumes: `DocumentPlanResult`, `DocumentNode[]`, `CoverageMatrix`, document type/template metadata.
- Produces: `deriveSectionContracts(input): readonly SectionContract[]` and `validateSectionContracts(input): readonly DocumentAssemblyFinding[]`.

- [ ] **Step 1: Write RED tests.**

Add:

```ts
it('derives the canonical ordinary contestacion order from the existing template', () => {
  const contracts = deriveSectionContracts(contestacionContractsInput());
  expect(contracts.map((contract) => contract.title)).toEqual([
    'PROEMIO', 'COMPARECENCIA Y PERSONALIDAD', 'OBJETO DEL ESCRITO',
    'CONTESTACIÓN DE HECHOS', 'CONTESTACIÓN DE PRESTACIONES',
    'EXCEPCIONES Y DEFENSAS', 'PRUEBAS', 'ALEGATOS', 'PETITORIOS', 'FIRMA',
  ]);
});

it('marks petition/evidence/argument roles from section type and Coverage, not text templates', () => {
  const contracts = deriveSectionContracts(contestacionContractsInput());
  expect(contracts.find((contract) => contract.type === 'petition')?.contentRole).toBe('PETITION');
  expect(contracts.find((contract) => contract.type === 'evidence')?.contentRole).toBe('EVIDENCE');
});

it('reports a missing required section without synthesizing one', () => {
  const findings = validateSectionContracts(inputWithoutPetition());
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'MISSING_REQUIRED_SECTION', severity: 'BLOCKER' }),
  ]));
});
```

- [ ] **Step 2: Run RED.**

Run:

```powershell
npx vitest run tests/legal-engine/documentSectionContracts.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement declarative derivation.**

Use `getRequiredSectionIds`, template `estructura`, `DocumentNode.type`, `requiredCoverageItemIds` and Coverage categories. Do not embed section prose, names of cases, facts, PDFs or authorities. Treat duplicate/missing section IDs as findings; do not call `ensureCanonicalSections` to repair them.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused Vitest command, then `npm run typecheck`. Expected: both pass.

- [ ] **Step 5: PASS criterion.**

Ordinary contestaciones and the post-sentence amparo skeleton are derived from the current declarative structure; no full document text is hardcoded and missing required sections remain missing.

### Task 4: Add proposition ledger and cross-block fact consistency

**Objective:** Detect material fact, stance and procedural-position conflicts without choosing a version or asking a provider to resolve one.

**Files:**

- Create: `lib/legal-engine/documentConsistency.ts`
- Create/modify: `tests/legal-engine/documentConsistency.test.ts`
- Reuse: `lib/legal-engine/case-extraction/types.ts:121`, `:156`, `:215`, `:242`, `lib/legal-engine/types.ts` fact positions, `lib/legal-engine/legalIssueMatrix.ts:41`

**Interfaces:**

- Consumes: assembled result, rich facts/claims/assertions/conflicts/client position, block IDs and linked IDs.
- Produces: `buildDocumentPropositionLedger(input)` and `validateDocumentConsistency(input): readonly DocumentAssemblyFinding[]`.

- [ ] **Step 1: Write RED tests for contracts 7–12.**

Use a fixture with `fact-1` and controlled block text. Include these assertions:

```ts
it('blocks incompatible dates for the same fact', () => {
  const findings = validateDocumentConsistency(inputWithBlocks(
    block('blk-a', 'La relación inició el 3 de marzo de 2024.', ['fact-1']),
    block('blk-b', 'La relación inició el 5 de marzo de 2024.', ['fact-1']),
  ));
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'MATERIAL_FACT_CONTRADICTION', severity: 'BLOCKER' }),
  ]));
});

it('blocks ADMIT versus DENY for the same client proposition', () => {
  const findings = validateDocumentConsistency(inputWithBlocks(
    block('blk-a', 'POSICIÓN PROCESAL: SE ADMITE.', ['fact-1']),
    block('blk-b', 'POSICIÓN PROCESAL: SE NIEGA.', ['fact-1']),
  ));
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'CONFLICTING_CLIENT_POSITION', severity: 'BLOCKER' }),
  ]));
});

it('does not merge source allegation and client denial into one scope', () => {
  const findings = validateDocumentConsistency(inputWithSourceAssertionAndClientDenial());
  expect(findings.some((finding) => finding.code === 'CONFLICTING_CLIENT_POSITION')).toBe(false);
});

it('rejects a concrete date absent from the authorized fact graph', () => {
  const findings = validateDocumentConsistency(inputWithBlocks(
    block('blk-new', 'El pago ocurrió el 9 de septiembre de 2025.', ['fact-1']),
  ));
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'NEW_FACT_DURING_ASSEMBLY', severity: 'BLOCKER' }),
  ]));
});

it('keeps an explicit source conflict as review instead of selecting a side', () => {
  const findings = validateDocumentConsistency(inputWithExplicitCaseConflict());
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'MATERIAL_FACT_CONTRADICTION', severity: 'REVIEW' }),
  ]));
});

it('does not classify prescription or absolution as a source fact', () => {
  const ledger = buildDocumentPropositionLedger(inputWithBlocks(
    block('blk-legal', 'La prescripción total conduce a la absolución.', ['issue-1']),
  ));
  expect(ledger.every((entry) => entry.kind !== 'FACT')).toBe(true);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentConsistency.test.ts`. Expected: FAIL because the ledger and validators do not exist.

- [ ] **Step 3: Implement conservative deterministic extraction.**

Create proposition entries only when the block has an authorized linked entity and a controlled stance/value marker. Compare values only within the same proposition and scope. Use normalized exact dates, amounts, IDs and known entity names; exclude formal place/date variables. If a `CaseConflict` ID is linked, retain both values and lower the finding to `REVIEW`; never choose a winning value. Unknown text remains unknown and is not silently considered consistent.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused consistency command and `npm run typecheck`. Expected: both pass.

- [ ] **Step 5: PASS criterion.**

All six contracts pass, findings include exact affected block/issue/fact IDs, and no input entity is mutated.

### Task 5: Validate EvidenceMention/EvidenceOffer consistency

**Objective:** Prevent an evidence mention from being presented as an offer and prevent evidence from crossing issue/section boundaries without an explicit relation.

**Files:**

- Create: `lib/legal-engine/documentEvidence.ts`
- Create/modify: `tests/legal-engine/documentEvidence.test.ts`
- Reuse unchanged: `lib/legal-engine/case-extraction/types.ts:177` and `:189`, `lib/legal-engine/coverageMatrix.ts`

**Interfaces:**

- Consumes: assembled blocks, Coverage items, rich evidence mentions/offers, legal issues and section contracts.
- Produces: `validateDocumentEvidence(input): readonly DocumentAssemblyFinding[]`.

- [ ] **Step 1: Write RED tests.**

Add tests named `rejects mention used as offer`, `accepts confirmed linked offer`, and `rejects evidence from another issue`. The valid fixture must set `EvidenceOffer.status = 'CLIENT_CONFIRMED'`, point it to an existing mention, link the same issue/Coverage and place the block in an evidence-compatible section.

```ts
it('accepts a confirmed offer with explicit issue and section links', () => {
  expect(validateDocumentEvidence(validEvidenceInput())).toEqual([]);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentEvidence.test.ts`. Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the allowlist checks.**

Require a valid `evidenceOfferId` for offer language, resolve its `evidenceMentionId`, check status, related fact/claim IDs, issue/Coverage linkage and section role. A `NEEDS_REVIEW` offer produces `EVIDENCE_OFFER_NEEDS_REVIEW`; an offer outside an obligatory item is a review finding, and an obligatory invalid offer is a blocker. Do not infer an offer from a mention.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused Vitest command and `npm run typecheck`. Expected: both pass.

- [ ] **Step 5: PASS criterion.**

Mention/offer separation is preserved and every finding names the block, evidence IDs, issue IDs and section IDs involved.

### Task 6: Validate authority allowlists and verification status

**Objective:** Reject authorities introduced during assembly and preserve `SOURCE_CITED` as unverified.

**Files:**

- Create: `lib/legal-engine/documentAuthority.ts`
- Create/modify: `tests/legal-engine/documentAuthority.test.ts`
- Reuse unchanged: `lib/legal-engine/case-extraction/types.ts:207`, `lib/legal-engine/legal-research/types.ts`, `lib/legal-engine/issueDraftResult.ts`

**Interfaces:**

- Consumes: rich authorities, issue/Coverage links, block authority IDs/citations, trace research references.
- Produces: `buildAuthorityAllowlist(input)` and `validateDocumentAuthorities(input): readonly DocumentAssemblyFinding[]`.

- [ ] **Step 1: Write RED tests.**

Add tests:

```ts
it('rejects a citation not present in the authorized authority graph', () => {
  const findings = validateDocumentAuthorities(inputWithCitation('Tesis inventada 99/2026'));
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'NEW_AUTHORITY_DURING_ASSEMBLY', severity: 'BLOCKER' }),
  ]));
});

it('does not treat SOURCE_CITED as LEGALLY_VERIFIED', () => {
  const findings = validateDocumentAuthorities(inputWithSourceCitedAuthority());
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'UNVERIFIED_AUTHORITY_USED_AS_VERIFIED', severity: 'BLOCKER' }),
  ]));
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentAuthority.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the closed-world validator.**

Normalize citation text only for matching against existing `SourceAuthorityMention.citationText`; never create a new ID or research result. Check issue/Coverage scope and preserve verification status exactly. Do not import or call any module under `legal-research/adapters`.

- [ ] **Step 4: Run GREEN, typecheck and a no-adapter import check.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAuthority.test.ts
npm run typecheck
rg -n "legal-research/adapters|runFastMode|IssueProviderInvoker" lib/legal-engine/documentAuthority.ts lib/legal-engine/documentAssembly.ts
```

Expected: tests/typecheck pass and the final `rg` command returns no matches.

- [ ] **Step 5: PASS criterion.**

New authorities are blockers, source-cited authorities remain unverified, and the module has no provider/research adapter dependency.

### Task 7: Add non-destructive redundancy policy

**Objective:** Detect repetition using issue/Coverage/function/evidence scope without deleting blocks.

**Files:**

- Create: `lib/legal-engine/documentRedundancy.ts`
- Create/modify: `tests/legal-engine/documentRedundancy.test.ts`
- Reuse as reference only: `lib/legal-engine/issueScopedGeneration.ts:609`, `lib/legal-engine/legalDocumentSanitizer.ts:445`

**Interfaces:**

- Consumes: ordered sections/blocks and their issue/Coverage/proposition/evidence links.
- Produces: `buildDocumentDuplicateKey(blockContext)` and `findDocumentRedundancy(input): readonly DocumentAssemblyFinding[]`.

- [ ] **Step 1: Write RED tests.**

Add:

```ts
it('keeps equal text from two issues and reports different-scope repetition only', () => {
  const result = findDocumentRedundancy(inputWithEqualTextDifferentIssues());
  expect(result.some((finding) => finding.code === 'DUPLICATE_BLOCK_SAME_FUNCTION')).toBe(false);
  expect(result.some((finding) => finding.code === 'REPEATED_TEXT_DIFFERENT_SCOPE')).toBe(true);
});

it('reports equal text in the same issue/function without deleting either block', () => {
  const findings = findDocumentRedundancy(inputWithSameFunctionDuplicate());
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'DUPLICATE_BLOCK_SAME_FUNCTION' }),
  ]));
  expect(inputWithSameFunctionDuplicate().assembly.orderedBlocks).toHaveLength(2);
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentRedundancy.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement keys and findings.**

Use section, function role, sorted issue IDs, sorted Coverage IDs, proposition IDs, evidence linkage and normalized text hash. Never call sanitizer deduplication and never remove an item from an assembled result.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused test and `npm run typecheck`. Expected: pass.

- [ ] **Step 5: PASS criterion.**

Identical text from distinct legal scopes survives; same-slot duplicate content is visible as a finding, not silently removed.

### Task 8: Reconcile final Coverage immutably

**Objective:** Prove which Coverage items survived into the final assembled document and distinguish missing, invalid-only, lost, incompatible and duplicated coverage.

**Files:**

- Create: `lib/legal-engine/documentCoverage.ts`
- Create/modify: `tests/legal-engine/documentCoverage.test.ts`
- Reuse unchanged: `lib/legal-engine/coveragePolicy.ts:17` and `:64`, `lib/legal-engine/generationTasks.ts:1656`

**Interfaces:**

- Consumes: original Coverage matrix, assembled blocks/sections, block evaluations, section contracts and legal issue links.
- Produces: `reconcileDocumentCoverage(input): CoverageReconciliation` and findings for the assembly result.

- [ ] **Step 1: Write RED tests for contracts 19–24.**

Add tests named `required coverage missing`, `coverage survives assembly`, `fallback does not satisfy`, `invalid block excluded`, `valid non-final does not satisfy`, `duplicate coverage detected`, and `coverage incompatible with section`.

```ts
it('does not mutate the input matrix while marking final coverage', () => {
  const input = makeCoverageInputWithAcceptedBlock();
  const before = structuredClone(input.coverageMatrix);
  const reconciliation = reconcileDocumentCoverage(input);
  expect(reconciliation.allRequiredSatisfied).toBe(true);
  expect(input.coverageMatrix).toEqual(before);
});

it('keeps a required item missing when only fallback exists', () => {
  const result = reconcileDocumentCoverage(makeCoverageInputWithFallbackOnly());
  expect(result.requiredMissingIds).toContain('cov-required');
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentCoverage.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement reconciliation.**

Clone/inspect, do not mutate. Call `isCoverageSatisfied` with final candidate blocks and their evaluations. Apply formal deterministic policy only to formal items. For each item, record final blocks/sections, duplicate/lost flags and exact reason. A block with a Coverage ID absent from the matrix produces `ORPHAN_COVERAGE_LINK`. A required item whose only candidates are invalid/non-final/fallback remains missing.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused command and `npm run typecheck`. Expected: pass.

- [ ] **Step 5: PASS criterion.**

Coverage status is computed in a new reconciliation object; the original matrix, blocks and evaluations are unchanged.

### Task 9: Validate petition cross-section compatibility and readiness

**Objective:** Prevent a petition from requesting relief not supported by the assembled defenses/issues/Coverage and classify readiness without changing lifecycle state.

**Files:**

- Create: `lib/legal-engine/documentReadiness.ts`
- Create/modify: `tests/legal-engine/documentReadiness.test.ts`
- Reuse unchanged: `lib/legal-engine/documentLifecycle.ts:14`, `lib/legal-engine/legalIssueMatrix.ts`, `lib/legal-engine/richCoverage.ts`, `lib/legal-engine/documentSectionContracts.ts`

**Interfaces:**

- Consumes: assembled result, section contracts, Coverage reconciliation, `LegalIssueMatrix`, claim/relief links, the deterministic `DocumentAssemblyCheckSet` and base gate result.
- Produces: `validatePetitionCompatibility(input)`, `evaluateDocumentAssemblyChecks(input)` and `decideDocumentAssemblyReadiness(input): DocumentAssemblyReadiness`.

- [ ] **Step 1: Write RED tests.**

Add:

```ts
it('blocks a petition whose relief is stronger or different from supported Coverage', () => {
  const findings = validatePetitionCompatibility(inputWithUnsupportedPartialRelief());
  expect(findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'UNSUPPORTED_PETITION_RELIEF', severity: 'BLOCKER' }),
  ]));
});

it('maps clean rich assembly to READY without changing lifecycle', () => {
  const result = decideDocumentAssemblyReadiness(cleanReadinessInput());
  expect(result).toBe('READY');
  expect(cleanReadinessInput().document.lifecycle?.readiness).not.toBe('READY_TO_EXPORT');
});

it('maps legacy compatibility without throwing', () => {
  expect(() => decideDocumentAssemblyReadiness(legacyReadinessInput())).not.toThrow();
  expect(decideDocumentAssemblyReadiness(legacyReadinessInput())).toBe('REQUIRES_REVIEW');
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentReadiness.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement deterministic readiness.**

Compare petition support IDs and requested-relief Coverage against the legal issue/claim/defense graph. Do not parse a new remedy into existence. Build the check set first, then evaluate readiness from that check set, Coverage, trace and the already-computed base gate. Do not call `runDocumentAssemblyQualityGate` from readiness and do not consume its final result; this keeps the dependency one-way. `READY` requires no blocker/review finding, required Coverage complete, required sections present, valid trace and base gate pass. Apply blocker precedence `INVALID` → `BLOCKED` → `INCOMPLETE` → `REQUIRES_REVIEW` → `READY`; `REVIEW` never becomes `READY`. Never call `markDocumentAsReadyToExport`.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused readiness command and `npm run typecheck`. Expected: pass.

- [ ] **Step 5: PASS criterion.**

Petition/defense mismatch blocks the result, clean rich output becomes `READY`, legacy output remains non-throwing, lifecycle remains explicit, and readiness does not depend on the final QualityGate result.

### Task 10: Compose the document-level QualityGate

**Objective:** Add a separate document assembly gate that composes the existing structural gate with FASE 6 findings after readiness has been decided, without creating a readiness↔gate cycle.

**Files:**

- Create: `lib/legal-engine/documentAssemblyQualityGate.ts`
- Create/modify: `tests/legal-engine/documentAssemblyQualityGate.test.ts`
- Reuse unchanged: `lib/legal-engine/qualityGate.ts:84`, `lib/legal-engine/validator.ts`, `lib/legal-engine/documentCoverage.ts`, `lib/legal-engine/documentConsistency.ts`, `lib/legal-engine/documentEvidence.ts`, `lib/legal-engine/documentAuthority.ts`, `lib/legal-engine/documentReadiness.ts`

**Interfaces:**

- Consumes: assembled candidate, base `QualityGateResult`, `DocumentAssemblyCheckSet`, Coverage reconciliation, trace metadata and the readiness already returned by Task 9.
- Produces: `runDocumentAssemblyQualityGate(input): DocumentAssemblyQualityGateResult`.

- [ ] **Step 1: Write RED tests.**

Cover:

```ts
it('fails on any material cross-block blocker even when block semantic scores pass', () => {
  const result = runDocumentAssemblyQualityGate(inputWithMaterialContradiction());
  expect(result.passed).toBe(false);
  expect(result.canMarkAsReady).toBe(false);
  expect(result.readiness).toBe('BLOCKED');
});

it('does not call a provider for deterministic assembly', () => {
  const provider = vi.fn();
  const result = runDocumentAssemblyQualityGate(inputWithFormalOnlyDocument({ provider }));
  expect(provider).not.toHaveBeenCalled();
  expect(result.checks).toEqual(expect.arrayContaining([
    expect.objectContaining({ checkId: 'DETERMINISTIC_ASSEMBLY', status: 'PASS' }),
  ]));
});

it('blocks a broken trace and does not copy research bundle bodies', () => {
  const result = runDocumentAssemblyQualityGate(inputWithBrokenTraceAndResearchBundle());
  expect(result.readiness).toBe('INVALID');
  expect(JSON.stringify(result)).not.toContain('full research bundle body');
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentAssemblyQualityGate.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement gate composition.**

Run the existing structural gate against the authorized sanitized document copy before final readiness. Aggregate FASE 6 check statuses and classify blockers before warnings, with precedence `INVALID` → `BLOCKED` → `INCOMPLETE` → `REQUIRES_REVIEW` → `READY`. Do not use `qualityScore` to downgrade a blocker. `runDocumentAssemblyQualityGate` must not call readiness again: it receives the Task 9 result, computes `passed` from the base gate and required check statuses, and derives `canMarkAsReady` once as `passed && readiness === 'READY'`. A `REVIEW`/`REQUIRES_REVIEW` status can never produce `canMarkAsReady: true`.

- [ ] **Step 4: Run GREEN and typecheck.**

Run the focused gate command and `npm run typecheck`. Expected: pass.

- [ ] **Step 5: PASS criterion.**

Document-level gate is a separate pure layer, preserves the existing QualityGate contract, makes no provider call, rejects broken trace/research leakage, and has no circular readiness dependency.

### Task 11: Extend GenerationTrace with document assembly metadata

**Objective:** Make the final document-to-source chain reconstructable without duplicating research bundles.

**Files:**

- Modify: `lib/legal-engine/generationTrace.ts:193`, `:231`, `:282`
- Create/modify: `tests/legal-engine/documentAssemblyTrace.test.ts`
- Reuse: `lib/legal-engine/generationTraceSanitizer.ts`, `tests/legal-engine/generationTraceContext.test.ts`, `tests/legal-engine/generationTraceExport.test.ts`

**Interfaces:**

- Consumes: `DocumentAssemblyTraceMetadata` and the existing trace context.
- Produces: optional `GenerationTrace.documentAssembly` and `GenerationTraceContext.recordDocumentAssembly(result)`.

- [ ] **Step 1: Write RED tests.**

Add tests:

```ts
it('records the complete final document chain by IDs and hashes', () => {
  const context = createGenerationTraceContext(traceFixtureInput());
  context.recordDocumentAssembly(assemblyFixtureResult());
  const trace = context.close();
  expect(trace.documentAssembly?.orderedBlockIds).toEqual(['blk-1']);
  expect(trace.documentAssembly?.blockLinks[0]).toMatchObject({
    blockId: 'blk-1', generationTaskId: 'task-1',
    legalIssueIds: ['issue-1'], coverageItemIds: ['cov-1'],
  });
  expect(trace.documentAssembly?.blockLinks[0]).not.toHaveProperty('researchBundle');
});

it('keeps existing trace fixtures valid when documentAssembly is absent', () => {
  expect(createGenerationTraceContext(traceFixtureInput()).close().schemaVersion).toBe('1.0');
});
```

- [ ] **Step 2: Run RED.**

Run `npx vitest run tests/legal-engine/documentAssemblyTrace.test.ts`. Expected: FAIL because the additive field/method do not exist.

- [ ] **Step 3: Implement additive trace support.**

Add the optional field and method. Sanitize IDs, hashes and findings with existing helpers. Do not add timestamps to `assemblyId`/fingerprints and do not serialize full research bundles. Keep `schemaVersion: '1.0'` for backward compatibility; the new field is optional.

- [ ] **Step 4: Run GREEN, existing trace focal tests and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAssemblyTrace.test.ts tests/legal-engine/generationTraceContext.test.ts tests/legal-engine/generationTraceExport.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: PASS criterion.**

The trace links final document, sections, blocks, issue result hash, task, issue, Coverage and research IDs without breaking old trace payloads.

### Task 12: Integrate FASE 6 into the existing pipeline without reopening FASE 5B

**Objective:** Capture accepted FASE 5B output before any destructive sanitization, run the pure assembly/validation layer over that snapshot, sanitize only the authorized assembly copy with deduplication disabled, compose final completeness from the FASE 6 gate, and preserve every legacy/formal behavior.

**Files:**

- Modify: `lib/legal-engine/pipeline.ts:2583`, `:2735`, `:2787`, `:3314`, `:3430`, `:3638`, `:3688`
- Modify: `lib/legal-engine/index.ts`
- Create/modify: `tests/legal-engine/documentAssemblyIntegration.test.ts`
- Do not modify: `issueDraftResult.ts`, `issueScopedGeneration.ts`, `legalIssueMatrix.ts`, `semanticEvaluator.ts`

**Interfaces:**

- Consumes: existing `generateSection` output, `DocumentPlanResult`, `DraftingPlan`, generated `ContentBlock`s, existing task metadata, current Coverage/Issue matrices and trace context.
- Produces: a validated assembled document copy, trace record, existing pipeline document sections updated from that copy, and no new provider call.

- [ ] **Step 1: Write RED integration tests.**

Add tests:

```ts
it('runs document assembly after generation and before final readiness', async () => {
  const result = await runControlledRichPipeline({ providerCalls: 1 });
  expect(result.generationMetadata.auditTrace?.documentAssembly?.assemblyId).toBeTruthy();
  expect(result.generationMetadata.auditTrace?.documentAssembly?.findingCodes).toBeDefined();
  expect(result.generationMetadata.pipelineState.isComplete).toBe(true);
});

it('does not add a provider call when all output is formal/deterministic', async () => {
  const provider = vi.fn();
  const result = await runControlledFormalPipeline({ provider });
  expect(provider).not.toHaveBeenCalled();
  expect(result.validation.errors.some((error) => error.checkId === 'DOCUMENT_ASSEMBLY_PROVIDER_CALL')).toBe(false);
});

it('preserves equal text from different issues through the real pipeline', async () => {
  const result = await runControlledRichPipeline({ sameTextDifferentIssueIds: true });
  const assembly = result.documentAssemblyResult;
  expect(assembly?.orderedBlocks.map((block) => block.id)).toEqual(
    expect.arrayContaining(['blk-issue-a', 'blk-issue-b']),
  );
  expect(assembly?.orderedBlocks).toHaveLength(2);
});

it('keeps final completeness false when FASE 6 is materially blocked', async () => {
  const result = await runControlledRichPipeline({ fixture: 'material-contradiction' });
  expect(result.documentAssemblyResult?.readiness).not.toBe('READY');
  expect(result.generationMetadata.pipelineState.isComplete).not.toBe(true);
  expect(result.lifecycle?.readiness).not.toBe('READY_TO_EXPORT');
});

it('keeps final completeness false when FASE 6 is INVALID', async () => {
  const result = await runControlledRichPipeline({ fixture: 'broken-assembly-trace' });
  expect(result.documentAssemblyResult?.readiness).toBe('INVALID');
  expect(result.generationMetadata.pipelineState.isComplete).not.toBe(true);
  expect(result.lifecycle?.readiness).not.toBe('READY_TO_EXPORT');
});

it('is invariant to provider completion order in the integrated fixture', async () => {
  const first = await runControlledRichPipeline({ completionOrder: ['slow', 'fast'] });
  const second = await runControlledRichPipeline({ completionOrder: ['fast', 'slow'] });
  expect(second.documentAssemblyResult?.trace.assemblyId)
    .toBe(first.documentAssemblyResult?.trace.assemblyId);
  expect(second.documentAssemblyResult?.trace.orderedBlockIds)
    .toEqual(first.documentAssemblyResult?.trace.orderedBlockIds);
});

it.each(['demanda_ordinaria_civil', 'contestacion_demanda_laboral', 'contestacion_demanda_civil'])('does not break %s compatibility', async (documentType) => {
  await expect(runCompatibilityPipeline(documentType)).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run RED.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAssemblyIntegration.test.ts
```

Expected: FAIL because the pipeline does not call FASE 6 or expose the new trace/result.

- [ ] **Step 3: Capture existing task metadata without changing execution.**

Extend the internal `generateSection` result with an optional `generationTasks?: GenerationTask[]` field and return the already-built task list from the existing hierarchical branches. This is metadata only; do not change task eligibility, provider calls, retries, or block acceptance. Accumulate the lists in `runGenerationPipeline` while the existing section loop runs.

- [ ] **Step 4: Invoke assembly at the validation boundary.**

Use this exact order; the sanitizer must not precede FASE 6 input capture:

1. After the existing section-generation loop and before the sanitizer at `pipeline.ts:3638`, create a non-destructive snapshot/copy of the accepted FASE 5B sections, blocks and already-built task metadata. Build `candidateBlocks` from this pre-sanitizer snapshot, preserving manual blocks, `legalIssueIds`, `coverageItemIds`, `issueDraftResultHash` and equal text from different issues.
2. Call `assembleLegalDraft` with the existing `plan`, `draftingPlan`, accumulated tasks, matrices, rich analysis, current semantic evaluation and trace references. Do not call `ensureCanonicalSections` and do not pass output that has been destructively deduplicated.
3. Call section validation, cross-block consistency, evidence, authority, redundancy, Coverage reconciliation and petition compatibility over the assembled copy.
4. Sanitize only the authorized assembly copy, after those FASE 6 checks, with `dedupeBlocks: false`. The sanitizer must preserve block IDs, issue/Coverage links and manual text; if it cannot, record an `INVALID` assembly result rather than dropping or merging a block.
5. Run `validateDocument`/`runQualityGateCheck` as the base structural QualityGate over that authorized sanitized copy.
6. Aggregate FASE 6 check statuses, call `decideDocumentAssemblyReadiness` once, then call `runDocumentAssemblyQualityGate` once with the already-decided readiness. Do not make readiness consume the final gate result.
7. Record the final result with `traceContext.recordDocumentAssembly` and use it to gate final `pipelineState.isComplete`; a material blocker or `INVALID` must make completeness false.
8. Replace only the working pipeline document’s sections/validation metadata with the authorized result copy; do not mutate the function’s FASE 5B inputs.
9. Preserve `markDocumentAsReviewRequired` and explicit lifecycle semantics. `DocumentAssemblyReadiness.READY` is evidence for a future explicit transition, not an automatic transition; never call `markDocumentAsReadyToExport` automatically.
10. Keep the current legacy path non-throwing and return `REQUIRES_REVIEW` when rich evidence cannot be proven.

Export the public FASE 6 functions/types from `lib/legal-engine/index.ts`.

The integration test harness may expose the transient `DocumentAssemblyResult` as `documentAssemblyResult` for assertions; it is not a new persistence contract and must not trigger a database/lifecycle write.

- [ ] **Step 5: Run GREEN on the focal integration tests.**

Run the integration file plus the existing focal contracts that exercise the affected boundaries:

```powershell
npx vitest run tests/legal-engine/documentAssemblyIntegration.test.ts tests/legal-engine/phase4HierarchicalGeneration.test.ts tests/legal-engine/issueScopedGeneration.test.ts tests/legal-engine/phase5Integration.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts
```

Expected: pass. If an existing test fails because a legacy path now receives a rich-only blocker, adjust the compatibility adapter, not FASE 5B.

- [ ] **Step 6: Run typecheck.**

Run `npm run typecheck`. Expected: exit code 0.

- [ ] **Step 7: PASS criterion.**

The pipeline produces and traces a FASE 6 result, no assembly function invokes a provider/research adapter, the working output remains fail-closed, and existing rich/legacy/non-labor/formal flows remain callable.

### Task 13: Run focal regression closure and perform implementation-plan self-review

**Objective:** Verify the complete FASE 6 contract set with bounded tests and confirm no scope drift into providers, research, DB, UI or renderers.

**Files:**

- Modify only if a test exposes a contract defect: the FASE 6 files listed above.
- Test: all twelve new `tests/legal-engine/documentAssembly*.test.ts` files.
- Focal regression tests: `tests/legal-engine/documentArchitecture.test.ts`, `tests/legal-engine/richDocumentPlan.test.ts`, `tests/legal-engine/phase4Integration.test.ts`, `tests/legal-engine/phase5SemanticEvaluation.test.ts`, `tests/legal-engine/qualityGateNewWriting.test.ts`, `tests/legal-engine/legalResearchLegacyRegression.test.ts`.

**Interfaces:**

- Consumes: completed FASE 6 modules and existing focal suites.
- Produces: bounded evidence for the acceptance criteria; no production feature beyond this plan.

- [ ] **Step 1: Run all new FASE 6 tests.**

Run:

```powershell
npx vitest run tests/legal-engine/documentAssemblyContracts.test.ts tests/legal-engine/documentAssembly.test.ts tests/legal-engine/documentSectionContracts.test.ts tests/legal-engine/documentConsistency.test.ts tests/legal-engine/documentEvidence.test.ts tests/legal-engine/documentAuthority.test.ts tests/legal-engine/documentRedundancy.test.ts tests/legal-engine/documentCoverage.test.ts tests/legal-engine/documentReadiness.test.ts tests/legal-engine/documentAssemblyQualityGate.test.ts tests/legal-engine/documentAssemblyTrace.test.ts tests/legal-engine/documentAssemblyIntegration.test.ts
```

Expected: all FASE 6 contracts pass.

- [ ] **Step 2: Run the bounded regression set.**

Run:

```powershell
npx vitest run tests/legal-engine/documentArchitecture.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/phase4Integration.test.ts tests/legal-engine/phase5SemanticEvaluation.test.ts tests/legal-engine/qualityGateNewWriting.test.ts tests/legal-engine/legalResearchLegacyRegression.test.ts
```

Expected: pass. Do not replace this with `npm test`.

- [ ] **Step 3: Run typecheck.**

Run `npm run typecheck`. Expected: exit code 0.

- [ ] **Step 4: Verify prohibited scope by literal inspection.**

Run:

```powershell
rg -n "runFastMode|IssueProviderInvoker|legal-research/adapters|fetch\(|prisma|Neon|DOCX|PDF|SCJN|DOF" lib/legal-engine/documentAssembly*.ts lib/legal-engine/documentSectionContracts.ts lib/legal-engine/documentConsistency.ts lib/legal-engine/documentEvidence.ts lib/legal-engine/documentAuthority.ts lib/legal-engine/documentCoverage.ts lib/legal-engine/documentReadiness.ts
```

Expected: no provider/research/database/rendering implementation references in the new FASE 6 modules. References in comments/tests must not be executable imports or calls.

Also inspect the shared FASE 6 path for Node builtins:

```powershell
rg -n "from ['\"](node:crypto|crypto|node:fs|fs|node:path|path)['\"]|require\(['\"](node:crypto|crypto|node:fs|fs|node:path|path)['\"]\)" lib/legal-engine/documentAssembly*.ts lib/legal-engine/documentSectionContracts.ts lib/legal-engine/documentConsistency.ts lib/legal-engine/documentEvidence.ts lib/legal-engine/documentAuthority.ts lib/legal-engine/documentCoverage.ts lib/legal-engine/documentReadiness.ts lib/legal-engine/documentAssemblyQualityGate.ts
```

Expected: zero executable imports. The focal contract also proves same-semantic-input stability, material-difference sensitivity, and that `stableResearchId` or its local replacement is browser/runtime-safe.

- [ ] **Step 5: Self-review the plan against the spec.**

Confirm explicitly:

- every one of 42 contracts has a named test;
- no task mutates the input matrix, plan, issue result, research bundle, task or block;
- no task calls provider or research;
- final readiness is distinct from lifecycle readiness;
- the integration captures FASE 5B output before sanitization, preserves same-text/different-issue blocks, and sanitizes only the authorized copy with `dedupeBlocks: false`;
- final completeness is false for FASE 6 `BLOCKED`/`INVALID`, with no automatic `READY_TO_EXPORT`;
- the new shared FASE 6 path contains zero Node builtin imports and its fingerprints ignore transient/provider-order noise;
- `VALID_NON_FINAL`, fallback and invalid blocks cannot satisfy substantive Coverage;
- cross-section petition checks and trace integrity are present;
- legacy/non-labor/formal-only compatibility has a test;
- no required spec section is unrepresented in a task.

- [ ] **Step 6: PASS criterion.**

Fresh bounded evidence exists for FASE 6, typecheck passes, the prohibited scope check is clean, and the implementation can stop before any full-suite/build/lint/release-gate action unless separately authorized.

## Execution Order and Dependencies

```text
Task 1 contracts/fixtures
  ↓
Task 2 deterministic assembly
  ↓
Task 3 section contracts ─┐
Task 4 consistency        │
Task 5 evidence           ├─→ Task 8 Coverage
Task 6 authorities        │       ↓
Task 7 redundancy ────────┘   Task 9 readiness
                                  ↓
                             Task 10 document gate
                                  ↓
                             Task 11 trace
                                   ↓
                              Task 12 pipeline integration
                                1. FASE 5B accepted-output snapshot
                                2. FASE 6 assembly + section/cross-block/evidence/authority/redundancy checks
                                3. Coverage + petition compatibility
                                4. sanitizer on authorized copy (`dedupeBlocks: false`)
                                5. base structural QualityGate
                                6. FASE 6 statuses → readiness → final gate
                                7. pipeline final completeness
                                   ↓
                              Task 13 focal closure
```

Tasks 3–7 are independent after Task 2 and may be reviewed separately, but the requested execution mode is inline and sequential. Task 8 consumes all findings. Task 9 decides readiness from the check set; Task 10 composes the final gate from that already-decided readiness. Task 11 records the result. Task 12 is the only production-pipeline integration task and must preserve the pre-sanitizer capture order shown above.

## Plan self-review

- **Spec coverage:** all spec sections 1–25 are represented by the file map, tasks, global constraints or acceptance tests; the explicit minimum 26 tests and the five correction contracts are included in the 42-contract allocation.
- **Placeholder scan:** no `TBD`, `TODO`, `FIXME`, vague “write tests” step or unnamed file is present.
- **Type consistency:** all later tasks consume `DocumentAssemblyInput`, `DocumentAssemblyResult`, `DocumentAssemblyFinding`, `CoverageReconciliation`, `SectionContract`, `runDocumentAssemblyQualityGate` and `recordDocumentAssembly` introduced by earlier tasks.
- **Scope:** the plan changes no FASE 5B decision or provider; it adds only the document-level layer and one integration seam.

**Plan status:** ready for inline execution after review; this document does not implement FASE 6.
