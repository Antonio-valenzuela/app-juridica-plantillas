# Verified Legal Research & Authority Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task inline. Do not dispatch subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an offline, deterministic FASE 5A vertical slice that turns a `NEEDS_RESEARCH` legal issue into a verified, proposition-grounded `LegalResearchBundle` and derived readiness without changing facts, client position, canonical issue status, or final generation.

**Architecture:** Add a focused `lib/legal-engine/legal-research/` domain with pure regime resolution, deterministic request/query construction, provider ports, a synthetic `FIXTURE_OFFICIAL` adapter, fail-closed authority verification, bundle/readiness derivation, memory-only cache, and research trace. Keep `SourceAuthorityMention` as the source-document observation and create separate `VerifiedAuthority` objects linked by IDs. Integrate only a research-only entry point and additive trace/context types; do not re-enter FASE 4 or call a generation provider.

**Tech Stack:** TypeScript, Vitest, existing legal-engine types and taxonomy, Web Crypto `globalThis.crypto.subtle` for content hashes, deterministic canonical serialization, injected clocks, and in-memory fixtures. No internet, real official adapters, NVIDIA, `LocalProvider`, Prisma, Neon, database, persistence files, or DOCX work.

**Spec:** `docs/superpowers/specs/2026-09-08-verified-legal-research-design.md`

## Global Constraints

- Use the approved scope: `FASE 5A — research + verification + LegalResearchBundle` with no automatic re-entry to FASE 4.
- The only executable provider in this phase is `FIXTURE_OFFICIAL`; do not implement `FEDERAL_LEGISLATION`, `DOF`, `SCJN`, or `STATE_OFFICIAL` adapters.
- Keep `SOURCE_CITED` separate from `VerifiedAuthority.verificationStatus = VERIFIED`; verification must not mutate the original `SourceAuthorityMention`.
- Require primary official evidence, exact identity, compatible jurisdiction, compatible temporal status or explicit historical applicability, supported proposition, and issue relation before accepting an authority.
- Treat secondary sources as discovery/context only; `SECONDARY_SUPPORT` cannot independently verify a primary authority.
- Use `LEGAL_REGIME_UNRESOLVED` fail-closed when any material regime field is missing; never infer Mexico, federal scope, CNPCF, current law, or a default technical value.
- Use `country.code` as ISO 3166-1 alpha-2 and `federativeEntity.code` as ISO 3166-2 where available; keep `code` and `displayName` separate.
- Do not mutate `LegalIssue.status` to resolve research; use `DerivedIssueReadiness` and preserve conflict/client-position precedence.
- Do not change `FactItem`, `ClientPosition`, `EvidenceMention`, `EvidenceOffer`, `ClaimItem`, conflicts, or case provenance.
- All IDs and semantic hashes exclude random UUIDs, `Date.now()`, array indices, and timestamps; timestamps are injectable metadata only.
- Shared modules must not reintroduce `node:crypto`; use a runtime-safe deterministic ID hash and Web Crypto SHA-256 for content hashes.
- Cache is in memory only; cache hits must still run regime/temporal verification where required.
- The 50 principal contracts are fully offline. Do not run `npm test`; final checks are focused FASE 5A tests, related regressions, `npm run typecheck`, `npm run lint`, and `npm run build`.
- Preserve the existing rich-first boundary: use rich entities when `caseAnalysis.richCaseAnalysis` exists and retain legacy behavior otherwise.
- No implementation step may invoke a final-generation provider. Research-only completion must prove zero calls to NVIDIA or `LocalProvider`.

## File map and responsibilities

### Create

- `lib/legal-engine/legal-research/types.ts` — domain unions/interfaces for regime, request/query, provider results, candidates, evidence, verification, authorities, bundle, readiness, cache, and human-review decision records.
- `lib/legal-engine/legal-research/canonical.ts` — runtime-safe canonicalization, deterministic IDs, and SHA-256 content hashing through Web Crypto.
- `lib/legal-engine/legal-research/regimeResolution.ts` — fail-closed material-field resolution and territorial code normalization.
- `lib/legal-engine/legal-research/researchRequest.ts` — issue-scoped request creation and normalized query construction.
- `lib/legal-engine/legal-research/adapters/types.ts` — provider port and adapter response contracts.
- `lib/legal-engine/legal-research/adapters/fixtureOfficial.ts` — deterministic synthetic official adapter used only by offline tests.
- `lib/legal-engine/legal-research/authorityVerification.ts` — candidate normalization and checks for source, identity, jurisdiction, temporal validity, authority kind, and proposition relation.
- `lib/legal-engine/legal-research/researchBundle.ts` — scoped bundle aggregation, rejection collection, sufficiency classification, and deterministic bundle hash.
- `lib/legal-engine/legal-research/readiness.ts` — derived issue readiness and blocker precedence.
- `lib/legal-engine/legal-research/cache.ts` — memory-only cache port, key, entry, and verification-on-hit wrapper.
- `lib/legal-engine/legal-research/researchTrace.ts` — bounded research trace event types and recording helpers.

### Modify

- `lib/legal-engine/generationTrace.ts` — add optional, sanitized research trace storage and methods without breaking existing generation traces.
- `lib/legal-engine/issueScopedGeneration.ts` — add only the future `verifiedResearch` pack type and a scoped projection helper; do not change generation eligibility or invoke providers.
- `lib/legal-engine/issueDraftResult.ts` — add only future-compatible validation types for verified authority IDs if needed by the pack contract; current output remains unchanged in FASE 5A.
- `lib/legal-engine/pipeline.ts` — add an isolated research-only orchestration entry point or adapter seam that returns research artifacts and never calls final generation.
- `lib/legal-engine/case-extraction/types.ts` — preserve the existing `SourceAuthorityMention` union and, only if compile-time mapping needs it, add an explicit observed-type alias without changing statuses.

### Test

- `tests/legal-engine/legalResearchCanonical.test.ts`
- `tests/legal-engine/legalRegimeResolution.test.ts`
- `tests/legal-engine/legalResearchRequest.test.ts`
- `tests/legal-engine/legalResearchFixtureAdapter.test.ts`
- `tests/legal-engine/authorityVerification.test.ts`
- `tests/legal-engine/legalResearchBundle.test.ts`
- `tests/legal-engine/legalResearchReadiness.test.ts`
- `tests/legal-engine/legalResearchCache.test.ts`
- `tests/legal-engine/legalResearchTrace.test.ts`
- `tests/legal-engine/legalResearchReentryTypes.test.ts`
- `tests/legal-engine/legalResearchPipeline.test.ts`
- `tests/legal-engine/legalResearchLegacyRegression.test.ts`

The first implementation batch should not add production adapter files. The approved future adapter order is `FEDERAL_LEGISLATION`, `DOF`, `SCJN`, `STATE_OFFICIAL`, but those are not part of this plan's code output.

## Contract surfaces used by all tasks

The following names and signatures are fixed for the plan so later tasks do not invent incompatible interfaces.

