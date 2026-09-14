# FASE 7 — Final Document Materialization Implementation Plan

> **For future execution:** This plan is design-only. It is not being executed in the current turn. Do not implement Task 1 or any other task until the user grants explicit final approval.

**Goal:** Build one verified, format-neutral materialization model from a prepared `UniversalLegalDocument`, then let DOCX and PDF renderers consume the same semantic nodes without substantive content transformation.

**Architecture:** Consume existing FASE 6 evidence (`DocumentAssemblyResult`, `DocumentAssemblyQualityGateResult` and `DocumentAssemblyTraceMetadata`) without recalculating or rerunning FASE 6. Require that evidence plus the existing export guard before rich materialization. Define an explicit `VerifiedCompatibilityInput` only for a separately approved non-rich contract; unknown/legacy non-rich input remains rejected. Add a shared-safe `ExportRenderModel` with no `format`, page geometry, `Buffer` or Node builtin. Adapt DOCX to render it; keep PDF as a compatibility/parity consumer with its current manual PDF 1.4 engine.

**Tech Stack:** TypeScript, existing Next.js Node runtime, `docx ^9.7.1`, existing `mammoth ^1.12.0`, current PDF 1.4 generator, Vitest and project scripts. No new dependency is planned.

**Spec:** `docs/superpowers/specs/2026-09-09-final-document-materialization-spec.md`

## Global constraints

- This plan is not being executed in this turn.
- Modify only the two design documents in this turn. Do not modify production, tests, dependencies or configuration.
- Do not implement Task 1 now.
- Do not modify or reopen FASE 5B or FASE 6. FASE 5B modifications planned: 0. FASE 6 semantic modifications planned: 0.
- Do not call `assembleLegalDraft`, `evaluateDocumentAssemblyChecks`, `decideDocumentAssemblyReadiness` or `runDocumentAssemblyQualityGate` from FASE 7. Consume their existing result/evidence only.
- Rich materialization requires `DocumentAssemblyReadiness.READY`, `DocumentAssemblyQualityGateResult.passed === true`, `canMarkAsReady === true`, intact assembly trace and export guard PASS. Lifecycle `READY_TO_EXPORT` alone is insufficient.
- Rich materialization must consume existing FASE 6 evidence only. It must not call FASE 6 validators again.
- `INCOMPLETE`, `BLOCKED`, `REQUIRES_REVIEW`, `INVALID`, missing evidence, broken trace, non-rich legacy input or failed export guard are fail-closed.
- `ExportRenderModel` is format-neutral. It must not contain `format`, page profile/geometry, `Buffer`, `Uint8Array`, filename or renderer options.
- `materializePreparedFinalDocument` must not receive `format` or page geometry. `format` and resolved page profile belong to `DocxRenderOptions`, `PdfRenderOptions`, `ExportArtifact` and the format-specific `ExportManifest`.
- `materializationFingerprint` must ignore renderer format and page geometry. `exportFingerprint` must include format and the resolved renderer profile.
- Shared FASE 7 materialization modules must have zero imports of `node:fs`, `fs`, `node:path`, `path`, `node:crypto`, `crypto` or other Node builtins, and zero public `Buffer` dependency.
- After `prepareUniversalDocumentForExport`, no second substantive sanitizer, deduplicator, similarity filter, rewriter, summarizer or fact/authority/evidence/petition generator may run.
- The only permitted post-prepare transformations are technical serialization, XML escaping, allowed control-character handling, paragraph/run segmentation, whitespace-equivalent line normalization and style mapping that preserves text.
- `applyStyleToSectionText` is not a materialization transform because it can inject opening/closing formulas. FASE 7 uses `LawyerProfile` for presentation only.
- `stripTrustMarkers`, `normalizeTitleText`, Markdown normalization and other substantive cleanup are already part of preparation where the current sanitizer executes them. They must not be run twice.
- No deduplication in materialization. Same text with different block/issue identity survives as two nodes and two DOCX paragraphs.
- Legacy `RenderedDocument`/`renderedSections` cannot fabricate FASE 6 evidence or enter the rich materialization path.
- PDF remains compatibility/parity only: no PDF engine rewrite, HTML, Chromium, external converter or fallback.
- Preserve explicit lifecycle transitions, authentication, canonical filename resolution, binary response contracts and honest errors.
- The final Task must run the complete baseline closure. It is not conditional on scope.

## Existing evidence and integration points

