# Issue-Scoped Multi-Call Legal Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Execute inline in the current workspace. The approved workflow forbids subagents, worktrees, Git operations, NVIDIA real calls, web research, and the full test suite.

**Goal:** Convert rich legal generation from section-level free text into independently validated, bounded, issue-scoped `IssueDraftResult` executions that become traceable `DraftBlock` instances only after validation and semantic evaluation.

**Architecture:** Add `IssueScopedGenerationExecutor` as a rich-first layer over the existing `executeGenerationTask`/`runFastMode` path. `IssueDraftResult` is the mandatory boundary between provider output, post-provider validation, issue semantic evaluation, retry, and `DraftBlock` conversion. Legacy tasks, formal deterministic content, `LEGAL_RESEARCH`, and blocked issues remain on non-provider paths.

**Tech Stack:** TypeScript, Next.js legal engine, Vitest, existing `runFastMode` provider adapter, existing semantic evaluator, existing `CoverageMatrix`, `LegalIssueMatrix`, `GenerationTrace`, and Vitest provider spies/injected invokers.

**Spec:** `docs/superpowers/specs/2026-09-08-issue-scoped-multi-call-generation-design.md`

## Global Constraints

- `LegalIssueMatrix` remains canonical rich-first; do not create another matrix.
- `legalIssueIds[]` is canonical; `targetIssueId` and `issueId` remain legacy aliases only.
- Preserve the `Coverage ↔ LegalIssue` link in `IssuePlan`, `GenerationTask`, `IssueDraftResult`, `DraftBlock`, and trace metadata; Coverage status is updated only by the existing policy.
- Issue relations remain explicit and typed as `EXPLICIT`, `UNLINKED`, or `UNKNOWN`; only `EXPLICIT` relations can resolve an issue-scoped context.
- `Claim` issues and `Fact` issues retain separate scoped inputs and validation paths; `EvidenceMention` and `EvidenceOffer` remain distinct.
- Only `READY_FOR_GENERATION` issues may call final-generation provider code.
- `NEEDS_CLIENT_POSITION`, `BLOCKED_BY_CONFLICT`, `NEEDS_RESEARCH`, `UNLINKED`, and `UNKNOWN` produce zero final-generation provider calls.
- `ClientPosition` blockers and conflict blockers remain locally plannable and traceable, but cannot reach final-generation provider code.
- `LEGAL_RESEARCH` remains plan-only and never calls a provider.
- A provider `success` is never sufficient for accepted legal content.
- Readiness is derived from structural eligibility, validation, semantic evaluation, unresolved requirements, Coverage state, and blocker state; it is never inferred from provider success.
- `VALID_NON_FINAL` is never `Coverage = covered`, `SUBSTANTIVELY_COVERED`, authority verification, conflict resolution, client-position resolution, or `canMarkAsFinal = true`.
- The existing `QualityGate` remains structural: it may report planning, tracing, blocker, research, and non-final states, but it must not turn them into a final legal response.
- The single semantic retry preserves `legalIssueId`, `generationTaskId`, `coverageItemIds`, `contextHash`, and the original allowlisted context.
- Retry may correct only the reported failed dimensions; it may not add facts, evidence, authorities, or context.
- Default concurrency is 3, configurable with a hard range of 1–4.
- Fixture F remains the only permanent fixture: 13 issues, 4 READY, 5 `NEEDS_CLIENT_POSITION`, 2 `BLOCKED_BY_CONFLICT`, 2 `NEEDS_RESEARCH`.
- Fixture F final-generation provider calls must be at most 4 and never include blockers or research-only issues.
- `EvidenceMention` and `EvidenceOffer` remain separate entities.
- Authority research status is preserved verbatim through the pack, result, and trace; `SOURCE_CITED` remains unverified, and `NEEDS_RESEARCH` remains plan-only.
- Local/provider fallback remains `LOCAL_PLACEHOLDER` or equivalent and cannot satisfy substantive Coverage.
- Formal headers, labels, signature, date, and other formal structure remain deterministic and never call a provider.
- Do not add a provider, SDK, web search, SCJN research, RAG, embeddings, vector DB, persistence, Prisma, Neon, migrations, DOCX, UI, or Windows packaging.
- Do not modify `.env`, run NVIDIA real calls, run `npm test`, run an unscoped Vitest suite, or use Git.

## File map and responsibilities

### New files

- `lib/legal-engine/issueDraftResult.ts` — canonical `IssueDraftResult`, validation statuses, allow-list checks, deterministic result hash, and safe `DraftBlock` conversion.
- `lib/legal-engine/issueScopedGeneration.ts` — issue eligibility, typed allow-listed context pack, prompt strategies/versioning, provider invocation seam, bounded executor, retry policy, isolated outcomes, and fallback coordination.
- `tests/legal-engine/issueScopedGeneration.test.ts` — all 38 FASE 4 contracts using Fixture F, immutable overrides, injected provider invokers, and deterministic deferred promises.

### Existing files to modify

- `lib/legal-engine/generationTasks.ts` — rich issue task eligibility, issue-scoped execution delegation, task status/result metadata, and canonical IDs.
- `lib/legal-engine/pipeline.ts` — bounded issue executor integration, deterministic assembly, Coverage updates, `DocumentPlan`/`IssuePlan` linkage, and preservation of legacy/formal paths.
- `lib/legal-engine/semanticEvaluator.ts` — `IssueDraftResult` component evaluation and minimal same-section redundancy checks.
- `lib/legal-engine/types.ts` — `ContentBlock.legalIssueIds`, `authorityIds`, and only the issue-result metadata required by the block contract.
- `lib/legal-engine/generationTrace.ts` — per-attempt issue trace, prompt version, context hash, result hash, and real token usage.
- `lib/legal-engine/coveragePolicy.ts` — preserve the invariant that fallback, invalid, and `VALID_NON_FINAL` issue results do not satisfy substantive Coverage.

### Explicitly unchanged

- `lib/ai/orchestrator.ts`.
- `lib/ai/providers/nvidia.ts`.
- `lib/ai/providers/local.ts`.
- `lib/legal-engine/legalIssueMatrix.ts`, except type-only imports if the compiler requires them; no second builder or matrix.
- `tests/fixtures/richCoverageFixtures.ts`; use immutable overrides in the new test file.

## Contract allocation

The 38 approved contracts are distributed as follows so every one has a named TDD home:

| Task | Contracts |
|---|---|
| 1 | 11, 12, 13, 14, 16 |
| 2 | 1, 2, 3, 4, 5, 34 |
| 3 | 6, 7, 8, 9, 10, 38 |
| 4 | 15 |
| 5 | 17, 18, 19, 20, 21, 22, 23, 24 |
| 6 | 25, 26, 27 |
| 7 | 28, 29, 30 |
| 8 | 31, 32, 33 |
| 9 | 35, 36, 37 |

