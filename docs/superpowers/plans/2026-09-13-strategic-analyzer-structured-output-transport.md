# Strategic Analyzer Structured Output Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transport the existing strategic analyzer output contract to NVIDIA as structured JSON, preserve fail-closed validation, and measure one real post-GREEN response without creating a fallback candidate.

**Architecture:** Reuse the existing `AIRequest.outputSchema` shape. The strategic analyzer supplies one allowlisted JSON Schema to its completion boundary; `NVIDIAProvider` forwards that schema to the OpenAI-compatible NVIDIA request as `response_format.type=json_schema`. The analyzer remains the owner of candidate parsing and semantic validation, while the provider exposes the actual HTTP status for its audit.

**Tech Stack:** TypeScript, Vitest, Vitest `vi` transport isolation, `undici`, NVIDIA OpenAI-compatible Chat Completions API.

**Spec:** Latest user checkpoint: `STRATEGIC ANALYZER FAILED SAFE` → `STRATEGIC ANALYZER STRUCTURED OUTPUT TRANSPORT`.

## Global Constraints

- Keep all listed closed contracts unchanged unless a new failing regression directly proves the transport boundary requires a change.
- Do not change the strategic semantic validator, research verification, generation tasks, NVIDIA model selection, assembly, or editor paths.
- Use deterministic transport configuration; no LLM decides source relations and no retry or second analyzer call is introduced.
- Preserve `0..N`, exact model-owned/system-owned fields, allowlists, provenance, client-position blockers, and fail-closed malformed-output behavior.
- Use one real NVIDIA call only after controlled GREEN and independent review; do not perform legal web research or research-provider calls.
- Baseline for comparison is `2527 PASS / 6 FAIL / 2 skipped`; the six known historical failures are not part of this phase.

---

### Task 1: Freeze the transport contract and RED

**Files:**
- Modify: `tests/legal-engine/strategicChallengeDiscovery.test.ts`
- Create: `tests/ai/nvidiaStructuredOutput.test.ts`
- Read: `lib/ai/providers/types.ts`, `lib/ai/providers/nvidia.ts`, `lib/legal-engine/legal-strategy/realStrategicChallengeAnalyzer.ts`

**Interfaces:**
- Consumes: existing `AIRequest.outputSchema`, `NVIDIACompletionOptions`, and injected `StrategicChallengeAnalyzerCompletion`.
- Produces: failing tests that prove the schema is currently absent at analyzer→completion and completion→HTTP boundaries.

- [x] **Step 1: Add analyzer-boundary RED.** Capture the injected completion options and assert that the request includes the strategic JSON Schema with `type: "object"`, top-level `candidates`, and `additionalProperties: false`.
- [x] **Step 2: Add HTTP-boundary RED.** Mock only `undici.fetch`, call `generateNVIDIACompletion` with `outputSchema`, parse the body, and assert `response_format.type === "json_schema"`, `strict === true`, and the exact schema is forwarded.
- [x] **Step 3: Add strict response RED cases.** Assert that a fenced JSON response and a response with a prose envelope do not become candidates; assert two valid candidates remain two candidates and one valid plus one invalid candidate rejects only the invalid record.
- [x] **Step 4: Run the focused tests and record the expected failure.**

Run: `npx vitest run tests/legal-engine/strategicChallengeDiscovery.test.ts tests/ai/nvidiaStructuredOutput.test.ts`

Expected: the existing analyzer/transport implementation fails because no `outputSchema` is sent and the NVIDIA body has no `response_format`; the pre-existing tests remain the control evidence.

### Task 2: Implement the minimum transport repair

**Files:**
- Modify: `lib/ai/providers/nvidia.ts:6-20,50-121,138-169`
- Modify: `lib/legal-engine/legal-strategy/realStrategicChallengeAnalyzer.ts:1-20,66-82,283-344,349-449`

**Interfaces:**
- Consumes: the existing `Record<string, any>` output-schema contract from `AIRequest`.
- Produces: `NVIDIACompletionOptions.outputSchema`, an HTTP `response_format` only when a schema is supplied, `NVIDIACompletionResult.httpStatus`, and a strategic analyzer schema owned by the analyzer contract.