| Area | Current evidence | Future use |
|---|---|---|
| FASE 6 result | `pipeline.ts:3811-3848` | Read `documentAssemblyResult` and its final readiness/status |
| FASE 6 gate | `pipeline.ts:3827-3835`, `documentAssemblyQualityGate.ts:53-82` | Require `passed`, `canMarkAsReady`, `readiness: READY` |
| FASE 6 trace | `documentReadiness.ts:119-125`, `documentAssemblyTypes.ts:54-70` | Verify existing order/fingerprint/block links without rerunning validators |
| Attached evidence | `pipeline.ts:3859-3865` | Read `documentAssemblyResult` and `documentAssemblyQualityGate` from prepared document/context |
| Export guard | `exportGuards.ts`, `prepareUniversalDocumentForExport` | Require sanitized, lifecycle-exportable, QualityGate-approved input |
| DOCX | `exportDocxUniversal.ts` | Preserve wrapper; move semantic traversal behind renderer boundary |
| PDF | `exportPdfUniversal.ts` | Consume same semantic model; keep manual PDF renderer |
| Legacy | `lib/templates/exportDocx.ts`, `exportPdf.ts` | Keep outside universal path |

## Future file map

These files are planning targets only. None is created or modified in the current turn.

### New production files

- `lib/legal-engine/finalDocumentMaterializationTypes.ts` — shared-safe model, provenance, page profile and materialization options; no format and no binary type.
- `lib/legal-engine/finalDocumentMaterializationGate.ts` — read-only verification of existing FASE 6 evidence plus export guard result; no FASE 6 validator calls.
- `lib/legal-engine/finalDocumentMaterialization.ts` — immutable recursive traversal and exact-text materialization.
- `lib/legal-engine/exportPageProfiles.ts` — renderer-specific deterministic profiles and safe profile validation; no page geometry enters the shared model.
- `lib/legal-engine/exportArtifactTypes.ts` — renderer/server boundary types with format-specific artifact/manifest and `Uint8Array` bytes.

### Existing production files to modify only after approval

- `lib/legal-engine/exportDocxUniversal.ts` — wrapper plus DOCX renderer over `ExportRenderModel`.
- `lib/legal-engine/exportPdfUniversal.ts` — bounded semantic-model adapter; keep current PDF 1.4 implementation.
- `lib/legal-engine/generationTrace.ts` — additive manifest/fingerprint metadata without binary/base64 payload.
- `app/api/legal-engine/export/docx/route.ts` and `app/api/legal-engine/export/pdf/route.ts` — preserve auth/payload/response contracts and pass only server-approved renderer options.
- `lib/legal-engine/index.ts` — export approved contracts only.

### Future test files

- `tests/legal-engine/finalDocumentMaterializationGate.test.ts`
- `tests/legal-engine/finalDocumentMaterializationContracts.test.ts`
- `tests/legal-engine/finalDocumentMaterialization.test.ts`
- `tests/legal-engine/finalDocumentFidelity.test.ts`
- `tests/legal-engine/exportPageProfiles.test.ts`
- `tests/legal-engine/exportDocxStructure.test.ts`
- `tests/legal-engine/docxPackageSecurity.test.ts`
- `tests/legal-engine/exportFormatParity.test.ts`
- `tests/legal-engine/exportManifest.test.ts`
- `tests/legal-engine/sharedRuntimeBoundary.test.ts`
- `tests/legal-engine/exportRouteContracts.test.ts`
- `tests/legal-engine/legacyExportBoundary.test.ts`
- `tests/legal-engine/compatibilityExport.test.ts`
- `tests/legal-engine/compatibilityMaterializationGate.test.ts`
- `tests/legal-engine/serializationFailure.test.ts`
- `tests/helpers/docxPackageReader.ts` — test-only ZIP/XML inspection helper using existing runtime capabilities; no production dependency.

## Explicit input policy for rich and compatibility materialization

The current code does not expose a generic non-rich universal final-export producer. `documentReadiness.ts:156-165` maps absent/non-`RICH` analysis to `REQUIRES_REVIEW`, and `RenderedDocument` has no lifecycle/evidence rich. Therefore the compatibility branch below is explicit and fail-closed; it is not inferred from `LEGACY_FALLBACK` or from a legacy DTO.

```ts
type VerificationMode = 'RICH_ASSEMBLY' | 'COMPATIBILITY';

type RichVerifiedInput = {
  verificationMode: 'RICH_ASSEMBLY';
  document: UniversalLegalDocument;
  assembly: DocumentAssemblyResult;
  assemblyGate: DocumentAssemblyQualityGateResult;
  exportValidation: ExportValidationResult;
};

type VerifiedMaterializationInput =
  | RichVerifiedInput
  | {
      verificationMode: 'COMPATIBILITY';
      document: UniversalLegalDocument;
      compatibility: {
        status: 'COMPATIBLE';
        compatibilityStatus:
          | 'EXPLICIT_COMPATIBILITY'
          | 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
          | 'NO_SOURCE_REQUIRED';
        selectedDocumentType: string;
      };
      exportValidation: ExportValidationResult;
      lifecycleValid: true;
      requiredStructuralChecksPass: true;
      richEvidence?: never;
    };
```

The compatibility gate must verify recognized type/path, `COMPATIBLE` status, export guard PASS, valid lifecycle, required structural checks, no technical placeholders and no fabricated Coverage, LegalIssueMatrix, DocumentAssemblyResult or FASE 6 QualityGate. It returns `verificationMode: 'COMPATIBILITY'` and feeds the same materializer. If no producer can satisfy this envelope, only the rich branch is enabled. Unknown/non-approved non-rich input is rejected.