The no-formal-provider assertion in contract 34 is tested with a deterministic formal section and a provider spy. The no-monolithic-prompt assertion in contract 38 is tested from the allow-listed context pack and request payload.

Shared test helpers introduced in Task 1 remain local to `issueScopedGeneration.test.ts` and are built from Fixture F: `fixtureAnalysis()`, `fixtureDocument()`, `fixtureMatrix()`, `taskForIssue(id)`, `issueWithStatus(status)`, `packFor(issueType)`, `validRawResult(overrides)`, `validResultFor(issueId, overrides)`, `passingEvaluation()`, and `aiResponse(result)`. Task 6 adds `deferredProviderResponses()`, `readyTasksForFixtureF()`, and `canonicalReadyIssueOrder()`. Task 9 adds `runIssueScopedFixtureGeneration(options)` and `aiResponseForRequest(request)`.

---

### Task 1: Define and validate `IssueDraftResult`

**Files:**

- Create: `lib/legal-engine/issueDraftResult.ts`
- Modify: `lib/legal-engine/types.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `LegalIssueItem`, `LegalIssueType`, `GenerationTask`, `ContentBlock`, `BlockQualityEvaluation`.
- Produces: `IssueDraftResult`, `IssueDraftValidation`, `IssueDraftValidationStatus`, `validateIssueDraftResult`, `hashIssueDraftResult`, `draftBlockFromIssueResult`.

- [ ] **Step 1: Write failing tests for the structured result contract.**

Add tests named `accepts a result with all required issue components`, `rejects an unexpected legalIssueId`, `rejects coverage IDs outside the issue`, `rejects source and authority IDs outside the allow-list`, `keeps SOURCE_CITED unverified`, `rejects an invented evidence offer`, `allows controlled legalDevelopment absence only with REQUIRES_LEGAL_RESEARCH`, and `does not accept provider success without a valid result`.

```ts
it('rejects an unexpected legalIssueId', () => {
  const validation = validateIssueDraftResult(validRawResult(), {
    expectedLegalIssueId: 'issue-ready-1',
    issueType: 'CLAIM_ELEMENT',
    allowedCoverageItemIds: ['cov-1'],
    allowedSourceEntityIds: ['claim-1', 'fact-1'],
    allowedAuthorityMentionIds: ['authority-1'],
    contextHash: 'ctx-1',
    promptVersion: 'CLAIM_ELEMENT_V1',
  });

  expect(validation.status).toBe('INVALID_FATAL');
  expect(validation.errors).toContain('LEGAL_ISSUE_ID_OUT_OF_SCOPE');
});
```

- [ ] **Step 2: Run the focused tests and confirm the contract is red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "IssueDraftResult|provider success|SOURCE_CITED|invented evidence"
```

Expected: FAIL because the new result type, validator, and conversion boundary do not exist.

- [ ] **Step 3: Write the canonical result type and validator.**

Define the result with the approved fields and a validation input that carries the expected issue, allowed Coverage IDs, allowed entity IDs, allowed authority IDs, `contextHash`, and `promptVersion`.

```ts
export interface IssueTokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimated?: boolean;
}

export interface IssueDraftResult {
  legalIssueId: string;
  coverageItemIds: string[];
  issueType: LegalIssueType;
  thesis: string;
  factualDevelopment: string[];
  evidentiaryDevelopment: string[];
  legalDevelopment: string[];
  counterPosition?: string;
  application: string;
  conclusion: string;
  sourceEntityIds: string[];
  authorityMentionIds: string[];
  unresolvedRequirements: string[];
  generationMetadata: {
    promptVersion: string;
    contextHash: string;
    providerRequested: string;
    providerActuallyUsed: string;
    model?: string | null;
    attemptCount: number;
    usage?: IssueTokenUsage;
  };
}

export type IssueDraftValidationStatus =
  | 'INVALID_FATAL'
  | 'INVALID_RETRYABLE'
  | 'VALID_NON_FINAL'
  | 'VALID_ACCEPTED';

export interface IssueDraftValidation {
  status: IssueDraftValidationStatus;
  result?: IssueDraftResult;
  errors: string[];
  warnings: string[];
}

export interface IssueGenerationAttempt {
  attempt: number;
  legalIssueId: string;
  taskId: string;
  coverageItemIds: string[];
  contextHash: string;
  promptVersion: string;
  status: string;
  providerRequested?: string;
  providerActuallyUsed?: string;
  model?: string | null;
  usage?: IssueTokenUsage;
}

export interface IssueGenerationOutcome {
  legalIssueId: string;
  taskId: string;
  status: 'ACCEPTED' | 'VALID_NON_FINAL' | 'FAILED' | 'BLOCKED' | 'FALLBACK';
  failureReason?: 'INSUFFICIENT' | 'VALIDATION' | 'SEMANTIC' | 'PROVIDER' | 'UNKNOWN';
  attempts: IssueGenerationAttempt[];
  result?: IssueDraftResult;
  validation?: IssueDraftValidation;
  evaluation?: unknown;
  block?: ContentBlock;
}
```

The validator must reject extra IDs, unknown requirement codes, empty required fields, placeholder markers, mismatched metadata, and evidence-offer invention. It may return `VALID_NON_FINAL` only when the result is grounded and a known unresolved requirement prevents final treatment.

- [ ] **Step 4: Implement deterministic hashing and safe block conversion.**

Hash the canonical JSON representation with sorted ID arrays and stable field order. Convert only `VALID_ACCEPTED` or explicitly `VALID_NON_FINAL` results to blocks, preserving the status distinction.

```ts
export function draftBlockFromIssueResult(
  result: IssueDraftResult,
  task: GenerationTask,
  evaluation: BlockQualityEvaluation,
): ContentBlock {
  return {
    id: `blk-${task.id}`,
    text: renderIssueComponents(result),
    generationTaskId: task.id,
    legalIssueIds: [result.legalIssueId],
    coverageItemIds: [...result.coverageItemIds],
    factIds: task.factIds || [],
    evidenceIds: task.evidenceIds || [],
    authorityIds: [...result.authorityMentionIds],
    semanticEvaluation: evaluation,
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    generatedBy: 'AI',
  };
}
```

Keep `renderIssueComponents(result): string` as a local typed formatter in the new module; it may only render validated result fields and must not add facts, authorities, evidence offers, or client-position conclusions.

Do not mark the block as covered here; Coverage policy remains a separate decision.

- [ ] **Step 5: Run the focused tests and confirm they pass.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "IssueDraftResult|provider success|SOURCE_CITED|invented evidence"
```

Expected: PASS for all Task 1 tests.

- [ ] **Step 6: Run the typecheck before advancing.**

Run:

```powershell
npm run typecheck
```

Expected: exit code 0.
 
### Task 2: Enforce READY-only issue eligibility and task metadata

**Files:**

- Create: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Modify: `lib/legal-engine/types.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `LegalIssueMatrix`, `LegalIssueItem`, `DocumentPlan`, `IssuePlan`, `GenerationTask`, existing `buildGenerationTasksForSection`.
- Produces: `IssueEligibility`, `resolveIssueEligibility`, `isFinalGenerationEligible`, canonical issue task metadata, and explicit `DocumentPlan → IssuePlan → legalIssueIds[]` linkage.

