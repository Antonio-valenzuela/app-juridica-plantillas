# GenerationTrace Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with the verification checkpoints below.

**Goal:** Instrument the existing legal-document pipeline so every observable DOCX paragraph can be traced from source and case analysis through plan, coverage, task, provider, evaluation, draft block, assembly and export, while rejecting false Coverage from placeholders and local/deterministic fallback.

**Architecture:** Add an explicit GenerationTraceContext created by runGenerationPipeline and passed through section/task execution. The context owns a sanitised, in-memory GenerationTrace; it is copied to transient generationMetadata.auditTrace only when audit mode is enabled, then updated by DOCX export and written as development/test JSON and Markdown artifacts. Provider semantics and coverage eligibility remain explicit, with no global event bus, database persistence, legal-content rewrite or renderer rewrite.

**Tech Stack:** TypeScript, Next.js 16, Vitest, existing docx exporter, Node crypto/fs APIs, PowerShell validation commands, existing Prisma/Next toolchain unchanged.

**Spec:** docs/superpowers/specs/2026-09-07-generation-trace-observability-design.md

## Global Constraints

- Preserve the accepted baseline: 106 test files; 1,886 tests passed; 1 skipped; 0 failed; typecheck passed; lint 0 errors and 973 pre-existing warnings.
- Treat the observed build EPERM in prisma generate as an environmental/pre-existing blocker while active Next processes hold the DLL; do not stop processes, change .env, or edit code to hide it.
- Reuse the existing PipelineInput.generationId and GenerationMetadata.generationId; generate one UUID only when the caller did not provide one.
- Keep GenerationTraceContext per execution; do not create a global mutable event bus or database table.
- Do not add dependencies, Prisma migrations, legal defenses, exceptions, offered evidence, invented facts, invented procedural posture, LegalIssueMatrix, multi-AI controversy generation, artificial words/pages, or broad legal-engine changes.
- providerRequested and providerActuallyUsed are separate fields; providerActuallyUsed is NVIDIA, LOCAL, or NONE, while semantic origin is AI_GENERATED_LEGAL_CONTENT, LOCAL_PLACEHOLDER, DETERMINISTIC_FALLBACK, USER, or SOURCE_DIRECT.
- Local or deterministic fallback must not become AI_GENERATED_LEGAL_CONTENT and must not satisfy a substantive CoverageItem automatically.
- Never write API keys, bearer tokens, cookies, passwords, authorization headers or unrelated private variables to trace artifacts; raw provider output is represented by hash and sizes.
- Audit artifacts are development/test outputs; transient trace metadata must be removed before legal-draft persistence and must not become a Prisma schema field.
- Keep existing function signatures source-compatible by adding optional trailing parameters/options only.
- Every implementation task begins with a focused failing test and ends with its focused test plus typecheck; run the full suite only at the final validation checkpoint.
- This checkout has no .git; do not initialize Git or invent commit commands. Each task ends with a working-tree checkpoint and recorded validation output instead of a commit.

## File Map

| File | Responsibility in this plan |
| --- | --- |
| lib/legal-engine/generationTrace.ts | Trace types, context lifecycle, IDs, timestamps, hashes and registration methods. |
| lib/legal-engine/generationTraceSanitizer.ts | Recursive allowlist/redaction and transient-trace stripping. |
| lib/legal-engine/generationTraceReports.ts | Atomic JSON/Markdown artifact writers and report rendering. |
| lib/legal-engine/coverageEligibility.ts | Single substantive-coverage guard and stable status reasons. |
| lib/legal-engine/types.ts | Additive ContentBlock provenance fields, transient audit trace metadata and origin types. |
| lib/ai/providers/types.ts | Add provider requested/actual/fallback metadata to AIProviderResult. |
| lib/ai/orchestrator.ts | Set normalized provider/fallback metadata in runFastMode. |
| lib/ai/providers/local.ts | Mark local responses as non-AI legal content. |
| lib/legal-engine/generationTasks.ts | Pass trace context, record task execution, attach block provenance and apply coverage guard. |
| lib/legal-engine/semanticEvaluator.ts | Prevent ineligible blocks from reporting covered coverage IDs. |
| lib/legal-engine/coverageMatrix.ts | Preserve explicit coverage status/reason data where the existing matrix type requires it. |
| lib/legal-engine/pipeline.ts | Create context, snapshot stages, pass context and close/attach the trace. |
| lib/legal-engine/legalDocumentSanitizer.ts | Keep trace available for export while exposing a persistence-safe stripping helper. |
| lib/legal-engine/exportGuards.ts | Preserve transient trace metadata through the export preparation clone. |
| lib/legal-engine/exportDocxUniversal.ts | Register paragraph-to-block assembly and DOCX export metadata. |
| app/api/legal-engine/generate/route.ts | Enable audit options for explicit development/audit requests without changing async job semantics. |
| app/api/legal-engine/export/docx/route.ts | Pass transient audit trace to the exporter and retain final artifact metadata. |
| app/api/legal-drafts/route.ts and app/api/legal-drafts/[id]/route.ts | Strip transient audit trace before database writes. |
| tests/legal-engine/generationTraceContext.test.ts | Core trace IDs, timestamps, snapshots and secret redaction. |
| tests/ai/generationProviderTrace.test.ts | Provider requested/actual/model/no-key/local semantics. |
| tests/legal-engine/coverageEligibility.test.ts | Placeholder/fallback false-Coverage rules and reasons. |
| tests/legal-engine/generationTaskTrace.test.ts | Per-task and DraftBlock provenance records. |
| tests/legal-engine/pipelineTrace.test.ts | End-to-end generation ID, plan/coverage snapshots and quality-gate trace. |
| tests/legal-engine/generationTraceReports.test.ts | JSON/Markdown report generation and secret absence. |
| tests/legal-engine/generationTracePersistenceBoundary.test.ts | Transient trace removal before persistence. |
| tests/legal-engine/generationTraceExport.test.ts | Assembly paragraph links, export survival and DOCX metadata. |
| tests/fixtures/generationTraceSyntheticCase.ts | Fully synthetic, explicit contestación input. |
| tests/e2e/generationTraceControlledRuns.test.ts | Same-case fallback run and conditional real-NVIDIA run with evidence. |