## Frozen contract registry

**previous proposed contracts: 43**  
**final proposed contracts: 49**  
**delta: +6**

Each contract is mapped to one future Task, one future test file and one exact planned test name. The names are frozen for execution planning; no test file is created in this turn.

| # | Contract | Task | Test file | Planned exact test name |
|---:|---|---:|---|---|
| 1 | Rich materialization requires FASE 6 `READY` + assembly QualityGate PASS + export guard PASS | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `requires FASE 6 READY, assembly QualityGate PASS and export guard PASS before materialization` |
| 2 | `BLOCKED` rejects final materialization | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `rejects BLOCKED assembly readiness` |
| 3 | `INVALID` rejects final materialization | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `rejects INVALID assembly readiness` |
| 4 | `REQUIRES_REVIEW` rejects final materialization | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `rejects REQUIRES_REVIEW assembly readiness` |
| 5 | Missing FASE 6 evidence rejects final materialization | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `rejects missing FASE 6 assembly evidence` |
| 6 | Broken assembly trace rejects final materialization | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `rejects broken assembly trace or block links` |
| 7 | FASE 7 does not recompute or rerun FASE 6 validators | 1 | `tests/legal-engine/finalDocumentMaterializationGate.test.ts` | `consumes existing FASE 6 evidence without rerunning FASE 6 validators` |
| 8 | `ExportRenderModel` is format-neutral and has no binary field | 2 | `tests/legal-engine/finalDocumentMaterializationContracts.test.ts` | `defines a format-neutral model without format or binary fields` |
| 9 | DOCX and PDF consume one identical semantic model | 5 | `tests/legal-engine/exportFormatParity.test.ts` | `DOCX and PDF consume the same ordered semantic model` |
| 10 | Prepared substantive text is preserved exactly | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `preserves exact prepared substantive text through materialization` |
| 11 | No destructive substantive transform is executed twice | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `does not reapply destructive sanitization or style text injection` |
| 12 | Manual text and manual-edit provenance are preserved | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `preserves manual text and manual edit provenance` |
| 13 | Same text with different block/issue identity survives twice | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `preserves same text from blocks with different issue identities` |
| 14 | Recursive `children` materialize in the model | 2 | `tests/legal-engine/finalDocumentMaterialization.test.ts` | `materializes recursive children with parent and depth metadata` |
| 15 | Section and block order are deterministic | 2 | `tests/legal-engine/finalDocumentMaterialization.test.ts` | `preserves canonical section and block order independent of completion order` |
| 16 | Materialization performs no deduplication | 2 | `tests/legal-engine/finalDocumentMaterialization.test.ts` | `never deduplicates distinct blocks or sections` |
| 17 | Materialization introduces no new facts | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `does not introduce facts absent from the prepared document` |
| 18 | Materialization introduces no new authorities | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `does not introduce authorities absent from the prepared document` |
| 19 | Materialization introduces no new evidence | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `does not introduce evidence absent from the prepared document` |
| 20 | Materialization introduces no new petitions | 2 | `tests/legal-engine/finalDocumentFidelity.test.ts` | `does not introduce petitions absent from the prepared document` |
| 21 | Existing headings are not duplicated | 2 | `tests/legal-engine/finalDocumentMaterialization.test.ts` | `does not duplicate headings represented by section and block content` |
| 22 | Profile resolution is deterministic | 3 | `tests/legal-engine/exportPageProfiles.test.ts` | `resolves the same profile deterministically for the same input` |
| 23 | Unsafe page profiles fail closed | 3 | `tests/legal-engine/exportPageProfiles.test.ts` | `rejects unsafe page dimensions, margins and units` |
| 24 | DOCX package is valid | 4 | `tests/legal-engine/exportDocxStructure.test.ts` | `creates a valid DOCX ZIP package` |
| 25 | `word/document.xml` exists and is well formed | 4 | `tests/legal-engine/exportDocxStructure.test.ts` | `contains a well-formed word/document.xml entry` |
| 26 | DOCX round trip preserves normalized text | 4 | `tests/legal-engine/exportDocxStructure.test.ts` | `DOCX round trip preserves normalized substantive text` |
| 27 | PDF has semantic parity with DOCX | 5 | `tests/legal-engine/exportFormatParity.test.ts` | `keeps PDF semantic text, order and provenance parity with DOCX` |
| 28 | PDF never falls back to HTML/Chromium/legacy | 5 | `tests/legal-engine/exportFormatParity.test.ts` | `does not fall back to HTML Chromium or legacy when PDF rendering fails` |
| 29 | Manifest/trace records materialization deterministically | 6 | `tests/legal-engine/exportManifest.test.ts` | `records model and export manifest fingerprints and counts` |
| 30 | Trace contains no binary or base64 payload | 6 | `tests/legal-engine/exportManifest.test.ts` | `does not place binary bytes or base64 payloads in trace` |
| 31 | Filename is Windows-safe | 7 | `tests/legal-engine/exportRouteContracts.test.ts` | `returns a Windows-safe canonical filename` |
| 32 | Path traversal is rejected/sanitized | 7 | `tests/legal-engine/exportRouteContracts.test.ts` | `rejects path traversal in title and filename metadata` |
| 33 | Invalid XML/control characters are handled safely | 4 | `tests/legal-engine/serializationFailure.test.ts` | `handles invalid XML control characters without substantive corruption` |
| 34 | DOCX has no macros or external active relationships | 4 | `tests/legal-engine/docxPackageSecurity.test.ts` | `contains no macros OLE objects or external active relationships` |
| 35 | Materialization makes zero provider calls | 7 | `tests/legal-engine/legacyExportBoundary.test.ts` | `performs zero provider calls during final materialization` |
| 36 | Materialization makes zero research calls | 7 | `tests/legal-engine/legacyExportBoundary.test.ts` | `performs zero research calls during final materialization` |
| 37 | Materialization makes zero DB calls | 7 | `tests/legal-engine/legacyExportBoundary.test.ts` | `performs zero database calls during final materialization` |
| 38 | Prepared input and FASE 6 evidence remain immutable | 2 | `tests/legal-engine/finalDocumentMaterialization.test.ts` | `does not mutate the prepared document or FASE 6 evidence` |
| 39 | Shared modules import zero Node builtins and public materialization types use no `Buffer` | 6 | `tests/legal-engine/sharedRuntimeBoundary.test.ts` | `has zero Node builtin imports and zero Buffer in shared materialization contracts` |
| 40 | Legacy boundary cannot fabricate rich evidence or enter universal export | 7 | `tests/legal-engine/legacyExportBoundary.test.ts` | `keeps RenderedDocument outside the rich universal materialization path` |
| 41 | Non-labor compatibility remains available without fake rich readiness | 7 | `tests/legal-engine/compatibilityExport.test.ts` | `preserves non-labor compatibility without fabricating FASE 6 evidence` |
| 42 | Formal-only compatibility remains available without fake substantive Coverage | 7 | `tests/legal-engine/compatibilityExport.test.ts` | `preserves formal-only compatibility without fabricating substantive Coverage` |
| 43 | Serialization/render failure is fail-closed | 4 | `tests/legal-engine/serializationFailure.test.ts` | `fails closed when DOCX serialization fails` |
| 44 | `VerifiedMaterializationInput` explicitly distinguishes rich and compatibility verification modes | 7 | `tests/legal-engine/compatibilityMaterializationGate.test.ts` | `exposes an explicit RichVerifiedInput or VerifiedCompatibilityInput union` |
| 45 | An approved compatibility input can materialize through the same model without rich evidence | 7 | `tests/legal-engine/compatibilityMaterializationGate.test.ts` | `materializes an approved compatibility input without fabricated rich evidence` |
| 46 | Compatibility provenance is exactly `verificationMode: COMPATIBILITY` | 7 | `tests/legal-engine/compatibilityMaterializationGate.test.ts` | `marks compatibility materialization with verificationMode COMPATIBILITY` |
| 47 | Compatibility input cannot claim FASE 6 `READY` or rich QualityGate PASS | 7 | `tests/legal-engine/compatibilityMaterializationGate.test.ts` | `cannot report FASE 6 READY for compatibility input` |
| 48 | Unknown/non-approved non-rich input fails closed | 7 | `tests/legal-engine/compatibilityMaterializationGate.test.ts` | `rejects unknown or non-approved non-rich materialization input` |
| 49 | Materialization fingerprint is renderer-independent and export fingerprint is renderer-specific | 6 | `tests/legal-engine/exportManifest.test.ts` | `separates renderer-independent materialization and renderer-specific export fingerprints` |

