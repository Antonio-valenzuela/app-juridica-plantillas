# ANTECEDENTES visible materialization

## Scope

- Keep the accepted source extraction and `REFERENCE_ONLY` Coverage binding frozen.
- Do not implement Evidence, Research, or a new general audit in this checkpoint.
- Prove the first missing visible stage with the real pipeline before changing production.

## Checkpoints

- [x] Confirm `REFERENCE_ONLY` is trace/provenance-only and never closes substantive Coverage.
- [x] Run the real PDF consumer path and record the current boundary: preassembly has one rendered paragraph/block; assembly excludes it; final Antecedentes/editor content is empty.
- [x] Identify the first incorrect stage as `documentAssembly.admitBlock` rejecting the source-backed deterministic block because it is labeled `DETERMINISTIC_FALLBACK`.
- [x] RED: controlled `TEST-ANTECEDENTES-VISIBLE-XYZ` source reaches preassembly but not final assembly/editor.
- [x] Minimal repair: classify only this source-backed procedural reference materialization as an admitted deterministic/source-direct block; preserve pending `REFERENCE_ONLY` Coverage and section compatibility.
- [x] GREEN: controlled source reaches block, assembly, and editor; provider remains unused; safety assertions remain closed.
- [x] Re-run the same real PDF audit and final verification commands; report historical baseline separately from new regressions.

## Safety invariants

- No artificial `LegalIssue` for procedural reference Coverage.
- No client-position, research, or evidence fabrication.
- `REFERENCE_ONLY` remains unsatisfied/pending even when visible source-backed text is admitted.
- No NVIDIA call is introduced for this deterministic materialization path.
