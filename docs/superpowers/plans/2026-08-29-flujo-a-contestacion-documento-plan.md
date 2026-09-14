# Flujo A de Contestación de Documentos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el flujo real de contestación de documentos en Jurídico Radar usando un único contrato de caso y `runGenerationPipeline` como motor, desde la carga hasta un DOCX revisable.

**Architecture:** El backend producirá y reutilizará un `CaseWorkflow` persistible que contiene fuentes por página, `CaseAnalysis`, elección de modo, plantilla/referencia y `UniversalLegalDocument`. La página de Machotes coordinará estados; no duplicará análisis ni generación. Se conservarán `extractDocument`, `documentIndex`, `caseAnalysis`, `styleEngine`, plantillas, `LegalDraft`, `LegalWorkspace`, `FloatingLegalChat` y exportadores.

**Tech Stack:** Next.js 16 App Router, TypeScript estricto, React 19, Prisma 6, Zod, Vitest, `docx`, extractores PDF/DOCX/TXT/imagen y proveedores NVIDIA/local existentes.

---

## Mapa de archivos

### Contrato y análisis

- Modify: `lib/legal-engine/types.ts` — tipos de procedencia, hechos individuales y flujo de caso.
- Modify: `lib/legal-engine/caseAnalysis.ts` — extracción de hechos numerados y datos con referencias.
- Modify: `lib/legal-engine/documentIndex.ts` — conservar chunks/páginas necesarios para hechos y trazabilidad.
- Modify: `lib/legal-engine/context.ts` — contexto por página sin truncamiento silencioso.
- Modify: `lib/legal-engine/pipeline.ts` — aceptar el contrato, respetar modo/plantilla, estilo y precedencia manual.
- Create: `lib/legal-engine/caseWorkflow.ts` — normalización pura del caso, elección de modo y serialización del contexto que consume el pipeline.

### API y persistencia

- Modify: `app/api/templates/analyze-upload/route.ts` — devolver análisis estructurado y autenticación consistente.
- Modify: `app/api/legal-engine/generate/route.ts` — validar y transportar el contrato de caso, modo y referencias.
- Modify: `app/api/legal-drafts/route.ts` — persistir y listar metadatos del flujo.
- Modify: `app/api/legal-drafts/[id]/route.ts` — reabrir sin regenerar y proteger organización.
- Modify: `app/api/legal-engine/export/docx/route.ts` — validar el documento y devolver DOCX con metadatos de revisión.

### UI y workspace

- Modify: `app/machotes/page.tsx` — consumir el análisis único, seleccionar modo, confirmar datos y conectar persistencia.
- Modify: `app/machotes/components/CaseDocumentsReader.tsx` — mostrar estado de fuente, páginas y trazabilidad.
- Modify: `app/machotes/components/FieldReviewPanel.tsx` — editar/confirmar datos críticos con origen y confianza.
- Modify: `app/machotes/components/WorkspaceDocumentEditor.tsx` — mantener banner permanente de borrador y proteger edición manual.
- Modify: `components/ai/FloatingLegalChat.tsx` — enviar sección seleccionada y preservar la operación localizada.
- Modify: `context/LegalWorkspaceContext.tsx` — transportar el snapshot persistible completo.

### Pruebas

- Create: `tests/legal-engine/caseWorkflow.test.ts` — contrato, procedencia y contaminación.
- Modify: `tests/templates/universalDocumentPipeline.test.ts` — hechos individuales, modos y trazabilidad.
- Modify: `tests/templates/customTemplatesApi.test.ts` — análisis persistible y seguridad de carga.
- Modify: `tests/ai/documentEditFlow.test.ts` — regeneración localizada y precedencia manual.
- Modify: `tests/e2e/criticalFlows.test.ts` — cadena de caso hasta DOCX.
- Modify: `tests/security/idor.test.ts` — análisis, generación y borradores aislados por organización.

## Convenciones de implementación

- No crear otra función de generación de contestaciones; todas las secciones pasan por `runGenerationPipeline`.
- No usar `any` en los nuevos contratos. Los bordes heredados se adaptarán con tipos Zod o `unknown` validado.
- No usar `slice(0, N)` para decidir hechos o contenido fuente. Los límites solo podrán existir en vistas/prompt por sección y deben registrar que son ventanas de contexto.
- Toda referencia generada tendrá `documentId`, página y fragmento cuando exista.
- Los datos históricos de plantilla/referencia se conservarán solo en una representación de estructura/estilo saneada.
- El fallback local quedará en `generationMetadata.aiProvider`, `aiUsed`, `aiError` y en el estado visible del editor.