- [ ] **Step 7: Write failing eligibility and zero-call tests.**

Add tests named `READY issue creates an eligible task`, `NEEDS_CLIENT_POSITION blocks provider`, `BLOCKED_BY_CONFLICT blocks provider`, `NEEDS_RESEARCH creates plan-only research without final provider`, `UNLINKED blocks provider`, and `formal task never becomes provider eligible`. In the READY case, also assert that `DocumentPlan` materializes one linked `IssuePlan` with canonical `legalIssueIds[]` and retained Coverage IDs.

```ts
it.each([
  ['NEEDS_CLIENT_POSITION', false],
  ['BLOCKED_BY_CONFLICT', false],
  ['NEEDS_RESEARCH', false],
  ['UNLINKED', false],
  ['UNKNOWN', false],
  ['READY_FOR_GENERATION', true],
] as const)('resolves %s eligibility', (status, eligible) => {
  const result = resolveIssueEligibility(
    taskForIssue('issue-ready-1'),
    matrixWithIssueStatus(status),
    { formal: false },
  );
  expect(result.eligible).toBe(eligible);
});
```

- [ ] **Step 8: Run the eligibility tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "eligibility|zero-call|formal task"
```

Expected: FAIL because no centralized eligibility result exists.

- [ ] **Step 9: Implement the allowlisted eligibility resolver and canonical task lookup.**

Use the matrix status, not `targetIssueId`, title, or task type alone. Require one resolved rich issue, `READY_FOR_GENERATION`, non-formal scope, and a non-`LEGAL_RESEARCH` task. When materializing an `IssuePlan` inside a `DocumentPlan`, carry the canonical `legalIssueIds[]` plus Coverage IDs and the issue status; retain `issueId`/`targetIssueId` only as compatibility aliases.

```ts
export interface IssueEligibility {
  eligible: boolean;
  legalIssueId?: string;
  status: LegalIssueStatus | 'MISSING_ISSUE';
  reason: string;
}

export function isFormalIssueTask(task: GenerationTask, section: DocumentNode): boolean;

export function resolveIssueEligibility(
  task: GenerationTask,
  matrix: LegalIssueMatrix | undefined,
  options: { formal: boolean },
): IssueEligibility {
  const issueIds = task.legalIssueIds?.length
    ? task.legalIssueIds
    : task.issueId
      ? [task.issueId]
      : task.targetIssueId
        ? [task.targetIssueId]
        : [];
  if (issueIds.length !== 1) return { eligible: false, status: 'MISSING_ISSUE', reason: 'ISSUE_SCOPE_NOT_SINGLE' };
  const issue = matrix?.issues.find((candidate) => issueIds.includes(candidate.id));
  if (!issue) return { eligible: false, status: 'MISSING_ISSUE', reason: 'ISSUE_NOT_RESOLVED' };
  if (issue.relationStatus !== 'EXPLICIT') {
    return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: `RELATION_${issue.relationStatus}` };
  }
  if (options.formal) return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: 'FORMAL_DETERMINISTIC_TASK' };
  if (task.taskType === 'LEGAL_RESEARCH') return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: 'LEGAL_RESEARCH_PLAN_ONLY' };
  return issue.status === 'READY_FOR_GENERATION'
    ? { eligible: true, legalIssueId: issue.id, status: issue.status, reason: 'READY_FOR_GENERATION' }
    : { eligible: false, legalIssueId: issue.id, status: issue.status, reason: `ISSUE_STATUS_${issue.status}` };
}
```

Ensure generated tasks use plural `legalIssueIds[]`; keep singular aliases only for legacy task consumers.

- [ ] **Step 10: Run the focused eligibility tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "eligibility|zero-call|formal task"
```

Expected: PASS; blocked statuses are resolved locally and do not reach the provider seam.

- [ ] **Step 11: Run the related task regression and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/richDocumentPlan.test.ts -t "issue|legacy|formal|research"
npm run typecheck
```

Expected: both commands exit 0.

---

### Task 3: Build the allow-listed context pack and prompt strategies

**Files:**

- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `LegalIssueMatrix`, `CoverageMatrix`, `RichCaseAnalysis`, `GenerationTask`, `SourceArgument`, bounded provenance.
- Produces: `IssueContextPack`, `IssuePrompt`, `buildIssueContextPack`, `buildIssuePrompt`, prompt version constants, and scoped `SourceArgument` serialization.

- [ ] **Step 12: Write failing allow-list and isolation tests.**

Add tests named `context pack contains only selected legalIssueIds`, `claim scope isolation`, `fact scope isolation`, `evidence scope isolation`, `authority scope isolation`, `keeps EvidenceMention separate from EvidenceOffer`, and `does not serialize the complete matrix or corpus`. The scope-isolation assertions must also prove that only the linked `SourceArgument` records enter the pack and that unrelated source arguments are absent.

```ts
it('claim scope isolation excludes unrelated rich entities', () => {
  const pack = buildIssueContextPack(taskForIssue('issue-claim-1'), fixtureDocument(), fixtureAnalysis(), fixtureMatrix());
  expect(pack.legalIssue.id).toBe('issue-claim-1');
  expect(pack.claims.map((item) => item.id)).toEqual(['fixture-f-claim-1']);
  expect(pack.facts.map((item) => item.id)).not.toContain('fixture-fact-unrelated');
  expect(JSON.stringify(pack)).not.toContain('fixture-f-claim-2');
});
```

- [ ] **Step 13: Run the context tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "context pack|scope isolation|EvidenceMention|complete matrix"
```

Expected: FAIL because the new typed pack is not available.

- [ ] **Step 14: Implement `IssueContextPack` from explicit IDs only.**

Build the pack from one canonical issue, its Coverage items, and the exact related entity IDs. Keep `evidenceMentions` and `evidenceOffers` in separate arrays; include authorities with their existing verification status, bounded citation text, and only the allow-listed `SourceArgument` records linked to the issue.

```ts
export interface IssueContextPack {
  legalIssue: Pick<LegalIssueItem, 'id' | 'issueType' | 'question' | 'status' | 'relationStatus' | 'required'>;
  coverage: DocumentCoverageItem[];
  claims: Array<{ id: string; text: string; status?: string }>;
  facts: Array<{ id: string; proposition: string; assertionStatus?: string }>;
  evidenceMentions: Array<{ id: string; description?: string; relatedFactIds: string[]; status?: string }>;
  evidenceOffers: Array<{ id: string; evidenceMentionId?: string; status?: string }>;
  sourceArguments: Array<Pick<SourceArgument, 'id' | 'proposition' | 'supportingFactIds' | 'citedAuthorityIds'>>;
  authorities: Array<{ id: string; citationText: string; verificationStatus: string }>;
  clientPosition?: { status: string; propositionIds: string[] };
  provenance: SourceProvenance[];
  contextHash: string;
}
```