```ts
export type ResearchClock = () => Date;

export interface LegalCodeLabel {
  code: string;
  displayName: string;
}

export type LegalScope =
  | 'FEDERAL' | 'STATE' | 'LOCAL' | 'MUNICIPAL'
  | 'ADMINISTRATIVE' | 'ELECTORAL' | 'MILITARY' | 'OTHER' | 'UNKNOWN';

export type LegalRegimeResolutionStatus =
  | 'RESOLVED' | 'PARTIALLY_RESOLVED' | 'LEGAL_REGIME_UNRESOLVED';

export interface LegalRegimeResolution {
  id: string;
  status: LegalRegimeResolutionStatus;
  country?: LegalCodeLabel;
  scope: LegalScope;
  federativeEntity?: LegalCodeLabel;
  matter?: LegalCodeLabel;
  procedure?: LegalCodeLabel;
  proceduralStage?: string;
  instance?: string;
  issuingOrAdjudicatingBody?: string;
  relevantDate?: string;
  temporalPrecision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  fieldEvidence: Array<{
    field: string;
    value: LegalCodeLabel | string;
    source: 'EXPLICIT_TAXONOMY' | 'EXPLICIT_SOURCE' | 'MANUAL_INPUT' | 'RESOLVED_METADATA';
    provenanceIds: string[];
  }>;
  unresolvedFields: string[];
  resolutionHash: string;
}

export type AuthorityType =
  | 'CONSTITUTION' | 'STATUTE' | 'CODE' | 'REGULATION'
  | 'JURISPRUDENCE' | 'THESIS' | 'PRECEDENT'
  | 'OFFICIAL_AGREEMENT' | 'OTHER_OFFICIAL_SOURCE';

export interface LegalResearchRequest {
  id: string;
  legalIssueId: string;
  coverageItemIds: string[];
  question: string;
  jurisdiction?: string;
  matter?: string;
  procedure?: string;
  relevantDate?: string;
  temporalPrecision?: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  requestedAuthorityTypes: AuthorityType[];
  sourceAuthorityMentionIds: string[];
  contextHash: string;
  regimeResolutionId: string;
  status: 'PENDING' | 'READY_FOR_RETRIEVAL' | 'RETRIEVAL_PARTIAL' | 'VERIFICATION_PENDING' | 'COMPLETED' | 'BLOCKED';
  createdAt: string;
}

export interface NormalizedResearchQuery {
  requestId: string;
  normalizedQuery: string;
  queryHash: string;
  explicitTerms: string[];
  regimeHash: string;
  relevantDate?: string;
}

export interface AuthorityCandidate {
  id: string;
  requestId: string;
  sourceAuthorityMentionId?: string;
  authorityType: AuthorityType;
  observedCitation: string;
  canonicalCitationCandidate?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  sourceTier: 'OFFICIAL_PRIMARY' | 'SECONDARY_SUPPORT' | 'UNKNOWN';
  issuingAuthority?: string;
  jurisdiction?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  locator?: string;
  retrievedAt: string;
  evidenceHash?: string;
  evidenceExcerptHash?: string;
  metadataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
  candidateStatus: 'DISCOVERED' | 'RETRIEVED' | 'REJECTED';
}

export interface OfficialSourceEvidence {
  sourceUrl: string;
  sourceDomain: string;
  sourceTier: 'OFFICIAL_PRIMARY';
  retrievedAt: string;
  locator?: string;
  sourceHash: string;
  excerptHash?: string;
  isFixture?: boolean;
}

export interface SupportedProposition {
  text: string;
  supportLevel: 'DIRECT' | 'LIMITED' | 'CONTEXT_ONLY';
  sourceLocator?: string;
  limitations: string[];
}

export interface VerifiedAuthority {
  id: string;
  identity: {
    canonicalCitation: string;
    authorityType: AuthorityType;
    issuingAuthority: string;
    identityKey: string;
  };
  source: OfficialSourceEvidence;
  temporalValidity: {
    status: 'CURRENT_AND_APPLICABLE' | 'HISTORICALLY_APPLICABLE' | 'CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED' | 'REPEALED' | 'SUPERSEDED' | 'UNKNOWN_EFFECTIVE_DATE';
    relevantDate?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    checkedAt: string;
    basis: string[];
  };
  jurisdictionValidity: {
    status: 'APPLICABLE' | 'WRONG_JURISDICTION' | 'REVIEW_REQUIRED' | 'UNKNOWN';
    country?: string;
    scope?: LegalScope;
    federativeEntity?: string;
    matter?: string;
    procedure?: string;
    issuingBody?: string;
    bindingCharacter?: 'BINDING_WHEN_APPLICABLE' | 'PERSUASIVE' | 'NON_BINDING' | 'UNKNOWN';
    basis: string[];
  };
  proposition: SupportedProposition;
  verificationStatus: 'VERIFIED';
  supportsLegalIssueIds: string[];
  sourceAuthorityMentionIds: string[];
  verificationHash: string;
}

export interface RejectedAuthorityCandidate {
  candidate: AuthorityCandidate;
  reasons: Array<'NOT_FOUND' | 'MISMATCH' | 'OUTDATED' | 'WRONG_JURISDICTION' | 'INSUFFICIENT_METADATA' | 'NON_OFFICIAL_ONLY' | 'NO_PROPOSITION_SUPPORT' | 'ADAPTER_ERROR'>;
  detail: string[];
  rejectedAt: string;
}

export interface LegalResearchBundle {
  legalIssueId: string;
  requestId: string;
  regimeResolution: LegalRegimeResolution;
  verifiedAuthorities: VerifiedAuthority[];
  rejectedCandidates: RejectedAuthorityCandidate[];
  unresolvedQuestions: string[];
  researchStatus: 'VERIFIED_SUFFICIENT' | 'VERIFIED_PARTIAL' | 'NO_AUTHORITY_FOUND' | 'REGIME_UNRESOLVED' | 'REQUIRES_HUMAN_REVIEW';
  researchHash: string;
}

export interface HumanReviewDecision {
  id: string;
  candidateId: string;
  authorityId?: string;
  decision: 'APPROVE_CONSUMPTION' | 'REJECT';
  reason: string;
  decidedAt: string;
  evidenceHash?: string;
  researchHash: string;
}

export interface DerivedIssueReadiness {
  legalIssueId: string;
  canonicalStatus: import('../legalIssueMatrix').LegalIssueStatus;
  researchReadiness: 'NOT_REQUIRED' | 'RESEARCH_REQUIRED' | 'LEGAL_REGIME_UNRESOLVED' | 'RESEARCH_PARTIAL' | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH';
  researchBundleHash?: string;
  blockers: string[];
}
```

The implementation may add fields needed for evidence bytes, adapter diagnostics, or human-review decisions, but it must not rename these surfaces or weaken their invariants.

## Task 1: Deterministic canonicalization and domain types

**Files:**
- Create: `lib/legal-engine/legal-research/types.ts`
- Create: `lib/legal-engine/legal-research/canonical.ts`
- Test: `tests/legal-engine/legalResearchCanonical.test.ts`

**Interfaces:**
- Consumes: no new modules; existing `LegalIssueStatus` is imported type-only.
- Produces: `canonicalizeResearchValue(value)`, `stableResearchId(prefix, value)`, and `sha256ResearchValue(value): Promise<string>` for every later task.

- [ ] **Step 1: Write the failing tests for canonical ordering and hash inputs.**

```ts
it('sorts object keys recursively but preserves non-ID array order', () => {
  expect(canonicalizeResearchValue({ b: 2, a: [{ z: 1, y: 2 }] }))
    .toEqual({ a: [{ y: 2, z: 1 }], b: 2 });
});

it('sorts arrays whose key ends in Ids', () => {
  expect(canonicalizeResearchValue({ authorityIds: ['b', 'a'] }))
    .toEqual({ authorityIds: ['a', 'b'] });
});

it('does not use time or randomness in stable IDs', () => {
  expect(stableResearchId('request', { issueId: 'i-1', coverageItemIds: ['c-2', 'c-1'] }))
    .toBe(stableResearchId('request', { coverageItemIds: ['c-1', 'c-2'], issueId: 'i-1' }));
});

it('produces the same SHA-256 for semantically identical canonical values', async () => {
  await expect(sha256ResearchValue({ a: 1, b: 2 }))
    .resolves.toBe(await sha256ResearchValue({ b: 2, a: 1 }));
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchCanonical.test.ts --reporter=dot`