## Task 1 — Verify existing FASE 6 exportability evidence

### Objective

Create the read-only gate that accepts only a prepared document with existing FASE 6 `READY`, passed assembly gate, intact trace and export guard PASS. It must not recompute or rerun FASE 6.

### Files

- Add `lib/legal-engine/finalDocumentMaterializationGate.ts`.
- Add `tests/legal-engine/finalDocumentMaterializationGate.test.ts`.
- Add `tests/legal-engine/finalDocumentMaterializationContracts.test.ts`.
- Do not modify FASE 6 files.

### Interfaces

```ts
export interface RichVerifiedInput {
  document: UniversalLegalDocument;
  assembly: DocumentAssemblyResult;
  assemblyGate: DocumentAssemblyQualityGateResult;
  exportValidation: ExportValidationResult;
}

export function verifyFinalDocumentExportability(input: {
  document: UniversalLegalDocument;
  exportValidation: ExportValidationResult;
}): RichVerifiedInput;
```

### Contracts

Contracts 1–7.

### RED tests

Implement the seven exact tests in the contract registry before the production helper exists.

### RED command

```text
npx vitest run tests/legal-engine/finalDocumentMaterializationGate.test.ts tests/legal-engine/finalDocumentMaterializationContracts.test.ts
```

### Expected RED