Throw a local scope error if an issue relation points to an entity not present in rich analysis. Do not add all of `RichCaseAnalysis`, `CoverageMatrix`, `LegalIssueMatrix`, source documents, or unrelated entities to the pack.

- [ ] **Step 15: Run the context tests and confirm green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "context pack|scope isolation|EvidenceMention|complete matrix"
```

Expected: PASS, including absence of unrelated Fixture F entities.

- [ ] **Step 16: Write failing prompt strategy/version tests.**

Add tests named `selects CLAIM_ELEMENT_V1`, `selects FACT_DISPUTE_V1`, `selects EVIDENCE_RELEVANCE_V1`, `selects EVIDENCE_SUFFICIENCY_V1`, `selects SOURCE_ARGUMENT_V1`, `selects PETITION_SUPPORT_V1`, and `prompt forbids invented law and facts`.

```ts
it('prompt uses a specialized version and structured output contract', () => {
  const prompt = buildIssuePrompt(packFor('CLAIM_ELEMENT'), taskForIssue('issue-claim-1'));
  expect(prompt.promptVersion).toBe('CLAIM_ELEMENT_V1');
  expect(prompt.systemPrompt).toContain('ÚNICAMENTE');
  expect(prompt.systemPrompt).toContain('REQUIRES_LEGAL_RESEARCH');
  expect(prompt.userMessage).toContain('legalIssueId');
  expect(prompt.userMessage).not.toContain('fixture-f-claim-2');
});
```

- [ ] **Step 17: Implement versioned strategies over a shared prompt contract.**

Use a map from `LegalIssueType` to version and focused instructions. The prompt must require `QUESTION → FACTS → EVIDENCE → RULE/AUTHORITY AVAILABLE → APPLICATION → RESPONSE → CONCLUSION`, preserve `SOURCE_ASSERTION`, distinguish mentions from offers, and prohibit new legal authorities or material facts.

```ts
const ISSUE_PROMPT_VERSIONS: Record<LegalIssueType, string> = {
  CLAIM_ELEMENT: 'CLAIM_ELEMENT_V1',
  FACT_DISPUTE: 'FACT_DISPUTE_V1',
  EVIDENCE_RELEVANCE: 'EVIDENCE_RELEVANCE_V1',
  EVIDENCE_SUFFICIENCY: 'EVIDENCE_SUFFICIENCY_V1',
  SOURCE_ARGUMENT: 'SOURCE_ARGUMENT_V1',
  PETITION_SUPPORT: 'PETITION_SUPPORT_V1',
  PROCEDURAL_ISSUE: 'ISSUE_DRAFT_V1',
  AUTHORITY_RESEARCH: 'ISSUE_DRAFT_V1',
  CONFLICT_DEPENDENCY: 'ISSUE_DRAFT_V1',
};

export interface IssuePrompt {
  promptVersion: string;
  contextHash: string;
  systemPrompt: string;
  userMessage: string;
  outputSchema: Record<string, unknown>;
}
```

`AUTHORITY_RESEARCH` and `CONFLICT_DEPENDENCY` remain non-provider paths; their versions exist only so plan/trace data is explicit if a prompt object is inspected.

- [ ] **Step 18: Run prompt tests and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "prompt|V1"
npm run typecheck
```

Expected: all prompt tests and typecheck pass.

---

### Task 4: Integrate `runFastMode` through parse and post-provider validation

**Files:**

- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Modify: `lib/legal-engine/coveragePolicy.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `IssueContextPack`, `IssuePrompt`, `validateIssueDraftResult`, `runFastMode`, `AIProviderResult`.
- Produces: injected `IssueProviderInvoker`, `parseIssueProviderOutput`, `invokeIssueProviderOnce`, explicit provider/fallback semantics.

- [ ] **Step 19: Write failing provider seam and guard tests.**

Add tests named `uses injected provider without NVIDIA`, `parses structuredOutput before content`, `parses strict JSON content`, `provider success is not accepted without validation`, `rejects invented authority post-provider`, `rejects invented material fact post-provider`, and `local fallback remains non-substantive`.

```ts
it('provider success is not accepted without validation', async () => {
  const invokeProvider = vi.fn().mockResolvedValue({
    success: true,
    content: JSON.stringify({ legalIssueId: 'other-issue', thesis: 'texto' }),
    provider: 'nvidia',
    providerActuallyUsed: 'nvidia',
    origin: 'AI_GENERATED_LEGAL_CONTENT',
  });

  const outcome = await executeIssueScopedGeneration(taskForIssue('issue-ready-1'), fixtureDocument(), fixtureAnalysis(), {
    invokeProvider,
  });

  expect(outcome.status).not.toBe('ACCEPTED');
  expect(outcome.validation?.status).toBe('INVALID_FATAL');
});
```

- [ ] **Step 20: Run the provider tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "injected provider|structuredOutput|strict JSON|provider success|invented authority|invented material fact|local fallback"
```

Expected: FAIL because the invocation seam and parser are not implemented.

- [ ] **Step 21: Implement the provider invocation seam and parser.**

Use `runFastMode` as the default invoker and permit only tests to inject an invoker. Send the issue-scoped prompt, `taskType`, `maxTokens`, `outputSchema`, and a request ID containing the task and attempt. Never send the full case analysis.

Before building the prompt or invoking either the injected provider or `runFastMode`, re-check `resolveIssueEligibility` against the canonical matrix. If the task is not a single `EXPLICIT` `READY_FOR_GENERATION` issue, return a local `BLOCKED`/`FALLBACK` outcome with `providerActuallyUsed = NONE`; the pipeline filter is an optimization, not the safety boundary.

```ts
export type IssueProviderInvoker = (request: AIRequest) => Promise<AIProviderResult>;

export interface IssueExecutorOptions {
  invokeProvider?: IssueProviderInvoker;
  maxConcurrency?: number;
  trace?: GenerationTraceContext;
}

export class IssueOutputError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
  }
}

export function executeIssueScopedGeneration(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis,
  options?: IssueExecutorOptions,
): Promise<IssueGenerationOutcome>;

export function parseIssueProviderOutput(response: AIProviderResult): unknown {
  if (response.structuredOutput) return response.structuredOutput;
  const text = String(response.content || '').trim();
  if (!text) throw new IssueOutputError('EMPTY_PROVIDER_OUTPUT', false);
  try {
    return JSON.parse(text);
  } catch {
    throw new IssueOutputError('INVALID_JSON_OUTPUT', true);
  }
}

const invokeProvider = options?.invokeProvider || runFastMode;
const response = await invokeProvider({
  systemPrompt: prompt.systemPrompt,
  userMessage: prompt.userMessage,
  outputSchema: prompt.outputSchema,
  taskType: task.taskType,
  mode: 'fast',
  maxTokens: task.tokenBudget,
  requestId: `issue:${task.id}:attempt:${attempt}`,
});
```