## Task 1: Formalizar el contrato único del flujo

**Files:**
- Modify: `lib/legal-engine/types.ts`
- Create: `lib/legal-engine/caseWorkflow.ts`
- Test: `tests/legal-engine/caseWorkflow.test.ts`

- [ ] **Step 1: Write failing contract tests**

Add tests that require the following public shapes and invariants:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildCaseWorkflow,
  chooseGenerationSource,
  type CaseWorkflowInput,
} from '@/lib/legal-engine/caseWorkflow';

describe('CaseWorkflow', () => {
  it('normaliza el análisis y conserva procedencia por página', () => {
    const input: CaseWorkflowInput = {
      sourceDocuments: [{
        id: 'src-1', filename: 'demanda.txt', type: 'txt',
        extractedText: 'HECHO PRIMERO. El actor celebró contrato.',
        pages: [{ page: 1, text: 'HECHO PRIMERO. El actor celebró contrato.', chars: 43 }],
        sourceValidated: true,
      }],
      analysis: {
        parties: { actor: 'Ana', demandado: 'Luis' },
        facts: [{ id: 'fact-1', number: 'PRIMERO', text: 'El actor celebró contrato.', documentId: 'src-1', page: 1, confidence: 0.9 }],
        missingData: [],
      },
      generationMode: 'automatic',
    };

    const workflow = buildCaseWorkflow(input);
    expect(workflow.analysis.facts[0].provenance).toBe('SOURCE_EXTRACTED');
    expect(workflow.analysis.facts[0].page).toBe(1);
  });

  it('separa plantilla personal de documento de referencia', () => {
    expect(chooseGenerationSource({ mode: 'personal_template', templateId: 'tpl-1' })).toEqual({
      mode: 'personal_template', templateId: 'tpl-1', referenceDocumentId: undefined,
    });
    expect(chooseGenerationSource({ mode: 'reference_document', referenceDocumentId: 'ref-1' })).toEqual({
      mode: 'reference_document', templateId: undefined, referenceDocumentId: 'ref-1',
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run tests/legal-engine/caseWorkflow.test.ts`

Expected: FAIL because `caseWorkflow.ts` and the individual-fact type do not yet exist.

- [ ] **Step 3: Implement the minimal typed contract**

Add to `lib/legal-engine/types.ts`:

```ts
export type ProvenanceKind =
  | 'SOURCE_EXTRACTED'
  | 'LAWYER_CONFIRMED'
  | 'INFERRED'
  | 'TEMPLATE_STRUCTURE'
  | 'AI_GENERATED'
  | 'USER_EDITED';

export interface AnalyzedFact {
  id: string;
  number: string;
  text: string;
  documentId?: string;
  page?: number;
  confidence: number;
  proposedPosture?: 'ADMIT' | 'DENY' | 'PARTIALLY_ADMIT' | 'UNKNOWN';
  proposedResponse?: string;
  manualResponse?: string;
  provenance: ProvenanceKind;
  isManuallyEdited?: boolean;
}

export type GenerationMode = 'personal_template' | 'reference_document' | 'automatic';

export interface CaseWorkflowSelection {
  mode: GenerationMode;
  templateId?: string;
  referenceDocumentId?: string;
}

export interface CaseWorkflow {
  sourceDocuments: UploadedSourceDocument[];
  analysis: CaseAnalysis;
  selection: CaseWorkflowSelection;
  structuredDoc?: UniversalLegalDocument;
  updatedAt: string;
}
```

In `caseWorkflow.ts`, validate that personal-template mode requires `templateId`, reference mode requires `referenceDocumentId`, and automatic mode contains neither. Normalize missing arrays to empty arrays, clamp confidence to `[0, 1]`, and preserve each fact's document/page fields.

- [ ] **Step 4: Run focused and regression tests**

Run: `npm test -- --run tests/legal-engine/caseWorkflow.test.ts tests/templates/universalDocumentPipeline.test.ts`

Expected: new contract tests pass and existing pipeline tests remain green.

- [ ] **Step 5: Commit when Git is available**

Run: `git add lib/legal-engine/types.ts lib/legal-engine/caseWorkflow.ts tests/legal-engine/caseWorkflow.test.ts && git commit -m "feat: formalize document case workflow contract"`

If the checkout still has no `.git`, record the exact failure and retain the files without initializing a repository.

## Task 2: Unificar extracción y análisis jurídico

**Files:**
- Modify: `lib/legal-engine/caseAnalysis.ts`
- Modify: `lib/legal-engine/documentIndex.ts`
- Modify: `lib/legal-engine/context.ts`
- Modify: `app/api/templates/analyze-upload/route.ts`
- Test: `tests/templates/customTemplatesApi.test.ts`
- Test: `tests/legal-engine/caseWorkflow.test.ts`

- [ ] **Step 1: Add failing tests for numbered facts and validation**

Add cases asserting that `HECHO PRIMERO`, `HECHO SEGUNDO` and `HECHO TERCERO` become three `AnalyzedFact` records with source page, exact text and independent IDs. Add a scanned-source case asserting `sourceValidated: false`, `pipelineStatus: 'NEEDS_MANUAL_REVIEW'`, no fabricated extracted text and no automatic generation permission.

- [ ] **Step 2: Run the focused tests**

Run: `npm test -- --run tests/templates/customTemplatesApi.test.ts tests/legal-engine/caseWorkflow.test.ts`

Expected: FAIL on missing `facts` or missing source validation behavior.

- [ ] **Step 3: Implement fact segmentation from existing page index**

Extend `CaseAnalysis` with `facts: AnalyzedFact[]`, `sourceReferences` and confidence-bearing extracted fields. In `reconstructCaseAnalysis`, process pages in original order and split on headings matching:

```ts
const factHeading = /(?:^|\n)\s*(?:HECHO|HECHOS)\s+([A-ZÁÉÍÓÚÑ0-9IVX]+)\s*[:.\-]?\s*/gim;
```

Use the next heading or page/document end as the fact boundary. Keep the original page and document ID. If no numbered facts exist, emit an empty array and retain existing generic analysis. Mark extracted facts `SOURCE_EXTRACTED`; do not infer a posture as confirmed.

Update `documentIndex`/context consumers so full-page retrieval remains available and any section prompt uses a recorded context window with page references instead of silently changing the source model.

- [ ] **Step 4: Return one analysis payload from upload**

In `app/api/templates/analyze-upload/route.ts`, preserve the current extraction response for compatibility and add `analysis`, `caseWorkflow`, and `generationEligibility`. `generationEligibility` must be `blocked` when any source is unvalidated unless the client explicitly sends the existing warning override. Enforce the result of `requireLawyerAccess`; return its error response instead of ignoring it.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --run tests/templates/customTemplatesApi.test.ts tests/legal-engine/caseWorkflow.test.ts && npm run typecheck`

Expected: focused tests pass and TypeScript exits 0.

## Task 3: Connect the three generation modes to the existing pipeline

**Files:**
- Modify: `lib/legal-engine/pipeline.ts`
- Modify: `lib/legal-engine/documentPlan.ts`
- Modify: `lib/legal-engine/styleEngine.ts`
- Modify: `app/api/legal-engine/generate/route.ts`
- Test: `tests/templates/universalDocumentPipeline.test.ts`
- Test: `tests/templates/mandatoryRequirementsPipeline.test.ts`

- [ ] **Step 1: Add failing mode and isolation tests**

Cover these exact expectations:

- Personal template uses the selected template's structure but excludes historical names, addresses, amounts, dates, case numbers, judges, counterparties, facts and signatures.
- Reference-document mode stores a structural/style representation and does not inject the complete historical document into the generation prompt.
- Automatic mode chooses a document plan based on matter, jurisdiction, procedure, received-document type, claims, facts, evidence and response type; it must not always use one fixed generic plan.
- Individual numbered facts produce individual response sections or blocks when the selected document type is a contestation.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run tests/templates/universalDocumentPipeline.test.ts tests/templates/mandatoryRequirementsPipeline.test.ts`

Expected: new assertions fail while existing assertions identify compatibility breaks.

- [ ] **Step 3: Normalize pipeline inputs through `CaseWorkflow`**

Add a typed optional `workflow` input to `PipelineInput`. Resolve the structural source exactly once:

```ts
const structuralSource = workflow?.selection.mode === 'personal_template'
  ? loadSanitizedTemplateStructure(workflow.selection.templateId)
  : workflow?.selection.mode === 'reference_document'
    ? extractReferenceStructure(workflow.selection.referenceDocumentId, input.referenceDocumentText)
    : buildAutomaticStructure({ classification: doc.classification, analysis: caseAnalysis });
```

The actual implementation must use existing template store/renderer and style extractor; `loadSanitizedTemplateStructure` and `extractReferenceStructure` are adapters, not new generators. Every section receives `_provenance: 'MACHOTE'` or `'GENERATED'`, and every generated block receives `AI_GENERATED` provenance through the existing `layer`/`trustLevel` fields plus the new typed metadata.

- [ ] **Step 4: Add per-fact drafting context**

When `caseAnalysis.facts` is non-empty and the document is a contestation, pass only the relevant fact record plus its source reference to the corresponding fact-response section. Generate posture as a proposed response, never as a confirmed fact. Preserve the source text and page in the block's `sources` array.

- [ ] **Step 5: Connect personal profile to generation behavior**

Ensure the effective profile loaded by `loadLawyerProfile` reaches the pipeline in all async and sync paths. Use `applyStyleToSectionText` for formulas/opening/closing, and pass profile length, tone, preferred order and contestation preferences into the section prompt. Record the profile application in `generationMetadata.trace`; do not create a second style system.

- [ ] **Step 6: Run focused tests, typecheck and lint**

Run: `npm test -- --run tests/templates/universalDocumentPipeline.test.ts tests/templates/mandatoryRequirementsPipeline.test.ts && npm run typecheck && npm run lint`

Expected: tests and typecheck pass; lint has no new errors. Existing warnings may remain and must be compared with the baseline.

## Task 4: Persist the complete workflow and reopen without regeneration

**Files:**
- Modify: `app/api/legal-engine/generate/route.ts`
- Modify: `app/api/legal-drafts/route.ts`
- Modify: `app/api/legal-drafts/[id]/route.ts`
- Modify: `context/LegalWorkspaceContext.tsx`
- Modify: `app/machotes/page.tsx`
- Test: `tests/e2e/criticalFlows.test.ts`
- Test: `tests/security/idor.test.ts`

- [ ] **Step 1: Add failing persistence and authorization tests**

Assert that a completed generation stores `sourceDocuments`, extraction state, `caseAnalysis`, corrected fields, generation mode, selected template/reference, `structuredDoc`, manually edited sections, metadata, warnings and validations. Assert that GET/PATCH by another organization returns 404/403 and cannot see source text.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run tests/e2e/criticalFlows.test.ts tests/security/idor.test.ts`

Expected: persistence metadata or organization isolation assertions fail before the adapter is connected.

- [ ] **Step 3: Persist on job completion**

After `runGenerationPipeline` completes in `app/api/legal-engine/generate/route.ts`, call the existing draft persistence path with the authenticated organization/user, full workflow fields and final `structuredDoc`. Do not persist raw provider secrets or file buffers. Keep job completion and draft persistence states distinct; if persistence fails, mark the job failure and return a retryable error rather than “saved”.

- [ ] **Step 4: Reopen the stored snapshot**

Update `GET /api/legal-drafts/[id]` to return the complete workflow snapshot. On page load, hydrate `LegalWorkspaceContext` and `universalDoc` directly from `structuredDoc`; only call analysis/generation when the user starts a new operation or explicitly retries. Preserve `lastSavedSignature` and manual edit flags.

- [ ] **Step 5: Verify organization scope**

Use the authenticated organization in every Prisma `where` clause. Do not use client-provided `organizationId` as authority. Ensure the template/reference IDs are resolved within the same organization or an explicitly allowed official visibility scope.

- [ ] **Step 6: Run regression checks**

Run: `npm test -- --run tests/e2e/criticalFlows.test.ts tests/security/idor.test.ts tests/ai/documentEditFlow.test.ts && npm run typecheck`

Expected: all focused tests pass and no schema migration is required.

## Task 5: Add the analysis review UI and explicit generation choice

**Files:**
- Modify: `app/machotes/page.tsx`
- Modify: `app/machotes/components/CaseDocumentsReader.tsx`
- Modify: `app/machotes/components/FieldReviewPanel.tsx`
- Modify: `app/machotes/components/TemplateLibraryManager.tsx`
- Modify: `app/machotes/components/GenerationStatusBar.tsx`
- Test: `tests/e2e/criticalFlows.test.ts`

- [ ] **Step 1: Add UI contract tests**

Using the existing test style, assert that upload results render source state, analysis fields, missing-data markers and the three mutually exclusive generation modes. Assert that a low-confidence critical field is visibly marked and can be corrected before generation.

- [ ] **Step 2: Run the focused UI/API tests**

Run: `npm test -- --run tests/e2e/criticalFlows.test.ts`

Expected: new assertions fail until the current page state is connected to `CaseWorkflow`.

- [ ] **Step 3: Render the analysis review state**

Use `CaseDocumentsReader` for source/page review and `FieldReviewPanel` for actor, defendant, expediente, court, matter, procedure, claims and principal facts. Each field must carry `source`, `confidence` and `provenance`, and edits must change it to `LAWYER_CONFIRMED`.

- [ ] **Step 4: Render and validate mode selection**

Replace implicit template behavior with an explicit mode selection. Require a selected personal template for `personal_template`, a selected reference document for `reference_document`, and neither for `automatic`. Send the same workflow snapshot to `/api/legal-engine/generate`.

- [ ] **Step 5: Show eligibility and progress truthfully**

Disable generation for unvalidated sources unless the existing explicit warning action is selected. Show actual job status, provider/fallback state and section progress from `useGenerationJob`; do not show completed before the server returns a document.

- [ ] **Step 6: Run typecheck and focused tests**

Run: `npm run typecheck && npm test -- --run tests/e2e/criticalFlows.test.ts`

Expected: TypeScript and focused tests pass.

## Task 6: Preserve manual edits and localized AI regeneration

**Files:**
- Modify: `lib/workspace/legalEditContract.ts`
- Modify: `context/LegalWorkspaceContext.tsx`
- Modify: `app/machotes/components/WorkspaceDocumentEditor.tsx`
- Modify: `components/ai/FloatingLegalChat.tsx`
- Modify: `app/api/ai/document-edit/route.ts`
- Modify: `lib/legal-engine/pipeline.ts`
- Test: `tests/ai/documentEditFlow.test.ts`
- Test: `tests/templates/universalDocumentPipeline.test.ts`

- [ ] **Step 1: Add failing localized-edit tests**

Create a three-fact document and assert that “Amplía el hecho tercero” changes only the third fact block; the first fact, second fact, exceptions, evidence and petitions retain byte-equivalent text. Assert that manual text has `isManuallyEdited: true`, `USER_EDITED` provenance and survives regeneration of another section.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run tests/ai/documentEditFlow.test.ts tests/templates/universalDocumentPipeline.test.ts`

Expected: any broad replacement or missing provenance causes a failure.

- [ ] **Step 3: Enforce target resolution**

Use the existing `resolveSection` and atomic operation contract. Require an explicit `sectionId` or an unambiguous fact identifier for `replace_section`, `replace_text`, `insert_after` and `insert_before`. Reject multi-section replacements when the user names one section. Preserve failed operations and warnings in the response.

- [ ] **Step 4: Enforce manual precedence in pipeline**

Before assigning generated content, detect section/block manual flags and skip them when regenerating another target or the whole document from an existing snapshot. Only replace a manually edited target when the request explicitly targets that same section and the UI confirms replacement.

- [ ] **Step 5: Connect chat to current selection**

Send the active draft ID, selected section, section index and current snapshot to `/api/ai/document-edit`. Apply returned operations through `requestDocumentEdits`/`applyLegalEdits`, then persist the returned document. Display whether the response is consultation, proposal or applied edit.

- [ ] **Step 6: Run focused and full tests**

Run: `npm test -- --run tests/ai/documentEditFlow.test.ts tests/templates/universalDocumentPipeline.test.ts tests/e2e/criticalFlows.test.ts`

Expected: all targeted tests pass.

## Task 7: Make DOCX the verified primary result

**Files:**
- Modify: `app/api/legal-engine/export/docx/route.ts`
- Modify: `lib/legal-engine/exportDocxUniversal.ts`
- Modify: `lib/legal-engine/exportGuards.ts`
- Modify: `app/machotes/page.tsx`
- Test: `tests/legal-engine/pdfExport.test.ts`
- Test: `tests/templates/exportDocx.test.ts`
- Create: `tests/e2e/generatedDocxInspection.test.ts`

- [ ] **Step 1: Add export assertions**

Assert that export rejects critical validation errors, preserves section titles, paragraph order, numbering, accents, legal characters, long text, pending markers and manually edited content. Assert that fallback metadata does not disappear from the document/workspace state.

- [ ] **Step 2: Run focused export tests to verify failure**

Run: `npm test -- --run tests/templates/exportDocx.test.ts tests/legal-engine/pdfExport.test.ts tests/e2e/generatedDocxInspection.test.ts`

Expected: new inspection assertions fail until the route and renderer agree on the final document shape.

- [ ] **Step 3: Validate before export**

Call `validateForExport` and the existing document validator in the DOCX route. Return HTTP 422 with actionable warnings for critical failures. Keep DOCX as the primary button and PDF as secondary.

- [ ] **Step 4: Inspect the generated artifact**

Generate a document fixture containing accented names, numbered facts, long paragraphs, headings, lists, pending markers and a manual edit. Write the returned DOCX to a temporary test artifact, unzip/read its XML with the existing Node runtime, and assert text/order. Then use the document rendering workflow to inspect page layout visually before accepting the end-to-end result.

- [ ] **Step 5: Run export and type checks**

Run: `npm test -- --run tests/templates/exportDocx.test.ts tests/legal-engine/pdfExport.test.ts tests/e2e/generatedDocxInspection.test.ts && npm run typecheck`

Expected: all export tests pass and TypeScript exits 0.

## Task 8: Execute the full end-to-end acceptance matrix

**Files:**
- Modify: `tests/e2e/criticalFlows.test.ts`
- Modify: `tests/e2e/rc1_full_audit.test.ts`
- Modify: `tests/templates/e2eRealCadena.test.ts`
- Create: `tests/e2e/flowAAcceptance.test.ts`
- Modify: `AUDITORIA_RELEASE_CANDIDATE_1_0.md`

- [ ] **Step 1: Add the six acceptance scenarios**

Implement tests for:

1. Valid demand upload → analysis → automatic contestation → DOCX.
2. Valid demand upload → personal template → no historical-data contamination → DOCX.
3. Valid demand upload → reference document → structural/style extraction → generated contestation.
4. Three numbered source facts → three differentiated responses with page references.
5. Manual edit of one section → localized AI edit of another → manual text unchanged.
6. Save → close/hydrate → reopen → export the same structured document without a second generation.

Include authorization tests for each endpoint and a low-quality/OCR-blocked scenario.

- [ ] **Step 2: Run the acceptance suite**

Run: `npm test -- --run tests/e2e/flowAAcceptance.test.ts tests/e2e/criticalFlows.test.ts tests/e2e/rc1_full_audit.test.ts tests/templates/e2eRealCadena.test.ts`

Expected: all Flow A scenarios pass without weakening existing assertions.

- [ ] **Step 3: Run project verification**

Run: `npm run typecheck; npm run lint; npm test -- --run; npm run build`

Expected: TypeScript exits 0, lint exits 0 with no new errors, all tests pass, and production build completes. Compare warning count to the baseline of 593 warnings.

- [ ] **Step 4: Perform manual UI verification**

Run: `npm run dev`, open `http://localhost:3200/machotes`, execute the user acceptance sequence with a real PDF/DOCX fixture, inspect analysis, select each generation mode, edit one section, use chat on another, reload/reopen the draft and download DOCX. Inspect the DOCX in Microsoft Word or a compatible renderer for layout and text integrity.

- [ ] **Step 5: Update the audit report with evidence**

Record exact commands, test counts, generated artifact path, source validation state, selected mode, provider/fallback, persistence ID, localized edit result and DOCX inspection result. Mark anything not actually executed as unvalidated rather than claiming completion.

- [ ] **Step 6: Commit when Git is available**

Run: `git add lib app components context tests docs AUDITORIA_RELEASE_CANDIDATE_1_0.md && git commit -m "feat: complete flow A document contestation"`

If `.git` remains absent, report that the implementation is uncommitted in this checkout and list the exact changed files.

## Plan self-review

- Contract coverage: tasks 1–2 cover provenance, facts, page traceability and source validation.
- Generation coverage: task 3 covers all three modes, quality, fact-by-fact drafting and lawyer style.
- Persistence coverage: task 4 covers every required reopen field and organization isolation.
- UI coverage: task 5 covers review, correction, mode selection and permanent status/progress.
- Manual-edit/chat coverage: task 6 covers authority, localized regeneration and atomic operations.
- DOCX coverage: task 7 covers validation, XML assertions and visual inspection.
- Acceptance coverage: task 8 covers the six requested scenarios and full verification.
- No unresolved placeholders such as TBD/TODO remain in the plan. The only conditional language concerns the already-observed absence of Git and must result in a reported environment limitation, not an assumed commit.

