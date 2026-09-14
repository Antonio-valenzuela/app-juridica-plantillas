# CaseAnalysis Extraction + Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task. Each step uses checkbox syntax and must be completed in order.

**Goal:** Convert heterogeneous legal source documents into a rich, provenance-preserving `CaseAnalysis` through deterministic layered extraction while keeping the existing `reconstructCaseAnalysis` API and legacy consumers compatible.

**Architecture:** Add a modular extractor under `lib/legal-engine/case-extraction/`. It consumes `DocumentIndex`-backed source units, creates and classifies candidates, normalizes only unambiguous values, deduplicates without losing provenance, records unresolved conflicts, builds a canonical rich model, and performs a one-way conservative projection to legacy `CaseAnalysis` fields. `GenerationTraceContext` receives extraction statistics and decisions without storing unnecessary raw sensitive text.

**Tech Stack:** TypeScript, existing Next.js 16 application, Vitest, `UploadedSourceDocument`, `DocumentIndex`, Node crypto hashing, existing `GenerationTraceContext`, PowerShell validation commands, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-caseanalysis-extraction-provenance-design.md`

## Global Constraints

- Preserve the accepted entry baseline: 115 test files; 1,906 tests passed; 2 skipped; 0 failures; typecheck passed; lint 0 errors and 975 warnings; build blocked before Next by the known Prisma `EPERM` DLL rename.
- Keep `reconstructCaseAnalysis` as the public entry point. Add only optional trailing options or additive result fields.
- The rich model is canonical. The only supported direction is `rich model → legacy projection`; never synchronize the two models bidirectionally.
- The legacy projection must never strengthen semantics: `SOURCE_ASSERTION` cannot become `ESTABLISHED_FACT`; `SOURCE_MENTIONED` cannot become `CLIENT_CONFIRMED`; `DocumentItem` cannot become `EvidenceOffer`; `SOURCE_CITED` cannot become `LEGALLY_VERIFIED`; `SOURCE_POSITION` cannot become `CLIENT_POSITION`; inference cannot become confirmed assertion.
- Reuse `buildDocumentIndex` for pages, elements and tables. Do not create a second page/table parser.
- Segment prudently. Split only when distinct legal events, claims or propositions have deterministic boundaries; retain one candidate and mark review when the boundary is uncertain.
- Basic extraction must work without NVIDIA. Any future semantic classifier is optional, validated against deterministic candidates, and unable to invent material data.
- Deduplication must retain every original `SourceProvenance` reference. Conflicts remain open and require review; no winner is selected automatically.
- Do not generate defenses, exceptions, legal arguments, offered evidence, procedural posture, LegalIssueMatrix, online legal verification, multi-AI controversy calls, artificial DOCX length, broad `DocumentPlan` changes, renderer changes or database migrations.
- Do not modify `.env`, simulate NVIDIA, store secrets, or initialize Git. The checkout has no `.git`; checkpoints are recorded as validation output instead of commits.
- No full test suite is rerun until Task 20. Every earlier task runs its focused tests and `npm run typecheck` before its checkpoint.
- Never store full sensitive source documents in traces. Use IDs, hashes, bounded excerpts, counts, methods, reasons and safe provenance.
- Existing consumers may continue to read legacy fields temporarily, but new extraction code must not read those projections back as its source of truth.

## File Map

| File | Responsibility |
| --- | --- |
| `lib/legal-engine/case-extraction/types.ts` | Rich extraction entities, candidate states, provenance enums and extraction statistics. |
| `lib/legal-engine/case-extraction/provenance.ts` | Excerpt hashing, bounded sanitization and `SourceProvenance` constructors. |
| `lib/legal-engine/case-extraction/sourceUnits.ts` | Adapt `UploadedSourceDocument` and `DocumentIndex` into ordered source units. |
| `lib/legal-engine/case-extraction/candidateSegmentation.ts` | Heading, list, table, delimiter and prudent paragraph segmentation. |
| `lib/legal-engine/case-extraction/classification.ts` | Deterministic candidate classification and speaker/role attribution. |
| `lib/legal-engine/case-extraction/normalization.ts` | Safe names, aliases, dates, amounts, authority labels and status normalization. |
| `lib/legal-engine/case-extraction/parties.ts` | Party identities, roles, aliases and explicit confirmation rules. |
| `lib/legal-engine/case-extraction/claims.ts` | Individual claims with relief, claimant, factual/evidence links and source status. |
| `lib/legal-engine/case-extraction/facts.ts` | Assertions and prudent atomic fact segmentation. |
| `lib/legal-engine/case-extraction/evidence.ts` | `DocumentItem`, `EvidenceMention`, `EvidenceOffer` and stated-purpose links. |
| `lib/legal-engine/case-extraction/arguments.ts` | Source arguments and cited authority mentions. |
| `lib/legal-engine/case-extraction/deduplication.ts` | Conservative canonical keys and provenance-preserving merges. |
| `lib/legal-engine/case-extraction/conflicts.ts` | Date, amount, identity, role and opposing-assertion conflicts. |
| `lib/legal-engine/case-extraction/missingData.ts` | Structured missing data and source/client position state. |
| `lib/legal-engine/case-extraction/legacyProjection.ts` | One-way conservative projection to existing `CaseAnalysis` fields. |
| `lib/legal-engine/case-extraction/orchestrator.ts` | Ordered extraction pipeline and statistics aggregation. |
| `lib/legal-engine/caseAnalysis.ts` | Preserve public reconstruction API and attach the rich analysis/projection. |
| `lib/legal-engine/generationTrace.ts` | Add extraction trace types and `recordExtraction` without changing FASE 0 semantics. |
| `tests/legal-engine/case-extraction/*.test.ts` | Focused TDD contracts for each extraction layer. |
| `tests/fixtures/caseAnalysisExtractionFixtures.ts` | Synthetic fixtures A–E. |
| `tests/legal-engine/caseAnalysisExtractionContracts.test.ts` | The 30 mandatory extraction contracts. |
| `tests/legal-engine/caseAnalysisExtractionRegression.test.ts` | Existing consumer and compatibility regressions. |

---

### Task 1: Define rich extraction types and provenance primitives

**Files:**
- Create: `lib/legal-engine/case-extraction/types.ts`
- Create: `lib/legal-engine/case-extraction/provenance.ts`
- Modify: `lib/legal-engine/caseAnalysis.ts:1-126` to add an optional `richCaseAnalysis?: RichCaseAnalysis` field without changing existing required fields.
- Test: `tests/legal-engine/case-extraction/typesAndProvenance.test.ts`

**Interfaces:**
- Consumes: existing `UploadedSourceDocument`, `SourceReference`, `ProvenanceKind`, `CaseAnalysis` and `GenerationTraceContext` shape.
- Produces: `SourceProvenance`, `ExtractionCandidate`, `RichCaseAnalysis`, `ExtractionStats`, `PartyRole`, `SpeakerRole`, `InferenceLevel`, `ExtractionMethod`, `CandidateKind`, `CandidateDecision`, `createSourceProvenance`, `hashExcerpt` and `sanitizeExcerpt`.

Define the canonical rich types before any extractor consumes them:

```ts
export type InferenceLevel = 'LITERAL' | 'NORMALIZED' | 'RELATION_INFERRED' | 'UNKNOWN';
export type ExtractionMethod = 'HEADING' | 'NUMBERED_LIST' | 'BULLET_LIST' | 'TABLE' | 'PARAGRAPH' | 'PATTERN' | 'NORMALIZATION' | 'MANUAL_INPUT';
export type CandidateDecision = 'ACCEPTED' | 'MERGED' | 'REJECTED' | 'REQUIRES_REVIEW';
export type CandidateKind = 'PARTY' | 'ASSERTION' | 'CLAIM' | 'FACT' | 'DOCUMENT' | 'EVIDENCE' | 'DATE' | 'AMOUNT' | 'ARGUMENT' | 'AUTHORITY';
export type PartyRole = 'ACTOR' | 'DEMANDADO' | 'PROMOVENTE' | 'QUEJOSO' | 'TERCERO' | 'AUTORIDAD' | 'REPRESENTANTE' | 'AUTORIZADO' | 'APODERADO' | 'UNKNOWN';
export type SpeakerRole = 'PARTE_ACTORA' | 'PARTE_DEMANDADA' | 'PROMOVENTE' | 'AUTORIDAD' | 'REPRESENTANTE' | 'TERCERO' | 'RESOLUTOR' | 'UNKNOWN';

export interface CandidateClassification {
  label: string;
  confidence: number;
  reason: string;
}

export interface SourceProvenance {
  sourceId: string;
  sourceType?: string;
  sourceName?: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  excerptHash: string;
  excerpt?: string;
  speakerRole?: SpeakerRole;
  extractionMethod: ExtractionMethod;
  confidence: number;
  inferenceLevel: InferenceLevel;
}

export interface ExtractionCandidate {
  candidateId: string;
  kind: CandidateKind;
  rawText: string;
  provenance: SourceProvenance[];
  speakerRole?: SpeakerRole;
  classification?: CandidateClassification;
  normalized?: unknown;
  decision: CandidateDecision;
  decisionReason?: string;
}

export interface ExtractionStats {
  sourceUnitCount: number;
  candidatesDetected: number;
  candidatesAccepted: number;
  candidatesMerged: number;
  candidatesRejected: number;
  candidatesForReview: number;
  rejectionReasons: Record<string, number>;
  provenanceComplete: number;
  provenancePartial: number;
  provenanceMissing: number;
}

export interface SegmentationStats {
  candidatesDetected: number;
  splitCandidates: number;
  reviewCandidates: number;
  bySection: Record<string, number>;
}

export interface CaseParty {
  id: string;
  name?: string;
  role: PartyRole;
  aliases: string[];
  provenance: SourceProvenance[];
  confidence: number;
  confirmed: boolean;
}

export interface SourceAssertion {
  id: string;
  actorPartyId?: string;
  actorRole?: SpeakerRole;
  proposition: string;
  status: 'ALLEGED' | 'DENIED' | 'ADMITTED' | 'REPORTED' | 'UNKNOWN';
  provenance: SourceProvenance[];
}

export interface NormalizedDate {
  rawValue: string;
  normalizedValue?: string;
  precision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  provenance: SourceProvenance[];
}

export interface NormalizedAmount {
  rawValue: string;
  normalizedValue?: number;
  currency?: string;
  unit?: string;
  provenance: SourceProvenance[];
}

export interface ClaimItem {
  id: string;
  claimantPartyId?: string;
  requestedRelief: string;
  factualBasisIds: string[];
  evidenceMentionIds: string[];
  amount?: NormalizedAmount;
  provenance: SourceProvenance[];
  status: 'SOURCE_MENTIONED' | 'SOURCE_ASSERTED' | 'NEEDS_REVIEW' | 'UNKNOWN';
}

export interface FactItem {
  id: string;
  proposition: string;
  date?: NormalizedDate;
  participants: string[];
  amount?: NormalizedAmount;
  location?: string;
  sourceRole?: SpeakerRole;
  assertionStatus: 'SOURCE_ASSERTION' | 'ESTABLISHED_FACT' | 'UNKNOWN';
  provenance: SourceProvenance[];
  relatedDocumentIds: string[];
}

export interface DocumentItem {
  id: string;
  title: string;
  documentType?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface EvidenceMention {
  id: string;
  documentItemId?: string;
  type?: string;
  description: string;
  relatedFactIds: string[];
  relatedClaimIds: string[];
  statedPurpose?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'POTENTIALLY_RELEVANT' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface EvidenceOffer {
  id: string;
  evidenceMentionId: string;
  status: 'PARTY_OFFERED' | 'CLIENT_CONFIRMED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface ArgumentItem {
  id: string;
  speakerRole?: SpeakerRole;
  proposition: string;
  supportingFactIds: string[];
  citedAuthorityIds: string[];
  provenance: SourceProvenance[];
}

export interface SourceAuthorityMention {
  id: string;
  authorityType: 'ARTICLE' | 'LAW' | 'CODE' | 'THESIS' | 'JURISPRUDENCE' | 'PRECEDENT' | 'OTHER';
  citationText: string;
  verificationStatus: 'SOURCE_CITED' | 'LEGALLY_VERIFIED';
  provenance: SourceProvenance[];
}

export interface CaseConflict {
  conflictId: string;
  type: 'DATE' | 'AMOUNT' | 'IDENTITY' | 'ROLE' | 'OPPOSING_ASSERTION' | 'OTHER';
  itemIds: string[];
  sourceIds: string[];
  description: string;
  requiresReview: true;
}

export interface MissingDataItem {
  field: string;
  reason: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  sectionAffected?: string;
  blocking: boolean;
  sourceSearched: string[];
  requiresClientInput: boolean;
}

export interface SourcePosition {
  status: 'KNOWN' | 'UNKNOWN';
  assertionIds: string[];
  provenance: SourceProvenance[];
}

export interface ClientPosition {
  status: 'CONFIRMED' | 'UNKNOWN';
  source: 'CLIENT_POSITION' | 'SOURCE_POSITION';
  propositionIds: string[];
  provenance: SourceProvenance[];
}

export interface PartyExtractionResult {
  parties: CaseParty[];
  reviewReasons: string[];
}

export interface ClaimExtractionContext {
  partyIdsByRole: Record<PartyRole, string[]>;
  factIds: string[];
  evidenceMentionIds: string[];
}

export interface EvidenceExtractionContext {
  factIdsByNumber: Record<string, string>;
  claimIds: string[];
}

export interface ArgumentExtractionContext {
  factIds: string[];
  authorityIds: string[];
}

export interface RichCaseAnalysis {
  parties: CaseParty[];
  assertions: SourceAssertion[];
  claims: ClaimItem[];
  facts: FactItem[];
  documents: DocumentItem[];
  evidenceMentions: EvidenceMention[];
  evidenceOffers: EvidenceOffer[];
  arguments: ArgumentItem[];
  authorities: SourceAuthorityMention[];
  dates: NormalizedDate[];
  amounts: NormalizedAmount[];
  conflicts: CaseConflict[];
  missingData: MissingDataItem[];
  sourcePosition: SourcePosition;
  clientPosition: ClientPosition;
  extractionStats: ExtractionStats;
  candidates: ExtractionCandidate[];
}
```

`createSourceProvenance` must require `sourceId` and `excerptHash`; `hashExcerpt` uses SHA-256; `sanitizeExcerpt` bounds and redacts secret-shaped content before storage.

- [x] **Step 1: Write the failing type and provenance tests**

```ts
it('requires source identity and hashes a bounded excerpt', () => {
  const provenance = createSourceProvenance({ sourceId: 'src-a', sourceName: 'demanda.txt', text: 'Actor: Ana' }, 'PARAGRAPH');
  expect(provenance.sourceId).toBe('src-a');
  expect(provenance.excerptHash).toMatch(/^[a-f0-9]{64}$/);
  expect(provenance.excerpt).toBe('Actor: Ana');
});

it('does not retain secrets in an excerpt', () => {
  const safe = sanitizeExcerpt('NVIDIA_API_KEY=nvapi-secret; actor: Ana');
  expect(safe).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
  expect(safe).toContain('actor: Ana');
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/typesAndProvenance.test.ts`

Expected: FAIL because the rich types and provenance helpers do not exist.

- [x] **Step 3: Implement the minimum type and provenance layer**

Create the exported unions/interfaces, add optional `richCaseAnalysis?: RichCaseAnalysis` to the existing `CaseAnalysis`, and implement SHA-256 hashing plus bounded secret redaction without changing any existing extraction behavior.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/typesAndProvenance.test.ts` and `npm run typecheck`

Expected: PASS with no changes to existing runtime consumers.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 1 checkpoint recorded' }`

**Done when:** all later rich entities can import stable types and every material item can carry a bounded, hashed, sanitized provenance reference.

**Regression risks:** circular imports between `caseAnalysis.ts` and extraction types, accidental mandatory-field changes, or hashing unsanitized secrets.

**Dependencies:** none.

### Task 2: Create `SourceUnit` from existing `DocumentIndex`

**Files:**
- Create: `lib/legal-engine/case-extraction/sourceUnits.ts`
- Test: `tests/legal-engine/case-extraction/sourceUnits.test.ts`

**Interfaces:**
- Consumes: `UploadedSourceDocument`, `DocumentPage`, `DocumentElement`, `buildDocumentIndex`, `createSourceProvenance`.
- Produces: `SourceUnit`, `buildSourceUnits(sources, options?)`.

Use `buildDocumentIndex([source], { referenceText })` for each source so the existing page/heading/paragraph/table classification remains the single parser. Wrap each resulting element with the source ID, page, stable order, optional section/paragraph/element indexes and provenance. Preserve table elements as table units; do not reparse table text in this task.

```ts
export interface SourceUnit {
  unitId: string;
  sourceId: string;
  sourceName?: string;
  sourceType?: string;
  kind: 'PAGE' | 'HEADING' | 'PARAGRAPH' | 'LINE' | 'TABLE' | 'SIGNATURE' | 'HEADER' | 'OTHER';
  text: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  order: number;
  tableRows?: string[][];
  provenance: SourceProvenance;
}

export function buildSourceUnits(
  sources: UploadedSourceDocument[],
  options: { referenceText?: string } = {},
): SourceUnit[];
```

- [x] **Step 1: Write the failing source-unit tests**

```ts
it('preserves source, page and ordered elements from DocumentIndex', () => {
  const units = buildSourceUnits([sourceWithPages('src-a', 3, 'HECHOS\n1. Contrato')]);
  expect(units[0]).toMatchObject({ sourceId: 'src-a', page: 3 });
  expect(units.every((unit, index) => unit.order === index)).toBe(true);
  expect(units.every((unit) => unit.provenance.sourceId === 'src-a')).toBe(true);
});

it('reuses DocumentIndex table units without inventing rows', () => {
  const units = buildSourceUnits([sourceWithPages('src-table', 1, '| Prueba | Hecho |\n| contrato | 1 |')]);
  expect(units.some((unit) => unit.kind === 'TABLE')).toBe(true);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/sourceUnits.test.ts`

Expected: FAIL because `SourceUnit` and `buildSourceUnits` do not exist.

- [x] **Step 3: Implement the adapter**

Call `buildDocumentIndex` once per source, map its existing elements into `SourceUnit`, and create a fallback page unit only when the source has text but no indexed elements. Use `createSourceProvenance` for every unit. Preserve source IDs when adding optional reference text by marking it with `sourceType: 'REFERENCE_DOCUMENT'`.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/sourceUnits.test.ts` and `npm run typecheck`

Expected: PASS and no modifications to `documentIndex.ts`.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 2 checkpoint recorded' }`

**Done when:** all extraction layers consume stable, ordered units backed by the existing document index, including available table units.

**Regression risks:** losing source identity when indexing multiple documents or duplicating reference text into real source pages.

**Dependencies:** Task 1.

### Task 3: Segment headings, lists, tables and prudent paragraph candidates

**Files:**
- Create: `lib/legal-engine/case-extraction/candidateSegmentation.ts`
- Test: `tests/legal-engine/case-extraction/candidateSegmentation.test.ts`

**Interfaces:**
- Consumes: `SourceUnit`, `ExtractionCandidate`, `SourceProvenance`.
- Produces: `SegmentationResult` and `segmentCandidates(units): SegmentationResult`.

```ts
export interface SegmentationResult {
  candidates: ExtractionCandidate[];
  stats: SegmentationStats;
}
```

Implement small, named segmentation rules rather than one giant regex:

- heading windows for `HECHOS`, `PRESTACIONES`, `PRUEBAS`, `DOCUMENTALES`, `ANEXOS`, `ARGUMENTOS`, `FUNDAMENTOS`, `DERECHO`, `PETITORIOS` and related headings;
- numbered, Roman, lettered and bullet items;
- table cells/rows supplied by `SourceUnit.tableRows`;
- comma or semicolon lists only when a heading establishes a list context;
- paragraph candidates retained as one unit when no safe boundary exists.

Every candidate receives a unique ID, original raw text, all contributing provenance and a preliminary `REQUIRES_REVIEW` decision until classification.

- [x] **Step 1: Write the failing segmentation tests**

```ts
it('segments numbered and bullet evidence without losing the heading context', () => {
  const { candidates } = segmentCandidates(units('PRUEBAS:\n1. contrato\n- recibos\n- requerimiento'));
  expect(candidates.map((candidate) => candidate.rawText)).toEqual(['contrato', 'recibos', 'requerimiento']);
  expect(candidates.every((candidate) => candidate.provenance[0].section === 'PRUEBAS')).toBe(true);
});

it('does not split every sentence in a continuous paragraph', () => {
  const { candidates } = segmentCandidates(units('La actora celebró contrato y posteriormente realizó un pago en la misma relación fáctica.'));
  expect(candidates).toHaveLength(1);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/candidateSegmentation.test.ts`

Expected: FAIL because no segmentation module exists.

- [x] **Step 3: Implement named segmentation rules**

Create heading-window, list-item, table-row and inline-list helpers. Keep the original paragraph reference on every split candidate and set a review decision when a delimiter is ambiguous. Do not normalize names, dates or amounts in this task.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/candidateSegmentation.test.ts` and `npm run typecheck`

Expected: PASS, including the subsegmentation and oversegmentation guards.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 3 checkpoint recorded' }`

**Done when:** candidates preserve raw context and provenance while separating only deterministic list/table/heading boundaries.

**Regression risks:** splitting legal prose at commas or periods that do not represent separate legal items.

**Dependencies:** Tasks 1–2.

### Task 4: Classify candidates deterministically and preserve attribution

**Files:**
- Create: `lib/legal-engine/case-extraction/classification.ts`
- Test: `tests/legal-engine/case-extraction/classification.test.ts`

**Interfaces:**
- Consumes: `ExtractionCandidate`, `SourceUnit`, heading context and deterministic label rules.
- Produces: `classifyCandidates(candidates): ExtractionCandidate[]`, `CandidateClassification` and speaker-role helpers.

Classification must identify `PARTY`, `ASSERTION`, `CLAIM`, `FACT`, `DOCUMENT`, `EVIDENCE`, `DATE`, `AMOUNT`, `ARGUMENT` and `AUTHORITY`. It must attach roles only when an explicit label or source speaker is present. A sentence containing “la actora afirma que…” becomes `SOURCE_ASSERTION` with `actorRole: PARTE_ACTORA`; it does not become `ESTABLISHED_FACT`.

- [x] **Step 1: Write the failing classification tests**

```ts
it('attributes an allegation to the speaking party', () => {
  const [candidate] = classifyCandidates(candidates('La actora afirma que el demandado incumplió.'));
  expect(candidate.classification).toBe('SOURCE_ASSERTION');
  expect(candidate.speakerRole).toBe('PARTE_ACTORA');
});

it('classifies explicit headings without treating them as legal conclusions', () => {
  const result = classifyCandidates(candidates('PRUEBAS: contrato, recibos'));
  expect(result.every((candidate) => candidate.kind === 'EVIDENCE' || candidate.kind === 'DOCUMENT')).toBe(true);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/classification.test.ts`

Expected: FAIL because classification helpers do not exist.

- [x] **Step 3: Implement deterministic classification**

Use heading context, explicit labels and bounded lexical rules. Store a classification reason and confidence on each candidate. Never assign `ESTABLISHED_FACT`, `CLIENT_CONFIRMED`, `PARTY_OFFERED` or `LEGALLY_VERIFIED` from lexical similarity alone.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/classification.test.ts` and `npm run typecheck`

Expected: PASS with attribution preserved.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 4 checkpoint recorded' }`

**Done when:** candidate types and speaker roles are deterministic, attributed and conservative.

**Regression risks:** classifying source wording as client posture or interpreting a legal heading as a verified conclusion.

**Dependencies:** Tasks 1–3.

### Task 5: Normalize dates and amounts without inventing precision

**Files:**
- Create: `lib/legal-engine/case-extraction/normalization.ts`
- Test: `tests/legal-engine/case-extraction/normalization.test.ts`

**Interfaces:**
- Consumes: date/amount candidates and `SourceProvenance`.
- Produces: `NormalizedDate`, `NormalizedAmount`, `normalizeDateCandidate`, `normalizeAmountCandidate`.

Implement separate parsers for day/month/year precision and monetary/percentage/unit values. Preserve `rawValue` and provenance. Normalize only unambiguous values; leave `normalizedValue` absent when currency, day or unit cannot be established. Do not resolve contradictions in this task.

- [x] **Step 1: Write the failing normalization tests**

```ts
it('normalizes a complete date while preserving raw text', () => {
  const date = normalizeDateCandidate(candidate('3 de enero de 2026'));
  expect(date).toMatchObject({ rawValue: '3 de enero de 2026', normalizedValue: '2026-01-03', precision: 'DAY' });
});

it('keeps a partial month date without inventing a day', () => {
  const date = normalizeDateCandidate(candidate('enero de 2026'));
  expect(date).toMatchObject({ precision: 'MONTH', normalizedValue: '2026-01' });
  expect(date.normalizedValue).not.toContain('-01');
});

it('normalizes an unambiguous peso amount and preserves the raw value', () => {
  expect(normalizeAmountCandidate(candidate('$20,000.00 (veinte mil pesos 00/100 M.N.)'))).toMatchObject({ normalizedValue: 20000, currency: 'MXN' });
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/normalization.test.ts`

Expected: FAIL because normalized date/amount types and functions do not exist.

- [x] **Step 3: Implement safe normalizers**

Add Spanish month mapping, ISO output by precision, monetary parsing with explicit currency recognition and percentage/unit handling. Preserve raw strings and return `undefined` normalized values when ambiguity remains.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/normalization.test.ts` and `npm run typecheck`

Expected: PASS; no normalization assigns missing precision.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 5 checkpoint recorded' }`

**Done when:** complete dates and safe amounts normalize, partial values remain partial, and raw/provenance are retained.

**Regression risks:** locale parsing errors, silent currency assumptions or converting a year-only value into a day-level date.

**Dependencies:** Tasks 1 and 4.

### Task 6: Extract parties, roles and prudent aliases

**Files:**
- Create: `lib/legal-engine/case-extraction/parties.ts`
- Test: `tests/legal-engine/case-extraction/parties.test.ts`

**Interfaces:**
- Consumes: classified party candidates, `SourceProvenance`, normalization helpers.
- Produces: `CaseParty`, `extractParties(candidates)`, `resolveExplicitAlias`, `PartyExtractionResult`.

Extract actor, demandado, promovente, quejoso, tercero, autoridad, representante, autorizado and apoderado. An identity gets `confirmed: true` only from explicit client/lawyer or human-review confirmation metadata. Explicit source labels set role and confidence but do not confirm identity. Similar names produce a review candidate or conflict, never an automatic merge.

- [x] **Step 1: Write the failing party tests**

```ts
it('extracts actor and defendant with separate roles and provenance', () => {
  const result = extractParties(classified('ACTOR: Ana López\nDEMANDADO: Luis Pérez'));
  expect(result.parties.map((party) => party.role)).toEqual(['ACTOR', 'DEMANDADO']);
  expect(result.parties.every((party) => party.provenance.length > 0 && party.confirmed === false)).toBe(true);
});

it('does not merge similar names without explicit confirmation', () => {
  const result = extractParties(classified('ACTOR: Ana López\nREPRESENTANTE: Ana L.'));
  expect(result.parties).toHaveLength(2);
  expect(result.reviewReasons).toContain('POSSIBLE_IDENTITY_ALIAS_REQUIRES_REVIEW');
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/parties.test.ts`

Expected: FAIL because structured party extraction does not exist.

- [x] **Step 3: Implement party extraction**

Use explicit labels from the candidate classifier, normalize surrounding punctuation, retain all aliases only when explicitly declared, and produce review reasons for similar-but-unconfirmed identities.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/parties.test.ts` and `npm run typecheck`

Expected: PASS with no automatic identity fusion.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 6 checkpoint recorded' }`

**Done when:** party identities retain roles, aliases and provenance without making unconfirmed identities authoritative.

**Regression risks:** treating an authority or representative as a party, or reusing legacy `parties` strings as canonical input.

**Dependencies:** Tasks 1, 4 and 5.

### Task 7: Extract individual claims

**Files:**
- Create: `lib/legal-engine/case-extraction/claims.ts`
- Test: `tests/legal-engine/case-extraction/claims.test.ts`

**Interfaces:**
- Consumes: claim candidates, parties, facts/evidence candidate IDs and normalized amounts.
- Produces: `ClaimItem`, `extractClaims(candidates: ExtractionCandidate[], context: ClaimExtractionContext): { claims: ClaimItem[]; reviewReasons: string[] }`.

Create one `ClaimItem` per legally distinguishable requested relief. Split conjunctions only in an explicit claims context and only when each side contains an independent relief. Preserve claimant attribution when explicitly present, link available factual/evidence IDs and leave status as `SOURCE_MENTIONED` or `SOURCE_ASSERTED`; never determine legal merit.

- [x] **Step 1: Write the failing claim tests**

```ts
it('separates two independent reliefs and keeps one source provenance', () => {
  const result = extractClaims(classified('PRESTACIONES: cumplimiento del contrato y pago de daños y perjuicios'), context());
  expect(result.claims.map((claim) => claim.requestedRelief)).toEqual(['cumplimiento del contrato', 'pago de daños y perjuicios']);
  expect(result.claims.every((claim) => claim.provenance.length === 1)).toBe(true);
});

it('keeps one claim when the phrase is one inseparable relief', () => {
  expect(extractClaims(classified('PRESTACIONES: declaración de nulidad y sus efectos inherentes'), context()).claims).toHaveLength(1);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/claims.test.ts`

Expected: FAIL because `ClaimItem` extraction does not exist.

- [x] **Step 3: Implement claim extraction**

Use heading-aware candidates, relief conjunction rules and explicit claimant labels. Leave `amount`, factual links and evidence links empty when not present. Record a review decision for ambiguous conjunctions.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/claims.test.ts` and `npm run typecheck`

Expected: PASS with no legal-procedural conclusion.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 7 checkpoint recorded' }`

**Done when:** distinguishable claims are individual, attributed, linked when explicit and legally unvalidated.

**Regression risks:** over-splitting compound reliefs or assigning claimant/client posture from document context.

**Dependencies:** Tasks 1, 3–6.

### Task 8: Preserve assertions and segment atomic facts prudently

**Files:**
- Create: `lib/legal-engine/case-extraction/facts.ts`
- Test: `tests/legal-engine/case-extraction/facts.test.ts`

**Interfaces:**
- Consumes: assertion/fact candidates, normalized dates/amounts, party IDs and source units.
- Produces: `SourceAssertion`, `FactItem`, `extractAssertions`, `extractAtomicFacts`.

An assertion records actor, proposition, source status and provenance. A fact may be `SOURCE_ASSERTION`, `ESTABLISHED_FACT` only when explicitly established by a resolution/admission, or `UNKNOWN`. Atomic segmentation may split a paragraph only when independent events have clear temporal/event boundaries; otherwise it returns one fact with the original paragraph provenance.

- [x] **Step 1: Write the failing fact tests**

```ts
it('keeps the speaker and alleged status', () => {
  const result = extractAssertions(classified('La actora afirma que el demandado incumplió'));
  expect(result[0]).toMatchObject({ actorRole: 'PARTE_ACTORA', status: 'ALLEGED', proposition: 'el demandado incumplió' });
});

it('splits two dated events but does not split every sentence', () => {
  const facts = extractAtomicFacts(classified('El 3 de enero celebramos contrato y el 10 de enero entregué $20,000.'));
  expect(facts).toHaveLength(2);
  expect(extractAtomicFacts(classified('La actora compareció y explicó su postura en la misma actuación.'))).toHaveLength(1);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/facts.test.ts`

Expected: FAIL because assertions and atomic facts do not exist.

- [x] **Step 3: Implement assertion and fact extraction**

Build assertions from explicit speaker verbs and labels. Use date/event boundaries and deterministic connectors for atomic split candidates. Preserve original paragraph and source references on every child fact; assign `REQUIRES_REVIEW` when confidence is insufficient.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/facts.test.ts` and `npm run typecheck`

Expected: PASS with allegation-vs-fact semantics intact.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 8 checkpoint recorded' }`

**Done when:** source allegations remain attributed and fact atomization is conservative, traceable and reversible to the original paragraph.

**Regression risks:** converting a pleading allegation into an established fact or creating artificial facts from ordinary prose.

**Dependencies:** Tasks 1, 3–7.

### Task 9: Separate documents, evidence mentions and offers

**Files:**
- Create: `lib/legal-engine/case-extraction/evidence.ts`
- Test: `tests/legal-engine/case-extraction/evidence.test.ts`

**Interfaces:**
- Consumes: evidence/document candidates, facts, claims, table rows and source provenance.
- Produces: `DocumentItem`, `EvidenceMention`, `EvidenceOffer`, `extractDocumentsAndEvidence(candidates: ExtractionCandidate[], context: EvidenceExtractionContext)`.

Support headings, numbered/lettered/bullet lists, comma/semicolon lists under evidence headings and table rows already supplied by `DocumentIndex`. Preserve explicit `relatedFactIds`, `relatedClaimIds` and `statedPurpose`. `SOURCE_MENTIONED` remains unconfirmed; no legacy or rich field may imply `CLIENT_CONFIRMED` or `EvidenceOffer` without explicit confirmation.

- [x] **Step 1: Write the failing evidence tests**

```ts
it('extracts comma-separated evidence without confirming it', () => {
  const result = extractDocumentsAndEvidence(classified('PRUEBAS: contrato, comprobantes de pago y requerimiento'), context());
  expect(result.evidenceMentions).toHaveLength(3);
  expect(result.evidenceMentions.every((item) => item.status === 'SOURCE_MENTIONED')).toBe(true);
  expect(result.evidenceOffers).toHaveLength(0);
});

it('keeps an explicit fact relation and stated purpose', () => {
  const item = extractDocumentsAndEvidence(classified('1. DOCUMENTAL PRIVADA: pagaré para acreditar el pago relacionado con el hecho 1'), context()).evidenceMentions[0];
  expect(item.relatedFactIds).toContain('fact-1');
  expect(item.statedPurpose).toMatch(/acreditar el pago/i);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/evidence.test.ts`

Expected: FAIL because the rich document/evidence model does not exist.

- [x] **Step 3: Implement layered evidence extraction**

Classify document title/type separately from evidence status, deduplicate list delimiters, attach explicit relationships, and create `EvidenceOffer` only from explicit source/client confirmation metadata. Keep `confirmed` out of the rich model unless it represents an explicit confirmation event.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/evidence.test.ts` and `npm run typecheck`

Expected: PASS for headings, commas, lists, bullets and available table units.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 9 checkpoint recorded' }`

**Done when:** document existence, evidence mention, evidence offer and client confirmation are distinct and provenance-preserving.

**Regression risks:** setting legacy `confirmed: true`, inventing evidence when no evidence heading exists, or losing stated purpose during list parsing.

**Dependencies:** Tasks 1–8.

### Task 10: Extract source arguments and authority mentions

**Files:**
- Create: `lib/legal-engine/case-extraction/arguments.ts`
- Test: `tests/legal-engine/case-extraction/argumentsAndAuthorities.test.ts`

**Interfaces:**
- Consumes: classified argument/authority candidates, facts, claims and provenance.
- Produces: `ArgumentItem`, `SourceAuthorityMention`, `extractArguments(candidates: ExtractionCandidate[], context: ArgumentExtractionContext)`, `extractAuthorityMentions(candidates: ExtractionCandidate[]): SourceAuthorityMention[]`.

Separate an argument proposition from a factual assertion. Extract articles, codes, laws, thesis and jurisprudence cited in the source with `verificationStatus: 'SOURCE_CITED'`. Do not verify or enrich citations online. Link supporting facts and cited authorities only when the source explicitly links them.

- [x] **Step 1: Write the failing argument/authority tests**

```ts
it('keeps an argument separate from a fact', () => {
  const result = extractArguments(classified('La acción es improcedente porque la contraparte no acreditó su pretensión.'), context());
  expect(result.arguments[0].proposition).toMatch(/improcedente/i);
  expect(result.facts).toHaveLength(0);
});

it('records a cited article without legal verification', () => {
  const [authority] = extractAuthorityMentions(classified('Con fundamento en el artículo 14 constitucional y la tesis 123/2024'));
  expect(authority.verificationStatus).toBe('SOURCE_CITED');
  expect(authority.provenance.length).toBeGreaterThan(0);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/argumentsAndAuthorities.test.ts`

Expected: FAIL because source argument and authority extraction does not exist.

- [x] **Step 3: Implement source-only extraction**

Use explicit argument markers and authority patterns already available in the indexed source text. Set `SOURCE_CITED` for every authority, never `LEGALLY_VERIFIED`, and leave unsupported relationships empty.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/argumentsAndAuthorities.test.ts` and `npm run typecheck`

Expected: PASS without online calls or generated legal reasoning.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 10 checkpoint recorded' }`

**Done when:** source arguments and cited authorities are represented independently and remain unverified.

**Regression risks:** turning an extracted citation into a legal conclusion or treating an argument as an established fact.

**Dependencies:** Tasks 1, 3–8.

### Task 11: Deduplicate rich entities while preserving every provenance

**Files:**
- Create: `lib/legal-engine/case-extraction/deduplication.ts`
- Test: `tests/legal-engine/case-extraction/deduplication.test.ts`

**Interfaces:**
- Consumes: rich parties, claims, facts, documents, evidence, arguments and authorities.
- Produces: `deduplicateRichItems(items): { items, mergedCount, mergeReasons }` and entity-specific canonical-key functions.

Use normalized keys only for safe semantic duplicates. Merge arrays of provenance with stable de-duplication by source/page/excerpt hash. Do not merge names with only fuzzy similarity; preserve separate items and emit a review reason.

- [x] **Step 1: Write the failing deduplication tests**

```ts
it('merges the same document mention while preserving both sources', () => {
  const result = deduplicateRichItems([
    documentItem('contrato', provenance('src-a')),
    documentItem('contrato', provenance('src-b')),
  ]);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].provenance.map((p) => p.sourceId).sort()).toEqual(['src-a', 'src-b']);
});

it('does not fuzzy-merge similar person names', () => {
  const result = deduplicateRichItems([partyItem('Ana López'), partyItem('Ana L. López')]);
  expect(result.items).toHaveLength(2);
  expect(result.mergeReasons).toContain('IDENTITY_SIMILARITY_REQUIRES_REVIEW');
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/deduplication.test.ts`

Expected: FAIL because no provenance-preserving deduplicator exists.

- [x] **Step 3: Implement conservative merges**

Define category-specific canonical keys, merge only exact normalized matches, union provenance and relationship IDs, and return counts/reasons for trace reporting. Never discard a candidate’s original source reference.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/deduplication.test.ts` and `npm run typecheck`

Expected: PASS with both source references retained.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 11 checkpoint recorded' }`

**Done when:** semantic duplicates are reduced and no provenance evidence is lost.

**Regression risks:** over-merging people or contradictory values, or deduplicating relationship arrays destructively.

**Dependencies:** Tasks 1 and 6–10.

### Task 12: Detect unresolved conflicts

**Files:**
- Create: `lib/legal-engine/case-extraction/conflicts.ts`
- Test: `tests/legal-engine/case-extraction/conflicts.test.ts`

**Interfaces:**
- Consumes: deduplicated rich items and provenance.
- Produces: `CaseConflict`, `detectCaseConflicts(analysis): CaseConflict[]`.

Detect incompatible dates for the same event, amounts for the same obligation, names/roles for possible same identities and opposing assertions across sources. A conflict stores `conflictId`, type, item IDs, source IDs, description and `requiresReview: true`; it never chooses a winner or rewrites either item.

- [x] **Step 1: Write the failing conflict tests**

```ts
it('keeps contradictory amounts open for review', () => {
  const conflicts = detectCaseConflicts(analysisWithAmounts('$20,000', '$25,000'));
  expect(conflicts[0]).toMatchObject({ type: 'AMOUNT', requiresReview: true });
  expect(conflicts[0].sourceIds.sort()).toEqual(['src-a', 'src-b']);
});

it('detects opposing assertions without selecting the true one', () => {
  const conflicts = detectCaseConflicts(analysisWithAssertions('hubo pago', 'no hubo pago'));
  expect(conflicts.some((conflict) => conflict.type === 'OPPOSING_ASSERTION')).toBe(true);
  expect(analysisWithAssertions('hubo pago', 'no hubo pago').facts.every((fact) => fact.assertionStatus !== 'ESTABLISHED_FACT')).toBe(true);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/conflicts.test.ts`

Expected: FAIL because conflict detection does not exist.

- [x] **Step 3: Implement open conflict detection**

Compare canonical event/obligation keys, preserve both item values and provenance, create stable conflict IDs and add a reason for review. Do not mutate either source item to resolve the conflict.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/conflicts.test.ts` and `npm run typecheck`

Expected: PASS with unresolved conflicts visible.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 12 checkpoint recorded' }`

**Done when:** contradictions are detected, attributed and left unresolved.

**Regression risks:** treating formatting differences as legal conflicts or silently selecting one source value.

**Dependencies:** Tasks 1, 5, 6, 8 and 11.

### Task 13: Structure missing data and client position

**Files:**
- Create: `lib/legal-engine/case-extraction/missingData.ts`
- Test: `tests/legal-engine/case-extraction/missingDataAndPosition.test.ts`

**Interfaces:**
- Consumes: rich parties, assertions, claims, facts, evidence and source IDs.
- Produces: `MissingDataItem`, `SourcePosition`, `ClientPosition`, `buildMissingData`, `deriveClientPosition`.

Every missing item must contain `field`, `reason`, `importance`, `sectionAffected`, `blocking`, `sourceSearched[]` and `requiresClientInput`. If only the opposing pleading is present, set `clientPosition.status = 'UNKNOWN'` and require client input for material posture fields. Do not block analysis of the available source.

- [x] **Step 1: Write the failing missing-data tests**

```ts
it('reports missing defendant position structurally', () => {
  const result = buildMissingData(analysisWithOnlyPlaintiffSource());
  expect(result.items).toContainEqual(expect.objectContaining({ field: 'clientPosition', blocking: true, requiresClientInput: true }));
});

it('does not invent a client posture from the plaintiff pleading', () => {
  const position = deriveClientPosition(analysisWithOnlyPlaintiffSource());
  expect(position).toMatchObject({ status: 'UNKNOWN', source: 'SOURCE_POSITION' });
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/missingDataAndPosition.test.ts`

Expected: FAIL because structured missing data and position models do not exist.

- [x] **Step 3: Implement structured missing data**

Inspect only the rich analysis/source IDs, create explicit field records and preserve source/client separation. Generate legacy strings later in Task 14; do not modify generation or theory-of-case logic here.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/missingDataAndPosition.test.ts` and `npm run typecheck`

Expected: PASS with client position unknown when absent.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 13 checkpoint recorded' }`

**Done when:** missing fields and client posture are explicit, actionable and source-grounded.

**Regression risks:** treating missing client input as a source fact or turning a non-blocking missing field into a generation failure.

**Dependencies:** Tasks 1 and 6–10.

### Task 14: Implement the one-way conservative legacy projection

**Files:**
- Create: `lib/legal-engine/case-extraction/legacyProjection.ts`
- Test: `tests/legal-engine/case-extraction/legacyProjection.test.ts`

**Interfaces:**
- Consumes: `RichCaseAnalysis` and existing `CaseAnalysis` legacy field types.
- Produces: `projectRichCaseAnalysis(rich, base): LegacyProjectionResult`.

Define the local result type in `legacyProjection.ts` so the extraction type module never imports `CaseAnalysis` at runtime:

```ts
export interface LegacyProjectionResult {
  caseAnalysis: Partial<CaseAnalysis>;
  losses: string[];
}
```

The result contains only safe legacy fields plus a `losses[]` list. Rules:

- `claims[]` contains requested relief text only;
- `claimResponses[]` keeps source provenance and pending lawyer posture;
- `facts[]` keeps source text/provenance and `REQUIRE_LAWYER_INPUT` posture;
- `evidence[]` projects mentions with `confirmed: false` or omitted, never `true` from mere mention;
- `missingData[]` contains readable strings while rich records remain canonical;
- `arguments[]` contains extracted source propositions only;
- cited authorities project conservatively without a verified flag;
- ambiguous parties remain absent from a scalar legacy slot and are reported in `losses[]`.

- [x] **Step 1: Write the failing projection tests**

```ts
it('does not strengthen a source evidence mention', () => {
  const projection = projectRichCaseAnalysis(richWithMentionedEvidence(), emptyLegacyCaseAnalysis());
  expect(projection.caseAnalysis.evidence[0].confirmed).not.toBe(true);
  expect(projection.losses).toContain('EvidenceMention status cannot be represented as CLIENT_CONFIRMED in legacy evidence');
});

it('does not convert a source assertion into a client-established fact', () => {
  const projection = projectRichCaseAnalysis(richWithAllegedFact(), emptyLegacyCaseAnalysis());
  expect(projection.caseAnalysis.facts[0].position).toBe('REQUIRE_LAWYER_INPUT');
  expect(projection.caseAnalysis.facts[0].contestedStatus).toBe('UNKNOWN');
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/legacyProjection.test.ts`

Expected: FAIL because no rich-to-legacy projection exists.

- [x] **Step 3: Implement the conservative projection**

Create explicit mapping functions for each legacy field. The mapper may omit unrepresentable fields, set the weakest allowed legacy state and append a human-readable loss reason. It must never read a legacy field to fill the rich model.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/legacyProjection.test.ts` and `npm run typecheck`

Expected: PASS; rich values remain unchanged after projection.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 14 checkpoint recorded' }`

**Done when:** legacy consumers receive safe compatibility fields and every semantic loss is explicit.

**Regression risks:** setting `confirmed`, lawyer positions or verified citations because legacy fields are narrower.

**Dependencies:** Tasks 1 and 6–13.

### Task 15: Integrate the layered extractor into `reconstructCaseAnalysis`

**Files:**
- Create: `lib/legal-engine/case-extraction/orchestrator.ts`
- Modify: `lib/legal-engine/caseAnalysis.ts:581-835`
- Test: `tests/legal-engine/case-extraction/caseAnalysisIntegration.test.ts`

**Interfaces:**
- Consumes: `buildSourceUnits`, segmentation/classification/normalization modules, entity extractors, deduplication, conflict and missing-data builders, legacy projection.
- Produces: `RichExtractionOptions`, `extractRichCaseAnalysis(sources, options): RichCaseAnalysis`; `reconstructCaseAnalysis` returns existing fields plus `richCaseAnalysis`.

```ts
export interface RichExtractionOptions {
  referenceText?: string;
  includeReferenceInAnalysis?: boolean;
  trace?: GenerationTraceContext;
}
```

The orchestrator must run the approved order and return stats. `reconstructCaseAnalysis` must preserve its existing signature and procedural timeline/acts/rulings/issue logic. Replace only the fact/claim/evidence/argument/citation extraction inputs with the conservative projection; do not rewrite `extractDynamicLegalIssues`, `caseTheory`, `DocumentPlan` or generation behavior.

- [x] **Step 1: Write the failing integration tests**

```ts
it('returns a non-empty rich analysis and safe legacy projection', () => {
  const analysis = reconstructCaseAnalysis([sourceWithClaimsFactsAndEvidence()], 'Analizar expediente', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.claims.length).toBeGreaterThanOrEqual(2);
  expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBeGreaterThan(0);
  expect(analysis.claimResponses?.length).toBe(analysis.richCaseAnalysis?.claims.length);
});

it('keeps existing procedural fields and does not add legal posture', () => {
  const analysis = reconstructCaseAnalysis([sourceWithOnlyAllegations()], 'Analizar expediente', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.clientPosition.status).toBe('UNKNOWN');
  expect(analysis.facts.every((fact) => fact.position === 'REQUIRE_LAWYER_INPUT')).toBe(true);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/caseAnalysisIntegration.test.ts`

Expected: FAIL because `richCaseAnalysis` is not populated by `reconstructCaseAnalysis`.

- [x] **Step 3: Implement the orchestrator and integration**

Create `extractRichCaseAnalysis`, pass `referenceText` only according to the existing `includeReferenceInAnalysis` option, attach the rich result, apply `projectRichCaseAnalysis`, and keep existing procedural extraction calls intact. Do not call NVIDIA or any network service.

- [x] **Step 4: Run focused integration and related tests plus typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/caseAnalysisIntegration.test.ts tests/legal-engine/caseWorkflow.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/flujoAQuality.test.ts` and `npm run typecheck`

Expected: new tests pass and existing source/coverage/generation consumers remain green.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 15 checkpoint recorded' }`

**Done when:** the public reconstruction path produces rich canonical analysis and safe legacy fields without changing legal-generation logic.

**Regression risks:** altered claim/fact counts affecting CoverageMatrix, accidental use of legacy values as rich input, or changing the existing issue/theory outputs.

**Dependencies:** Tasks 1–14.

### Task 16: Integrate extraction decisions with `GenerationTrace`

**Files:**
- Modify: `lib/legal-engine/generationTrace.ts:1-260`
- Modify: `lib/legal-engine/caseAnalysis.ts:581-835`
- Test: `tests/legal-engine/case-extraction/generationTraceExtraction.test.ts`

**Interfaces:**
- Consumes: `GenerationTraceContext`, `RichCaseAnalysis`, candidates, decisions, conflicts and projection losses.
- Produces: `ExtractionTrace`, `GenerationTraceContext.recordExtraction(entry)` and optional `trace?: GenerationTraceContext` inside the existing reconstruction options.

Add an additive trace record:

```ts
export interface ExtractionTrace {
  sourceUnitCount: number;
  candidateCounts: Record<string, number>;
  decisions: Array<{ candidateId: string; kind: string; decision: string; reason?: string; provenance: SourceProvenance[] }>;
  entityCounts: Record<string, number>;
  conflictIds: string[];
  missingDataFields: string[];
  projectionLosses: string[];
}
```

`recordExtraction` stores IDs, counts, reasons, hashes and bounded provenance only. `reconstructCaseAnalysis` accepts `{ trace?: GenerationTraceContext }` as an additive option and records one extraction event when supplied. It must not change the FASE 0 generation ID or provider semantics.

- [x] **Step 1: Write the failing trace tests**

```ts
it('records candidate decisions and rich entity counts with one generation ID', () => {
  const trace = createGenerationTraceContext({ generationId: 'gen-extraction-1', doc: emptyDoc(), options: { enabled: true } });
  reconstructCaseAnalysis([sourceWithClaimsFactsAndEvidence()], 'Analizar expediente', '', { includeReferenceInAnalysis: false, trace });
  const closed = trace.close();
  expect(closed.generationId).toBe('gen-extraction-1');
  expect(closed.extraction?.sourceUnitCount).toBeGreaterThan(0);
  expect(closed.extraction?.candidateCounts.CLAIM).toBeGreaterThan(0);
});

it('does not place raw secrets in extraction trace decisions', () => {
  const trace = traceForSource('NVIDIA_API_KEY=nvapi-secret');
  reconstructCaseAnalysis([trace.source], 'Analizar expediente', '', { trace: trace.context });
  expect(JSON.stringify(trace.context.close())).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/generationTraceExtraction.test.ts`

Expected: FAIL because the trace has no extraction record or reconstruction option.

- [x] **Step 3: Implement additive trace recording**

Add the interface and context method, sanitize decisions before storage, call `recordExtraction` from the orchestrator integration and retain partial extraction stats when an extractor returns a review/conflict result. Do not persist traces in the database.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/generationTraceExtraction.test.ts tests/legal-engine/generationTraceContext.test.ts` and `npm run typecheck`

Expected: PASS with existing FASE 0 trace tests unchanged.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 16 checkpoint recorded' }`

**Done when:** a trace reconstructs `SourceUnit → candidate → classification → rich item → dedup/conflict decision → CaseAnalysis` using safe IDs and counts.

**Regression risks:** raw source leakage, duplicate extraction records or altering trace lifecycle for generation callers.

**Dependencies:** Tasks 1 and 15; FASE 0 trace implementation.

### Task 17: Add Fixtures A–C and their focused extraction tests

**Files:**
- Create: `tests/fixtures/caseAnalysisExtractionFixtures.ts`
- Create: `tests/legal-engine/case-extraction/fixturesAtoC.test.ts`

**Interfaces:**
- Consumes: existing `createSourceDocument` and rich reconstruction API.
- Produces: `fixtureA_cleanText()`, `fixtureB_continuousText()`, `fixtureC_commaEvidence()`.

Fixtures must contain synthetic parties, pages and text only. Fixture A includes conventional headings and numbered facts. Fixture B uses continuous prose with an attributed allegation and two clearly dated events. Fixture C includes `PRUEBAS: contrato, recibos, requerimiento` and at least one explicit fact relation.

- [x] **Step 1: Write the failing fixture tests**

```ts
it('Fixture A extracts the conventional structure', () => {
  const analysis = reconstructCaseAnalysis([fixtureA_cleanText()], 'Analizar', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.parties.length).toBeGreaterThanOrEqual(2);
  expect(analysis.richCaseAnalysis?.claims.length).toBeGreaterThanOrEqual(2);
});

it('Fixture B keeps continuous prose conservative', () => {
  const analysis = reconstructCaseAnalysis([fixtureB_continuousText()], 'Analizar', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.assertions.some((item) => item.status === 'ALLEGED')).toBe(true);
  expect(analysis.richCaseAnalysis?.facts.length).toBeLessThanOrEqual(2);
});

it('Fixture C produces evidence mentions from comma-separated text', () => {
  const analysis = reconstructCaseAnalysis([fixtureC_commaEvidence()], 'Analizar', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBe(3);
  expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(0);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/fixturesAtoC.test.ts`

Expected: FAIL because fixtures and rich extraction are not available yet.

- [x] **Step 3: Implement the synthetic fixtures**

Create the three source documents with stable IDs, explicit pages and no legal solution hardcoded. Reuse the fixture factory for test input; do not place fixture-specific branches in production extraction code.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/fixturesAtoC.test.ts` and `npm run typecheck`

Expected: PASS with no NVIDIA/network access.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 17 checkpoint recorded' }`

**Done when:** Fixtures A–C exercise clean, continuous and comma-separated source formats reproducibly.

**Regression risks:** encoding expected extraction in fixture-specific production rules or accidentally adding a legal conclusion.

**Dependencies:** Tasks 1–16.

### Task 18: Add Fixtures D–E for conflicts and incompleteness

**Files:**
- Modify: `tests/fixtures/caseAnalysisExtractionFixtures.ts`
- Create: `tests/legal-engine/case-extraction/fixturesDtoE.test.ts`

**Interfaces:**
- Consumes: the fixture factory and rich reconstruction API.
- Produces: `fixtureD_conflictingSources()`, `fixtureE_incompleteCase()`.

Fixture D contains two documents with different dates/amounts and incompatible role assertions. Fixture E omits client position, uses a month-only date and mentions a source document without offering it. Both fixtures remain fully synthetic.

- [x] **Step 1: Write the failing fixture tests**

```ts
it('Fixture D records conflicts without selecting a winning source', () => {
  const analysis = reconstructCaseAnalysis(fixtureD_conflictingSources(), 'Analizar', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.conflicts.length).toBeGreaterThanOrEqual(2);
  expect(analysis.richCaseAnalysis?.conflicts.every((conflict) => conflict.requiresReview)).toBe(true);
});

it('Fixture E keeps partial dates and unknown client position', () => {
  const analysis = reconstructCaseAnalysis([fixtureE_incompleteCase()], 'Analizar', '', { includeReferenceInAnalysis: false });
  expect(analysis.richCaseAnalysis?.clientPosition.status).toBe('UNKNOWN');
  expect(analysis.richCaseAnalysis?.dates.some((date) => date.precision === 'MONTH')).toBe(true);
  expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(0);
});
```

- [x] **Step 2: Run the focused tests to verify failure**

Run: `npm test -- --run tests/legal-engine/case-extraction/fixturesDtoE.test.ts`

Expected: FAIL because fixtures D/E and conflict/position integration are not complete.

- [x] **Step 3: Implement Fixtures D–E**

Add two source documents for D and one incomplete source for E. Keep contradictory raw values and source IDs intact. Do not add a production special case for either fixture.

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- --run tests/legal-engine/case-extraction/fixturesDtoE.test.ts` and `npm run typecheck`

Expected: PASS with open conflicts and no invented client posture.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 18 checkpoint recorded' }`

**Done when:** contradictory and incomplete source behavior is reproducible and conservatively represented.

**Regression risks:** selecting a conflict winner, filling missing day/position, or turning a mentioned document into an offered proof.

**Dependencies:** Tasks 1–16.

### Task 19: Complete the 30 contracts and regression consumers

**Files:**
- Create: `tests/legal-engine/caseAnalysisExtractionContracts.test.ts`
- Create: `tests/legal-engine/caseAnalysisExtractionRegression.test.ts`
- Modify only when a focused regression exposes a compatibility defect: `tests/legal-engine/caseWorkflow.test.ts`, `tests/legal-engine/phase3CoverageMatrix.test.ts`, `tests/legal-engine/flujoAQuality.test.ts`, `tests/acceptance/ocrAcceptance.test.ts`, `tests/e2e/flujoAClosure.test.ts`

**Interfaces:**
- Consumes: all rich extraction and projection APIs from Tasks 1–18.
- Produces: exactly 30 meaningful extraction assertions and regression evidence for current consumers.

The contract file must contain these numbered tests:

1. actor and demandado extraction;
2. role of the speaker asserting a fact;
3. allegation not established fact;
4. two claims from one phrase;
5. two atomic events from one paragraph when boundaries are clear;
6. `PRUEBAS: contrato, comprobantes y requerimiento`;
7. comma-separated evidence;
8. numbered evidence;
9. bullet evidence;
10. table evidence through `DocumentIndex`;
11. mentioned evidence not `CLIENT_CONFIRMED`;
12. opposing document not automatic `EvidenceOffer`;
13. complete date;
14. partial date without invented day;
15. normalized amount with raw value;
16. contradictory amounts;
17. cited article remains `SOURCE_CITED`;
18. cited thesis/jurisprudence remains a mention;
19. argument distinct from fact;
20. missing client position;
21. no invented posture;
22. provenance on every material rich item;
23. duplicate document retains both provenance references;
24. prudent aliases and identity review;
25. extraction registered in `GenerationTrace`;
26. no API key or secret in the trace;
27. complete synthetic fixture produces non-empty `CaseAnalysis`;
28. evidence array is non-empty when the source enumerates evidence;
29. at least two claims when two claims exist in the source;
30. absent data remains absent.

The regression file must prove that `caseWorkflow`, `CoverageMatrix`, OCR analysis and Flujo A consumers continue to operate with the projection, and that no existing test is weakened or deleted.

- [x] **Step 1: Write all missing contract assertions as failing tests**

Add one `it` per numbered contract with concrete synthetic inputs and exact semantic assertions. Run the focused files from Tasks 1–18 first so failures identify missing implementation rather than fixture setup.

- [x] **Step 2: Run the contract and regression files to verify failures**

Run: `npm test -- --run tests/legal-engine/caseAnalysisExtractionContracts.test.ts tests/legal-engine/caseAnalysisExtractionRegression.test.ts`

Expected: FAIL only for contracts not yet implemented; no unrelated baseline file is changed to make a test pass.

- [x] **Step 3: Implement only compatibility corrections exposed by these tests**

Make additive changes to projection or consumer adapters when a legacy consumer cannot accept the safe canonical source. Do not add legal behavior, bidirectional synchronization, a second parser or weaker semantic states.

- [x] **Step 4: Run contract, regression and related existing tests plus typecheck**

Run: `npm test -- --run tests/legal-engine/caseAnalysisExtractionContracts.test.ts tests/legal-engine/caseAnalysisExtractionRegression.test.ts tests/legal-engine/caseWorkflow.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/flujoAQuality.test.ts tests/acceptance/ocrAcceptance.test.ts tests/e2e/flujoAClosure.test.ts` and `npm run typecheck`

Expected: all 30 contracts and selected consumers pass; no new NVIDIA or network dependency appears.

- [x] **Step 5: Record the checkpoint**

Run: `if(Test-Path -LiteralPath '.git'){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 19 checkpoint recorded' }`

**Done when:** all 30 contracts are meaningful, regression consumers remain green and rich semantics remain canonical.

**Regression risks:** brittle tests tied to string formatting, accidental legal-content changes, or silently treating legacy projection as input truth.

**Dependencies:** Tasks 1–18.

### Task 20: Complete validation, warning attribution and handoff evidence

**Files:**
- Modify only if a focused test exposes a defect: files from Tasks 1–19.
- Inspect: generated test traces and fixture reports under `.tmp` when tests emit them.
- Create only as validation artifacts: `.tmp/phase1-lint.json`, `.tmp/phase1-warning-attribution.md`.

**Interfaces:**
- Consumes: completed rich extractor, projection, trace integration, fixtures, contracts and current baseline.
- Produces: final A–U evidence with metrics for Fixtures A–E, exact warning attribution and environmental build status.

- [x] **Step 1: Run all focused extraction tests**

Run: `npm test -- --run tests/legal-engine/case-extraction tests/legal-engine/caseAnalysisExtractionContracts.test.ts tests/legal-engine/caseAnalysisExtractionRegression.test.ts`

Expected: every new extraction test passes before the full suite is attempted.

- [x] **Step 2: Run related existing tests**

Run: `npm test -- --run tests/legal-engine/caseWorkflow.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/flujoAQuality.test.ts tests/acceptance/ocrAcceptance.test.ts tests/e2e/flujoAClosure.test.ts`

Expected: current consumers pass without generated legal behavior or source/projection semantic strengthening.

- [x] **Step 3: Run the complete suite with local provider disabled**

Run: `$env:NVIDIA_API_KEY=''; $env:NVIDIA_REAL_TEST='false'; npm test -- --run`

Expected: at least 1,906 passed and 2 skipped, plus the new tests; 0 failures. Any failure must return to a focused TDD cycle before proceeding.

- [x] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: exit code 0.

- [x] **Step 5: Capture lint in machine-readable form**

Run: `New-Item -ItemType Directory -Force '.tmp' | Out-Null; npm run lint -- --format json *> '.tmp/phase1-lint.json'`

Expected: exit code 0 with 0 errors. Parse the JSON into normalized tuples `(ruleId, filePath, line, column, message)` and count warnings.

- [x] **Step 6: Identify the two FASE 0 warnings exactly**

Use the accepted FASE 0 lint output/baseline and the FASE 0 changed-file list from `docs/superpowers/plans/2026-09-07-generation-trace-observability-plan.md`. Normalize both outputs into the tuple format from Step 5, diff them, and write `.tmp/phase1-warning-attribution.md` with exactly these fields for each additional warning: file, line, column, rule, message, FASE 0 change that introduced it, and whether a scope-safe correction exists.

Acceptance: the report identifies the two warning tuples that account for the increase from 973 to 975. Correct a warning only when the correction is local, behavior-neutral and covered by a focused test; otherwise retain it and document why. Do not fix historical warnings or reformat unrelated files. If the historical output is not available as a machine-readable file, reconstruct it from the recorded FASE 0 lint output before claiming attribution; do not label an unverified warning as introduced.

- [x] **Step 7: Run lint again after any safe warning correction**

Run: `npm run lint`

Expected: 0 errors; warning count and the two-warning attribution are updated in the evidence report. No broad lint cleanup is permitted.

- [x] **Step 8: Run the build without changing the environmental condition**

Run: `npm run build`

Expected: either a successful build or the known pre-Next Prisma `EPERM` rename of `query_engine-windows.dll.node` while Node/Next processes use it. Do not stop processes, change `.env`, initialize Git or classify the repeated environmental error as a code regression without causal evidence.

- [x] **Step 9: Inspect traces, fixture metrics and sanitization**

Run: `Get-ChildItem -LiteralPath '.tmp' -Filter '*case*analysis*' -ErrorAction SilentlyContinue; Get-ChildItem -LiteralPath '.tmp' -Filter '*trace*' -ErrorAction SilentlyContinue`

Parse emitted JSON/Markdown where present and verify: source IDs, candidate counts, accepted/merged/rejected/review counts, rich entity metrics, conflict IDs, missing fields, projection losses, provenance coverage and absence of `NVIDIA_API_KEY`, bearer tokens, cookies, passwords or private keys.

- [x] **Step 10: Write final A–U delivery evidence**

Record: A baseline; B prior extraction architecture; C new architecture; D files; E types; F parties; G claims; H facts; I documents/evidence; J dates/amounts; K arguments/authorities; L provenance; M conflicts; N missing data; O GenerationTrace integration; P tests; Q fixture A–E comparison; R tests/typecheck/lint/build; S exact warning attribution; T newly visible problems; U next phase recommendation. Include the known Prisma `EPERM` as environmental when it persists and distinguish unexecuted NVIDIA from deterministic extraction.

**Done when:** all focused and related tests pass, the full suite/typecheck/lint results are recorded, the build outcome is classified with evidence, the two warning additions are explicitly attributed, and the A–U handoff is complete.

**Regression risks:** claiming exact historical warning attribution without source output, treating build failure as code regression, leaking source text into artifacts or presenting a skipped NVIDIA path as executed.

**Dependencies:** Tasks 1–19.

## Plan Self-Review

### Spec coverage

- Rich types, provenance, source units, candidate segmentation, deterministic classification, normalization, parties, claims, facts, documents/evidence, arguments/authorities, deduplication, conflicts, missing data, client position, one-way projection, reconstruction integration and GenerationTrace are covered by Tasks 1–16.
- Fixtures A–E are covered by Tasks 17–18.
- All 30 mandatory contracts and current-consumer regressions are covered by Task 19.
- Full validation, baseline preservation, exact lint-warning attribution and environmental build handling are covered by Task 20.
- Explicit out-of-scope items are repeated in Global Constraints and are absent from implementation tasks.

### Placeholder scan

The plan contains no unresolved implementation markers. Every task has concrete files, interfaces, failing tests, implementation boundaries, commands, expected results, completion criteria, risks and dependencies. Conditional statements in Task 20 describe observable command outcomes and do not defer implementation details.

### Type consistency

- `SourceProvenance`, `ExtractionCandidate`, `RichCaseAnalysis` and `ExtractionStats` are defined in Task 1 before all consumers.
- `SourceUnit` is defined in Task 2 and consumed by segmentation in Task 3.
- `ClaimItem`, `FactItem`, `DocumentItem`, `EvidenceMention`, `EvidenceOffer`, `ArgumentItem`, `SourceAuthorityMention`, `CaseConflict` and `MissingDataItem` are defined before their extractors and projection.
- `projectRichCaseAnalysis` is defined in Task 14 before `reconstructCaseAnalysis` integration in Task 15.
- `recordExtraction` and `ExtractionTrace` are defined in Task 16 before contract 25 in Task 19.
- `reconstructCaseAnalysis` keeps its existing four parameters; the optional trace remains inside its existing options object.

### Scope and compatibility review

- No task creates legal content or verifies law online.
- No task modifies database schema, `.env`, Word formatting, renderer architecture or NVIDIA availability.
- Legacy fields are written only by `legacyProjection.ts`; rich extraction never reads them back.
- Evidence and identity confirmation rules are explicitly weaker under legacy projection.
- Deduplication and conflict tasks preserve all source references and leave unresolved values open.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-caseanalysis-extraction-provenance-plan.md`. Implementation has not started. The next action requires the user to choose the execution workflow supported by `writing-plans`:

1. **Subagent-Driven** — a fresh agent per task with review between tasks.
2. **Inline Execution** — execute tasks in this session with `executing-plans` checkpoints.

Because this checkout has no `.git`, implementation checkpoints must be validation records rather than commits.