Treat `LOCAL_PLACEHOLDER`, `isLegalAiContent = false`, empty content, and local provider output as fallback, never as accepted structured legal content. Validate all output IDs against the pack allow-list after parsing.

- [ ] **Step 22: Run the provider tests and confirm green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "injected provider|structuredOutput|strict JSON|provider success|invented authority|invented material fact|local fallback"
```

Expected: PASS; no test accesses NVIDIA or the network.

- [ ] **Step 23: Verify `GenerationTaskResult` and Coverage semantics compile.**

Run:

```powershell
npm run typecheck
npx vitest run tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts -t "fallback|covered|Coverage"
```

Expected: exit code 0, with fallback and Coverage invariants preserved.

---

### Task 5: Add issue semantic evaluation and the single directed retry

**Files:**

- Modify: `lib/legal-engine/semanticEvaluator.ts`
- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: validated `IssueDraftResult`, `IssueContextPack`, existing evaluator helpers and thresholds.
- Produces: `IssueSemanticEvaluation`, `evaluateIssueDraftResult`, `buildTargetedIssueRetryPrompt`, one-retry outcome semantics.

- [ ] **Step 24: Write failing semantic dimension tests.**

Add tests named `evaluates specificity for the selected issue`, `evaluates factual grounding`, `evaluates evidence grounding`, `evaluates client-position consistency`, `evaluates authority discipline`, `evaluates application`, and `evaluates completeness`.

```ts
it('fails authority discipline when result cites an unavailable authority', () => {
  const result = validResultFor('issue-source-argument', {
    legalDevelopment: ['Conforme al artículo inventado 999.'],
  });
  const evaluation = evaluateIssueDraftResult(result, taskForIssue('issue-source-argument'), fixtureDocument(), packFor('SOURCE_ARGUMENT'));
  expect(evaluation.authorityDiscipline).toBe(0);
  expect(evaluation.hardFailReasons).toContain('AUTHORITY_OUT_OF_SCOPE');
  expect(evaluation.verdict).toBe('FAIL');
});
```

- [ ] **Step 25: Run semantic tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "specificity|factual grounding|evidence grounding|client-position|authority discipline|application|completeness"
```

Expected: FAIL because no issue-level evaluator exists.

- [ ] **Step 26: Implement the component evaluator.**

Define the explicit dimensions and reuse existing factual/evidence/issue/repetition helpers where possible. Do not evaluate whether a legal rule is substantively correct; evaluate only grounding, discipline, applicability of available components, and response completeness.

```ts
export interface IssueSemanticEvaluation {
  legalIssueId: string;
  taskId: string;
  specificity: number;
  factualGrounding: number;
  evidenceGrounding: number;
  positionConsistency: number;
  authorityDiscipline: number;
  application: number;
  completeness: number;
  overallScore: number;
  verdict: 'PASS' | 'WEAK' | 'FAIL';
  revisionMode: RevisionMode;
  deficiencies: string[];
  hardFailReasons: string[];
}

export function evaluateIssueDraftResult(
  result: IssueDraftResult,
  task: GenerationTask,
  doc: UniversalLegalDocument,
  pack: IssueContextPack,
): IssueSemanticEvaluation;
```

Use hard failures for out-of-scope IDs, invented authorities/facts in controlled patterns, evidence-offer invention, contradiction with confirmed client position, and empty required components. Use `WEAK` for repairable missing application/evidence connection/specificity.

- [ ] **Step 27: Run semantic tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "specificity|factual grounding|evidence grounding|client-position|authority discipline|application|completeness"
```

Expected: PASS for all seven dimensions.

- [ ] **Step 28: Write failing retry and `VALID_NON_FINAL` tests.**

Add tests named `performs one targeted retry for a repairable semantic failure`, `retry preserves issue task coverage and context hash`, `retry does not receive expanded context`, `second failure yields FAILED/INSUFFICIENT`, `does not perform a third attempt`, and `VALID_NON_FINAL never satisfies Coverage or final readiness`.

```ts
it('retry preserves identity and scope', async () => {
  const invokeProvider = vi.fn()
    .mockResolvedValueOnce(aiResponse(validResultFor('issue-ready-1', { application: '' })))
    .mockResolvedValueOnce(aiResponse(validResultFor('issue-ready-1')));
  const task = taskForIssue('issue-ready-1');

  const outcome = await executeIssueScopedGeneration(task, fixtureDocument(), fixtureAnalysis(), { invokeProvider });

  expect(invokeProvider).toHaveBeenCalledTimes(2);
  expect(outcome.legalIssueId).toBe('issue-ready-1');
  expect(outcome.attempts.every((attempt) => attempt.contextHash === outcome.attempts[0].contextHash)).toBe(true);
  expect(outcome.attempts[1].promptVersion).toBe(outcome.attempts[0].promptVersion);
  expect(outcome.attempts[1].coverageItemIds).toEqual(outcome.attempts[0].coverageItemIds);
});
```

- [ ] **Step 29: Run retry tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "retry|VALID_NON_FINAL|third attempt|FAILED/INSUFFICIENT"
```

Expected: FAIL because retry classification and non-final semantics are not connected.

- [ ] **Step 30: Implement one directed retry with immutable scope.**

Retry only a repairable semantic/validation deficiency. Build a new instruction from the deficiency while reusing the exact context pack, `contextHash`, issue ID, task ID, Coverage IDs, and prompt version. Do not retry blockers, local fallback, invented authority/fact, client contradiction, or fatal schema errors.

```ts
const MAX_SEMANTIC_RETRIES_PER_ISSUE = 1;

if (evaluation.verdict === 'WEAK' && isRepairable(evaluation) && attempt === 1) {
  const retryPrompt = buildTargetedIssueRetryPrompt(prompt, evaluation.deficiencies);
  return runAttempt({
    attempt: 2,
    task,
    pack,
    prompt: retryPrompt,
    contextHash: pack.contextHash,
  });
}
```

When a result is structurally valid and grounded but has a known non-final condition, return `VALID_NON_FINAL`; never call `updateCoverageMatrixWithTaskResults` as if it were accepted.

- [ ] **Step 31: Run retry tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "retry|VALID_NON_FINAL|third attempt|FAILED/INSUFFICIENT"
```

Expected: PASS; second failure produces `FAILED/INSUFFICIENT` and exactly two attempts maximum.

- [ ] **Step 32: Run semantic regressions and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts -t "semantic|fallback|covered|quality"
npm run typecheck
```

Expected: exit code 0.

---