The command must fail because the gate module/contracts do not yet exist, and because the current export preparation does not prove the complete FASE 6 evidence chain.

### Minimal implementation

Add only the types and a pure read-only verifier. It may inspect attached `documentAssemblyResult`, `documentAssemblyQualityGate`, `assembly.trace` and `ExportValidationResult`. It must not import or call FASE 6 validators, providers, research or database code.

### GREEN command

```text
npx vitest run tests/legal-engine/finalDocumentMaterializationGate.test.ts tests/legal-engine/finalDocumentMaterializationContracts.test.ts
```

### Expected GREEN

All seven gate/contract tests pass. Every non-`READY` state, missing evidence and broken trace is rejected with a typed fail-closed error.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

The helper proves existing FASE 6 evidence; no FASE 6 function is called or changed; lifecycle readiness is necessary but insufficient.

## Task 2 — Build the single format-neutral, exact-text materialization

### Objective

Create one semantic model from `VerifiedMaterializationInput`, recursively preserving order, children, manual text, verification mode, provenance and exact substantive text. Remove any need for a second substantive cleanup in renderers.

### Files

- Add `lib/legal-engine/finalDocumentMaterializationTypes.ts`.
- Add `lib/legal-engine/finalDocumentMaterialization.ts`.
- Add `tests/legal-engine/finalDocumentMaterialization.test.ts`.
- Add `tests/legal-engine/finalDocumentFidelity.test.ts`.

### Interfaces

```ts
export function materializePreparedFinalDocument(
  input: VerifiedMaterializationInput,
): ExportRenderModel;
```

`ExportRenderModel` must have no `format`, page profile/geometry, `Buffer`, `Uint8Array`, filename or renderer option.
Every `RenderProvenance` entry must carry the input union's exact `verificationMode`.

### Contracts

Contracts 8 and 10–21, plus 38. Contract 49 is completed with the manifest work in Task 6.

### RED tests

Implement the exact tests mapped to those contracts, including same-text/different-issue, manual text, no-dedupe, no-new-fact/authority/evidence/petition and recursive children cases.

### RED command

```text
npx vitest run tests/legal-engine/finalDocumentMaterialization.test.ts tests/legal-engine/finalDocumentFidelity.test.ts
```

### Expected RED

The command must fail because no format-neutral materializer exists and the current DOCX path directly traverses `sections[].content`, can call `applyStyleToSectionText`, does not recurse through children and has no exact-text/no-dedupe contract.

### Minimal implementation

1. Add shared-safe types and an immutable materializer.
2. Consume only the prepared text. Do not call `sanitizeLegalDocument`, `stripTrustMarkers`, `normalizeTitleText`, Markdown cleanup or `applyStyleToSectionText` again.
3. Treat `normalizeLegalDocumentText` as a single technical serialization canonicalization only if the before/after substantive equality contract proves it safe; record control-character removals and fail closed when safe handling is impossible.
4. Reuse existing section/strategy order and recursively walk `DocumentNode.children`.
5. Preserve duplicate text with distinct identity and preserve all provenance arrays.
6. Make fingerprints independent of timestamps/provider completion order but dependent on semantic order/content/identity.

### GREEN command

```text
npx vitest run tests/legal-engine/finalDocumentMaterialization.test.ts tests/legal-engine/finalDocumentFidelity.test.ts
```

### Expected GREEN

All mapped materialization/fidelity tests pass; one prepared document produces one model regardless of eventual renderer format; input and FASE 6 evidence are structurally unchanged.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

No shared materialization type imports Node builtins or contains a binary field. No post-prepare operation changes substantive meaning or deduplicates content.

## Task 3 — Deterministic and safe page/profile resolution

### Objective

Make the current effective page geometry and lawyer presentation profile explicit and deterministic without changing the default or injecting content.

### Files

- Add `lib/legal-engine/exportPageProfiles.ts`.
- Extend `lib/legal-engine/finalDocumentMaterializationTypes.ts` only if required by the approved interface.
- Add `tests/legal-engine/exportPageProfiles.test.ts`.

### Interfaces

```ts
export interface DocxPageProfile {
  id: string;
  unit: 'twip';
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  source: 'DOCUMENT_METADATA' | 'SERVER_OPTION' | 'COMPATIBILITY_DEFAULT';
}

export interface PdfPageProfile {
  id: string;
  unit: 'pt';
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  source: 'DOCUMENT_METADATA' | 'SERVER_OPTION' | 'COMPATIBILITY_DEFAULT';
}

export function resolveDocxPageProfile(input: unknown): DocxPageProfile;
export function resolvePdfPageProfile(input: unknown): PdfPageProfile;
```

### Contracts

Contracts 22–23. The resolved profile belongs only to the corresponding renderer options; it is not copied into `ExportRenderModel`.

