# Evidence true-positive extraction repair

## Scope

- Repair only `SOURCE -> EvidenceMention/EvidenceOffer -> RichCaseAnalysis`.
- Keep ANTECEDENTES, Coverage builders, `generationTasks.ts`, NVIDIA, and
  `candidateSegmentation.ts` frozen unless a new failing test proves a causal
  regression in one of them.
- Preserve `EvidenceMention != EvidenceOffer`; a source-reported party offer
  is not client confirmation and admission/rejection/valuation are not offers.

## Checkpoints

- [x] Read handoff, napkin, contracts, consumers, and current evidence code.
- [x] Run a fresh real-PDF source-unit/candidate audit for pages 3, 5, 10-20.
- [x] RED: concrete evidence embedded in a source assertion is extracted;
  abstract/jurisprudential proof language is rejected; source-reported offer
  retains `PARTY_OFFERED` without `CLIENT_CONFIRMED`.
- [x] Minimal implementation at the evidence extraction boundary only.
- [x] GREEN focused evidence tests and adjacent extraction regressions.
- [x] Fresh real PDF measurement with per-candidate trace and downstream
  counts; do not target historical approximate counts.
- [x] Stop after downstream measurement; do not advance phase.

## Current diagnosis

The real PDF extracts successfully (27 pages, 57,137 characters, native,
`READY`, confidence 100). Its concrete evidence contexts remain in candidates,
including candidate `...:element:270:candidate:0` on page 20, but classification
leaves the mixed paragraph as `ASSERTION` and `evidence.ts` only admits kinds
`EVIDENCE`/`DOCUMENT`, explicit evidence sections, or an evidence label. Thus
the first material loss is the evidence-candidate predicate/extraction layer,
not source extraction or segmentation.

## Safety invariants

- No evidence entity from `prueba`, `probar`, `acreditar`, `carga de la prueba`,
  jurisprudence, or a generic admission/rejection sentence alone.
- Every emitted entity keeps bounded source provenance and an explicit source
  relation; no current-document offer is inferred from a mere mention.
- Repeated identical source descriptions follow existing canonical
  deduplication rather than multiplying entities.

## Verification receipt

- RED observed before the production change: the two concrete embedded-source
  cases returned zero mentions under the old predicate.
- Focused evidence suite after the review fixes: 13 tests passed.
- Adjacent extraction/Coverage/issue/evidence suite: 93 tests passed across 8
  files.
- Static checks after the review fixes: `typecheck` passed; `lint` passed with
  0 errors and 1,173 existing warnings.
- Full deterministic suite after the review fixes: 2,465 passed, 2 skipped,
  9 historical failures in 5 files; no new evidence-related failure.
- Fresh PDF: 27 pages, 57,137 characters, native extraction, `READY`,
  confidence 100; 18 deduplicated `EvidenceMention` and 7 `EvidenceOffer`,
  all offer/document links resolve and all provenance is bounded/complete.
- Natural downstream: `PRUEBAS` materialized 25 tasks (18 mention + 7 offer);
  18 mention attempts, 7 offer tasks blocked by the existing client-position
  guard, and `lost=0`. NVIDIA remained disabled for this deterministic run.