### Task 1: Define the trace model, context lifecycle and redaction boundary

**Files:**
- Create: lib/legal-engine/generationTrace.ts
- Create: lib/legal-engine/generationTraceSanitizer.ts
- Modify: lib/legal-engine/types.ts:1-20, 227-249, 420-450
- Test: tests/legal-engine/generationTraceContext.test.ts

**Interfaces:**
- Consumes: existing CaseAnalysis, UniversalLegalDocument, CoverageMatrix, GenerationTask, ContentBlock, QualityGateResult and AIProviderResult shapes.
- Produces: GenerationOrigin, ProviderActuallyUsed, GenerationTraceOptions, GenerationTrace, GenerationTraceContext, createGenerationTraceContext, sanitizeTraceValue, hashTraceText and stripTransientAuditTrace.

Define the additive types before changing call sites:

~~~typescript
export type GenerationOrigin =
  | 'AI_GENERATED_LEGAL_CONTENT'
  | 'LOCAL_PLACEHOLDER'
  | 'DETERMINISTIC_FALLBACK'
  | 'USER'
  | 'SOURCE_DIRECT';

export type GeneratedBy = 'AI' | 'DETERMINISTIC' | 'USER' | 'FALLBACK' | 'SOURCE_DIRECT';

export type ProviderActuallyUsed = 'NVIDIA' | 'LOCAL' | 'NONE';

export interface GenerationTraceOptions {
  enabled?: boolean;
  outputDir?: string;
  writeMarkdown?: boolean;
  now?: () => Date;
  monotonicNow?: () => number;
}

export interface GenerationTraceContext {
  readonly generationId: string;
  readonly enabled: boolean;
  readonly trace: GenerationTrace;
  snapshotCaseAnalysis(value: CaseAnalysis | undefined): void;
  snapshotDocumentPlan(value: unknown): void;
  snapshotCoverageBefore(value: CoverageMatrix | undefined): void;
  recordTaskPlanned(task: GenerationTask, contextPack?: unknown): void;
  recordTaskExecution(entry: TaskExecutionTrace): void;
  recordCoverageTransition(entry: CoverageTransitionTrace): void;
  recordDraftBlock(block: ContentBlock): void;
  recordQualityGate(result: QualityGateResult): void;
  recordAssembly(entry: AssemblyParagraphTrace): void;
  recordExport(entry: ExportTrace): void;
  addWarning(message: string): void;
  addError(message: string): void;
  close(): GenerationTrace;
}

export function createGenerationTraceContext(
  input: { generationId?: string; doc: UniversalLegalDocument; providerRequested?: string; options?: GenerationTraceOptions },
): GenerationTraceContext;
~~~

The trace must use input.generationId when present, otherwise crypto.randomUUID(). close() sets completedAt once, preserves partial errors and returns a sanitised serialisable snapshot. sanitizeTraceValue recursively redacts secret-shaped keys and values; hashTraceText returns a SHA-256 hex digest. ContentBlock gains optional additive fields generatedBy (the GeneratedBy union), provider, model, generationTaskId, generationId, fallbackStatus, fallbackReason, semanticScore and genericityClass; GenerationMetadata gains transient auditTrace?: GenerationTrace.

- [x] **Step 1: Write the failing core tests**