- [x] **Step 1: Define the exact strategic output schema.** Export one `STRATEGIC_CHALLENGE_OUTPUT_SCHEMA` with only `candidates` and the six existing proposal fields; set `additionalProperties: false` at both object levels and keep the candidate array `0..N`.
- [x] **Step 2: Pass the schema from `runRealStrategicChallengeAnalyzer`.** Keep the existing prompt, temperature, max-token budget, and exactly-one completion invocation unchanged; add only `outputSchema: STRATEGIC_CHALLENGE_OUTPUT_SCHEMA`.
- [x] **Step 3: Extend the NVIDIA completion option using the existing schema shape.** Add optional `outputSchema?: Record<string, unknown>`; when present, serialize `response_format: { type: "json_schema", json_schema: { name: "nvidia_structured_output", strict: true, schema: options.outputSchema } }`. Preserve the old body when absent.
- [x] **Step 4: Forward `request.outputSchema` from `NVIDIAProvider.generate`.** Do not alter provider selection, fallback, model, or generation semantics.
- [x] **Step 5: Expose `response.status` as `NVIDIACompletionResult.httpStatus`.** Use it only for analyzer observability; errors still fail closed.
- [x] **Step 6: Parse this structured analyzer response with `JSON.parse(raw.trim())` only.** Do not modify the shared tolerant extractor; fenced/prose envelopes are rejected as transport-contract violations.
- [x] **Step 7: Add `rawChars` to the analyzer audit and use the completion HTTP status when available.** Preserve `NOT_EXPOSED_BY_TRANSPORT` only for injected completions that do not supply a status.

### Task 3: Controlled GREEN and regression checks

**Files:**
- Test: `tests/ai/nvidiaStructuredOutput.test.ts`
- Test: `tests/legal-engine/strategicChallengeDiscovery.test.ts`

- [x] **Step 1: Run the two focused test files.**
- [x] **Step 2: Run related legal research, decision-reasoning, rich-coverage, and issue-generation contract tests.**
- [x] **Step 3: Run `npm run typecheck`.**
- [x] **Step 4: Run focal ESLint on changed TypeScript files.**
- [x] **Step 5: Confirm no semantic validator, model, fallback, research, assembly, or editor files changed.**

### Task 4: Independent safety review

**Files:**
- Review only: all files changed by Tasks 1–3.

- [x] **Step 1: Dispatch one independent review agent after GREEN.**
- [x] **Step 2: Require checks for false relations, proximity contamination, authority-seed promotion, client-position bypass, source provenance, relation identity, research-plan safety, strict schema, no retry, and no fallback candidate.**
- [x] **Step 3: Resolve any blocker with one minimal patch and rerun the affected focused tests.**

### Task 5: One real NVIDIA measurement and documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-09-13-legal-research-strategic-drafting-foundation-plan.md`
- Modify: `.claude/napkin.md` only if the transport rule is demonstrated as reusable.

- [x] **Step 1: Run exactly one real `runRealStrategicChallengeAnalyzer` call against the existing PDF-derived `DecisionReasoningItem`, with the current configured NVIDIA model and no second call.**
- [x] **Step 2: Record request schema mode, HTTP status, duration, raw character count, finish reason, truncation, parse status, candidate count, accepted count, and fallback status without printing secrets or the full PDF.**
- [x] **Step 3: Classify the result as valid structured output, provider inability, or fail-safe model output; do not manufacture a candidate or research plan.**
- [x] **Step 4: Update the architecture plan with the measured checkpoint, actual baseline, first next root, and Definition of Done evidence.**
- [x] **Step 5: Run the full deterministic suite with `NVIDIA_API_KEY=''` and `NVIDIA_REAL_TEST='false'`; compare against `2536 PASS / 6 FAIL / 2 skipped` after the nine intentional tests added by this checkpoint.**

## Definition of Done

- The analyzer passes its exact schema to the completion dependency.
- NVIDIA forwards the schema as `response_format.json_schema` when requested and preserves the legacy body when not requested.
- The provider returns actual HTTP status for audit without weakening failures.
- Strict structured-response parsing rejects fences/prose and never synthesizes candidates.
- Zero, one, multiple, mixed-validity, unknown-field, forbidden-field, unallowlisted, and malformed cases remain fail-closed as specified.
- Only a legitimate validated model proposal can produce a research-required candidate and plan; an authority-only seed remains verification-only.
- One real post-GREEN NVIDIA call is measured, with no retry, web research, or provider research call.
- Typecheck, focal lint, focused tests, related tests, and full deterministic tests provide evidence; the six historical failures are unchanged and new regressions are zero.
- Architecture documentation and durable Napkin guidance are updated only after the checkpoint is verified.