### Task 6: Implement bounded concurrency, independent failures, and fallback outcomes

**Files:**

- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Modify: `lib/legal-engine/pipeline.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `executeIssueScopedGeneration`, `IssueEligibility`, `IssueExecutorOptions`, `GenerationTask`, `IssueGenerationOutcome`.
- Produces: `executeReadyIssueTasks`, deterministic sorted outcomes, bounded concurrency, and isolated failures.

- [ ] **Step 33: Write failing bounded-executor tests.**

Add tests named `limits concurrent provider calls to three`, `respects configured concurrency bounds one through four`, `orders outcomes by section plan and issue ID rather than completion`, `isolates one failed issue from passing issues`, and `does not call provider for a blocked issue or local fallback`.

```ts
it('limits concurrent provider calls to three and preserves deterministic order', async () => {
  const deferred = deferredProviderResponses();
  const invokeProvider = vi.fn(deferred.invoke);
  const tasks = readyTasksForFixtureF();

  const pending = executeReadyIssueTasks(tasks, fixtureDocument(), fixtureAnalysis(), {
    invokeProvider,
    maxConcurrency: 3,
  });
  expect(deferred.maxActive()).toBe(3);
  deferred.resolveInReverseOrder();
  const outcomes = await pending;

  expect(outcomes.map((item) => item.legalIssueId)).toEqual(canonicalReadyIssueOrder());
  expect(invokeProvider).toHaveBeenCalledTimes(4);
});
```

- [ ] **Step 34: Run executor tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "concurrent|configured concurrency|completion|isolates|blocked issue|local fallback"
```

Expected: FAIL because there is no bounded worker pool.

- [ ] **Step 35: Implement the deterministic bounded worker pool.**

Validate `maxConcurrency` in 1–4, sort tasks before dispatch, start no more workers than the limit, and catch each task error into an isolated outcome.

```ts
export function buildBlockedIssueOutcome(
  task: GenerationTask,
  matrix: LegalIssueMatrix | undefined,
): IssueGenerationOutcome;

export async function executeReadyIssueTasks(
  tasks: GenerationTask[],
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis,
  options: IssueExecutorOptions = {},
): Promise<IssueGenerationOutcome[]> {
  const limit = clampConcurrency(options.maxConcurrency ?? 3);
  const ordered = [...tasks].sort(compareIssueTasks);
  const results: IssueGenerationOutcome[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < ordered.length) {
      const task = ordered[cursor++];
      try {
        results.push(await executeIssueScopedGeneration(task, doc, caseAnalysis, options));
      } catch (error) {
        results.push(failedIssueOutcome(task, error));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, ordered.length) }, worker));
  return results.sort(compareOutcomes);
}
```

Blocked tasks must be represented as local `BLOCKED` outcomes without invoking `invokeProvider`. The worker pool must not include `LEGAL_RESEARCH`, formal tasks, or non-READY issues.

- [ ] **Step 36: Run executor tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "concurrent|configured concurrency|completion|isolates|blocked issue|local fallback"
```

Expected: PASS; four Fixture F READY tasks produce at most four provider calls, with at most three active.

- [ ] **Step 37: Integrate isolated outcomes with task status and fallback metadata.**

Update `GenerationTask` and `GenerationTaskResult` so each outcome records `legalIssueId`, `attemptCount`, validation status, evaluation, provider metadata, fallback reason, and generated block IDs. Provider/local errors for one issue must not mutate another task.

`IssueGenerationOutcome` and `IssueGenerationAttempt` are the shared contracts defined in Task 1; this task adds the executor options and worker implementation around them.

- [ ] **Step 38: Run integration tests and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "outcome|fallback|failed issue|provider calls"
npm run typecheck
```

Expected: exit code 0; local fallback remains non-substantive.

---

### Task 7: Convert accepted results to blocks and assemble deterministically

**Files:**

- Modify: `lib/legal-engine/types.ts`
- Modify: `lib/legal-engine/issueDraftResult.ts`
- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/pipeline.ts`
- Modify: `lib/legal-engine/coveragePolicy.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: `IssueGenerationOutcome[]`, `IssueDraftResult`, `IssueSemanticEvaluation`, existing section plans and Coverage policy.
- Produces: `assembleIssueDraftBlocks`, `deduplicateIssueBlocks`, block metadata, and Coverage-safe status updates.

- [ ] **Step 39: Write failing block, assembly, Coverage, and duplicate tests.**

Add tests named `accepted result preserves legalIssueIds and authorityIds`, `section contains multiple separate issue blocks`, `assembly order ignores provider completion order`, `VALID_NON_FINAL does not cover substantive Coverage`, `fallback does not cover substantive Coverage`, `exact duplicate same issue is not appended twice`, and `different issues remain separately traceable when text overlaps`.

```ts
it('accepted result preserves all traceability IDs', () => {
  const block = draftBlockFromIssueResult(validResultFor('issue-ready-1'), taskForIssue('issue-ready-1'), passingEvaluation());
  expect(block.legalIssueIds).toEqual(['issue-ready-1']);
  expect(block.coverageItemIds).toEqual(['cov-ready-1']);
  expect(block.authorityIds).toEqual(['authority-1']);
  expect(block.generationTaskId).toBe('task-issue-ready-1');
});
```

- [ ] **Step 40: Run block tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "preserves.*IDs|multiple.*blocks|assembly order|VALID_NON_FINAL|fallback does not cover|duplicate|overlap"
```

Expected: FAIL because block fields and deterministic issue assembly are not integrated.

- [ ] **Step 41: Add block traceability fields and conversion.**

Extend `ContentBlock` with `legalIssueIds?: string[]` and `authorityIds?: string[]`. Render components in the fixed order `thesis`, factual, evidentiary, legal, counter-position, application, conclusion; preserve result metadata outside opaque text.

```ts
export interface ContentBlock {
  // existing fields
  legalIssueIds?: string[];
  authorityIds?: string[];
}
```

Conversion must carry `coverageItemIds`, `generationTaskId`, `factIds`, `evidenceIds`, provider/model, fallback state, generation ID, semantic evaluation, and revision metadata.

- [ ] **Step 42: Implement deterministic assembly and minimal deduplication.**

Sort accepted/non-final/fallback blocks by section order, plan order, and legal issue ID. Preserve one block per issue. For exact duplicate text from the same issue, keep the first and record the second as a duplicate outcome; for different issues, keep both and emit a warning.

```ts
export function assembleIssueDraftBlocks(
  section: DocumentNode,
  outcomes: IssueGenerationOutcome[],
): { blocks: ContentBlock[]; warnings: string[] } {
  const ordered = outcomes.filter((item) => item.block).sort(compareOutcomes);
  const seenByIssueAndText = new Set<string>();
  const blocks: ContentBlock[] = [];
  const warnings: string[] = [];
  for (const outcome of ordered) {
    const block = outcome.block!;
    const key = `${block.legalIssueIds?.join(',')}|${normalizeBlockText(block.text)}`;
    if (seenByIssueAndText.has(key)) {
      warnings.push(`DUPLICATE_ISSUE_BLOCK:${outcome.legalIssueId}`);
      continue;
    }
    seenByIssueAndText.add(key);
    blocks.push(block);
  }
  return { blocks, warnings };
}
```

Use existing `isCoverageSatisfied` only for accepted substantive blocks. Explicitly prevent `VALID_NON_FINAL`, `LOCAL_PLACEHOLDER`, deterministic fallback, failed validation, and failed semantic evaluation from marking substantive Coverage as covered. Feed those distinctions into the existing structural `QualityGate`: readiness may remain false or non-final while planning, tracing, blocker reporting, and research-task creation continue to work.

- [ ] **Step 43: Run block and assembly tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "preserves.*IDs|multiple.*blocks|assembly order|VALID_NON_FINAL|fallback does not cover|duplicate|overlap"
```