Expected: FAIL because the new canonical helpers do not exist.

- [ ] **Step 3: Add the domain unions/interfaces and runtime-safe helpers.**

Implement `types.ts` with the contract surfaces above. Implement `canonicalizeResearchValue` recursively, sorting only arrays under keys matching `/(Ids|IDs)$/`. Implement `stableResearchId` with the existing deterministic string-hash style used by the legal engine, without importing `node:crypto`. Implement `sha256ResearchValue` with `TextEncoder` and `globalThis.crypto.subtle.digest('SHA-256', bytes)`; exclude timestamps from callers' semantic inputs rather than stripping them generically.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchCanonical.test.ts --reporter=dot`

Expected: PASS with all canonicalization and determinism assertions green.

## Task 2: Fail-closed legal regime resolution

**Files:**
- Create: `lib/legal-engine/legal-research/regimeResolution.ts`
- Modify: `lib/legal-taxonomy/index.ts` only if an explicit code/display-name helper must be exported; otherwise leave it unchanged.
- Test: `tests/legal-engine/legalRegimeResolution.test.ts`

**Interfaces:**
- Consumes: `LegalTaxonomySelection`, explicit `legalContext`, source provenance records, `ResearchClock`, and canonical helpers from Task 1.
- Produces: `resolveLegalRegime(input, clock): Promise<LegalRegimeResolution>` and `isMaterialRegimeFieldMissing(resolution): boolean`.

- [ ] **Step 1: Write failing tests for federal, state, unresolved, and default safety.**

```ts
it('resolves an explicit federal Mexican regime with separate codes and labels', async () => {
  const result = await resolveLegalRegime({
    taxonomy: { matter: 'civil', jurisdiction: 'federal', documentType: 'contestacion_demanda', procedure: 'ordinario' },
    legalContext: { country: 'MX', matter: 'civil', scope: 'FEDERAL', procedure: 'ordinario' },
  }, fixedClock);
  expect(result.status).toBe('RESOLVED');
  expect(result.country).toEqual({ code: 'MX', displayName: expect.any(String) });
  expect(result.scope).toBe('FEDERAL');
});

it('requires a federative entity for STATE and LOCAL', async () => {
  const result = await resolveLegalRegime({
    legalContext: { country: 'MX', scope: 'STATE', matter: 'civil', procedure: 'ordinario' },
  }, fixedClock);
  expect(result.status).toBe('LEGAL_REGIME_UNRESOLVED');
  expect(result.unresolvedFields).toContain('federativeEntity');
});

it('does not treat a technical federal default as resolved law', async () => {
  const result = await resolveLegalRegime({ technicalDocumentDefaults: { jurisdiction: 'federal' } }, fixedClock);
  expect(result.status).toBe('LEGAL_REGIME_UNRESOLVED');
});

it('preserves relevant date and precision without inventing a day', async () => {
  const result = await resolveLegalRegime({
    legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', relevantDate: '2024', temporalPrecision: 'YEAR' },
  }, fixedClock);
  expect(result.relevantDate).toBe('2024');
  expect(result.temporalPrecision).toBe('YEAR');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalRegimeResolution.test.ts --reporter=dot`

Expected: FAIL because the resolver is not implemented.

- [ ] **Step 3: Implement material-field resolution.**

Define `LegalRegimeInput` with explicit taxonomy/context/source fields and technical defaults separately. Normalize codes to `MX` and `MX-*` only when the input explicitly identifies them; store `displayName` independently. Require `country`, `scope`, and `matter`; require `procedure` when it changes source/régimen selection; require `federativeEntity` for `STATE`/`LOCAL`; require `relevantDate` when temporal applicability is material; require stage/instance/body only when they change search, jurisdiction, or binding character. Set `LEGAL_REGIME_UNRESOLVED` and list every missing material field. Compute `resolutionHash` from semantic fields only and `id` from `stableResearchId('regime', semanticInput)`.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalRegimeResolution.test.ts --reporter=dot`

Expected: PASS for federal, state/local fail-closed, default safety, territorial code separation, and date preservation.

## Task 3: Issue-scoped request and normalized query

**Files:**
- Create: `lib/legal-engine/legal-research/researchRequest.ts`
- Test: `tests/legal-engine/legalResearchRequest.test.ts`

**Interfaces:**
- Consumes: `LegalIssueItem`, `LegalRegimeResolution`, source authority IDs/types, `contextHash`, and Task 1 canonical helpers.
- Produces: `buildLegalResearchRequest(input, clock): Promise<LegalResearchRequest>`, `normalizeResearchQuery(request, regime): Promise<NormalizedResearchQuery>`, and `shouldCreateResearchRequest(issue): boolean`.

- [ ] **Step 1: Write failing tests for request creation, no-request readiness, deterministic IDs, and query safety.**

```ts
it('creates a request only for NEEDS_RESEARCH', async () => {
  const request = await buildLegalResearchRequest({ issue: needsResearchIssue, regime: resolvedFederal, contextHash: 'ctx-1' }, fixedClock);
  expect(request.legalIssueId).toBe(needsResearchIssue.id);
  expect(request.status).toBe('READY_FOR_RETRIEVAL');
  expect(request.id).toBe(await buildLegalResearchRequest({ issue: needsResearchIssue, regime: resolvedFederal, contextHash: 'ctx-1' }, fixedClock).then((r) => r.id));
});

it('does not create a request when research is not required', () => {
  expect(shouldCreateResearchRequest({ ...needsResearchIssue, researchStatus: 'NOT_REQUIRED', status: 'READY_FOR_GENERATION' })).toBe(false);
});

it('keeps the question open and derives query terms only from explicit issue/regime data', async () => {
  const request = await buildLegalResearchRequest({ issue: { ...needsResearchIssue, question: '¿Qué requisito debe revisarse?' }, regime: resolvedFederal, contextHash: 'ctx-1' }, fixedClock);
  const query = await normalizeResearchQuery(request, resolvedFederal);
  expect(query.normalizedQuery).toContain('qué requisito debe revisarse');
  expect(query.normalizedQuery).not.toContain('el actor pierde');
});