~~~typescript
it('creates one stable generationId and ISO timestamps', () => {
  const ctx = createGenerationTraceContext({ doc: emptyDoc(), options: { enabled: true } });
  expect(ctx.generationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(ctx.trace.startedAt).toMatch(/Z$/);
  expect(ctx.close().completedAt).toMatch(/Z$/);
});

it('redacts secrets while preserving legal structure', () => {
  const safe = sanitizeTraceValue({
    parties: { actor: 'Parte Sintética' },
    NVIDIA_API_KEY: 'nvapi-secret',
    authorization: 'Bearer token',
  });
  expect(safe).toMatchObject({ parties: { actor: 'Parte Sintética' } });
  expect(JSON.stringify(safe)).not.toMatch(/nvapi-secret|Bearer token/i);
});
~~~

- [x] **Step 2: Run the focused tests to verify failure**

Run: npm test -- --run tests/legal-engine/generationTraceContext.test.ts

Expected: FAIL because the trace module and its exported types do not exist yet.

- [x] **Step 3: Write the minimal context and types**

Create the two trace modules, use crypto.randomUUID() and crypto.createHash('sha256'), add the additive type fields, and ensure stripTransientAuditTrace removes only generationMetadata.auditTrace from a clone without mutating the original document.

- [x] **Step 4: Run focused tests and typecheck**

Run: npm test -- --run tests/legal-engine/generationTraceContext.test.ts and npm run typecheck

Expected: both commands pass with no new errors.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 1 checkpoint recorded' }

Expected: GIT_DIRECTORY=absent; Task 1 checkpoint recorded; do not initialise Git.

**Done when:** the context creates one ID, supports snapshots/registration, closes once, hashes outputs, redacts secrets, and exposes additive provenance types without changing runtime behavior of uninstrumented callers.

**Regression risks:** accidental mutation of legal documents, non-serialisable values in traces, or name collisions with existing generationMetadata.trace.

**Dependencies:** none; all later tasks consume these types.

### Task 2: Make provider semantics explicit and classify LocalProvider

**Files:**
- Modify: lib/ai/providers/types.ts:1-42
- Modify: lib/ai/orchestrator.ts:18-95
- Modify: lib/ai/providers/local.ts:1-95
- Test: tests/ai/generationProviderTrace.test.ts

**Interfaces:**
- Consumes: AIRequest, existing runFastMode, nvidia.isAvailable(), NVIDIAProvider, LocalProvider.
- Produces: optional providerRequested, providerActuallyUsed, fallbackReason, origin, isLegalAiContent fields on AIProviderResult; normalised results from runFastMode.

Use the existing lowercase AIProviderId at provider boundaries and map to the trace enum at the legal-engine boundary. A result from NVIDIA has providerActuallyUsed: 'NVIDIA', origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true. A local response has providerActuallyUsed: 'LOCAL', origin: 'LOCAL_PLACEHOLDER', isLegalAiContent: false. A deterministic task fallback has no provider and is represented later as providerActuallyUsed: 'NONE'.

- [x] **Step 1: Write failing provider tests**

~~~typescript
it('records requested NVIDIA and actual LOCAL when the key is absent', async () => {
  const result = await runFastMode({ userMessage: 'contenido jurídico', mode: 'fast' });
  expect(result.providerRequested).toBe('nvidia');
  expect(result.providerActuallyUsed).toBe('local');
  expect(result.fallbackReason).toBe('NVIDIA_NO_API_KEY');
  expect(result.origin).toBe('LOCAL_PLACEHOLDER');
  expect(result.isLegalAiContent).toBe(false);
});

it('never reports LocalProvider as complete AI legal content', async () => {
  const result = await new LocalProvider().generate({ userMessage: 'expediente 123' });
  expect(result.origin).toBe('LOCAL_PLACEHOLDER');
  expect(result.isLegalAiContent).toBe(false);
});
~~~

- [x] **Step 2: Run focused tests to verify failure**

Run: $env:NVIDIA_API_KEY=''; npm test -- --run tests/ai/generationProviderTrace.test.ts

Expected: FAIL because AIProviderResult has no semantic fields and runFastMode currently returns local success without explicit origin.

- [x] **Step 3: Implement minimum provider metadata**

Extend AIProviderResult with optional metadata, set NVIDIA success metadata in nvidia.ts only if its existing response path already returns there, set LocalProvider metadata in local.ts, and set every runFastMode fallback reason through the existing sanitised reason mapping. Do not log or return key values.

- [x] **Step 4: Run tests and typecheck**

Run: $env:NVIDIA_API_KEY=''; npm test -- --run tests/ai/generationProviderTrace.test.ts and npm run typecheck

Expected: PASS; no API key or token appears in result JSON or console assertions.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 2 checkpoint recorded' }

**Done when:** requested and actual providers, model, fallback reason and legal-content classification are available for NVIDIA, LOCAL and key-absent paths.

**Regression risks:** changing existing provider/success values, breaking callers that expect lowercase provider IDs, or treating a successful local response as AI.

**Dependencies:** Task 1 types; Task 4 and Task 5 consume these fields.

### Task 3: Add DraftBlock provenance and one substantive Coverage guard

**Files:**
- Create: lib/legal-engine/coverageEligibility.ts
- Modify: lib/legal-engine/semanticEvaluator.ts:616-700
- Modify: lib/legal-engine/generationTasks.ts:978-1088
- Modify: lib/legal-engine/coverageMatrix.ts:42-59
- Test: tests/legal-engine/coverageEligibility.test.ts

**Interfaces:**
- Consumes: ContentBlock, GenerationTask, BlockQualityEvaluation, existing Coverage statuses.
- Produces: CoverageEligibility, assessCoverageEligibility(block, item), isSubstantiveCoverageItem(item), and stable reasons VALID_SUBSTANTIVE_BLOCK, VALID_STRUCTURAL_BLOCK, PLACEHOLDER_NOT_COVERAGE, LOCAL_FALLBACK_NOT_COVERAGE, DETERMINISTIC_NOT_COVERAGE, EMPTY_OUTPUT_NOT_COVERAGE, SEMANTIC_SCORE_BELOW_THRESHOLD and NO_GENERATED_BLOCK.

Implement the guard in one module:

~~~typescript
export interface CoverageEligibility {
  eligible: boolean;
  reason: CoverageStatusReason;
}

export function assessCoverageEligibility(
  block: Pick<ContentBlock, 'text' | 'generatedBy' | 'fallbackStatus' | 'generationRequirement'>,
  item?: Pick<DocumentCoverageItem, 'category' | 'metadata'>,
): CoverageEligibility;

export function isSubstantiveCoverageItem(
  item: Pick<DocumentCoverageItem, 'category' | 'metadata'>,
): boolean;
~~~

The guard applies only when isSubstantiveCoverageItem(item) is true; an item with metadata.coverageScope === 'STRUCTURAL' is exempt so formal/structural deterministic content remains usable. For substantive items it returns ineligible for empty text, LOCAL_PLACEHOLDER, DETERMINISTIC_FALLBACK, fallbackStatus truthy, and text containing a standalone [REQUIERE...] or [DATO PENDIENTE...] marker. A non-empty deterministic block without fallback markers can remain eligible only for a structural item. evaluateBlockQuality must then leave coveredCoverageItemIds empty and put the task coverage IDs in missingCoverageItemIds; updateCoverageMatrixWithTaskResults must preserve a non-covered status and trace the reason rather than trusting success: true.

- [x] **Step 1: Write failing eligibility and semantic tests**

~~~typescript
it.each([
  ['[REQUIERE DEFINIR PRUEBAS]', 'AI', undefined, 'PLACEHOLDER_NOT_COVERAGE'],
  ['[DATO PENDIENTE: órgano]', 'AI', undefined, 'PLACEHOLDER_NOT_COVERAGE'],
  ['texto local', 'FALLBACK', 'LOCAL_PLACEHOLDER', 'LOCAL_FALLBACK_NOT_COVERAGE'],
  ['', 'FALLBACK', undefined, 'EMPTY_OUTPUT_NOT_COVERAGE'],
])('rejects %s as substantive Coverage', (text, generatedBy, fallbackStatus, reason) => {
  const result = assessCoverageEligibility({ text, generatedBy, fallbackStatus }, { category: 'CLAIM' });
  expect(result).toEqual({ eligible: false, reason });
});

it('allows non-empty deterministic content for a structural item', () => {
  const result = assessCoverageEligibility(
    { text: 'PRIMERO. Comparece la parte.', generatedBy: 'DETERMINISTIC' },
    { category: 'PROCEDURAL_REQUIREMENT', metadata: { coverageScope: 'STRUCTURAL' } },
  );
  expect(result).toEqual({ eligible: true, reason: 'VALID_STRUCTURAL_BLOCK' });
});
~~~

- [x] **Step 2: Run focused tests to verify failure**

Run: npm test -- --run tests/legal-engine/coverageEligibility.test.ts

Expected: FAIL because the guard and reason type do not exist and semantic evaluation still trusts covered IDs.

- [x] **Step 3: Implement the guard and evaluation hook**

Create the pure helper, call it before coverage IDs are accepted in evaluateBlockQuality, and make the coverage update function record the stable reason through the trace callback when a context is present. Do not change task construction or add legal content.

- [x] **Step 4: Run focused tests plus existing coverage tests**

Run: npm test -- --run tests/legal-engine/coverageEligibility.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/phase5SemanticEvaluation.test.ts and npm run typecheck

Expected: new tests pass and existing coverage/semantic tests remain green.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 3 checkpoint recorded' }

**Done when:** every forbidden placeholder/local/deterministic block is ineligible for substantive Coverage, the reason is stable, and existing eligible AI/user/source blocks retain current behavior.

**Regression risks:** overmatching legitimate legal text, changing existing weak/partial statuses, or introducing a circular import between coverage and semantic evaluator modules.

**Dependencies:** Task 1 provenance types; Task 4 uses the helper while recording blocks.

### Task 4: Trace every GenerationTask and DraftBlock

**Files:**
- Modify: lib/legal-engine/generationTasks.ts:57-129, 405-528, 573-915, 938-1088
- Modify: lib/legal-engine/semanticEvaluator.ts:616-700
- Test: tests/legal-engine/generationTaskTrace.test.ts

**Interfaces:**
- Consumes: GenerationTraceContext from Task 1, provider metadata from Task 2, eligibility from Task 3.
- Produces: optional trailing trace?: GenerationTraceContext parameter on executeGenerationTask; populated TaskExecutionTrace and DraftBlock provenance.

The compatible signature becomes:

~~~typescript
export async function executeGenerationTask(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis?: CaseAnalysis,
  customGenerator?: CustomGenerator,
  lawyerProfile?: LawyerProfile,
  siblingBlocks: ContentBlock[] = [],
  trace?: GenerationTraceContext,
): Promise<{ block: ContentBlock; result: GenerationTaskResult }>;
~~~

At task start record task IDs, section, coverage/fact/claim/evidence IDs, token budget and context-pack sizes. At provider return record requested/actual provider, model, latency, input/output UTF-8 byte sizes, continuation and retry counts, response status, output hash and fallback reason. At block creation set generationId, generationTaskId, generatedBy, provider/model, fallback fields, semantic score and genericity class. Record custom-generator, NVIDIA, local and deterministic-fallback branches without changing their legal text.

- [x] **Step 1: Write failing task trace tests**

~~~typescript
it('links task execution and DraftBlock under one generationId', async () => {
  const trace = createGenerationTraceContext({ doc: testDoc(), options: { enabled: true } });
  const { block, result } = await executeGenerationTask(task(), testDoc(), analysis(), async () => 'Hecho específico.', undefined, [], trace);
  expect(trace.trace.taskExecutions[0]).toMatchObject({ taskId: task().id, finalBlockId: block.id });
  expect(block.generationId).toBe(trace.generationId);
  expect(block.generationTaskId).toBe(task().id);
  expect(result.provider).toBeDefined();
});
~~~

- [x] **Step 2: Run focused test to verify failure**

Run: npm test -- --run tests/legal-engine/generationTaskTrace.test.ts

Expected: FAIL because the optional context parameter and task/block registration do not exist.

- [x] **Step 3: Implement minimum task instrumentation**

Thread the optional context through every branch in executeGenerationTask, reuse the existing context-pack builder and evaluator, and ensure finalBlockId is set after the final block is known. Use hashTraceText for raw output and never store the raw provider prompt or key.

- [x] **Step 4: Run focused task and regression tests**

Run: npm test -- --run tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/phase4HierarchicalGeneration.test.ts tests/legal-engine/phase5SemanticEvaluation.test.ts and npm run typecheck

Expected: all selected tests pass; task limits and existing fallback behavior remain unchanged.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 4 checkpoint recorded' }

**Done when:** every executed task has a trace entry and every generated block identifies its task, generation, provider/origin, fallback status and semantic result.

**Regression risks:** positional-argument breakage, missing instrumentation in custom-generator or revision branches, and mutated shared task objects.

**Dependencies:** Tasks 1–3; Task 5 passes the context from the pipeline.

### Task 5: Instrument pipeline snapshots and quality-gate closure

**Files:**
- Modify: lib/legal-engine/pipeline.ts:350-390, 502-510, 2351-3120
- Modify: lib/legal-engine/types.ts:420-450
- Test: tests/legal-engine/pipelineTrace.test.ts

**Interfaces:**
- Consumes: GenerationTraceContext, task instrumentation and provider/coverage semantics.
- Produces: optional PipelineInput.traceOptions?: GenerationTraceOptions, optional PipelineCallbacks.onTraceReady, and a closed generationMetadata.auditTrace in audit mode.

Add only trailing options:

~~~typescript
interface PipelineInput {
  // existing fields remain unchanged
  traceOptions?: GenerationTraceOptions;
}

interface PipelineCallbacks {
  // existing callbacks remain unchanged
  onTraceReady?: (trace: GenerationTrace) => void | Promise<void>;
}
~~~

At the start of runGenerationPipeline, create the context using the existing input.generationId or a UUID and write it into doc.generationMetadata.generationId. Snapshot the actual CaseAnalysis before generation, the DocumentPlan immediately after plan creation, and Coverage immediately before tasks. Pass the context to every generateSection call and register task/coverage transitions. After section generation, snapshot Coverage after, record the actual runQualityGateCheck result, close the trace, attach it transiently to generationMetadata.auditTrace, invoke onTraceReady, and write development/test artifacts through Task 6. If the pipeline throws, close a partial trace with errors[] before rethrowing.

- [x] **Step 1: Write failing pipeline tests**

~~~typescript
it('uses one generationId across metadata, tasks, blocks and snapshots', async () => {
  const doc = await runGenerationPipeline({
    ...syntheticInput(),
    traceOptions: { enabled: true, outputDir: tempDir },
  });
  const trace = doc.generationMetadata.auditTrace!;
  expect(trace.generationId).toBe(doc.generationMetadata.generationId);
  expect(trace.caseAnalysisSnapshot).toBeDefined();
  expect(trace.documentPlanSnapshot).toBeDefined();
  expect(trace.coverageMatrixBeforeGeneration).toBeDefined();
  expect(trace.coverageMatrixAfterGeneration).toBeDefined();
  expect(trace.qualityGateResult).toBeDefined();
});
~~~

- [x] **Step 2: Run focused test to verify failure**

Run: npm test -- --run tests/legal-engine/pipelineTrace.test.ts

Expected: FAIL because traceOptions, pipeline context creation and auditTrace attachment do not exist.

- [x] **Step 3: Implement pipeline lifecycle instrumentation**

Thread the context through section/task calls using optional trailing parameters, keep existing callbacks and metadata intact, and ensure audit mode is enabled by explicit options or NODE_ENV === 'development'/GENERATION_TRACE_ENABLED=true; leave test/production default disabled unless explicitly requested.

- [x] **Step 4: Run focused pipeline tests and existing flow tests**

Run: npm test -- --run tests/legal-engine/pipelineTrace.test.ts tests/legal-engine/flowABClosure.test.ts tests/acceptance/flowA.acceptance.test.ts and npm run typecheck

Expected: selected tests pass; existing generationMetadata.trace pipeline-step history remains available.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 5 checkpoint recorded' }

**Done when:** the pipeline produces before/after snapshots, task links, semantic evaluations, quality-gate result, warnings/errors and one common generation ID, including partial traces on errors.

**Regression risks:** duplicate IDs on regeneration, writing traces for every legacy test, losing existing callbacks, or serialising a trace into normal production documents.

**Dependencies:** Tasks 1–4; Task 6 provides artifact writing and persistence boundaries.

### Task 6: Write auditable JSON/Markdown reports and enforce the persistence boundary

**Files:**
- Create: lib/legal-engine/generationTraceReports.ts
- Modify: lib/legal-engine/legalDocumentSanitizer.ts:444-490
- Modify: app/api/legal-drafts/route.ts:90-115
- Modify: app/api/legal-drafts/[id]/route.ts:110-135
- Test: tests/legal-engine/generationTraceReports.test.ts
- Test: tests/legal-engine/generationTracePersistenceBoundary.test.ts

**Interfaces:**
- Consumes: closed GenerationTrace, redaction helpers and transient auditTrace.
- Produces: writeGenerationTraceArtifacts(trace, options), renderGenerationReportMarkdown(trace), and persistence-safe stripping used before draft create/update.

The JSON filename is generation-trace-{generationId}.json; Markdown is generation-report-{generationId}.md. The writer creates a same-directory temporary file, writes UTF-8 JSON/Markdown, renames it, and records an error without publishing a partial artifact if either operation fails. Markdown headings must be exactly the sections in the approved spec. The writer accepts an injected output directory and never reads .env or prints its contents.

- [x] **Step 1: Write failing report and persistence tests**

~~~typescript
it('writes JSON and Markdown without secrets', async () => {
  const trace = traceWith({ warnings: ['NVIDIA_API_KEY=nvapi-secret'] });
  const files = await writeGenerationTraceArtifacts(trace, { outputDir: tempDir, writeMarkdown: true });
  const json = await fs.readFile(files.jsonPath, 'utf8');
  const md = await fs.readFile(files.markdownPath, 'utf8');
  expect(JSON.parse(json).generationId).toBe(trace.generationId);
  expect(json + md).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
  expect(md).toContain('## SOURCE');
  expect(md).toContain('## DOCX EXPORT');
});

it('removes transient auditTrace before draft persistence', () => {
  const doc = docWithAuditTrace();
  const persisted = stripTransientAuditTrace(doc);
  expect(persisted.generationMetadata.auditTrace).toBeUndefined();
  expect(doc.generationMetadata.auditTrace).toBeDefined();
});
~~~

- [x] **Step 2: Run focused tests to verify failure**

Run: npm test -- --run tests/legal-engine/generationTraceReports.test.ts tests/legal-engine/generationTracePersistenceBoundary.test.ts

Expected: FAIL because report writers and persistence stripping do not exist.

- [x] **Step 3: Implement writers and route boundary**

Implement atomic writer, Markdown sections for source/case analysis/plan/coverage/tasks/providers/fallbacks/evaluations/quality/DOCX/warnings/errors, and call stripTransientAuditTrace before both legal-draft create and update persistence payloads. Do not modify Prisma schema or store traces in database.

- [x] **Step 4: Run focused tests, route typecheck and lint**

Run: npm test -- --run tests/legal-engine/generationTraceReports.test.ts tests/legal-engine/generationTracePersistenceBoundary.test.ts; npm run typecheck; and npx eslint lib/legal-engine/generationTrace.ts lib/legal-engine/generationTraceReports.ts lib/legal-engine/generationTraceSanitizer.ts app/api/legal-drafts/route.ts 'app/api/legal-drafts/[id]/route.ts'

Expected: tests pass, typecheck passes, and lint reports no new errors; existing warning volume may remain.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 6 checkpoint recorded' }

**Done when:** both artifacts are generated deterministically from a sanitised trace, reports contain all required sections, and persistence payloads cannot contain transient audit traces.

**Regression risks:** path traversal through generation IDs/output directories, partial files, report leakage, or removing metadata needed by export.

**Dependencies:** Task 1 and Task 5; Task 7 consumes the writer for final DOCX metadata.

### Task 7: Preserve paragraph provenance through DOCX assembly and export

**Files:**
- Modify: lib/legal-engine/exportGuards.ts:664-760, 936-980
- Modify: lib/legal-engine/exportDocxUniversal.ts:55-155
- Modify: app/api/legal-engine/export/docx/route.ts:25-48
- Test: tests/legal-engine/generationTraceExport.test.ts

**Interfaces:**
- Consumes: UniversalLegalDocument.generationMetadata.auditTrace, block provenance and report writer.
- Produces: optional trace?: GenerationTrace trailing parameter for exportUniversalToDocx; assemblyMetadata.paragraphs[] and exportMetadata.

Keep the visible DOCX unchanged except for metadata needed to explain existing paragraphs. For each generated title/body/list paragraph, record section ID, block ID, generation task ID, coverage IDs, paragraph index, normalised text SHA-256, style category, and omission reason. Record DOCX format, byte length, SHA-256, paragraph/style counts and export status. Preserve transient trace metadata through the export-preparation clone; do not insert hidden markers or refactor paragraph styling.

- [x] **Step 1: Write failing export trace tests**

~~~typescript
it('links a visible paragraph to block, task and coverage after export', async () => {
  const { doc, block, trace } = generatedDocWithTrace();
  const buffer = await exportUniversalToDocx(doc, undefined, trace);
  expect(buffer.subarray(0, 2).toString()).toBe('PK');
  expect(trace.assemblyMetadata.paragraphs.some((p) =>
    p.blockId === block.id && p.generationTaskId === block.generationTaskId
  )).toBe(true);
  expect(trace.exportMetadata?.byteLength).toBe(buffer.length);
});
~~~

- [x] **Step 2: Run focused test to verify failure**

Run: npm test -- --run tests/legal-engine/generationTraceExport.test.ts

Expected: FAIL because the exporter has no trace parameter or paragraph metadata.

- [x] **Step 3: Implement minimum assembly/export registration**

Add the optional trailing trace parameter, capture metadata at the same points where Paragraph objects are created, preserve the trace through assertUniversalDocumentExportable, hash the final buffer, and call writeGenerationTraceArtifacts after successful export when audit mode is enabled.

- [x] **Step 4: Run focused export and acceptance tests**

Run: npm test -- --run tests/legal-engine/generationTraceExport.test.ts tests/acceptance/exportUniversal.acceptance.test.ts tests/acceptance/viewerMachoteExport.acceptance.test.ts and npm run typecheck

Expected: all selected tests pass, the buffer remains a real ZIP DOCX, and no technical markers appear in document text.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 7 checkpoint recorded' }

**Done when:** a new DOCX paragraph resolves through the trace to its DraftBlock, task, CoverageItem and provider, while existing layout/style behavior remains unchanged.

**Regression risks:** exporter signature positional mistakes, sanitiser dropping trace metadata, paragraph index drift from spacers, or leaking trace fields into visible text.

**Dependencies:** Tasks 1, 5 and 6; Task 8 uses the final export path.

### Task 8: Add the synthetic fixture and controlled NVIDIA/fallback E2E runs

**Files:**
- Create: tests/fixtures/generationTraceSyntheticCase.ts
- Create: tests/e2e/generationTraceControlledRuns.test.ts
- Modify: app/api/legal-engine/generate/route.ts:150-260 only if explicit audit options need API pass-through
- Test: the new E2E file

**Interfaces:**
- Consumes: pipeline trace options, provider semantics, report writer and DOCX export.
- Produces: reusable syntheticContestacionInput() and controlled-run evidence records.

The fixture must state named parties, an expediente, at least four facts, two claims, three documentary elements and explicit procedural postures. It must be synthetic and contain input facts only; no legal solution or provider result is hardcoded into production code.

- [x] **Step 1: Write failing controlled-run tests**

~~~typescript
it('runs the same synthetic case without NVIDIA and records fallback truthfully', async () => {
  const doc = await runGenerationPipeline({
    ...syntheticContestacionInput(),
    traceOptions: { enabled: true, outputDir: tempDir },
    forceAiUnavailable: true,
  });
  const trace = doc.generationMetadata.auditTrace!;
  expect(trace.providerRequested).toBe('NVIDIA');
  expect(['LOCAL', 'NONE']).toContain(trace.providerActuallyUsed);
  expect(trace.generationTasks.some(t => t.origin !== 'AI_GENERATED_LEGAL_CONTENT')).toBe(true);
  expect(trace.coverageMatrixAfterGeneration.items.some(i => i.reason?.includes('NOT_COVERAGE'))).toBe(true);
});

it.skipIf(!process.env.NVIDIA_API_KEY)('does not simulate NVIDIA when the key is absent', async () => {
  const doc = await runGenerationPipeline({ ...syntheticContestacionInput(), traceOptions: { enabled: true, outputDir: tempDir } });
  expect(doc.generationMetadata.auditTrace!.providerActuallyUsed).toBe('NVIDIA');
});
~~~

- [x] **Step 2: Run the new E2E test in deterministic fallback mode**

Run: $env:NVIDIA_API_KEY=''; $env:NVIDIA_REAL_TEST='false'; npm test -- --run tests/e2e/generationTraceControlledRuns.test.ts

Expected: fallback half passes and records NVIDIA_NO_API_KEY; the NVIDIA half is skipped only when the key is absent and emits no simulated NVIDIA result.

- [x] **Step 3: Implement the fixture and controlled harness**

Build the fixture from existing legal types and runGenerationPipeline; use a temporary output directory per test; restore process environment in afterEach; write separate named DOCX/trace artifacts for fallback and real-provider runs. Do not call external NVIDIA when the key is absent.

- [x] **Step 4: Run the E2E test with the real key only when available**

Run: if($env:NVIDIA_API_KEY){ $env:NVIDIA_REAL_TEST='true'; npm test -- --run tests/e2e/generationTraceControlledRuns.test.ts } else { 'NVIDIA_REAL_BLOCKED=API key absent; fallback evidence retained; no simulation' }

Expected: with a working key, the trace proves actual NVIDIA; without it, the exact blocked status is reported and fallback remains fully tested.

- [x] **Step 5: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 8 checkpoint recorded' }

**Done when:** the same synthetic case yields independently auditable fallback and, only when externally available, real-NVIDIA traces and DOCX outputs.

**Regression risks:** fixture accidentally encoding a legal answer, network nondeterminism, API-key leakage in test output, or leaving environment variables modified.

**Dependencies:** Tasks 1–7.

### Task 9: Complete the 20 trace contracts and compare outputs

**Files:**
- Modify: tests/legal-engine/generationTraceContext.test.ts
- Modify: tests/ai/generationProviderTrace.test.ts
- Modify: tests/legal-engine/coverageEligibility.test.ts
- Modify: tests/legal-engine/generationTaskTrace.test.ts
- Modify: tests/legal-engine/pipelineTrace.test.ts
- Modify: tests/legal-engine/generationTraceReports.test.ts
- Modify: tests/legal-engine/generationTracePersistenceBoundary.test.ts
- Modify: tests/legal-engine/generationTraceExport.test.ts
- Modify: tests/e2e/generationTraceControlledRuns.test.ts

**Interfaces:**
- Consumes: all implementation contracts from Tasks 1–8.
- Produces: exactly the 20 required assertions and a comparison object with descriptive metrics.

Add assertions for: ID, requested provider, actual provider, model, secret absence, per-task trace, block-to-task link, AI/fallback origin, LocalProvider non-AI classification, generic fallback false Coverage, [REQUIERE...], [DATO PENDIENTE...], Coverage reasons, planned/generated reconstruction, generated/rendered reconstruction, post-export trace survival, one generation ID across stages, JSON report, and Markdown report. The E2E comparison records task count, real AI calls, AI/deterministic/fallback blocks, Coverage before/after counts, generic blocks, placeholders, warnings, quality-gate status and DOCX word count as descriptive data only.

- [x] **Step 1: Write any missing failing assertions**

Run the focused files from Tasks 1–8 and add only assertions for uncovered contracts; do not weaken an existing test or alter baseline tests.

- [x] **Step 2: Run the focused contract set**

Run: npm test -- --run tests/legal-engine/generationTraceContext.test.ts tests/ai/generationProviderTrace.test.ts tests/legal-engine/coverageEligibility.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/pipelineTrace.test.ts tests/legal-engine/generationTraceReports.test.ts tests/legal-engine/generationTracePersistenceBoundary.test.ts tests/legal-engine/generationTraceExport.test.ts tests/e2e/generationTraceControlledRuns.test.ts

Expected: all new contracts pass; NVIDIA is skipped only for absent external credentials.

- [x] **Step 3: Run typecheck and targeted lint**

Run: npm run typecheck and npx eslint lib/ai/orchestrator.ts lib/ai/providers/local.ts lib/ai/providers/types.ts lib/legal-engine/generationTrace.ts lib/legal-engine/generationTraceReports.ts lib/legal-engine/generationTraceSanitizer.ts lib/legal-engine/coverageEligibility.ts lib/legal-engine/generationTasks.ts lib/legal-engine/semanticEvaluator.ts lib/legal-engine/pipeline.ts lib/legal-engine/exportGuards.ts lib/legal-engine/exportDocxUniversal.ts tests/legal-engine/generationTraceContext.test.ts tests/ai/generationProviderTrace.test.ts tests/legal-engine/coverageEligibility.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/pipelineTrace.test.ts tests/legal-engine/generationTraceReports.test.ts tests/legal-engine/generationTracePersistenceBoundary.test.ts tests/legal-engine/generationTraceExport.test.ts tests/e2e/generationTraceControlledRuns.test.ts

Expected: typecheck passes; lint has no new errors, and any warnings are reported separately from the accepted baseline.

- [x] **Step 4: Record the checkpoint**

Run: if(Test-Path .git){ 'unexpected-git-directory' } else { 'GIT_DIRECTORY=absent; Task 9 checkpoint recorded' }

**Done when:** the 20 contracts are all represented by meaningful assertions, the same-case comparison is available, and no test fabricates provider availability.

**Regression risks:** brittle assertions tied to word counts, accidentally counting local output as AI, or silently skipping a required contract.

**Dependencies:** Tasks 1–8.

### Task 10: Final validation, artifact inspection and handoff evidence

**Files:**
- Modify only if a focused test exposes an implementation defect: files from Tasks 1–9.
- Inspect: generated generation-trace-*.json, generation-report-*.md, fallback DOCX and real-NVIDIA DOCX when available.
- Do not modify: existing historical tmp-flujo-a-*.docx files.

**Interfaces:**
- Consumes: complete implementation and controlled-run artifacts.
- Produces: final validation record with exact command outputs, comparison table and discovered telemetry problems.

- [x] **Step 1: Run the complete test suite**

Run: $env:NVIDIA_API_KEY=''; $env:NVIDIA_REAL_TEST='false'; npm test -- --run

Expected: existing baseline remains at least 1,886 passed and 1 skipped, plus the new tests; any failure is reported with file and error and fixed through a focused TDD cycle before proceeding.

- [x] **Step 2: Run typecheck and lint**

Run: npm run typecheck and npm run lint

Expected: typecheck succeeds; lint has 0 errors and its warning count is compared with the accepted 973-warning baseline.

- [x] **Step 3: Run build without altering the environmental condition**

Run: npm run build

Expected: either a successful build or the same prisma generate EPERM rename failure before Next while active Next processes hold the DLL. Do not stop/restart processes, change .env, or label the environmental failure as a code regression without new causal evidence.

- [x] **Step 4: Inspect new artifacts and DOCX structure**

Run: Get-ChildItem '.tmp\generation-traces' -Filter 'generation-trace-*.json'; Get-ChildItem '.tmp\generation-traces' -Filter 'generation-report-*.md'; parse JSON; unzip DOCX with existing test utilities; verify paragraph hashes, section IDs, styles, page/layout metadata and absence of technical markers. Compare fallback and real-NVIDIA artifacts only when the real run executed.

Expected: every visible generated paragraph resolves to block/task/coverage/provider; JSON/Markdown contain no secret patterns; the report distinguishes PLANIFICADO, GENERADO and RENDERIZADO.

- [x] **Step 5: Write the delivery evidence**

Record sections A–Q requested by the user: baseline, modified files, types, trace operation, actual provider, AI/fallback distinction, Coverage links, tests, NVIDIA real status, fallback status, artifact paths, DOCX paths, comparison metrics, validation, telemetry-discovered problems and next phase. State the exact external NVIDIA block if no key or network response was available; do not invent results.

**Done when:** all focused and full validations are recorded, artifacts are inspectable, the DOCX linkage is demonstrable, and the final report preserves the accepted baseline and environmental build limitation.

**Regression risks:** confusing a downloaded browser file with exporter correctness, claiming visual rendering without a renderer run, or reporting an unexecuted NVIDIA path as real.

**Dependencies:** Tasks 1–9.

## Plan self-review

### Spec coverage

- Context, common ID, timestamps, snapshots, task records, provider semantics, fallback reasons, DraftBlock provenance, coverage reasons, report artifacts, redaction, synthetic fixture, controlled runs, DOCX mapping and 20 contracts are covered by Tasks 1–10.
- The accepted baseline and EPERM handling are stated globally and validated again in Task 10.
- No database migration or broad legal-content change is included.

### Placeholder scan

The plan contains no unresolved implementation markers or unspecified error-handling steps. Every implementation step names files, interfaces, tests, command, expected result, completion criterion, regression risks and dependencies.

### Type consistency

GenerationOrigin, GeneratedBy, ProviderActuallyUsed, GenerationTraceOptions, GenerationTrace, GenerationTraceContext, CoverageEligibility, auditTrace, and the optional trailing trace parameters are defined before later tasks consume them. Existing lowercase provider IDs remain at AI boundaries; uppercase provider trace values are introduced only in the legal trace. stripTransientAuditTrace is used by persistence routes and does not remove the export-time trace before Task 7 records assembly.

## Execution handoff

The plan is complete and saved. No implementation has started. Because this checkout has no .git, checkpoints are validation records rather than commits. The next action requires the user to choose the execution workflow supported by writing-plans: executing-plans inline with checkpoints or subagent-driven-development with a fresh agent per task.