Expected: PASS; completion order never changes section order and issue blocks remain separately identifiable.

- [ ] **Step 44: Run Coverage regressions and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts -t "covered|fallback|Coverage|block"
npm run typecheck
```

Expected: exit code 0.

---

### Task 8: Add per-attempt GenerationTrace and token observability

**Files:**

- Modify: `lib/legal-engine/generationTrace.ts`
- Modify: `lib/legal-engine/issueScopedGeneration.ts`
- Modify: `lib/legal-engine/generationTasks.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: issue outcomes, provider responses, validation/evaluation results, existing trace context.
- Produces: `IssueGenerationAttemptTrace`, `recordIssueGenerationAttempt`, trace linkage and token usage fields.

- [ ] **Step 45: Write failing trace tests.**

Add tests named `trace records issue task provider validation evaluation and accepted block`, `trace records attempt one and directed retry`, `trace records contextHash and promptVersion without full prompt`, `trace records real token usage when supplied`, and `trace leaves token usage null when absent`.

```ts
it('records two attempts without storing the complete prompt', async () => {
  const trace = createGenerationTraceContext({ doc: fixtureDocument(), options: { enabled: true } });
  const outcome = await executeIssueScopedGeneration(taskForIssue('issue-ready-1'), fixtureDocument(), fixtureAnalysis(), {
    trace,
    invokeProvider: retryingProvider(),
  });
  const closed = trace.close();

  expect(closed.issueGenerationAttempts.map((entry) => entry.attempt)).toEqual([1, 2]);
  expect(closed.issueGenerationAttempts.every((entry) => entry.legalIssueId === 'issue-ready-1')).toBe(true);
  expect(JSON.stringify(closed)).not.toContain('Eres un motor forense');
  expect(outcome.legalIssueId).toBe('issue-ready-1');
});
```

- [ ] **Step 46: Run trace tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "trace records|attempt one|contextHash|promptVersion|token usage|complete prompt"
```

Expected: FAIL because the trace has no issue-attempt collection or record method.

- [ ] **Step 47: Implement per-attempt trace fields and recording.**

Add a sanitized `issueGenerationAttempts` collection to `GenerationTrace` and a `recordIssueGenerationAttempt` method to `GenerationTraceContext`.

```ts
export interface IssueGenerationAttemptTrace {
  legalIssueId: string;
  taskId: string;
  attempt: number;
  coverageItemIds: string[];
  promptVersion: string;
  contextHash: string;
  providerRequested: string;
  providerActuallyUsed: string;
  model?: string | null;
  outcome: 'PROVIDER_SUCCESS' | 'VALIDATION_FAILED' | 'SEMANTIC_FAILED' | 'ACCEPTED' | 'FALLBACK' | 'BLOCKED';
  validationStatus?: string;
  resultHash?: string;
  evaluation?: unknown;
  usage?: IssueTokenUsage;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}
```

Record `usage.promptTokens`, `completionTokens`, and `totalTokens` exactly when returned. Use `null` when missing; set `estimated = true` only for an explicitly approximate metric. Sanitize output and never store the full system/user prompt.

- [ ] **Step 48: Connect every attempt, task execution, and block to the trace.**

At attempt start, record issue/task/context/prompt metadata. At provider return, record provider metadata and usage. At validation/evaluation, record outcome and hashes. At conversion, preserve `legalIssueIds` in task execution and block trace.

```ts
trace?.recordIssueGenerationAttempt({
  legalIssueId: issue.id,
  taskId: task.id,
  attempt,
  coverageItemIds: [...(task.coverageItemIds || [])],
  promptVersion: prompt.promptVersion,
  contextHash: pack.contextHash,
  providerRequested: providerResult.providerRequested || 'nvidia',
  providerActuallyUsed: providerResult.providerActuallyUsed || 'none',
  model: providerResult.model || null,
  outcome,
  validationStatus: validation?.status,
  resultHash: result ? hashIssueDraftResult(result) : undefined,
  evaluation,
  usage: providerResult.usage
    ? { ...providerResult.usage, estimated: false }
    : undefined,
  startedAt,
  completedAt: new Date().toISOString(),
});
```

- [ ] **Step 49: Run trace tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "trace records|attempt one|contextHash|promptVersion|token usage|complete prompt"
```

Expected: PASS with per-attempt identity and no complete prompt leakage.

- [ ] **Step 50: Run trace regressions and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts -t "trace|task|Coverage|provider"
npm run typecheck
```

Expected: exit code 0.

---

### Task 9: Integrate Fixture F, preserve legacy/non-labor behavior, and wire the pipeline

**Files:**

- Modify: `lib/legal-engine/generationTasks.ts`
- Modify: `lib/legal-engine/pipeline.ts`
- Modify: `lib/legal-engine/semanticEvaluator.ts`
- Modify: `lib/legal-engine/coveragePolicy.ts`
- Test: `tests/legal-engine/issueScopedGeneration.test.ts`

**Interfaces:**

- Consumes: all previous task interfaces, Fixture F builder, existing pipeline section plans, legacy task path.
- Produces: rich-first issue execution in the pipeline while preserving legacy, formal deterministic, and non-labor regressions.

- [ ] **Step 51: Write failing end-to-end-focused integration tests with injected providers.**

Add tests named `Fixture F calls final-generation provider only for four READY issues`, `Fixture F produces zero calls for client-position blockers`, `Fixture F produces zero calls for conflicts`, `Fixture F produces zero final-generation calls for research`, `legacy analysis remains available`, `non-labor document remains available`, `formal section uses zero provider calls`, and `no monolithic document prompt is emitted`.

```ts
it('Fixture F calls final-generation provider only for four READY issues', async () => {
  const invokeProvider = vi.fn().mockImplementation(async (request: AIRequest) => aiResponseForRequest(request));
  const result = await runIssueScopedFixtureGeneration({ invokeProvider });
  const calls = invokeProvider.mock.calls.map(([request]) => request.legalContext?.legalIssueId);

  expect(result.matrix.summary.total).toBe(13);
  expect(result.matrix.summary.readyForGeneration).toBe(4);
  expect(calls).toHaveLength(4);
  expect(new Set(calls)).toEqual(new Set(result.readyIssueIds));
  expect(result.blockedIssueIds.every((id) => !calls.includes(id))).toBe(true);
  expect(result.researchIssueIds.every((id) => !calls.includes(id))).toBe(true);
});
```

- [ ] **Step 52: Run integration tests and confirm red.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "Fixture F|legacy analysis|non-labor|formal section|monolithic document prompt"
```