it('does not use a universal CNPCF term', async () => {
  const query = await normalizeResearchQuery(requestFor('civil'), resolvedFederal);
  expect(query.normalizedQuery).not.toMatch(/CNPCF/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchRequest.test.ts --reporter=dot`

Expected: FAIL because request/query builders are absent.

- [ ] **Step 3: Implement request and query construction.**

Reject request creation for `NOT_REQUIRED`. For `NEEDS_RESEARCH` and `SOURCE_CITED_UNVERIFIED`, preserve the issue question verbatim after whitespace normalization only. Use the issue’s explicit `coverageItemIds`, `authorityMentionIds`, `question`, requested authority types, regime hash, relevant date, and context hash to build a deterministic request ID. Build `normalizedQuery` from explicit question, matter, procedure, scope, entity code, and source concepts; never append a legal conclusion. Exclude `createdAt` from IDs and hashes. Return `LEGAL_REGIME_UNRESOLVED` as request status `BLOCKED` when the regime is unresolved.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchRequest.test.ts --reporter=dot`

Expected: PASS with deterministic request IDs, preserved questions/dates, no universal CNPCF, and no request for `NOT_REQUIRED`.

## Task 4: Provider port and deterministic `FIXTURE_OFFICIAL`

**Files:**
- Create: `lib/legal-engine/legal-research/adapters/types.ts`
- Create: `lib/legal-engine/legal-research/adapters/fixtureOfficial.ts`
- Test: `tests/legal-engine/legalResearchFixtureAdapter.test.ts`

**Interfaces:**
- Consumes: `LegalResearchRequest`, `NormalizedResearchQuery`, `LegalRegimeResolution`, injected clock, and fixture records.
- Produces: `LegalResearchProvider`, `ProviderSearchResult`, `ProviderRetrieveResult`, `createFixtureOfficialAdapter(fixtures, clock)`.

- [ ] **Step 1: Write failing tests for federal/state fixture scoping and isolated adapter errors.**

```ts
it('returns a synthetic official candidate for a resolved federal query', async () => {
  const adapter = createFixtureOfficialAdapter([federalFixture], fixedClock);
  const result = await adapter.search({ request: federalRequest, query: federalQuery, regime: resolvedFederal });
  expect(result.status).toBe('PASS');
  expect(result.candidates[0].sourceTier).toBe('OFFICIAL_PRIMARY');
  expect(result.candidates[0].sourceUrl).toMatch(/^https:\/\/fixture\.official\.test\//);
});

it('preserves a state entity in the request/bundle path without needing a real state adapter', async () => {
  const result = await createFixtureOfficialAdapter([stateFixture], fixedClock).search({ request: stateRequest, query: stateQuery, regime: resolvedState });
  expect(result.candidates[0].jurisdiction).toContain('MX-JAL');
});

it('returns an adapter error without discarding candidates from another adapter', async () => {
  const result = await createFixtureOfficialAdapter([federalFixture], fixedClock).retrieve({ candidateId: 'missing', requestId: federalRequest.id });
  expect(result.status).toBe('FAIL');
  expect(result.errorCode).toBe('NOT_FOUND');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchFixtureAdapter.test.ts --reporter=dot`

Expected: FAIL because the provider port and fixture adapter are absent.

- [ ] **Step 3: Implement the provider port and fixture records.**

Define `search({ request, query, regime })` and `retrieve({ candidateId, requestId })`. Fixture records must contain citation, type, official URL/domain, issuing body, scope/entity/matter/procedure, publication/effective dates, locator, source content, and a bounded proposition excerpt. Produce candidate IDs from adapter ID plus identity/source locator, not array index. Mark fixture evidence with `isFixture: true`; never present it as a real government retrieval. Return `PASS`, `PARTIAL`, or `FAIL` with sanitized reason codes and keep failure isolated to the adapter call.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchFixtureAdapter.test.ts --reporter=dot`

Expected: PASS for federal/state fixture scope and isolated failure behavior.

## Task 5: Candidate normalization, source evidence, and exact identity

**Files:**
- Create: `lib/legal-engine/legal-research/authorityVerification.ts`
- Test: `tests/legal-engine/authorityVerification.test.ts`

**Interfaces:**
- Consumes: adapter candidates, retrieved evidence, `SourceAuthorityMention`, request/regime, and `ResearchClock`.
- Produces: `normalizeAuthorityCandidate`, `buildOfficialSourceEvidence`, `verifyAuthorityIdentity`, and `verifySourceCitedMention`.

- [ ] **Step 1: Write failing tests for official evidence, SOURCE_CITED separation, exact match, mismatch, and missing evidence.**

```ts
it('keeps SOURCE_CITED unchanged and creates a separate verified object after exact match', async () => {
  const mention = sourceCitedMention('Artículo 14 de la Constitución');
  const result = await verifySourceCitedMention({ mention, candidate: exactFederalCandidate, evidence: exactEvidence, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(mention.verificationStatus).toBe('SOURCE_CITED');
  expect(result.verifiedAuthority?.sourceAuthorityMentionIds).toEqual([mention.id]);
  expect(result.verifiedAuthority?.verificationStatus).toBe('VERIFIED');
});

it('rejects an incompatible official identity as MISMATCH', async () => {
  const result = await verifySourceCitedMention({ mention: sourceCitedMention('Artículo 14'), candidate: candidateFor('Artículo 16'), evidence: exactEvidence, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.rejection?.reasons).toContain('MISMATCH');
});

it('does not verify a candidate without primary official evidence', async () => {
  const result = await verifyAuthorityCandidate({ candidate: secondaryCandidate, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.verifiedAuthority).toBeUndefined();
  expect(result.rejection?.reasons).toContain('NON_OFFICIAL_ONLY');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: FAIL because candidate verification functions are absent.

- [ ] **Step 3: Implement normalization and exact identity checks.**

Normalize whitespace and citation punctuation only for comparison; preserve the observed citation. Require `sourceTier = OFFICIAL_PRIMARY`, non-empty official URL/domain, retrieved timestamp, source hash, and complete identity metadata. For a source-cited mention, compare authority type and canonical identity fields, not fuzzy text alone. Build `VerifiedAuthority.id` from canonical identity, keep `sourceAuthorityMentionIds` as a relation, and never mutate `rich.authorities`. Reject missing evidence, secondary-only candidates, and incompatible identity with explicit reasons.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: PASS for `SOURCE_CITED` separation, exact official match, mismatch rejection, source URL/retrievedAt preservation, and no evidence acceptance.

## Task 6: Jurisdiction, temporal validity, and authority-kind discipline

**Files:**
- Modify: `lib/legal-engine/legal-research/authorityVerification.ts`
- Test: `tests/legal-engine/authorityVerification.test.ts`

**Interfaces:**
- Consumes: normalized candidates/evidence from Task 5 and `LegalRegimeResolution` from Task 2.
- Produces: `validateAuthorityJurisdiction`, `validateAuthorityTemporalStatus`, and `classifyAuthorityKind`.

- [ ] **Step 1: Add failing tests for federal/state mismatch, temporal mismatch, repeal, thesis, and jurisprudence.**

```ts
it('rejects a federal candidate for a resolved state regime', async () => {
  const result = await verifyAuthorityCandidate({ candidate: federalCandidate, evidence: federalEvidence, request: stateRequest, regime: resolvedState }, fixedClock);
  expect(result.rejection?.reasons).toContain('WRONG_JURISDICTION');
});

it('does not accept a current authority when it was not applicable at the relevant date', async () => {
  const result = await verifyAuthorityCandidate({ candidate: currentButLaterCandidate, evidence: currentEvidence, request: datedRequest('2018'), regime: datedRegime('2018') }, fixedClock);
  expect(result.verifiedAuthority).toBeUndefined();
  expect(result.rejection?.reasons).toContain('OUTDATED');
});

it('keeps a thesis distinct from jurisprudence', async () => {
  const result = await verifyAuthorityCandidate({ candidate: thesisCandidate, evidence: thesisEvidence, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.verifiedAuthority?.identity.authorityType).toBe('THESIS');
  expect(result.verifiedAuthority?.jurisdictionValidity.bindingCharacter).not.toBe('BINDING_WHEN_APPLICABLE');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: FAIL because jurisdiction and temporal validators are not implemented.

- [ ] **Step 3: Implement fail-closed jurisdiction and temporal checks.**

Compare country, scope, federative code, matter, procedure, issuing body, instance, and binding metadata. Return `WRONG_JURISDICTION` for incompatible resolved values and `REVIEW_REQUIRED`/`UNKNOWN` when material metadata is absent. Compare relevant date using declared precision; accept `CURRENT_AND_APPLICABLE` or `HISTORICALLY_APPLICABLE` only with evidence. Reject `REPEALED`, `SUPERSEDED`, or non-applicable current text for the requested temporal context. Map observed `THESIS` to `THESIS` and observed `JURISPRUDENCE` to `JURISPRUDENCE`; never upgrade by label or tribunal name.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: PASS for jurisdiction, date, repeal/supersession, thesis-vs-jurisprudence, and binding-character discipline.

## Task 7: Proposition-level grounding and explicit rejection reasons

**Files:**
- Modify: `lib/legal-engine/legal-research/authorityVerification.ts`
- Test: `tests/legal-engine/authorityVerification.test.ts`

**Interfaces:**
- Consumes: accepted identity/source/jurisdiction/temporal checks, request issue ID, and fixture proposition evidence.
- Produces: `extractSupportedProposition`, `linkVerifiedAuthorityToIssue`, and `verifyAuthorityCandidate` as the composed fail-closed result.

- [ ] **Step 1: Write failing tests for proposition support, unrelated authorities, and no invented citation.**

```ts
it('requires a proposition linked to the requested issue', async () => {
  const result = await verifyAuthorityCandidate({ candidate: candidateWithoutProposition, evidence: evidenceWithoutProposition, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.rejection?.reasons).toContain('NO_PROPOSITION_SUPPORT');
});

it('links only the requested issue and records limitations', async () => {
  const result = await verifyAuthorityCandidate({ candidate: exactFederalCandidate, evidence: propositionEvidence('X es un requisito que debe acreditarse'), request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.verifiedAuthority?.supportsLegalIssueIds).toEqual([federalRequest.legalIssueId]);
  expect(result.verifiedAuthority?.proposition.limitations.length).toBeGreaterThan(0);
});

it('does not create a citation when retrieval has no candidate', async () => {
  const result = await verifyAuthorityCandidate({ candidate: undefined, request: federalRequest, regime: resolvedFederal }, fixedClock);
  expect(result.rejection?.reasons).toContain('NOT_FOUND');
  expect(result.verifiedAuthority).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: FAIL because proposition extraction/linking is absent.

- [ ] **Step 3: Implement proposition extraction and scoped linking.**

Require a bounded source locator or evidence excerpt hash and a proposition text that states only what the source supports. Store `supportLevel` and non-empty limitations for limited/context support. Link exactly `request.legalIssueId`; do not link by matter, citation, or similar wording. Return `NOT_FOUND` for absent retrieval, `NO_PROPOSITION_SUPPORT` for evidence that cannot support a proposition, and preserve `MISMATCH`, `WRONG_JURISDICTION`, `OUTDATED`, `INSUFFICIENT_METADATA`, `NON_OFFICIAL_ONLY`, and `ADAPTER_ERROR` as applicable.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/authorityVerification.test.ts --reporter=dot`

Expected: PASS with proposition-level relation, limitations, unrelated-authority rejection, and no invented citation.

## Task 8: Scoped research bundle and sufficiency classification

**Files:**
- Create: `lib/legal-engine/legal-research/researchBundle.ts`
- Test: `tests/legal-engine/legalResearchBundle.test.ts`

**Interfaces:**
- Consumes: request, regime resolution, verification results, adapter outcomes, and Task 1 hashing.
- Produces: `buildLegalResearchBundle(input): Promise<LegalResearchBundle>`, `hashResearchBundle(bundle): Promise<string>`, and `recordHumanReviewDecision(input): HumanReviewDecision`.

- [ ] **Step 1: Write failing tests for partial, sufficient, no-authority, unresolved-regime, rejection reasons, and scope.**

```ts
it('returns VERIFIED_SUFFICIENT when essential propositions are officially supported', async () => {
  const bundle = await buildLegalResearchBundle({ request: federalRequest, regime: resolvedFederal, verifications: [verifiedFor(federalRequest.legalIssueId)], unresolvedQuestions: [] });
  expect(bundle.researchStatus).toBe('VERIFIED_SUFFICIENT');
});

it('returns VERIFIED_PARTIAL when a material proposition is unsupported', async () => {
  const bundle = await buildLegalResearchBundle({ request: federalRequest, regime: resolvedFederal, verifications: [verifiedFor(federalRequest.legalIssueId, 'LIMITED')], unresolvedQuestions: ['proposición esencial sin soporte'] });
  expect(bundle.researchStatus).toBe('VERIFIED_PARTIAL');
});

it('returns REGIME_UNRESOLVED without accepting candidates', async () => {
  const bundle = await buildLegalResearchBundle({ request: blockedRequest, regime: unresolvedRegime, verifications: [verifiedFor('other-issue')] });
  expect(bundle.researchStatus).toBe('REGIME_UNRESOLVED');
  expect(bundle.verifiedAuthorities).toEqual([]);
});

it('does not leak an authority from issue A into issue B', async () => {
  const bundle = await buildLegalResearchBundle({ request: issueBRequest, regime: resolvedFederal, verifications: [verifiedFor('issue-A')] });
  expect(bundle.verifiedAuthorities).toEqual([]);
});

it('records explicit human review without changing source evidence or authority kind', () => {
  const decision = recordHumanReviewDecision({
    candidateId: 'candidate-1',
    authorityId: 'authority-1',
    decision: 'APPROVE_CONSUMPTION',
    reason: 'Metadata ambiguity reviewed against the same official evidence.',
    evidenceHash: 'evidence-hash-1',
    researchHash: 'research-hash-1',
    decidedAt: fixedClock().toISOString(),
  });
  expect(decision.candidateId).toBe('candidate-1');
  expect(decision.evidenceHash).toBe('evidence-hash-1');
  expect(decision.decision).toBe('APPROVE_CONSUMPTION');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchBundle.test.ts --reporter=dot`

Expected: FAIL because bundle construction is absent.

- [ ] **Step 3: Implement scoped aggregation and issue-based sufficiency.**

Filter accepted authorities to the request’s issue ID and request ID. Include only `verificationStatus = VERIFIED`. Preserve rejected candidates with every reason and unresolved question. Return `REGIME_UNRESOLVED` before considering any candidate when the regime is unresolved; return `NO_AUTHORITY_FOUND` when none are accepted; return `VERIFIED_PARTIAL` when accepted propositions exist but an essential proposition remains unresolved; return `VERIFIED_SUFFICIENT` only when all essential propositions supplied by the issue’s explicit research requirements are supported by official primary evidence. Do not require one authority per requested type and do not use result counts, page counts, word counts, or article counts. Hash only semantic bundle content, sorted IDs, source hashes, proposition text/level/limitations, validity statuses, and unresolved questions; exclude timestamps and attempt order. Export `recordHumanReviewDecision(input): HumanReviewDecision` as a pure recorder that requires candidate ID, optional authority ID, decision, reason, timestamp, evidence hash, and research hash. It must not alter evidence, source tier, identity, authority type, or citation; a later readiness layer may consume the decision only if all primary-evidence invariants still hold.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchBundle.test.ts --reporter=dot`

Expected: PASS for all bundle statuses, rejection reasons, issue scoping, deterministic research hash, and no cross-issue leakage.

## Task 9: Derived readiness and blocker precedence

**Files:**
- Create: `lib/legal-engine/legal-research/readiness.ts`
- Test: `tests/legal-engine/legalResearchReadiness.test.ts`

**Interfaces:**
- Consumes: `LegalIssueItem`, optional `LegalResearchBundle`, and canonical issue blockers.
- Produces: `deriveIssueResearchReadiness(issue, bundle?): DerivedIssueReadiness`.

- [ ] **Step 1: Write failing tests for research transition and blocker precedence.**

```ts
it('derives readiness without changing the canonical NEEDS_RESEARCH status', () => {
  const issue = issueWith({ status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
  const result = deriveIssueResearchReadiness(issue, sufficientBundleFor(issue.id));
  expect(result.canonicalStatus).toBe('NEEDS_RESEARCH');
  expect(result.researchReadiness).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
  expect(issue.status).toBe('NEEDS_RESEARCH');
});

it('keeps client-position blocker precedence', () => {
  const result = deriveIssueResearchReadiness(issueWith({ status: 'NEEDS_CLIENT_POSITION', clientPositionStatus: 'UNKNOWN' }), sufficientBundleFor('issue-1'));
  expect(result.blockers).toContain('MISSING_CLIENT_POSITION_REQUIRED');
  expect(result.researchReadiness).not.toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
});

it('keeps conflict blocker precedence', () => {
  const result = deriveIssueResearchReadiness(issueWith({ status: 'BLOCKED_BY_CONFLICT', conflictIds: ['conflict-1'] }), sufficientBundleFor('issue-1'));
  expect(result.blockers).toContain('BLOCKING_CONFLICT_REQUIRES_REVIEW');
  expect(result.researchReadiness).not.toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchReadiness.test.ts --reporter=dot`

Expected: FAIL because readiness derivation is absent.

- [ ] **Step 3: Implement derived readiness only.**

Return `NOT_REQUIRED` when the issue has no research dependency. Return `LEGAL_REGIME_UNRESOLVED`, `RESEARCH_REQUIRED`, or `RESEARCH_PARTIAL` for unresolved/absent/partial research. Return `READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH` only for `VERIFIED_SUFFICIENT` plus no relation, conflict, client-position, or unresolved-question blocker. Always copy the original status into `canonicalStatus` and never assign to `issue.status`. Preserve `BLOCKED_BY_CONFLICT`, `NEEDS_CLIENT_POSITION`, `UNKNOWN`, and `UNLINKED` precedence.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchReadiness.test.ts --reporter=dot`

Expected: PASS with canonical status unchanged and blocker precedence preserved.

## Task 10: Memory-only cache with revalidation on hit

**Files:**
- Create: `lib/legal-engine/legal-research/cache.ts`
- Test: `tests/legal-engine/legalResearchCache.test.ts`

**Interfaces:**
- Consumes: normalized query, regime hash, adapter ID/version, relevant date, temporal precision, and verification function from Tasks 2–8.
- Produces: `ResearchCacheKey`, `ResearchCache`, `createMemoryResearchCache()`, and `getOrVerifyResearchResult(input)`.

- [ ] **Step 1: Write failing tests for deterministic keys, no persistence, and verification on cache hit.**

```ts
it('uses query, regime, adapter, source, date, and precision in the key', () => {
  const left = makeResearchCacheKey({ normalizedQuery: 'art 14', regimeHash: 'r1', adapterId: 'FIXTURE_OFFICIAL', adapterVersion: '1', relevantDate: '2024', temporalPrecision: 'YEAR' });
  const right = makeResearchCacheKey({ normalizedQuery: 'art 14', regimeHash: 'r2', adapterId: 'FIXTURE_OFFICIAL', adapterVersion: '1', relevantDate: '2024', temporalPrecision: 'YEAR' });
  expect(left).not.toBe(right);
});

it('runs verification again on a cache hit when temporal validation is required', async () => {
  const verify = vi.fn().mockResolvedValue(verifiedResult);
  const cache = createMemoryResearchCache();
  await getOrVerifyResearchResult({ cache, key, load: async () => candidateResult, verify, temporalRevalidationRequired: true });
  await getOrVerifyResearchResult({ cache, key, load: async () => { throw new Error('must not load'); }, verify, temporalRevalidationRequired: true });
  expect(verify).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchCache.test.ts --reporter=dot`

Expected: FAIL because cache helpers are absent.

- [ ] **Step 3: Implement the in-memory cache abstraction.**

Canonicalize all key fields and include adapter version. Store retrievedAt, sourceHash, temporal status, and semantic result; do not store corpus or write files. Expose configurable adapter revalidation policy without a universal TTL. On a hit, bypass retrieval only when the entry is still eligible, but call verification whenever temporal/régimen validation is required. Do not let cache return `VERIFIED` without a fresh verification result when the policy requires revalidation.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchCache.test.ts --reporter=dot`

Expected: PASS for deterministic keying, in-memory behavior, metadata retention, and verification-on-hit.

## Task 11: Research trace by attempt, bounded and corpus-free

**Files:**
- Create: `lib/legal-engine/legal-research/researchTrace.ts`
- Modify: `lib/legal-engine/generationTrace.ts`
- Test: `tests/legal-engine/legalResearchTrace.test.ts`

**Interfaces:**
- Consumes: request, regime, normalized query, adapter outcomes, candidates, verification results, bundle, and existing `GenerationTraceContext`.
- Produces: `LegalResearchTrace`, `recordResearchAttempt`, `recordResearchCandidate`, `recordResearchVerification`, `recordResearchBundle`, and additive `GenerationTrace.legalResearch` storage.

- [ ] **Step 1: Write failing tests for the complete trace chain and sanitization.**

```ts
it('records issue, regime, request, query, adapter attempt, candidate, verification, authority, bundle, and readiness', () => {
  const trace = createResearchTraceRecorder({ clock: fixedClock });
  trace.recordRequest(request, regime);
  trace.recordQuery(query);
  trace.recordAttempt({ adapterId: 'FIXTURE_OFFICIAL', outcome: 'PASS', candidateIds: ['candidate-1'], acceptedAuthorityIds: ['authority-1'], rejectedCandidateIds: [], officialUrls: ['https://fixture.official.test/a'], sourceHashes: ['hash-1'], reasons: [] });
  trace.recordBundle(bundle, readiness);
  expect(trace.close().requestId).toBe(request.id);
  expect(trace.close().status).toBe(bundle.researchStatus);
});

it('does not store corpus or secrets', () => {
  const result = createResearchTraceRecorder({ clock: fixedClock }).close();
  expect(JSON.stringify(result)).not.toContain('full source corpus');
  expect(JSON.stringify(result)).not.toMatch(/api[_-]?key|bearer/i);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchTrace.test.ts --reporter=dot`

Expected: FAIL because research trace types/recorders are absent.

- [ ] **Step 3: Implement bounded research tracing and additive generation integration.**

Record IDs, hashes, statuses, timestamps, official URLs, source hashes, adapter outcomes, and rejection reasons. Record one attempt entry per adapter call. Sanitize/limit strings using the existing trace sanitizer before attaching the optional trace to `GenerationTrace`. Do not add retrieved corpus, secrets, full source text, or unbounded provider output. Keep `schemaVersion: '1.0'` backward-compatible by making research trace optional and preserve existing generation trace methods.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchTrace.test.ts --reporter=dot`

Expected: PASS for the full research chain, per-attempt recording, hashes/statuses/reasons, sanitization, and corpus-free trace.

## Task 12: Future re-entry contract types without generation changes

**Files:**
- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/issueDraftResult.ts` only for additive type exports if required.
- Test: `tests/legal-engine/legalResearchReentryTypes.test.ts`

**Interfaces:**
- Consumes: `LegalResearchBundle` and `IssueContextPack` existing allowlist.
- Produces: `VerifiedResearchContext`, `buildVerifiedResearchContext(bundle, issueId)`, and a type-level contract that excludes rejected/secondary/cross-issue authorities.

- [ ] **Step 1: Write failing tests for scoped future context and no automatic eligibility.**

```ts
it('projects only verified authorities for the requested issue', () => {
  const context = buildVerifiedResearchContext(bundleWithAuthorities('issue-A', 'issue-B'), 'issue-A');
  expect(context.authorities.map((authority) => authority.id)).toEqual(['authority-issue-A']);
  expect(context).not.toHaveProperty('rejectedCandidates');
});

it('does not translate derived readiness into current final-generation eligibility', () => {
  const issue = issueWith({ status: 'NEEDS_RESEARCH' });
  const task = researchTaskFor(issue.id);
  expect(isFinalGenerationEligible(issue, task)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchReentryTypes.test.ts --reporter=dot`

Expected: FAIL because the future projection type/helper is absent.

- [ ] **Step 3: Implement only the additive projection.**

Add `verifiedResearch?: { requestId; researchHash; authorities: ... }` to the pack-compatible type and implement a pure projection that filters `verificationStatus = VERIFIED` and `supportsLegalIssueIds.includes(issueId)`. Reject cross-issue authorities with a scoped error. Do not change `resolveIssueEligibility`, `isFinalGenerationEligible`, `executeIssueScopedGeneration`, `IssueDraftResult` runtime validation, or provider invocation.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchReentryTypes.test.ts --reporter=dot`

Expected: PASS with scoped future context and unchanged current generation eligibility.

## Task 13: Research-only pipeline orchestration and zero final-generation calls

**Files:**
- Modify: `lib/legal-engine/pipeline.ts`
- Test: `tests/legal-engine/legalResearchPipeline.test.ts`

**Interfaces:**
- Consumes: rich `CaseAnalysis`, canonical `LegalIssueMatrix`, taxonomy/legal context, fixture provider, injected clock, and research trace recorder.
- Produces: `runLegalResearchOnly(input): Promise<{ requests; bundles; readiness; trace }>`.

- [ ] **Step 1: Write failing tests for the end-to-end offline vertical slices.**

```ts
it('runs Case A from federal NEEDS_RESEARCH to VERIFIED_SUFFICIENT without generation provider calls', async () => {
  const finalProvider = vi.fn();
  const result = await runLegalResearchOnly({ caseAnalysis: richFederalAnalysis, issueMatrix: federalMatrix, provider: fixtureProvider, invokeFinalProvider: finalProvider, clock: fixedClock });
  expect(result.bundles[0].researchStatus).toBe('VERIFIED_SUFFICIENT');
  expect(result.readiness[0].researchReadiness).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
  expect(finalProvider).not.toHaveBeenCalled();
});

it('runs Case B with state plus explicit federative entity', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: richStateAnalysis, issueMatrix: stateMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.bundles[0].regimeResolution.scope).toBe('STATE');
  expect(result.bundles[0].regimeResolution.federativeEntity?.code).toBe('MX-JAL');
});

it('runs Case C unresolved regime with no false verification', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: unresolvedAnalysis, issueMatrix: unresolvedMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.bundles[0].researchStatus).toBe('REGIME_UNRESOLVED');
  expect(result.bundles[0].verifiedAuthorities).toEqual([]);
});

it('runs Cases D-F through SOURCE_CITED, mismatch, and temporal rejection', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: citedMismatchTemporalAnalysis, issueMatrix: citedMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.bundles.flatMap((bundle) => bundle.rejectedCandidates.flatMap((item) => item.reasons)))
    .toEqual(expect.arrayContaining(['MISMATCH', 'OUTDATED']));
});

it('runs Case G without cross-issue leakage', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: twoIssueAnalysis, issueMatrix: twoIssueMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.bundles.find((bundle) => bundle.legalIssueId === 'issue-B')?.verifiedAuthorities).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `npx vitest run tests/legal-engine/legalResearchPipeline.test.ts --reporter=dot`

Expected: FAIL because the research-only orchestration entry point is absent.

- [ ] **Step 3: Implement the isolated research-only orchestration.**

Select only issues whose canonical status/research status requires research. Resolve each regime, build one request, normalize one query, call only the injected `LegalResearchProvider`, verify candidates, build one issue-scoped bundle, derive readiness, and record the trace. Never call `executeGenerationTask`, `executeReadyIssueTasks`, `runFastMode`, `runDeepReviewMode`, NVIDIA, or `LocalProvider`. Return partial results for adapter failures and preserve valid results from other adapters. Keep the input `LegalIssueMatrix` object unchanged.

- [ ] **Step 4: Run the focused test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchPipeline.test.ts --reporter=dot`

Expected: PASS for federal, state, unresolved, `SOURCE_CITED`, mismatch, temporal, cross-issue, and zero final-generation provider-call slices.

## Task 14: Legacy/non-labor regression and explicit source-mention preservation

**Files:**
- Modify: `lib/legal-engine/legal-research/*` only if a regression exposes an actual scope violation; do not alter legacy code paths to relax research gates.
- Test: `tests/legal-engine/legalResearchLegacyRegression.test.ts`

**Interfaces:**
- Consumes: existing rich and legacy matrix builders, research-only orchestration, and current fixture helpers.
- Produces: regression evidence that rich-first and legacy behavior remain separated and the non-labor path is unaffected.

- [ ] **Step 1: Write failing regression tests before any compatibility adjustment.**

```ts
it('uses rich entities when richCaseAnalysis exists and never projects through legacy issues', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: richAnalysisWithAuthority, issueMatrix: richMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.bundles[0].legalIssueId).toMatch(/^issue-/);
  expect(result.bundles[0].legalIssueId).not.toMatch(/^legacy-issue-/);
});

it('does not change a legacy matrix or invent research authorities', async () => {
  const matrixBefore = structuredClone(legacyMatrix);
  const result = await runLegalResearchOnly({ caseAnalysis: legacyAnalysis, issueMatrix: legacyMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(legacyMatrix).toEqual(matrixBefore);
  expect(result.bundles.every((bundle) => bundle.verifiedAuthorities.length === 0)).toBe(true);
});

it('preserves the non-labor regression path', async () => {
  const result = await runLegalResearchOnly({ caseAnalysis: civilNonLaborAnalysis, issueMatrix: civilNonLaborMatrix, provider: fixtureProvider, clock: fixedClock });
  expect(result.readiness.every((item) => item.legalIssueId)).toBe(true);
});
```

- [ ] **Step 2: Run the focused regression test to verify its baseline.**

Run: `npx vitest run tests/legal-engine/legalResearchLegacyRegression.test.ts --reporter=dot`

Expected: FAIL only if the new integration has violated rich/legacy or non-labor boundaries; if it passes immediately, retain the tests as regression protection and continue.

- [ ] **Step 3: Make the smallest compatibility correction if the test identifies a real FASE 5A defect.**

Keep the correction inside the research-only boundary. Do not route rich data through legacy, do not change `LegalIssue.status`, do not synthesize a client position, and do not add a fallback that treats an unverified source mention as verified.

- [ ] **Step 4: Run the focused regression test to verify it passes.**

Run: `npx vitest run tests/legal-engine/legalResearchLegacyRegression.test.ts --reporter=dot`

Expected: PASS with canonical matrices unchanged and rich/legacy/non-labor behavior preserved.

## Task 15: Contract matrix, final focused validation, and handoff evidence

**Files:**
- Modify: all FASE 5A files only when a test from this plan identifies a concrete defect.
- Test: all FASE 5A test files listed in the file map.

**Interfaces:**
- Consumes: completed Tasks 1–14.
- Produces: one focused validation record and a contract-to-test mapping with all 50 contracts covered.

- [ ] **Step 1: Add or verify one named test for each contract.**

Use the following exact mapping; do not replace a contract with a count-only assertion.

| # | Contract | Test location |
|---:|---|---|
| 1 | `NEEDS_RESEARCH` creates request | `legalResearchRequest.test.ts` |
| 2 | `READY_FOR_GENERATION` without research does not create request | `legalResearchRequest.test.ts` |
| 3 | Client-position blocker survives research | `legalResearchReadiness.test.ts` |
| 4 | Conflict blocker survives research | `legalResearchReadiness.test.ts` |
| 5 | Request ID deterministic | `legalResearchRequest.test.ts` |
| 6 | Federal regime resolves | `legalRegimeResolution.test.ts` |
| 7 | State regime resolves with entity | `legalRegimeResolution.test.ts` |
| 8 | Unresolved regime fails closed | `legalRegimeResolution.test.ts` |
| 9 | Relevant date preserved | `legalRegimeResolution.test.ts` |
| 10 | No universal CNPCF | `legalResearchRequest.test.ts` |
| 11 | `SOURCE_CITED` creates verification candidate | `authorityVerification.test.ts` |
| 12 | `SOURCE_CITED` remains unverified before verification | `authorityVerification.test.ts` |
| 13 | Official exact match verifies | `authorityVerification.test.ts` |
| 14 | Mismatched citation rejected | `authorityVerification.test.ts` |
| 15 | Wrong jurisdiction rejected | `authorityVerification.test.ts` |
| 16 | Temporal mismatch rejected | `authorityVerification.test.ts` |
| 17 | Repealed authority flagged | `authorityVerification.test.ts` |
| 18 | Thesis is not jurisprudence | `authorityVerification.test.ts` |
| 19 | Candidate without official evidence is not verified | `authorityVerification.test.ts` |
| 20 | Source URL preserved | `authorityVerification.test.ts` |
| 21 | `retrievedAt` preserved | `authorityVerification.test.ts` |
| 22 | Authority hash deterministic | `legalResearchCanonical.test.ts` |
| 23 | Proposition-level link required | `authorityVerification.test.ts` |
| 24 | Unrelated authority is not linked | `authorityVerification.test.ts` |
| 25 | Verified authority does not create facts | `legalResearchPipeline.test.ts` |
| 26 | Verified authority does not create `EvidenceOffer` | `legalResearchPipeline.test.ts` |
| 27 | Verified authority does not create `ClientPosition` | `legalResearchPipeline.test.ts` |
| 28 | Bundle scoped to one issue | `legalResearchBundle.test.ts` |
| 29 | No cross-issue authority leakage | `legalResearchBundle.test.ts` |
| 30 | Partial bundle | `legalResearchBundle.test.ts` |
| 31 | Sufficient bundle | `legalResearchBundle.test.ts` |
| 32 | No-authority bundle | `legalResearchBundle.test.ts` |
| 33 | Unresolved-regime bundle | `legalResearchBundle.test.ts` |
| 34 | Rejection reasons explicit | `legalResearchBundle.test.ts` |
| 35 | Adapter failure isolated | `legalResearchFixtureAdapter.test.ts` |
| 36 | Trace records request | `legalResearchTrace.test.ts` |
| 37 | Trace records candidate | `legalResearchTrace.test.ts` |
| 38 | Trace records verification | `legalResearchTrace.test.ts` |
| 39 | Trace records accepted authority | `legalResearchTrace.test.ts` |
| 40 | Trace has no corpus | `legalResearchTrace.test.ts` |
| 41 | Research hash deterministic | `legalResearchBundle.test.ts` |
| 42 | No invented citation | `authorityVerification.test.ts` |
| 43 | Official-source priority | `authorityVerification.test.ts` |
| 44 | Secondary source cannot independently verify primary authority | `authorityVerification.test.ts` |
| 45 | Readiness transition requires verified sufficient research | `legalResearchReadiness.test.ts` |
| 46 | Blockers preserve precedence | `legalResearchReadiness.test.ts` |
| 47 | Future context consumes scoped verified bundle | `legalResearchReentryTypes.test.ts` |
| 48 | Legacy path unaffected | `legalResearchLegacyRegression.test.ts` |
| 49 | Non-labor regression unaffected | `legalResearchLegacyRegression.test.ts` |
| 50 | Research-only has zero final-generation provider calls | `legalResearchPipeline.test.ts` |

- [ ] **Step 2: Run the complete focused FASE 5A test set.**

Run:

```powershell
npx vitest run `
  tests/legal-engine/legalResearchCanonical.test.ts `
  tests/legal-engine/legalRegimeResolution.test.ts `
  tests/legal-engine/legalResearchRequest.test.ts `
  tests/legal-engine/legalResearchFixtureAdapter.test.ts `
  tests/legal-engine/authorityVerification.test.ts `
  tests/legal-engine/legalResearchBundle.test.ts `
  tests/legal-engine/legalResearchReadiness.test.ts `
  tests/legal-engine/legalResearchCache.test.ts `
  tests/legal-engine/legalResearchTrace.test.ts `
  tests/legal-engine/legalResearchReentryTypes.test.ts `
  tests/legal-engine/legalResearchPipeline.test.ts `
  tests/legal-engine/legalResearchLegacyRegression.test.ts `
  --reporter=dot
```

Expected: PASS with zero internet/provider calls. Record the exact test/file counts and any warnings.

- [ ] **Step 3: Run the directly related existing regressions.**

Run only the existing rich-first and issue-scoped tests directly affected by the new imports or trace seam, for example:

```powershell
npx vitest run tests/legal-engine/richCoverageLegacyRegression.test.ts tests/legal-engine/issueScopedGeneration.test.ts --reporter=dot
```

If a named file does not exist in the checkout, replace it with the exact existing test file that covers the changed import, and record that substitution. Do not run `npm test` or the full suite.

- [ ] **Step 4: Run typecheck, lint, and build.**

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: each command exits 0. Do not investigate historical lint-warning deltas unless a new FASE 5A error depends on them.

- [ ] **Step 5: Verify scope and artifacts before handoff.**

Confirm with read-only checks that no files for real official adapters, database persistence, DOCX, RAG, or UI were added; no call to `runFastMode`, `runDeepReviewMode`, NVIDIA, or `LocalProvider` exists in the research-only path; `LegalIssue.status` is not assigned by research code; and all 50 contract names remain represented in the mapping above.

## Dependency order

```text
Task 1 canonical/types
  → Task 2 regime
  → Task 3 request/query
  → Task 4 provider/fixture
  → Tasks 5–7 verification
  → Task 8 bundle
  → Task 9 readiness
  → Task 10 cache and Task 11 trace
  → Task 12 future reentry types
  → Task 13 pipeline
  → Task 14 regressions
  → Task 15 final focused validation
```

Tasks 10 and 11 can be implemented after Task 8 independently, but the inline executor should keep the displayed order to simplify checkpoints. No task depends on internet or a real official site.

## Validation policy

The implementation is not complete merely because interfaces compile. The minimum evidence is the six required fixture scenarios (federal, state, unresolved regime, `SOURCE_CITED`, mismatch, temporal, plus cross-issue isolation), the 50 named contracts, zero final-generation provider calls, focused related regressions, `npm run typecheck`, `npm run lint`, and `npm run build`. No `npm test`, real web retrieval, real SCJN/Cámara/DOF, NVIDIA, `LocalProvider`, persistence, or DOCX validation belongs to this plan.

## Risks and mitigations

- **Fixture mistaken for real legal evidence:** mark every fixture source with `isFixture: true` and keep real adapters out of this phase.
- **Citation strengthened accidentally:** preserve `SourceAuthorityMention` and require a separate `VerifiedAuthority` relation.
- **Wrong regime or date:** fail closed on material fields and validate scope/entity/matter/procedure/date before proposition acceptance.
- **False sufficiency:** assess essential proposition coverage, not result counts or requested type counts.
- **Blocker bypass:** derive readiness without mutating canonical status and test conflict/client-position precedence.
- **Cross-issue contamination:** filter by request ID and `supportsLegalIssueIds` at candidate, authority, bundle, and context projection boundaries.
- **Stale cache:** include regime/date/adapter version and re-run verification on required cache hits.
- **Trace leakage:** store IDs, URLs, hashes, statuses, timestamps, and bounded reasons only.
- **Legacy regression:** keep the research-only entry point additive and preserve rich-first versus legacy fallback separation.
- **Scope expansion:** do not add real adapters, RAG, DB, UI, DOCX, web, or final generation in FASE 5A.