### RED tests

Add the exact profile tests from the registry before the resolver exists.

### RED command

```text
npx vitest run tests/legal-engine/exportPageProfiles.test.ts
```

### Expected RED

The command must fail because no validated resolver exists and current DOCX/PDF constants are not represented by one explicit profile.

### Minimal implementation

Encode the current compatibility geometry separately for DOCX twips and PDF points, validate finite positive dimensions/margins/units, resolve explicit metadata then server option then compatibility default in each renderer, and use `LawyerProfile` only for presentation. Never copy either profile into `ExportRenderModel`.

### GREEN command

```text
npx vitest run tests/legal-engine/exportPageProfiles.test.ts
```

### Expected GREEN

Both deterministic-resolution and unsafe-profile tests pass; no default Letter/Oficio behavior changes.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

The selected profile is stable, validated and recorded; it cannot create legal text or provenance.

## Task 4 — DOCX renderer, OOXML structure and serialization safety

### Objective

Make DOCX consume only the format-neutral model and verify package structure, exact round trip, XML safety, active-content absence and fail-closed serialization.

### Files

- Modify `lib/legal-engine/exportDocxUniversal.ts` only after Tasks 1–3 pass.
- Add `tests/helpers/docxPackageReader.ts` as a test-only package reader using existing runtime capabilities; do not add a dependency.
- Add `tests/legal-engine/exportDocxStructure.test.ts`.
- Add `tests/legal-engine/docxPackageSecurity.test.ts`.
- Add `tests/legal-engine/serializationFailure.test.ts`.

### Interfaces

```ts
export interface DocxRenderOptions {
  format: 'docx';
  pageProfile: DocxPageProfile;
  lawyerProfile: LawyerProfile;
}

export function renderDocx(model: ExportRenderModel, options: DocxRenderOptions): Promise<ExportArtifact>;
```

The public compatibility wrapper may still return the current Node `Buffer` at its server boundary, but the shared model/artifact contract remains binary-neutral.

### Contracts

Contracts 24–26, 33–34 and 43.

### RED tests

Add the exact DOCX structure, security and serialization tests from the registry before moving semantic traversal out of the current exporter.

### RED command

```text
npx vitest run tests/legal-engine/exportDocxStructure.test.ts tests/legal-engine/docxPackageSecurity.test.ts tests/legal-engine/serializationFailure.test.ts
```

### Expected RED

At least the new `word/document.xml`, exact recursive structure, active-relationship and fail-closed assertions must fail against the current direct renderer; package signature tests may pass and do not cancel the RED requirement.

### Minimal implementation

1. Keep `exportUniversalToDocx` as guard/materialization wrapper.
2. Render only `ExportRenderModel` and `DocxRenderOptions`.
3. Map paragraph/run roles and page rules without changing text.
4. XML-escape safely, handle allowed XML controls, and reject unrepresentable serialization cases.
5. Inspect package entries and relationships in tests for `word/document.xml`, macros, OLE and external targets.
6. Keep header/footer content limited to approved model values and preserve canonical filename behavior.

### GREEN command

```text
npx vitest run tests/legal-engine/exportDocxStructure.test.ts tests/legal-engine/docxPackageSecurity.test.ts tests/legal-engine/serializationFailure.test.ts
```

### Expected GREEN

All DOCX structure/security/serialization tests pass; extracted text matches the prepared substantive model and failed serialization returns an honest error without legacy fallback.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

DOCX package, `word/document.xml`, round trip, active-content safety and fail-closed serialization are proven beyond `PK`/size checks.

## Task 5 — PDF compatibility/parity consumer

### Objective

Consume the same model in PDF without rewriting the current manual PDF engine or adding HTML/Chromium/external conversion.

### Files

- Modify `lib/legal-engine/exportPdfUniversal.ts` minimally.
- Add `tests/legal-engine/exportFormatParity.test.ts`.
- Extend existing PDF focal tests only after the new parity tests are red.

### Interfaces

```ts
export interface PdfRenderOptions {
  format: 'pdf';
  pageProfile: PdfPageProfile;
  lawyerProfile: LawyerProfile;
}

export function renderPdf(model: ExportRenderModel, options: PdfRenderOptions): Promise<ExportArtifact>;
```

### Contracts

Contracts 9, 27–28.

### RED tests

Add the exact semantic-parity and no-fallback tests from the registry.

### RED command

```text
npx vitest run tests/legal-engine/exportFormatParity.test.ts tests/legal-engine/pdfExport.test.ts
```

### Expected RED

The shared-model parity and explicit no-fallback tests must fail until the PDF path consumes the same semantic sequence and exposes renderer failure honestly.

### Minimal implementation

Adapt the current pagination/drawing functions to ordered model paragraphs. Preserve `%PDF`, WinAnsi/cp1252, page numbering, closing-cluster behavior and `PDF_LEGACY_PAYLOAD_REJECTED`/`PDF_EXPORT_FAILED` semantics.