Expected: FAIL because the pipeline still needs to delegate eligible rich tasks to the bounded executor and assemble outcomes.

- [ ] **Step 53: Wire rich pipeline execution without changing provider or legacy paths.**

In the existing hierarchical section path, derive the canonical matrix from the document, build tasks with plural IDs, send only eligible rich material tasks to `executeReadyIssueTasks`, and append returned blocks through deterministic assembly. Keep the existing legacy `executeGenerationTask` path when there is no rich matrix. Keep formal tasks deterministic.

Extend the existing pipeline input type with the testable provider seam and concurrency setting:

```ts
interface PipelineInput {
  // existing fields
  issueProviderInvoker?: IssueProviderInvoker;
  maxIssueConcurrency?: number;
}
```

```ts
const richIssueTasks = tasks.filter((task) => {
  const eligibility = resolveIssueEligibility(task, doc.legalIssueMatrix, { formal: isFormalIssueTask(task, section) });
  return eligibility.eligible;
});
const issueOutcomes = await executeReadyIssueTasks(richIssueTasks, doc, caseAnalysis, {
  invokeProvider: options.issueProviderInvoker,
  maxConcurrency: options.maxIssueConcurrency ?? 3,
  trace,
});
const assembled = assembleIssueDraftBlocks(section, issueOutcomes);
section.content.push(...assembled.blocks);
for (const warning of assembled.warnings) trace?.addWarning(warning);
```

Blocked and research tasks remain planned/traced locally. Do not pass the whole `CaseAnalysis`, `CoverageMatrix`, or `LegalIssueMatrix` to an issue provider request; only the typed pack is serialized.

- [ ] **Step 54: Preserve legacy and non-labor branches explicitly.**

Keep the existing fallback adapter for `richCaseAnalysis` absence and ensure `LegalIssue` DTO fields continue to work through the existing aliases. Run no provider for formal deterministic sections and no new issue generation for legacy-only data.

```ts
if (!caseAnalysis?.richCaseAnalysis) {
  return executeLegacyTaskPath(task, doc, caseAnalysis, existingGenerator, trace);
}
if (isFormalIssueTask(task, section) || !resolveIssueEligibility(task, matrix, { formal: false }).eligible) {
  return buildBlockedIssueOutcome(task, matrix);
}
return executeIssueScopedGeneration(task, doc, caseAnalysis, options);
```

Extract the current non-rich branch into the explicitly typed `executeLegacyTaskPath(task, doc, caseAnalysis, existingGenerator, trace): Promise<IssueGenerationOutcome>`, keeping its output and aliases unchanged. `buildBlockedIssueOutcome(task, matrix)` is the local outcome produced by Task 6.

- [ ] **Step 55: Run the integration tests and verify green.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts -t "Fixture F|legacy analysis|non-labor|formal section|monolithic document prompt"
```

Expected: PASS; Fixture F has exactly four or fewer final-generation calls, blockers/research have zero, and legacy/non-labor paths remain available.

- [ ] **Step 56: Run all directly related regressions and typecheck.**

Run:

```powershell
npx vitest run tests/legal-engine/richCoverageBuilder.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts
npm run typecheck
```

Expected: all selected tests pass and typecheck exits 0.

---

### Task 10: Focused final validation

**Files:**

- Test: `tests/legal-engine/issueScopedGeneration.test.ts` and the directly related regression files listed below.
- Validate: all FASE 4 files and the approved file boundary.

**Interfaces:**

- Consumes: completed Tasks 1–9.
- Produces: reproducible focal validation evidence; no code changes.

- [ ] **Step 57: Run the complete FASE 4 focal test file only.**

Run:

```powershell
npx vitest run tests/legal-engine/issueScopedGeneration.test.ts
```

Expected: all FASE 4 tests pass, including all 38 named contracts.

- [ ] **Step 58: Run the directly related regression set.**

Run:

```powershell
npx vitest run tests/legal-engine/richCoverageBuilder.test.ts tests/legal-engine/richCoverageLegacyRegression.test.ts tests/legal-engine/richDocumentPlan.test.ts tests/legal-engine/richGenerationTasks.test.ts tests/legal-engine/phase3CoverageMatrix.test.ts tests/legal-engine/generationTaskTrace.test.ts tests/legal-engine/richCoverageQualityTrace.test.ts
```

Expected: every selected regression passes. Do not run `npm test` or an unscoped Vitest command.

- [ ] **Step 59: Run the final typecheck.**

Run:

```powershell
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 60: Run the final lint.**

Run:

```powershell
npm run lint
```

Expected: exit code 0. Report warnings separately; do not broaden FASE 4 to clean unrelated lint debt.

- [ ] **Step 61: Run the final production build.**

Run:

```powershell
npm run build
```

Expected: exit code 0. This is the last validation command; do not add a full suite, NVIDIA call, web lookup, DOCX check, or Git operation.

## Final handoff checklist

Before declaring the implementation complete, verify the following from the focal output and trace assertions:

- `IssueDraftResult` is the mandatory provider-to-block boundary.
- Provider calls are restricted to `READY_FOR_GENERATION` issues.
- Fixture F has 13 issues and no more than four final-generation provider calls.
- Client-position, conflict, research, unlinked, unknown, and formal paths have zero final-generation provider calls.
- Context packs contain only explicit issue relationships and bounded provenance.
- No authority, material fact, evidence offer, or client-position conclusion is invented post-provider.
- `SOURCE_CITED` remains unverified.
- One retry maximum preserves issue/task/Coverage/context identity and does not expand scope.
- `VALID_NON_FINAL` is traceable but cannot satisfy substantive Coverage or final readiness.
- One issue failure does not discard passing independent issues.
- Assembly order is deterministic and independent of completion order.
- DraftBlocks preserve `legalIssueIds[]`, `authorityIds[]`, Coverage, task, evaluation, provider, and fallback metadata.
- GenerationTrace records each attempt, prompt version, context hash, result hash, evaluation, and real usage when available.
- QualityGate remains structural and reports unresolved readiness, Coverage, client-position, conflict, research, and non-final conditions without converting any of them into a final response.
- Legacy behavior, non-labor behavior, formal deterministic behavior, and Coverage fallback invariants remain green.
