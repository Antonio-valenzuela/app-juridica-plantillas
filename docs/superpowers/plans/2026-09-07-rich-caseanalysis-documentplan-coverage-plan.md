# RichCaseAnalysis DocumentPlan Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Each step uses checkbox syntax and must be completed in order.

**Goal:** Make `RichCaseAnalysis` the direct source for canonical Coverage and planning while preserving the existing legacy path only when rich analysis is absent.

**Architecture:** Extend the existing `DocumentCoverageItem`, `DocumentNode`, `GenerationTask`, semantic evaluation and trace contracts additively. Add one pure `richCoverage` builder and one coverage policy helper, dispatch from the existing public `buildCoverageMatrix` entry point, bind Coverage to template section IDs, and reuse the current task/execution pipeline. The rich path never projects to legacy arrays before building Coverage or a plan; the legacy builder remains an explicit fallback.

**Tech Stack:** TypeScript, Next.js 16.3.4, Vitest 4, existing `buildDocumentIndex`, `RichCaseAnalysis`, `GenerationTraceContext`, PowerShell validation commands, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-rich-caseanalysis-documentplan-coverage-design.md`

## Global Constraints

- Preserve the accepted baseline: 135 test files; 1,983 tests passed; 2 skipped; 0 failures; typecheck passed; lint 0 errors and 973 warnings; build blocked before Next by the known Prisma `EPERM` DLL rename.
- `RichCaseAnalysis` is canonical whenever `caseAnalysis.richCaseAnalysis` exists. The only supported rich flow is `RichCaseAnalysis → Coverage/DocumentPlan`; never `RichCaseAnalysis → legacy projection → plan`.
- The legacy Coverage and planning path runs only when `richCaseAnalysis` is absent. Existing legacy consumers and tests remain supported.
- The rich path may not synthesize `CIERTO`, `SE_IGNORA`, `IMPROCEDENTE`, admission, denial, defense, exception or any client position. Unknown posture remains `NEEDS_CLIENT_POSITION`, `needs_client_position` or an equivalent explicit state.
- `SOURCE_ASSERTION`, `SOURCE_MENTIONED`, `SOURCE_CITED` and `SOURCE_POSITION` never become stronger semantic states through planning or compatibility aliases.
- `EvidenceMention` never creates `EvidenceOffer`; only an explicit `EvidenceOffer` creates offer Coverage. `DocumentItem` never becomes an offer automatically.
- Relationships are copied only from explicit rich IDs. Missing relationships are `UNLINKED`/`UNKNOWN`; no text similarity, co-occurrence or proximity inference is introduced.
- Conflicts remain open. No date, amount, identity, role or factual version is selected automatically.
- `SUBSTANTIVE` Coverage requires an eligible semantically evaluated response. `FORMAL` Coverage may use `FORMAL_DETERMINISTIC_ALLOWED` for permitted structural blocks. Headings, paragraphs, length, technical success, placeholders, local fallback and generic fallback never satisfy substantive Coverage.
- Do not create universal sections or a monolithic “Derecho” Coverage item. Do not add legal defenses, exceptions, norms, jurisprudence, procedural posture, `LegalIssueMatrix` or deep legal generation.
- Add `COVERAGE_ITEM` only for a concrete Coverage category that cannot be represented by `ISSUE`, `CLAIM`, `FACT_RESPONSE`, `EVIDENCE`, `SECTION_SUPPORT` or `PROCEDURAL_GROUNDS`; each such use must be justified by a test.
- Do not modify `.env`, initialize Git, stop Next processes, add migrations, persist new trace data, simulate NVIDIA or refactor the DOCX renderer.
- Reuse existing DOCX metadata and content provenance. No visual or textual expansion is part of this phase.
- Use TDD for every behavior: write a failing focused test, run it, implement the smallest change, rerun the focused test, run `npm run typecheck`, then record a checkpoint. Do not run the full suite before Task 19.
- Checkpoints are validation records only because this checkout has no `.git`; do not create commits or initialize a repository.

## File Map

| File | Responsibility in this plan |
| --- | --- |
| `lib/legal-engine/coverageMatrix.ts` | Preserve the public builder, expose extended types, dispatch rich-first, retain legacy fallback, summarize and validate rich links. |
| `lib/legal-engine/richCoverage.ts` | Pure construction of CoverageItems from `RichCaseAnalysis`, with explicit entity links, status, scope and policy. |
| `lib/legal-engine/coveragePolicy.ts` | Decide whether a CoverageItem is satisfied by linked blocks and semantic evaluations. |
| `lib/legal-engine/types.ts` | Add optional `DocumentNode` Coverage metadata. |
| `lib/legal-engine/documentPlan.ts` | Preserve template selection and expose Coverage-aware plan metadata. |
| `lib/legal-engine/contestacionStructure.ts` | Add a direct rich branch for contestación skeletons with neutral posture text. |
| `lib/legal-engine/pipeline.ts` | Build one canonical matrix, bind it to the plan, pass it to tasks/evaluation and trace. |
| `lib/legal-engine/generationTasks.ts` | Map individual CoverageItems to existing task types and conditionally add `COVERAGE_ITEM`. |
| `lib/legal-engine/semanticEvaluator.ts` | Apply the Coverage satisfaction policy and preserve auditable reasons. |
| `lib/legal-engine/qualityGate.ts` | Add structural Coverage gates without legal reasoning or length gates. |
| `lib/legal-engine/generationTrace.ts` | Record rich entity IDs, section links, scope, policy and Coverage transitions. |
| `tests/fixtures/richCoverageFixtures.ts` | Add deterministic fixture F and helpers for rich-first tests. |
| `tests/legal-engine/richCoverageTypes.test.ts` | Type and metadata contracts. |
| `tests/legal-engine/richCoverageBuilder.test.ts` | Dispatch, individual entity Coverage and explicit relationships. |
| `tests/legal-engine/richCoveragePolicy.test.ts` | Formal/substantive satisfaction and false Coverage barriers. |
| `tests/legal-engine/richDocumentPlan.test.ts` | Section binding, rich contestación skeleton and posture preservation. |
| `tests/legal-engine/richGenerationTasks.test.ts` | Coverage-to-task atomic mapping and conditional `COVERAGE_ITEM`. |
| `tests/legal-engine/richCoverageQualityTrace.test.ts` | Semantic evaluator, QualityGate and trace contracts. |
| `tests/legal-engine/richCoverageLegacyRegression.test.ts` | Legacy fallback and existing consumer compatibility. |
| `tests/legal-engine/richCoverageFixtureMetrics.test.ts` | Fixture A–F metrics and deterministic reports. |

---

### Task 1: Extend canonical Coverage and section metadata

**Purpose:** Establish the additive type contract that every later rich Coverage, section, task and trace step consumes.

**Files:**
- Modify: `lib/legal-engine/coverageMatrix.ts:20-80` (`CoverageCategory`, `CoverageItemStatus`, `DocumentCoverageItem`, `CoverageMatrix`).
- Modify: `lib/legal-engine/types.ts:272-320` (`DocumentNode`).
- Test: `tests/legal-engine/richCoverageTypes.test.ts`.

**Interfaces:**
- Consumes: existing `SourceProvenance`, `SourceReference`, `DocumentNode`, `CoverageMatrix` and `BlockQualityEvaluation` shapes.
- Produces: `CoverageScope`, `CoverageSatisfactionPolicy`, `CoverageEntityType`, rich link fields, `blocking`, `requiresClientPosition`, `statusReason`, section Coverage metadata and additive summary counters.

- [ ] **Step 1: Write the failing type and metadata tests.**

```ts
import { describe, expect, it } from 'vitest';
import type { DocumentCoverageItem, CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import type { DocumentNode } from '@/lib/legal-engine/types';

describe('rich Coverage contracts', () => {
  it('represents entity links, scope, policy and blocking without changing legacy fields', () => {
    const item: DocumentCoverageItem = {
      id: 'cov-claim-rich-1',
      category: 'CLAIM_RESPONSE',
      description: 'Responder la pretensión fuente',
      required: true,
      status: 'needs_client_position',
      targetSectionIds: ['sec-prestaciones'],
      sourceEntityType: 'CLAIM',
      sourceEntityIds: ['claim-rich-1'],
      claimIds: ['claim-rich-1'],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
      requiresClientPosition: true,
      statusReason: 'La postura del cliente no está confirmada',
      relationStatus: 'EXPLICIT',
      provenance: [],
    };
    expect(item.claimIds).toEqual(['claim-rich-1']);
    expect(item.scope).toBe('SUBSTANTIVE');
    expect(item.satisfactionPolicy).toBe('REQUIRES_SEMANTIC_RESPONSE');
    expect(item.blocking).toBe(true);
  });

  it('allows a DocumentNode to explain its Coverage origin', () => {
    const section = { coverageItemIds: ['cov-formal-header'], requiredCoverageItemIds: ['cov-formal-header'], coverageReason: 'Requisito formal del template' } as DocumentNode;
    expect(section.coverageItemIds).toEqual(['cov-formal-header']);
    expect(section.requiredCoverageItemIds).toEqual(['cov-formal-header']);
    expect(section.coverageReason).toContain('template');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the rich fields are absent.**

Run: `npm run test -- --run tests/legal-engine/richCoverageTypes.test.ts`

Expected: FAIL with TypeScript/Vitest diagnostics for missing `CLAIM_RESPONSE`, `needs_client_position`, rich link fields and `DocumentNode.coverageItemIds`.

- [ ] **Step 3: Add the smallest additive type definitions.**

Add the unions and optional fields from the approved spec. Keep all existing categories/statuses. Add summary counters (`blocked`, `needsClientPosition`, `contradictory`, `insufficient`) as optional fields so legacy matrix literals remain valid. Add `coverageItemIds?: string[]`, `requiredCoverageItemIds?: string[]` and `coverageReason?: string` to `DocumentNode`.

- [ ] **Step 4: Run the focused test and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageTypes.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0 with no new diagnostics.

- [ ] **Step 5: Record the checkpoint.**

Done when the new fields compile, existing Coverage literals remain valid, the focused test passes, and typecheck is clean. Risk: widening unions can expose exhaustive switches; resolve only by preserving existing behavior. Dependency: all later builders use these exact field names.

### Task 2: Add the rich Coverage builder and explicit dispatcher

**Purpose:** Separate rich-first construction from the existing legacy builder while preserving the public entry point.

**Files:**
- Create: `lib/legal-engine/richCoverage.ts`.
- Modify: `lib/legal-engine/coverageMatrix.ts:155-410`, renaming the current implementation internally to `buildLegacyCoverageMatrix` and dispatching from `buildCoverageMatrix`.
- Create: `tests/fixtures/richCoverageFixtures.ts` with the minimal rich-analysis/document factories used by the following tasks.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis`, `CaseAnalysis`, `UniversalLegalDocument`, `DocumentNode[]`.
- Produces: `buildRichCoverageMatrix(rich, doc, sections)` and a public `buildCoverageMatrix` that selects rich only when `caseAnalysis.richCaseAnalysis` is present.

- [ ] **Step 1: Write the failing rich-first dispatch test.**

```ts
import { describe, expect, it } from 'vitest';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { makeFixtureFCaseAnalysis, makeFixtureDocument } from '@/tests/fixtures/richCoverageFixtures';

describe('Coverage builder dispatch', () => {
it('uses rich entities even when legacy arrays disagree', () => {
  const analysis = makeFixtureFCaseAnalysis({
    claims: ['LEGACY CLAIM THAT MUST NOT DRIVE RICH PLANNING'],
    facts: [],
    richCaseAnalysis: { claims: [], facts: [], parties: [], assertions: [], documents: [], evidenceMentions: [], evidenceOffers: [], arguments: [], authorities: [], dates: [], amounts: [], conflicts: [], missingData: [], sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] }, clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] }, extractionStats: {} as any, candidates: [] },
  });
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  expect(matrix.items).toEqual([]);
  expect(matrix.items.some((item) => item.description.includes('LEGACY CLAIM'))).toBe(false);
});

  it('uses legacy behavior only when richCaseAnalysis is absent', () => {
    const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
    analysis.claims = ['LEGACY CLAIM'];
    const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
    expect(matrix.items.some((item) => item.description.includes('LEGACY CLAIM'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts`

Expected: FAIL because the fixture helper and rich dispatcher do not yet exist.

- [ ] **Step 3: Implement the dispatcher and pure builder shell.**

Move the existing body into a private/exported `buildLegacyCoverageMatrix`. Add `buildRichCoverageMatrix` with deterministic section-role input and an empty `items` array initially. In `buildCoverageMatrix`, branch only on `Boolean(caseAnalysis.richCaseAnalysis)`. Do not read legacy arrays in the rich branch. Keep document ID/type and summary shape stable. In `tests/fixtures/richCoverageFixtures.ts`, define the exported `makeFixtureFCaseAnalysis(overrides?)`, `makeFixtureDocument()` and `fixtureFSourceDocuments()` factories with stable IDs and a valid empty `RichCaseAnalysis` shape; later tasks extend the same fixture with its full entities.

- [ ] **Step 4: Run the focused test and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts`

Expected: both dispatch tests PASS. The first test proves that the rich branch returns no legacy claim item even when the legacy array is populated; entity assertions belong to Tasks 3–7.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when rich and legacy paths are structurally separate, the rich path cannot reach legacy arrays, and the fallback test passes. Risk: renaming the legacy function can break imports; keep `buildCoverageMatrix` as the only public entry point and update no unrelated callers. Dependency: Tasks 3–7 fill `buildRichCoverageMatrix`.

### Task 3: Build individual Claim Coverage without posture synthesis

**Purpose:** Represent every material rich claim as an independently traceable substantive requirement.

**Files:**
- Modify: `lib/legal-engine/richCoverage.ts`.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis.claims`, explicit claimant/factual/evidence IDs, `ClientPosition` when proposition IDs match explicitly.
- Produces: one `CLAIM_RESPONSE` CoverageItem per material `ClaimItem`, with provenance and `requiresClientPosition` metadata.

- [ ] **Step 1: Add the failing claim contracts.**

```ts
it('creates one substantive CoverageItem per rich claim and preserves explicit links', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  const claims = matrix.items.filter((item) => item.claimIds?.length === 1);
  expect(claims).toHaveLength(2);
  expect(claims.map((item) => item.claimIds?.[0])).toEqual(['fixture-f-claim-1', 'fixture-f-claim-2']);
  expect(claims.every((item) => item.scope === 'SUBSTANTIVE')).toBe(true);
  expect(claims.some((item) => item.description.includes('IMPROCEDENTE'))).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "one substantive CoverageItem per rich claim"`

Expected: FAIL because the rich builder has no claim items.

- [ ] **Step 3: Implement the claim builder.**

Iterate `rich.claims` in stable array order. Emit `CLAIM_RESPONSE` with `sourceEntityType: 'CLAIM'`, exact `claimIds`, explicit `factualBasisIds` in `factIds`, explicit `evidenceMentionIds`, all claim provenance, `scope: 'SUBSTANTIVE'`, `satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE'`, and `status: 'pending'` unless an explicit linked client position is unknown, in which case use `needs_client_position`. Do not populate contested status, improcedencia, defense or exception text.

- [ ] **Step 4: Run the focused claim tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "rich claim"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when every rich claim has its own Coverage, explicit links are copied, and no generated claim description contains a synthesized posture. Risk: claim IDs may be empty in malformed input; skip only non-material entries and add a review reason rather than inventing an ID. Dependency: Task 4 reuses the same helper for facts.

### Task 4: Build individual Fact Coverage and posture blockers

**Purpose:** Require an individual fact response while preserving source assertion state and unknown client posture.

**Files:**
- Modify: `lib/legal-engine/richCoverage.ts`.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis.facts`, `ClientPosition`, `MissingDataItem`, explicit related document IDs.
- Produces: one `FACT_RESPONSE` CoverageItem per material fact and a linked `MISSING_CLIENT_POSITION` item when posture is unknown and relevant.

- [ ] **Step 1: Add failing fact/posture contracts.**

```ts
it('keeps SOURCE_ASSERTION and unknown client posture without inventing a response', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  const fact = matrix.items.find((item) => item.factIds?.includes('fixture-f-fact-1'))!;
  expect(fact.scope).toBe('SUBSTANTIVE');
  expect(fact.metadata?.assertionStatus).toBe('SOURCE_ASSERTION');
  expect(fact.status).toBe('needs_client_position');
  expect(fact.metadata?.responseKind).toBeUndefined();
  const missing = matrix.items.find((item) => item.category === 'MISSING_CLIENT_POSITION' && item.factIds?.includes('fixture-f-fact-1'));
  expect(missing?.blocking).toBe(true);
});

it('links a confirmed client position only when proposition IDs explicitly match', () => {
  const analysis = makeFixtureFCaseAnalysis({ confirmedFactPosition: 'fixture-f-fact-2' });
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  const fact = matrix.items.find((item) => item.factIds?.includes('fixture-f-fact-2'))!;
  expect(fact.metadata?.clientPositionStatus).toBe('CONFIRMED');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "SOURCE_ASSERTION|confirmed client position"`

Expected: FAIL because fact and posture Coverage are absent.

- [ ] **Step 3: Implement fact and missing-position construction.**

Emit one `FACT_RESPONSE` per material `FactItem`, copy `assertionStatus`, date/amount metadata and explicit fact links, and set `requiresClientPosition: true` for a contestación response. Match a client position only by an explicit proposition ID. For unknown posture, emit `MISSING_CLIENT_POSITION` with `scope: 'SUBSTANTIVE'`, `blocking` from the linked missing-data item (default true only when the fact response is required), and a reason naming the missing field. Never assign `responseKind`.

- [ ] **Step 4: Run the focused tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "SOURCE_ASSERTION|confirmed client position"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when all material facts are individually covered, source assertion state is observable, unknown posture blocks only the affected requirement, and no `CIERTO`, `FALSO`, `SE_IGNORA`, admission or denial is synthesized. Risk: `ClientPosition.propositionIds` may refer to assertions rather than facts; only exact IDs may match. Dependency: Tasks 8 and 13 consume these status reasons.

### Task 5: Separate EvidenceMention and EvidenceOffer Coverage

**Purpose:** Ensure mentioned evidence can be analyzed without being converted into an offer by inference.

**Files:**
- Modify: `lib/legal-engine/richCoverage.ts`.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis.documents`, `evidenceMentions`, `evidenceOffers` and their explicit claim/fact links.
- Produces: `EVIDENCE_TREATMENT` and explicit `EVIDENCE_OFFER` CoverageItems with independent IDs and provenance.

- [ ] **Step 1: Add failing evidence contracts.**

```ts
it('creates treatment for EvidenceMention without creating an EvidenceOffer', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  const mention = matrix.items.find((item) => item.evidenceMentionIds?.includes('fixture-f-evidence-mention-1'))!;
  expect(mention.category).toBe('EVIDENCE_TREATMENT');
  expect(mention.evidenceOfferIds || []).toEqual([]);
  expect(matrix.items.some((item) => item.evidenceOfferIds?.includes('fixture-f-evidence-mention-1'))).toBe(false);
});

it('creates offer Coverage only for an explicit EvidenceOffer', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const matrix = buildCoverageMatrix(analysis, makeFixtureDocument(), makeFixtureDocument().sections);
  const offer = matrix.items.find((item) => item.evidenceOfferIds?.includes('fixture-f-offer-1'))!;
  expect(offer.category).toBe('EVIDENCE_OFFER');
  expect(offer.sourceEntityType).toBe('EVIDENCE_OFFER');
});
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "EvidenceMention|EvidenceOffer"`

Expected: FAIL because evidence Coverage is not emitted.

- [ ] **Step 3: Implement separate evidence builders.**

For each material `EvidenceMention`, emit treatment with exact mention ID, explicit related fact/claim IDs, `SOURCE_MENTIONED` metadata, `scope: 'SUBSTANTIVE'` only when the document requires treatment, and `REFERENCE_ONLY` otherwise. For each explicit `EvidenceOffer`, emit a separate offer item linked to its mention ID and preserve `PARTY_OFFERED`/`CLIENT_CONFIRMED` status without deriving it. Never set `confirmed` from mention presence.

- [ ] **Step 4: Run focused evidence tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "EvidenceMention|EvidenceOffer"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when mentions and offers are separate Coverage types, a mentioned document cannot become an offer, and explicit claim/fact links are preserved. Risk: existing legacy evidence tests expect `relatedEvidenceIds`; populate those aliases only in the compatibility view. Dependency: Task 12 maps treatment and offer items to tasks.

### Task 6: Add MissingData and Conflict Coverage

**Purpose:** Make unresolved information and conflicting source values visible, independently addressable and correctly blocking.

**Files:**
- Modify: `lib/legal-engine/richCoverage.ts`.
- Modify: `lib/legal-engine/coverageMatrix.ts` summary and invariant validation.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis.missingData`, `conflicts`, entity IDs in each conflict.
- Produces: individual `MISSING_CLIENT_POSITION`/missing-data Coverage and blocking `CONFLICT_REVIEW` Coverage with open status.

- [ ] **Step 1: Add failing missing-data and conflict contracts.**

```ts
it('keeps blocking and informational missing data distinct', () => {
  const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
  const blocking = matrix.items.find((item) => item.missingDataIds?.includes('fixture-f-missing-posture'))!;
  const informational = matrix.items.find((item) => item.missingDataIds?.includes('fixture-f-missing-secondary'))!;
  expect(blocking.blocking).toBe(true);
  expect(informational.blocking).toBe(false);
});

it('leaves every material conflict open and blocking', () => {
  const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
  const conflict = matrix.items.find((item) => item.conflictIds?.includes('fixture-f-conflict-1'))!;
  expect(conflict.category).toBe('CONFLICT_REVIEW');
  expect(conflict.status).toBe('blocked');
  expect(conflict.statusReason).toMatch(/revisi[oó]n/i);
  expect(conflict.metadata?.selectedSourceId).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "missing data|conflict"`

Expected: FAIL because these Coverage categories are absent.

- [ ] **Step 3: Implement missing-data and conflict items.**

Emit one item per relevant `MissingDataItem`, copying `field`, `importance`, `blocking`, `requiresClientInput`, `sectionAffected` and `sourceSearched`. Emit one `CONFLICT_REVIEW` per `CaseConflict`, with all `itemIds` and `sourceIds`, `blocking: true` when the conflict touches required content, `status: 'blocked'`, and a review reason. Do not select a source or value.

- [ ] **Step 4: Update summary and invariant validation, then run tests/typecheck.**

Count new statuses in `CoverageMatrix.summary`; validate every rich entity ID against the corresponding `RichCaseAnalysis` set when rich analysis is supplied. Keep legacy validation unchanged when rich analysis is absent.

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "missing data|conflict"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when blocking and informational missing data are observable separately and conflicts remain open without a winner. Risk: a conflict may refer to an entity not yet materialized; validation reports an orphan instead of manufacturing an entity. Dependency: Tasks 8 and 14 consume the blocking flags.

### Task 7: Add SourceArgument, authority and petition-support Coverage

**Purpose:** Track source arguments, unverified authority mentions and explicit petition support without generating legal conclusions.

**Files:**
- Modify: `lib/legal-engine/richCoverage.ts`.
- Test: `tests/legal-engine/richCoverageBuilder.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis.arguments`, `authorities`, explicit argument fact/authority IDs, document/template petition context.
- Produces: individual `SOURCE_ARGUMENT_RESPONSE`, `AUTHORITY_MENTION` and `PETITION_SUPPORT` items with unverified authority status preserved.

- [ ] **Step 1: Add failing argument/authority/petition contracts.**

```ts
it('preserves source arguments and cited authorities without legal verification', () => {
  const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
  const argument = matrix.items.find((item) => item.argumentIds?.includes('fixture-f-argument-1'))!;
  const authority = matrix.items.find((item) => item.authorityMentionIds?.includes('fixture-f-authority-1'))!;
  expect(argument.category).toBe('SOURCE_ARGUMENT_RESPONSE');
  expect(argument.factIds).toEqual(['fixture-f-fact-2']);
  expect(authority.metadata?.verificationStatus).toBe('SOURCE_CITED');
  expect(authority.metadata?.verificationStatus).not.toBe('LEGALLY_VERIFIED');
});

it('creates petition support only when a petition requirement has explicit supporting links', () => {
  const matrix = buildCoverageMatrix(makeFixtureFCaseAnalysis(), makeFixtureDocument(), makeFixtureDocument().sections);
  const petition = matrix.items.find((item) => item.category === 'PETITION_SUPPORT');
  expect(petition?.factIds).toEqual(['fixture-f-fact-2']);
});
```

- [ ] **Step 2: Run the focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "source arguments|cited authorities|petition support"`

Expected: FAIL because the rich builder does not emit these categories.

- [ ] **Step 3: Implement argument, authority and petition builders.**

Emit one argument item per material `ArgumentItem`, copy only `supportingFactIds` and `citedAuthorityIds`, and preserve provenance. Emit authority items with `SOURCE_CITED` metadata. Emit petition support only for a petition section/requirement declared by the template or rich context and only with explicit supporting IDs; never create a conclusion or legal basis.

- [ ] **Step 4: Run focused tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts -t "source arguments|cited authorities|petition support"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when source arguments and authorities remain source-level, petition support is explicit, and no legal verification or conclusion is created. Risk: existing templates may have petition sections without links; emit an unsupported/pending Coverage item rather than inventing support. Dependency: Task 12 maps these items to tasks and Task 14 gates unsupported petitions.

### Task 8: Implement the formal/substantive Coverage policy

**Purpose:** Provide one auditable rule for allowing legitimate deterministic formal blocks while rejecting false substantive Coverage.

**Files:**
- Create: `lib/legal-engine/coveragePolicy.ts`.
- Modify: `lib/legal-engine/coverageMatrix.ts` for policy metadata defaults.
- Test: `tests/legal-engine/richCoveragePolicy.test.ts`.

**Interfaces:**
- Consumes: `DocumentCoverageItem`, `ContentBlock`, `BlockQualityEvaluation`.
- Produces: `isCoverageSatisfied(item, blocks, evaluations)` returning `{ satisfied, reason }` and deterministic policy helpers.

- [ ] **Step 1: Write failing policy tests.**

```ts
import { isCoverageSatisfied } from '@/lib/legal-engine/coveragePolicy';

it('allows an approved deterministic formal block', () => {
  const item = { id: 'cov-formal-signature', scope: 'FORMAL', satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED', required: true, status: 'generated', targetSectionIds: [], category: 'FORMAL_REQUIREMENT', description: '', blocking: false } as any;
  const block = { id: 'block-signature', text: 'Firma de la parte promovente', generatedBy: 'DETERMINISTIC', coverageItemIds: [item.id], generationRequirement: 'DETERMINISTIC' } as any;
  expect(isCoverageSatisfied(item, [block], [])).toEqual({ satisfied: true, reason: 'VALID_STRUCTURAL_BLOCK' });
});

it('rejects deterministic, local fallback and placeholder blocks for substantive Coverage', () => {
  const item = { id: 'cov-fact-response', scope: 'SUBSTANTIVE', satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', required: true, status: 'generated', targetSectionIds: [], category: 'FACT_RESPONSE', description: '', blocking: true } as any;
  const block = { id: 'block-placeholder', text: '[DATO PENDIENTE]', generatedBy: 'FALLBACK', fallbackStatus: 'LOCAL_PLACEHOLDER', coverageItemIds: [item.id] } as any;
  const result = isCoverageSatisfied(item, [block], []);
  expect(result.satisfied).toBe(false);
  expect(result.reason).toMatch(/NOT_COVERAGE|PLACEHOLDER|fallback/i);
});
```

- [ ] **Step 2: Run focused policy tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoveragePolicy.test.ts`

Expected: FAIL because `coveragePolicy.ts` does not exist.

- [ ] **Step 3: Implement the policy helper.**

Require an exact Coverage ID on a linked block. For `FORMAL_DETERMINISTIC_ALLOWED`, permit only `generatedBy: 'DETERMINISTIC'` blocks without placeholder/fallback markers. For `REQUIRES_SEMANTIC_RESPONSE`, require a linked block plus a `PASS` evaluation whose `blockId` matches and whose hard-fail reasons do not indicate unresolved dependencies. Reject `LOCAL_PLACEHOLDER`, `FALLBACK`, generic deterministic text, empty text and `REFERENCE_ONLY` as substantive satisfaction. Return stable reason codes matching `CoverageTraceStatusReason`.

- [ ] **Step 4: Run focused tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoveragePolicy.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when formal deterministic blocks can pass only their formal item and every false substantive Coverage case is rejected with an auditable reason. Risk: semantic evaluator verdict enums may differ in casing; use the existing `EvaluationVerdict` type and normalize only at the helper boundary. Dependency: Tasks 13–15 call this helper.

### Task 9: Bind Coverage to DocumentPlan sections

**Purpose:** Make every material section explainable through canonical Coverage IDs, prove the mapping is template-generic, and report unmatched requirements.

**Files:**
- Modify: `lib/legal-engine/documentPlan.ts:313-380`.
- Modify: `lib/legal-engine/coverageMatrix.ts` or create `bindCoverageToSections` in `richCoverage.ts`.
- Modify: `lib/legal-engine/types.ts` only if Task 1 fields need adjustment.
- Test: `tests/legal-engine/richDocumentPlan.test.ts`.

**Interfaces:**
- Consumes: `CoverageMatrix`, `DocumentNode[]`, template section identity/type.
- Produces: `bindCoverageToSections(sections: DocumentNode[], matrix: CoverageMatrix): { sections: DocumentNode[]; orphanCoverageItemIds: string[] }`, section `coverageItemIds`, `requiredCoverageItemIds`, `coverageReason`, orphan diagnostics and stable `DocumentPlanResult` metadata.

- [ ] **Step 1: Write failing section-binding tests.**

```ts
function buildRichPlanForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const sections = buildDocumentPlan({ doc, template: getDocumentTemplate('contestacion_demanda_laboral'), caseAnalysis: analysis }).sections;
  const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
  const binding = bindCoverageToSections(sections, matrix);
  return { sections: binding.sections, matrix, orphans: binding.orphanCoverageItemIds };
}

it('explains each material section through Coverage IDs and keeps required IDs valid', () => {
  const result = buildRichPlanForFixtureF();
  const section = result.sections.find((item) => item.type === 'facts')!;
  expect(section.coverageItemIds?.length).toBeGreaterThan(0);
  expect(section.requiredCoverageItemIds).toEqual(expect.arrayContaining(section.coverageItemIds!.filter((id) => id.includes('fact'))));
  expect(section.coverageReason).toMatch(/Coverage|hecho/i);
});

function buildRichPlanWithOrphanCoverage() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const sections = buildDocumentPlan({ doc, template: getDocumentTemplate('contestacion_demanda_laboral'), caseAnalysis: analysis }).sections;
  const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
  matrix.items.push({ id: 'cov-orphan-rich', category: 'SOURCE_ARGUMENT_RESPONSE', description: 'orphan', required: true, status: 'blocked', targetSectionIds: [], scope: 'SUBSTANTIVE', satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true, requiresClientPosition: false });
  const binding = bindCoverageToSections(sections, matrix);
  return { sections: binding.sections, matrix, orphans: binding.orphanCoverageItemIds };
}

it('reports a rich Coverage item without an eligible section instead of assigning by title text', () => {
  const result = buildRichPlanWithOrphanCoverage();
  expect(result.orphans).toContain('cov-orphan-rich');
  expect(result.sections.some((section) => section.coverageItemIds?.includes('cov-orphan-rich'))).toBe(false);
});

it('maps claims and petition support to their distinct canonical sections for a non-labor template', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = { ...makeFixtureDocument(), documentType: 'contestacion_demanda_civil', documentTypeLabel: 'Contestación civil' };
  const sections = buildDocumentPlan({ doc, template: getDocumentTemplate('contestacion_demanda_civil'), caseAnalysis: analysis }).sections;
  const matrix = buildCoverageMatrix(analysis, { ...doc, sections }, sections);
  const binding = bindCoverageToSections(sections, matrix);
  const claim = matrix.items.find((item) => item.category === 'CLAIM_RESPONSE')!;
  const petition = matrix.items.find((item) => item.category === 'PETITION_SUPPORT')!;
  expect(binding.sections.find((section) => section.coverageItemIds?.includes(claim.id))?.type).not.toBe('petition');
  expect(binding.sections.find((section) => section.coverageItemIds?.includes(petition.id))?.type).toBe('petition');
});
```

Import `buildDocumentPlan`, `buildCoverageMatrix`, `bindCoverageToSections`, `getDocumentTemplate`, `makeFixtureFCaseAnalysis` and `makeFixtureDocument` at the top of the test file. The two helper functions above are test-local and make every dependency explicit.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "Coverage IDs|orphan"`

Expected: FAIL because sections do not yet expose rich Coverage links.

- [ ] **Step 3: Implement deterministic section binding.**

Use exact `DocumentNode.type` and template-declared canonical section IDs. Map facts to `facts`/`background`, `CLAIM_RESPONSE` only to the template's canonical claims/prestations response section, `PETITION_SUPPORT` only to `petition`, evidence to `evidence`, arguments/issues to `argument`/`legal_grounds`, and formal requirements to their declared section. Do not use title regexes in the rich branch and do not add labor- or civil-specific rules; both templates must use the same type/metadata mapping. Leave unmatched substantive items orphaned and blocked. Set `coverageReason` from entity category and IDs, and assert required IDs are a subset.

- [ ] **Step 4: Run focused tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "Coverage IDs|orphan"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when each material section can answer why it exists, required IDs are valid, and unmatched rich Coverage is reported rather than silently attached by heading text. Risk: older templates may omit an expected typed section; preserve the template and mark the item orphaned. Dependency: Tasks 10–12 consume section Coverage IDs.

### Task 10: Add the direct rich branch to contestaciónStructure

**Purpose:** Build contestación structure from rich IDs and neutral seeds without consulting legacy semantic arrays.

**Files:**
- Modify: `lib/legal-engine/contestacionStructure.ts` at `buildContestacionSkeleton` and its helper types.
- Modify: `lib/legal-engine/documentPlan.ts` only for the new optional rich argument.
- Test: `tests/legal-engine/richDocumentPlan.test.ts`.

**Interfaces:**
- Consumes: `RichCaseAnalysis`, `savedParties`, template section IDs.
- Produces: a contestación skeleton whose seeds carry rich IDs and neutral instructions without reading legacy arrays when rich analysis exists.

- [ ] **Step 1: Write failing rich skeleton tests.**

```ts
function buildContestacionRichFixtureDocument(options: { legacyClaim?: string } = {}) {
  const analysis = makeFixtureFCaseAnalysis(options.legacyClaim ? { claims: [options.legacyClaim] } : {});
  const doc = makeFixtureDocument();
  const template = getDocumentTemplate('contestacion_demanda_laboral');
  return { ...doc, sections: buildDocumentPlan({ doc, template, caseAnalysis: analysis }).sections };
}

it('builds contestación seeds from rich entities and leaves unknown posture neutral', () => {
  const doc = buildContestacionRichFixtureDocument();
  const ids = doc.sections.flatMap((section) => section.content.flatMap((block) => block.coverageItemIds || []));
  const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  expect(ids.some((id) => id.includes('fixture-f-fact-1'))).toBe(true);
  expect(text).not.toMatch(/\b(CIERTO|SE_IGNORA|IMPROCEDENTE|SE NIEGA|excepci[oó]n|defensa)\b/i);
});

it('does not let contradictory legacy claim text contaminate the rich skeleton', () => {
  const doc = buildContestacionRichFixtureDocument({ legacyClaim: 'IMPROCEDENTE POR PRESCRIPCIÓN' });
  const text = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  expect(text).not.toContain('IMPROCEDENTE POR PRESCRIPCIÓN');
});

it('keeps technical rich IDs in metadata and out of visible block text', () => {
  const doc = buildContestacionRichFixtureDocument();
  const visible = doc.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');
  expect(visible).not.toMatch(/fixture-f-fact-1|cov-claim-|task-/i);
});
```

Import `buildDocumentPlan`, `getDocumentTemplate`, `makeFixtureFCaseAnalysis` and `makeFixtureDocument`. The helper is test-local and uses the stable fixture factories from Task 2.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "rich entities|legacy claim text"`

Expected: FAIL because `buildContestacionSkeleton` currently reads legacy fields.

- [ ] **Step 3: Implement the smallest rich branch.**

Add an optional `richCaseAnalysis` parameter or branch from `caseAnalysis.richCaseAnalysis`. For rich input, iterate rich claims/facts/evidence mentions by ID, put IDs only in `coverageItemIds`, `factIds`, `evidenceIds` or other internal metadata, and use “postura pendiente de confirmación” where posture is unknown. Never place a rich ID, Coverage ID or task ID in visible seed text. Keep the existing legacy branch byte-compatible for absent rich analysis. Do not add defenses, exceptions or legal conclusions.

- [ ] **Step 4: Run focused tests, existing contestación tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "rich entities|legacy claim text"`

Expected: PASS.

Run: `npm run test -- --run tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/loop8bPhase2cContestations.test.ts`

Expected: all selected existing tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when rich skeleton creation never consults equivalent legacy arrays and unknown posture remains visibly pending without inventing a response. Risk: seeds are consumed by generation; ensure neutral wording does not become a legal conclusion. Dependency: Task 11 uses the same branch in drafting-plan construction.

### Task 11: Make buildDraftingPlan rich-first and remove synthesized postures

**Purpose:** Preserve explicit client positions only and stop the rich planner from fabricating response kinds or defenses.

**Files:**
- Modify: `lib/legal-engine/pipeline.ts:549-740` (`buildDraftingPlan`, `ClaimPlan`, `FactResponsePlan`, `SectionPlan`).
- Modify: `lib/legal-engine/documentPlan.ts` only if the plan result needs Coverage metadata.
- Test: `tests/legal-engine/richDocumentPlan.test.ts`.

**Interfaces:**
- Consumes: canonical `CoverageMatrix`, `RichCaseAnalysis`, section bindings.
- Produces: rich `DraftingPlan` with individual ClaimPlan/FactResponsePlan links and no implicit posture fields.

- [ ] **Step 1: Write failing plan posture tests.**

```ts
function buildRichDraftingPlanForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  return { plan: buildDraftingPlan(doc, 5000, analysis, matrix), matrix };
}

it('does not synthesize claim or fact responses from rich data', () => {
  const { plan } = buildRichDraftingPlanForFixtureF();
  const claims = plan.sections.flatMap((section) => section.claimPlans || []);
  const facts = plan.sections.flatMap((section) => section.factResponsePlans || []);
  expect(claims).toHaveLength(2);
  expect(claims.every((claim) => claim.contestedStatus === undefined && claim.defenseStrategy === undefined)).toBe(true);
  expect(facts).toHaveLength(4);
  expect(facts.every((fact) => fact.responseKind === undefined)).toBe(true);
  expect(facts.every((fact) => fact.relatedCoverageItemIds?.length)).toBe(true);
});
```

Import `buildDraftingPlan`, `buildCoverageMatrix`, `makeFixtureFCaseAnalysis` and `makeFixtureDocument`. The helper is test-local and its fourth argument becomes the additive matrix parameter specified in Step 3.

- [ ] **Step 2: Run focused test and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "synthesize claim or fact responses"`

Expected: FAIL because current code sets `IMPROCEDENTE`, `CIERTO` or `SE_IGNORA`.

- [ ] **Step 3: Add a canonical rich input branch to buildDraftingPlan.**

Accept an optional `coverageMatrix` parameter while preserving the existing signature behavior for callers that omit it. When rich analysis exists, construct ClaimPlans and FactResponsePlans from rich IDs and explicit links, leave posture fields undefined unless a direct confirmed `ClientPosition` match exists, and attach `relatedCoverageItemIds`. Do not read `caseAnalysis.claims`, `facts`, `claimResponses` or legacy evidence for this branch.

- [ ] **Step 4: Run focused and existing plan tests plus typecheck.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts -t "synthesize claim or fact responses"`

Expected: PASS.

Run: `npm run test -- --run tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/documentArchitecture.test.ts`

Expected: selected existing tests pass; any changed expectation must be limited to the new rich path and documented in the regression test.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when rich plans preserve explicit posture only, legacy plans remain compatible when rich analysis is absent, and no legal strategy text is synthesized. Risk: downstream task prompts expect `responseKind`; pass an explicit pending instruction rather than a fabricated enum. Dependency: Task 12 creates tasks from these plans.

### Task 12: Map Coverage atomically to GenerationTask

**Purpose:** Give each required generable CoverageItem an exact task link and justify any generic task type.

**Files:**
- Modify: `lib/legal-engine/generationTasks.ts:43-410`.
- Test: `tests/legal-engine/richGenerationTasks.test.ts`.

**Interfaces:**
- Consumes: `SectionPlan`, canonical `CoverageMatrix`, rich IDs and existing task constructors.
- Produces: one exact Coverage link per required generable item; conditional `COVERAGE_ITEM` task type only for unsupported categories.

- [ ] **Step 1: Write failing atomic-task tests.**

```ts
function buildRichTasksForFixtureF() {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const plan = buildDraftingPlan(doc, 5000, analysis, matrix);
  const tasks = plan.sections.flatMap((section) => buildGenerationTasksForSection(section, doc, analysis, matrix));
  return { tasks, matrix };
}

it('maps each required rich claim and fact to a task with exact Coverage IDs', () => {
  const { tasks, matrix } = buildRichTasksForFixtureF();
  for (const item of matrix.items.filter((candidate) => candidate.required && /CLAIM_RESPONSE|FACT_RESPONSE/.test(candidate.category))) {
    expect(tasks.filter((task) => task.coverageItemIds?.includes(item.id)).length).toBeGreaterThanOrEqual(1);
  }
  expect(tasks.flatMap((task) => task.coverageItemIds || []).some((id) => id.includes('legacy'))).toBe(false);
});

it('uses COVERAGE_ITEM only for conflict or missing-position work without a native task type', () => {
  const { tasks } = buildRichTasksForFixtureF();
  const generic = tasks.filter((task) => task.taskType === 'COVERAGE_ITEM');
  expect(generic.every((task) => task.coverageItemIds?.some((id) => /conflict|missing/.test(id)))).toBe(true);
});
```

Import `buildGenerationTasksForSection`, `buildDraftingPlan`, `buildCoverageMatrix`, `makeFixtureFCaseAnalysis` and `makeFixtureDocument`. The helper is test-local and uses only interfaces produced by earlier tasks.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richGenerationTasks.test.ts`

Expected: FAIL because the current builders group or omit rich Coverage IDs and `COVERAGE_ITEM` is not defined.

- [ ] **Step 3: Implement exact Coverage matching.**

Extend `GenerationTaskType` with `COVERAGE_ITEM` only after the test demonstrates a category without a native constructor. Update claim/fact/evidence/issue matching to use canonical rich IDs and `relatedCoverageItemIds`. Add a small generic constructor for conflict review, missing client position, source argument response or petition support only when no existing task type represents it. Reuse the existing generic context/execution branch.

- [ ] **Step 4: Run focused tests, task integration tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/phase4Integration.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when every required generable CoverageItem has an exact task link, no task reads legacy semantics in the rich branch, and every `COVERAGE_ITEM` occurrence has a failing test and justification. Risk: global task limits may be reached by individual Coverage; preserve limits and report blocked/orphan items instead of dropping silently. Dependency: Tasks 13–15 use task IDs for evaluation and trace.

### Task 13: Integrate policy into semantic evaluation

**Purpose:** Update Coverage only from linked block evidence and the approved satisfaction policy.

**Files:**
- Modify: `lib/legal-engine/semanticEvaluator.ts:856-915` and Coverage update helpers.
- Modify: `lib/legal-engine/generationTasks.ts:1169-1300` only for reason propagation.
- Test: `tests/legal-engine/richCoveragePolicy.test.ts`.

**Interfaces:**
- Consumes: `CoverageMatrix`, `ContentBlock`, `BlockQualityEvaluation`, `isCoverageSatisfied`.
- Produces: auditable Coverage status transitions with stable reasons and no false substantive Coverage.

- [ ] **Step 1: Write failing semantic integration tests.**

```ts
function makePassEvaluation(blockId: string) {
  return { blockId, taskId: 'task-fixture', verdict: 'PASS', overallScore: 0.95, hardFailReasons: [], deficiencies: [] } as any;
}

function makeSubstantiveCoverageCase() {
  const { doc, matrix, block } = makeBaseCoverageCase('SUBSTANTIVE', 'REQUIRES_SEMANTIC_RESPONSE', 'FACT_RESPONSE');
  return { doc, matrix, block };
}

function makeFormalOnlyCoverageCase() {
  const { doc, matrix } = makeBaseCoverageCase('FORMAL', 'FORMAL_DETERMINISTIC_ALLOWED', 'FORMAL_REQUIREMENT');
  matrix.items.push({ id: 'cov-substantive-fact', category: 'FACT_RESPONSE', description: 'fact', required: true, status: 'generated', targetSectionIds: [], scope: 'SUBSTANTIVE', satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true, requiresClientPosition: false });
  return { doc, matrix };
}

it('marks substantive Coverage covered only after a linked PASS evaluation', () => {
  const { doc, matrix, block } = makeSubstantiveCoverageCase();
  const evaluation = makePassEvaluation(block.id);
  applySemanticEvaluationToCoverageMatrix(matrix, [evaluation]);
  const result = evaluateDocumentSemantics(doc, matrix, [evaluation]);
  expect(result.uncoveredRequiredItems).not.toContain('cov-fact-response');
  expect(matrix.items.find((item) => item.id === 'cov-fact-response')?.status).toBe('covered');
});

it('keeps formal deterministic Coverage valid without treating it as substantive reasoning', () => {
  const { doc, matrix } = makeFormalOnlyCoverageCase();
  applySemanticEvaluationToCoverageMatrix(matrix, []);
  evaluateDocumentSemantics(doc, matrix, []);
  expect(matrix.items.find((item) => item.id === 'cov-formal-signature')?.status).toBe('covered');
  expect(matrix.items.find((item) => item.id === 'cov-substantive-fact')?.status).not.toBe('covered');
});
```

Define `makeBaseCoverageCase(scope, satisfactionPolicy, category)` in the test file with a minimal `UniversalLegalDocument`, one matrix item `cov-fact-response`/`cov-formal-signature` and one linked block. Import `applySemanticEvaluationToCoverageMatrix`, `evaluateDocumentSemantics` and the existing test document factory. These helpers are test-only and make the policy inputs explicit.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoveragePolicy.test.ts -t "linked PASS|formal deterministic"`

Expected: FAIL because global evaluation currently checks only `status !== 'covered'` and does not call the policy helper.

- [ ] **Step 3: Use `isCoverageSatisfied` in Coverage updates.**

For each required item, locate linked blocks by exact `coverageItemIds`, evaluate with the policy helper, set status to `covered` only when satisfied, otherwise preserve or set `generated`, `weak`, `blocked`, `insufficient` or `contradictory` with `metadata.coverageStatusReason`. Record a transition through the existing `GenerationTraceContext` hook when available.

- [ ] **Step 4: Run focused tests, existing semantic tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoveragePolicy.test.ts tests/legal-engine/phase5SemanticEvaluation.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when semantic status reflects linked content and policy rather than length, heading or task success. Risk: current global evaluation requires at least one evaluated block; retain that document-level behavior while Coverage policy remains item-specific. Dependency: Task 14 consumes final statuses.

### Task 14: Add bounded rich Coverage QualityGate rules

**Purpose:** Block only demonstrable structural Coverage defects while leaving legal judgment and length out of the gate.

**Files:**
- Modify: `lib/legal-engine/qualityGate.ts:83-520`.
- Test: `tests/legal-engine/richCoverageQualityTrace.test.ts`.

**Interfaces:**
- Consumes: `UniversalLegalDocument.coverageMatrix`, semantic evaluation, task/block IDs and missing data metadata.
- Produces: structural critical errors for unresolved required Coverage, posture, conflicts, petition support and EvidenceOffer treatment, with no word/page criterion.

- [ ] **Step 1: Write failing QualityGate tests.**

```ts
function makeQualityGateFixture(options: { unresolvedRequired?: boolean; blockingConflict?: boolean; informationalMissingOnly?: boolean; allRequiredCoverageCovered?: boolean } = {}) {
  const doc = makeFixtureDocument() as any;
  doc.coverageMatrix = makeCoverageMatrixForQualityGate(options);
  return doc;
}

it('blocks required substantive Coverage and blocking conflict', () => {
  const doc = makeQualityGateFixture({ unresolvedRequired: true, blockingConflict: true });
  const result = runQualityGateCheck(doc);
  expect(result.passed).toBe(false);
  expect(result.criticalErrors.map((error) => error.checkId)).toEqual(expect.arrayContaining([
    'UNRESOLVED_COVERAGE_REQUIREMENT',
    'BLOCKING_COVERAGE_CONFLICT',
  ]));
});

it('does not block only because an informational missing field exists', () => {
  const doc = makeQualityGateFixture({ informationalMissingOnly: true, allRequiredCoverageCovered: true });
  const result = runQualityGateCheck(doc);
  expect(result.criticalErrors.some((error) => error.checkId === 'MISSING_CLIENT_POSITION')).toBe(false);
});
```

Define `makeCoverageMatrixForQualityGate` in the same test file with explicit items for a required substantive item, a `CONFLICT_REVIEW` item and an informational missing-data item. Import `runQualityGateCheck` and `makeFixtureDocument`. The helper must set statuses directly so the test isolates QualityGate behavior.

- [ ] **Step 2: Run focused tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageQualityTrace.test.ts -t "required substantive|informational"`

Expected: FAIL because the new structural check IDs do not exist.

- [ ] **Step 3: Implement only the structural rich gates.**

Add checks for required items whose policy is substantive and whose status is unresolved, blocking `MISSING_CLIENT_POSITION`, blocking `CONFLICT_REVIEW`, required `PETITION_SUPPORT` without a satisfied link, and required `EVIDENCE_OFFER` without treatment. Reuse the existing `ValidationIssue` shape. Do not use word count, page count, number of paragraphs or legal conclusions.

- [ ] **Step 4: Run focused tests, existing QualityGate tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageQualityTrace.test.ts tests/legal-engine/coverageEligibility.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when structural defects block `FINAL_READY` and informational missing data remains non-critical. Risk: existing documents without rich Coverage must retain legacy gate behavior; guard rich-only checks behind rich metadata. Dependency: Task 16 wires the canonical matrix before this gate runs.

### Task 15: Extend GenerationTrace for rich Coverage provenance

**Purpose:** Preserve the complete rich entity to Coverage to task to block chain in sanitized trace artifacts.

**Files:**
- Modify: `lib/legal-engine/generationTrace.ts:70-450`.
- Test: `tests/legal-engine/richCoverageQualityTrace.test.ts`.

**Interfaces:**
- Consumes: rich Coverage items, section metadata, GenerationTask, ContentBlock, semantic transitions.
- Produces: sanitized trace links for `RichEntity → CoverageItem → DocumentPlanSection → GenerationTask → DraftBlock → CoverageTransition`.

- [ ] **Step 1: Write failing trace reconstruction and secret tests.**

```ts
function runTraceFixtureF(options: { secret?: string } = {}) {
  const analysis = makeFixtureFCaseAnalysis(options.secret ? { extraText: options.secret } : {});
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const context = createGenerationTraceContext({ generationId: 'fixture-f-generation', doc, options: { enabled: true } });
  context.snapshotCaseAnalysis(analysis);
  context.snapshotCoverageBefore(matrix);
  const task = { id: 'task-fixture-claim-1', sectionId: 'sec-prestaciones', sectionTitle: 'PRESTACIONES', taskType: 'CLAIM', complexity: 'SHORT', tokenBudget: 800, status: 'completed', coverageItemIds: ['cov-claim-fixture-f-claim-1'] } as any;
  context.recordTaskPlanned(task);
  context.recordTaskExecution({ taskId: task.id, sectionId: task.sectionId, coverageItemIds: task.coverageItemIds, legalIssueIds: [], evidenceIds: [], factIds: [], claimIds: ['fixture-f-claim-1'], providerActuallyUsed: 'NONE', startedAt: new Date(0).toISOString(), responseStatus: 'completed', continuationCount: 0, retryCount: 0, fallbackUsed: false, origin: 'DETERMINISTIC_FALLBACK', finalBlockId: 'block-fixture-claim-1' });
  context.recordDraftBlock({ id: 'block-fixture-claim-1', text: 'Respuesta sustantiva de fixture', layer: 'AI_DRAFT', coverageItemIds: ['cov-claim-fixture-f-claim-1'], generationTaskId: task.id, generatedBy: 'AI' } as any);
  context.recordCoverageTransition({ coverageItemId: 'cov-claim-fixture-f-claim-1', statusBefore: 'generated', statusAfter: 'covered', reason: 'VALID_SUBSTANTIVE_BLOCK', taskIds: [task.id], draftBlockIds: ['block-fixture-claim-1'] });
  context.snapshotCoverageAfter(matrix);
  return { trace: context.close() };
}

it('records rich entity IDs, section, scope, policy and transitions', () => {
  const { trace } = runTraceFixtureF();
  const serialized = JSON.stringify(trace);
  expect(serialized).toContain('fixture-f-claim-1');
  expect(serialized).toContain('cov-claim-fixture-f-claim-1');
  expect(serialized).toContain('SUBSTANTIVE');
  expect(serialized).toContain('REQUIRES_SEMANTIC_RESPONSE');
  expect(trace.coverageTransitions.some((entry) => entry.statusAfter === 'covered')).toBe(true);
});

it('never stores credentials or full source text in the trace', () => {
  const { trace } = runTraceFixtureF({ secret: 'NVIDIA_API_KEY=forbidden' });
  const serialized = JSON.stringify(trace);
  expect(serialized).not.toContain('forbidden');
  expect(serialized).not.toContain('NVIDIA_API_KEY');
});
```

Import `createGenerationTraceContext`, `buildCoverageMatrix`, `makeFixtureFCaseAnalysis` and `makeFixtureDocument`. The helper is test-local; add a linked task/block/transition in it so the reconstruction assertion observes every required hop. The secret option is only an in-memory assertion input and must never be written to the trace.

- [ ] **Step 2: Run focused trace tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageQualityTrace.test.ts -t "rich entity IDs|credentials"`

Expected: FAIL because Coverage snapshots do not yet expose scope/policy/entity IDs.

- [ ] **Step 3: Extend trace structures and snapshot mapping additively.**

Add optional `sourceEntityType`, `sourceEntityIds`, `scope`, `satisfactionPolicy`, `blocking`, `statusReason`, `sectionIds` and rich link arrays to `CoverageTraceItem`/`CoverageTransitionTrace`. Populate them from Coverage metadata, task links and block links. Keep existing hashes, bounded excerpts and `sanitizeTraceValue`; add secret-key filtering only through the existing sanitizer boundary.

- [ ] **Step 4: Run focused trace tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageQualityTrace.test.ts -t "rich entity IDs|credentials"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when a trace can explain a rich entity through its final block and no secret or full document source is present. Risk: adding raw rich snapshots can expose sensitive text; retain hashes/bounded excerpts and reuse the sanitizer. Dependency: Task 16 records the actual pipeline links.

### Task 16: Wire one canonical matrix through the pipeline

**Purpose:** Ensure every pipeline stage observes the same rich-first matrix and no stage rebuilds it from legacy fields.

**Files:**
- Modify: `lib/legal-engine/pipeline.ts:549-590`, `:2800-2860`, `:3140-3180`.
- Modify: `lib/legal-engine/documentPlan.ts` only for plan result metadata.
- Test: `tests/legal-engine/richDocumentPlan.test.ts` and `tests/legal-engine/richCoverageQualityTrace.test.ts`.

**Interfaces:**
- Consumes: `buildDocumentPlan`, `buildCoverageMatrix`, section binder, `buildDraftingPlan`, trace context.
- Produces: one matrix shared by plan, tasks, semantic evaluation, QualityGate and before/after trace snapshots.

- [ ] **Step 1: Write failing pipeline identity test.**

```ts
function makeFixtureFPipelineInput() {
  return {
    flow: 'DOCUMENT_ANALYSIS' as const,
    matter: 'civil',
    documentTypeLabel: 'Contestación de demanda laboral',
    sourceDocuments: fixtureFSourceDocuments(),
    userInstruction: 'Contestar la demanda con postura pendiente donde la fuente no confirma posición',
    traceOptions: { enabled: true },
  };
}

it('uses the same rich Coverage item IDs in plan, tasks, blocks and trace', async () => {
  const doc = await runGenerationPipeline(makeFixtureFPipelineInput());
  const matrixIds = new Set((doc.coverageMatrix?.items || []).map((item) => item.id));
  const richIds = (doc.coverageMatrix?.items || []).filter((item) => item.sourceEntityType).map((item) => item.id);
  const planIds = new Set((doc.draftingPlan?.sections || []).flatMap((section: any) => section.coverageItemIds || []));
  const taskIds = new Set((doc.sections || []).flatMap((section) => section.content.flatMap((block) => block.coverageItemIds || [])));
  expect(richIds.length).toBeGreaterThan(0);
  expect([...planIds].every((id) => matrixIds.has(id))).toBe(true);
  expect([...taskIds].every((id) => matrixIds.has(id))).toBe(true);
  expect(doc.generationMetadata.auditTrace?.coverageMatrixBeforeGeneration?.items.some((item) => item.id.startsWith('cov-'))).toBe(true);
});
```

Define the test-local `makeFixtureFPipelineInput` helper with the exact `PipelineInput` fields shown and use the exported `fixtureFSourceDocuments()` factory created in Task 17. The helper must not set an NVIDIA key or alter process environment.

- [ ] **Step 2: Run the focused pipeline test and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts -t "same rich Coverage"`

Expected: FAIL because the pipeline currently rebuilds or delays Coverage and trace links.

- [ ] **Step 3: Build and pass one matrix instance.**

After assigning `plan.sections` to `doc.sections`, build the matrix once with rich-first dispatch, bind section metadata, assign it to `doc.coverageMatrix`, and pass it to `buildDraftingPlan`, task builders and semantic/QualityGate stages. Snapshot before generation after binding and snapshot after final transitions. Preserve existing filtering of optional contestación alegatos.

- [ ] **Step 4: Run focused pipeline/trace tests, existing pipeline tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts tests/legal-engine/pipelineTrace.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when plan, tasks, blocks and trace use the same Coverage IDs and no stage rebuilds Coverage from legacy arrays. Risk: existing pipeline branches create documents without case analysis; leave their current undefined matrix behavior intact. Dependency: Task 17 runs fixture F through this integrated path.

### Task 17: Add fixture F and A–F metrics

**Purpose:** Provide a reproducible complete contestación fixture and comparable Coverage metrics for all fixtures.

**Files:**
- Modify: `tests/fixtures/richCoverageFixtures.ts` (extend the minimal factories created in Task 2 with complete Fixture F entities).
- Test: `tests/legal-engine/richCoverageFixtureMetrics.test.ts`.
- Modify: `tests/fixtures/caseAnalysisExtractionFixtures.ts` only to re-export shared helpers if necessary.

**Interfaces:**
- Consumes: FASE 1 fixtures A–E, `RichCaseAnalysis`, `buildCoverageMatrix`, `buildDraftingPlan`, pipeline trace.
- Produces: deterministic fixture F and metrics for rich counts, Coverage, sections, orphans and `FINAL_READY` eligibility.

- [ ] **Step 1: Write the failing fixture and metrics tests.**

```ts
it('fixture F contains the approved contestación shape', () => {
  const analysis = makeFixtureFCaseAnalysis();
  expect(analysis.richCaseAnalysis?.claims).toHaveLength(2);
  expect(analysis.richCaseAnalysis?.facts).toHaveLength(4);
  expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBeGreaterThanOrEqual(2);
  expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(1);
  expect(analysis.richCaseAnalysis?.conflicts).toHaveLength(1);
  expect(analysis.richCaseAnalysis?.missingData.length).toBeGreaterThanOrEqual(2);
});

it('reports deterministic A–F Coverage metrics', () => {
  const metrics = collectRichCoverageFixtureMetrics();
  expect(metrics.F.coverageTotal).toBeGreaterThan(0);
  expect(metrics.F.coverageBlocked).toBeGreaterThan(0);
  expect(metrics.F.coverageByType.CLAIM_RESPONSE).toBe(2);
  expect(metrics.F.coverageByType.FACT_RESPONSE).toBe(4);
  expect(metrics.F.orphanCoverageItems).toEqual([]);
});
```

- [ ] **Step 2: Run focused metrics tests and verify failure.**

Run: `npm run test -- --run tests/legal-engine/richCoverageFixtureMetrics.test.ts`

Expected: FAIL because fixture F and metric collection do not exist.

- [ ] **Step 3: Implement fixture F and metric helpers.**

Create rich entities with stable IDs, two claims, four facts, explicit and missing positions, separate evidence mentions/offer, one conflict, blocking and informational missing data, one argument, one `SOURCE_CITED` authority, dates, amounts and complete provenance. Add `collectRichCoverageFixtureMetrics` that runs A–F through the pure builder/plan and returns counts, section links, orphan IDs, sections without Coverage and `finalReadyEligible` without calling NVIDIA.

- [ ] **Step 4: Run focused metrics tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageFixtureMetrics.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when fixture F is reproducible and A–F metrics expose rich counts, Coverage scope/status, section links, orphans and final eligibility. Risk: fixture IDs accidentally depend on array indexes; hardcode stable fixture IDs. Dependency: Task 18 uses F for the 35 contracts.

### Task 18: Complete the 35 contracts and legacy regressions

**Purpose:** Close every approved contract and prove existing legacy consumers remain compatible.

**Files:**
- Modify: `tests/legal-engine/richCoverageBuilder.test.ts`.
- Modify: `tests/legal-engine/richCoveragePolicy.test.ts`.
- Modify: `tests/legal-engine/richDocumentPlan.test.ts`.
- Modify: `tests/legal-engine/richGenerationTasks.test.ts`.
- Modify: `tests/legal-engine/richCoverageQualityTrace.test.ts`.
- Create: `tests/legal-engine/richCoverageLegacyRegression.test.ts`.

**Interfaces:**
- Consumes: all APIs produced by Tasks 1–17.
- Produces: the complete 35-contract suite from the spec plus regression coverage for existing legacy consumers.

- [ ] **Step 1: Add the remaining failing contract tests.**

Add tests for the contracts not already covered: no rich-to-legacy read using contradictory arrays; `SOURCE_CITED` preservation; explicit relation-only links and `UNLINKED`; no name fusion; open conflict values; formal heading/signature behavior; no universal sections; exact task links; missing petition support; distinct `CLAIM_RESPONSE` versus `PETITION_SUPPORT` placement in a non-labor template; trace scope/policy/status reasons; determinism; complete secret sanitization; and absence of `fixture-f-*`, `cov-*` and `task-*` IDs in visible block text. Keep each test named after its contract number.

- [ ] **Step 2: Run the complete new contract files and verify failures are attributable to missing behavior.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts tests/legal-engine/richCoveragePolicy.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts`

Expected: only tests for unfinished contract behavior fail; no unrelated baseline test failure is accepted without diagnosis.

- [ ] **Step 3: Implement only the minimum fixes required by the failing contracts.**

Use the existing modules and helpers. Do not add legal generation, online verification, migrations or renderer changes. If a regression is caused by a rich path accidentally reading a legacy array, add a spy or contradictory-input test and remove that read.

- [ ] **Step 4: Run all new contracts, existing Coverage/DocumentPlan/pipeline/task/semantic/QualityGate/trace tests and typecheck.**

Run: `npm run test -- --run tests/legal-engine/richCoverageBuilder.test.ts tests/legal-engine/richCoveragePolicy.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/phase4Integration.test.ts tests/legal-engine/phase5SemanticEvaluation.test.ts tests/legal-engine/pipelineTrace.test.ts tests/legal-engine/documentArchitecture.test.ts`

Expected: all selected tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Record the checkpoint.**

Done when all 35 contracts pass, legacy consumers remain green, and every fix has a focused regression test. Risk: legacy tests may expose a stronger old assumption; preserve it only in the no-rich fallback and keep the rich path conservative. Dependency: Task 19 is the only full validation task.

### Task 19: Full validation, reports and final audit

**Purpose:** Produce the final test, trace, provider, artifact and environmental-build evidence without starting a later phase.

**Files:**
- Create: `.tmp/generation-trace-phase2-coverage-artifact.json`.
- Create: `.tmp/generation-report-phase2-coverage-artifact.md`.
- Create: `.tmp/phase2-fixture-metrics.json`.
- Modify: no production code unless a validation failure from Task 18 identifies a focused regression.
- Test: all existing tests through `npm run test`.

**Interfaces:**
- Consumes: completed rich Coverage pipeline, fixture metrics, trace reports, baseline commands.
- Produces: auditable JSON/Markdown artifacts and final A–W delivery report.

- [ ] **Step 1: Run the complete test suite and capture exact counts.**

Run: `npm run test -- --run`

Expected: 0 failures; record total files, passed tests, skipped tests and any newly discovered regressions. Do not compare the final count to 1,983 as an equality requirement because new tests increase it.

- [ ] **Step 2: Run typecheck, lint and build without changing environment or processes.**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run lint`

Expected: 0 errors; attribute warnings to the accepted 973 baseline or a documented new source.

Run: `npm run build`

Expected: if the known Prisma `EPERM` occurs before Next while active Node/Next processes hold `query_engine-windows.dll.node`, record it as environmental/preexisting. Do not stop processes or change code to hide it.

- [ ] **Step 3: Execute fixture F in controlled fallback mode and NVIDIA only when genuinely available.**

Set process-local test variables only in the command invocation, without editing `.env`: `NVIDIA_API_KEY='' NVIDIA_REAL_TEST=false` equivalent in PowerShell. Record `providerRequested` and `providerActuallyUsed` from the real trace. Run a separate NVIDIA execution only when a real configured API key is already available; never simulate it. Store no key in artifacts.

- [ ] **Step 4: Write sanitized JSON and Markdown reports from the real trace.**

Reports must include: final test counts; typecheck; lint/warnings; build classification; files changed/created; A–F metrics; rich entity counts; Coverage total/required/blocked/by type/scope/status; section Coverage and orphans; Coverage→Task→DraftBlock→DOCX examples; formal deterministic versus false substantive Coverage; fallback reason; provider requested/actually used; conflicts; missing data; legacy projection losses; regressions fixed; remaining issues; and next-phase legal-generation limits. Assert serialized artifacts contain no API keys, tokens, credentials or full source documents.

- [ ] **Step 5: Perform final plan self-review and checkpoint.**

Run the `writing-plans` skill's placeholder-pattern scan against this plan.

Expected: no red-flag matches. Confirm every spec section maps to at least one task, every task has files/interfaces/failing test/implementation/validation/done criteria/risk/dependencies, and no out-of-scope behavior was added. This task is complete only when the artifacts and final report are reviewable; do not start a later phase automatically.

Done when the full validation evidence, sanitized artifacts and A–W audit report are reviewable. Risk: a real-provider run can expose timeout fallbacks or generated-content defects; preserve those results truthfully in the trace and never convert them into passing Coverage. Dependency: this is the terminal validation task and has no implementation dependency after Task 18; no later phase starts from it automatically.

## Dependency Order

Tasks 1–2 establish types and dispatch. Tasks 3–7 populate entity-specific Coverage. Task 8 defines satisfaction policy. Task 9 binds sections. Tasks 10–11 make the rich plan and contestación skeleton posture-safe. Task 12 maps Coverage to tasks. Tasks 13–15 connect policy, QualityGate and trace. Task 16 wires one matrix through the real pipeline. Task 17 supplies fixture F and metrics. Task 18 closes all contracts and legacy regressions. Task 19 performs the only full-suite validation and produces final artifacts.

## Scope Confirmation

This plan changes observability, provenance, Coverage construction, plan/task linking and structural gates. It does not add legal defenses, exceptions, procedural theories, offered evidence, online verification, artificial length, universal sections, database persistence, migrations, `.env` changes, NVIDIA simulation or DOCX renderer changes. The next phase may use the resulting evidence to improve legal generation, but this plan stops after the FASE 2 audit report.