### GREEN command

```text
npx vitest run tests/legal-engine/exportFormatParity.test.ts tests/legal-engine/pdfExport.test.ts
```

### Expected GREEN

PDF and DOCX normalized text/order/provenance match; PDF remains binary and no HTML/Chromium/legacy fallback is reachable.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

PDF is only a parity consumer and its engine was not rewritten.

## Task 6 — Manifest, trace and shared/runtime boundary

### Objective

Record deterministic model/export metadata without embedding binary data and prove the shared materialization boundary is runtime-safe.

### Files

- Add `lib/legal-engine/exportArtifactTypes.ts`.
- Modify `lib/legal-engine/generationTrace.ts` additively.
- Add `tests/legal-engine/exportManifest.test.ts`.
- Add `tests/legal-engine/sharedRuntimeBoundary.test.ts`.

### Interfaces

```ts
export interface ExportManifest {
  schemaVersion: 'fase7-v1';
  format: 'docx' | 'pdf';
  documentFingerprint: string;
  materializationFingerprint: string;
  exportFingerprint: string;
  pageProfileId: string;
  sectionCount: number;
  paragraphCount: number;
  omittedParagraphCount: number;
  renderedBlockIds: readonly string[];
  omittedBlockIds: readonly string[];
  traceStatus: 'RECORDED' | 'NOT_AVAILABLE';
}

export interface ExportArtifact {
  format: 'docx' | 'pdf';
  mediaType: string;
  fileName: string;
  bytes: Uint8Array;
  manifest: ExportManifest;
}
```

### Contracts

Contracts 29–30, 39 and 49.

### RED tests

Add the exact manifest, binary/base64 and runtime-boundary tests from the registry.

### RED command

```text
npx vitest run tests/legal-engine/exportManifest.test.ts tests/legal-engine/sharedRuntimeBoundary.test.ts
```

### Expected RED

The command must fail because the current trace has no FASE 7 manifest contract and the new static inspection cannot yet prove zero Node builtin/Buffer use in shared materialization modules.

### Minimal implementation

Add only additive manifest fields, renderer-independent model fingerprints and renderer-specific export fingerprints/profile IDs. Store hashes as digest strings, never raw bytes/base64. Keep `Buffer` conversion at renderer/server boundary and use `Uint8Array` in artifact types.

### GREEN command

```text
npx vitest run tests/legal-engine/exportManifest.test.ts tests/legal-engine/sharedRuntimeBoundary.test.ts
```

### Expected GREEN

Manifest counts/fingerprints are stable, trace has no binary/base64 payload, and static inspection reports zero shared Node builtin imports and zero public `Buffer` dependency.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

The trace explains what was rendered without carrying the rendered bytes.

## Task 7 — API, filename, legacy and compatibility boundaries

### Objective

Integrate both routes without bypasses, preserve Windows-safe filenames, keep legacy isolated and preserve non-labor/formal-only compatibility without fabricating rich evidence.

### Files

- Modify `app/api/legal-engine/export/docx/route.ts` only for approved server-side renderer options and artifact conversion.
- Modify `app/api/legal-engine/export/pdf/route.ts` only for shared-model artifact integration.
- Add `tests/legal-engine/exportRouteContracts.test.ts`.
- Add `tests/legal-engine/legacyExportBoundary.test.ts`.
- Add `tests/legal-engine/compatibilityExport.test.ts`.
- Add `tests/legal-engine/compatibilityMaterializationGate.test.ts`.

### Interfaces

```ts
export function resolveDocumentOutputFilename(
  document: UniversalLegalDocument,
  extension: 'docx' | 'pdf',
): string;

type VerifiedCompatibilityInput = {
  verificationMode: 'COMPATIBILITY';
  document: UniversalLegalDocument;
  compatibility: {
    status: 'COMPATIBLE';
    compatibilityStatus:
      | 'EXPLICIT_COMPATIBILITY'
      | 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
      | 'NO_SOURCE_REQUIRED';
    selectedDocumentType: string;
  };
  exportValidation: ExportValidationResult;
  lifecycleValid: true;
  requiredStructuralChecksPass: true;
  richEvidence?: never;
};

type VerifiedMaterializationInput = RichVerifiedInput | VerifiedCompatibilityInput;
```

Routes continue to accept the universal document, require auth, return binary content and reject legacy payloads. The server converts `Uint8Array` to the `Buffer`/`NextResponse` shape only at this boundary. The compatibility branch is enabled only for an explicit recognized type/path with `COMPATIBLE` status, lifecycle and structural checks; current `LEGACY_FALLBACK`/`RenderedDocument` inputs remain rejected.

### Contracts

Contracts 31–32, 35–42 and 44–48.

### RED tests

Add the exact route, side-effect, legacy and compatibility tests from the registry.

### RED command

```text
npx vitest run tests/legal-engine/exportRouteContracts.test.ts tests/legal-engine/legacyExportBoundary.test.ts tests/legal-engine/compatibilityExport.test.ts
npx vitest run tests/legal-engine/compatibilityMaterializationGate.test.ts
```

### Expected RED

The command must fail until route options, filename safety, zero-side-effect spies, legacy rejection and compatibility distinctions are explicitly covered. The compatibility gate must reject `LEGACY_FALLBACK`, generic non-rich and missing-envelope inputs while accepting only the approved envelope.

### Minimal implementation

1. Keep `requireLawyerAccess` first.
2. Require `body.document` for both universal endpoints.
3. Reuse `resolveDocumentOutputFilename`; reject/sanitize traversal and Windows-invalid values.
4. Do not call `lib/templates/exportDocx.ts` or `generatePrintHtml` from universal routes.
5. Do not let legacy create `DocumentAssemblyResult` or `DocumentAssemblyQualityGateResult`.
6. Preserve non-labor/formal-only existing paths where their own contracts are valid. If they carry valid FASE 6 evidence, classify them `RICH_ASSEMBLY`; otherwise use the explicit compatibility envelope or reject.
7. Set compatibility provenance to exactly `verificationMode: 'COMPATIBILITY'`; it can never claim FASE 6 `READY` or rich QualityGate PASS.
8. Instrument tests to prove zero provider/research/DB calls.

### GREEN command

```text
npx vitest run tests/legal-engine/exportRouteContracts.test.ts tests/legal-engine/legacyExportBoundary.test.ts tests/legal-engine/compatibilityExport.test.ts
npx vitest run tests/legal-engine/compatibilityMaterializationGate.test.ts
```

### Expected GREEN

Routes remain authenticated/fail-closed, filenames are safe, legacy cannot bypass, approved compatibility materializes through the same model with explicit provenance, unknown non-rich input is rejected and no provider/research/DB calls occur.

### Typecheck

```text
npm run typecheck
```

### PASS criterion

Only a verified rich path or an explicitly approved compatibility envelope can materialize a final document; legacy and unknown non-rich behavior is rejected rather than inferred.

## Task 8 — Mandatory global baseline closure

### Objective

Prove complete FASE 7 closure against the protected baseline after all focal tasks are green. This Task is mandatory and unconditional.

### Files

- No production/test/dependency file is authorized by this Task.
- Evidence is the captured output of the project commands and the release-gate report.

### Interfaces

```text
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm run release-gate
```

`npm run release-gate` resolves to the real project script `node scripts/release-gate.mjs`.

### Contracts

Closure evidence must cover Contracts 1–49, FASE 5B regression count, FASE 6 contract/behavior regression count and the protected baseline. It is not a replacement for any contract test.

### RED tests

Run the complete baseline only after Tasks 1–7 are individually green.

### RED command

```text
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm run release-gate
```

### Expected RED

Any test failure, type error, lint error, build failure, audit HIGH/CRITICAL finding, release-gate non-GO, FASE 5B regression or FASE 6 regression blocks closure. Existing 1,032 baseline warnings are not themselves a failure and must not be cleaned wholesale. The historical count is not an expected final count.

### Minimal implementation

Fix only attributable FASE 7 defects, then rerun the exact complete command sequence. Do not alter unrelated baseline warnings or reopen FASE 5B/6.

### GREEN command

```text
npm test
npm run typecheck
npm run lint
npm run build
npm audit
npm run release-gate
```

### Expected GREEN

```text
PRE-FASE7 BASELINE: 170 test files / 2321 tests PASS / 0 failed / 2 skipped
all pre-FASE7 baseline tests remain PASS
all new FASE7 contracts/tests PASS
0 failed
final test files passed: X
final test files failed: 0
final tests passed: Y
final tests failed: 0
skipped: Z
new skips: none without explicit justification
typecheck PASS
lint 0 errors
1032 warnings baseline
new FASE 7 attributable lint warnings: 0
build PASS
npm audit HIGH 0
npm audit CRITICAL 0
release-gate GO
FASE 5B behavior regressions 0
FASE 6 contracts 42/42
FASE 6 behavior regressions 0
```

`170 files / 2321 tests` is the protected PRE-FASE 7 baseline, not the final post-FASE 7 total. `X`, `Y` and `Z` must be measured from the final run; they must not be hard-coded to historical values.

### Typecheck

`npm run typecheck` is mandatory in the GREEN sequence and must exit 0.

### PASS criterion

Only this exact evidence permits declaring FASE 7 complete. No “scope allows” exception exists for build, lint, audit or release-gate.

## Execution order and stop boundary

Future execution order is strictly Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8. Each Task must complete its RED → minimal implementation → GREEN → typecheck checkpoint before the next Task.

The current turn stops before Task 1. No implementation, test run or dependency change is authorized by this document delivery.

**FASE 5B modifications planned:** `0`  
**FASE 6 semantic modifications planned:** `0`  
**Estado:** `FASE 7 SPEC + PLAN FINAL · APPROVAL REQUESTED`
