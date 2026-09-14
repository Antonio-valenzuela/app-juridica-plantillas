import { describe, expect, it } from 'vitest';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { makeFixtureDocument } from '@/tests/fixtures/richCoverageFixtures';
import { makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { createGenerationTraceContext, hashTraceText } from '@/lib/legal-engine/generationTrace';
import { executeGenerationTask } from '@/lib/legal-engine/generationTasks';
import type { CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { ContentBlock } from '@/lib/legal-engine/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

function makeCoverageMatrixForQualityGate(options: {
  unresolvedRequired?: boolean;
  blockingConflict?: boolean;
  informationalMissingOnly?: boolean;
  blockingMissingPosition?: boolean;
  allRequiredCoverageCovered?: boolean;
} = {}): CoverageMatrix {
  const requiredStatus = options.allRequiredCoverageCovered ? 'covered' : options.unresolvedRequired ? 'pending' : 'covered';
  const items: CoverageMatrix['items'] = [{
    id: 'cov-quality-fact',
    category: 'FACT_RESPONSE',
    description: 'respuesta fáctica',
    required: true,
    status: requiredStatus,
    targetSectionIds: ['sec-hechos'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    blocking: true,
  }];
  if (options.blockingConflict) {
    items.push({
      id: 'cov-quality-conflict',
      category: 'CONFLICT_REVIEW',
      description: 'conflicto abierto',
      required: true,
      status: 'blocked',
      targetSectionIds: [],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
    });
  }
  if (options.informationalMissingOnly) {
    items.push({
      id: 'cov-quality-missing-info',
      category: 'MISSING_CLIENT_POSITION',
      description: 'dato informativo',
      required: false,
      status: 'needs_client_position',
      targetSectionIds: [],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: false,
    });
  }
  if (options.blockingMissingPosition) {
    items.push({
      id: 'cov-quality-missing-blocking',
      category: 'MISSING_CLIENT_POSITION',
      description: 'postura requerida sobre despido',
      required: true,
      status: 'needs_client_position',
      targetSectionIds: [],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
    });
  }
  return {
    documentId: 'fixture-quality',
    documentType: 'contestacion_demanda_laboral',
    items,
    summary: { total: items.length, required: items.filter((item) => item.required).length, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
}

function makeQualityGateFixture(options: Parameters<typeof makeCoverageMatrixForQualityGate>[0] = {}) {
  const doc = makeFixtureDocument();
  doc.coverageMatrix = makeCoverageMatrixForQualityGate(options);
  return doc;
}

describe('rich Coverage QualityGate structural checks', () => {
  it('blocks required substantive Coverage and blocking conflict', () => {
    const result = runQualityGateCheck(makeQualityGateFixture({ unresolvedRequired: true, blockingConflict: true }));
    expect(result.passed).toBe(false);
    expect(result.criticalErrors.map((error) => error.checkId)).toEqual(expect.arrayContaining([
      'UNRESOLVED_COVERAGE_REQUIREMENT',
      'BLOCKING_COVERAGE_CONFLICT',
    ]));
  });

  it('blocks when a missing client position requirement is blocking', () => {
    const result = runQualityGateCheck(makeQualityGateFixture({ blockingMissingPosition: true, allRequiredCoverageCovered: true }));
    expect(result.passed).toBe(false);
    expect(result.criticalErrors.map((error) => error.checkId)).toEqual(expect.arrayContaining([
      'MISSING_CLIENT_POSITION',
      'UNRESOLVED_COVERAGE_REQUIREMENT',
    ]));
  });

  it('passes coverage structural gates when all required items are covered without blocking items', () => {
    const result = runQualityGateCheck(makeQualityGateFixture({ allRequiredCoverageCovered: true }));
    expect(result.criticalErrors.some((error) => [
      'UNRESOLVED_COVERAGE_REQUIREMENT',
      'BLOCKING_COVERAGE_CONFLICT',
      'MISSING_CLIENT_POSITION',
    ].includes(error.checkId))).toBe(false);
  });

  it('does not block only because an informational missing field exists', () => {
    const result = runQualityGateCheck(makeQualityGateFixture({ informationalMissingOnly: true, allRequiredCoverageCovered: true }));
    expect(result.criticalErrors.some((error) => error.checkId === 'MISSING_CLIENT_POSITION')).toBe(false);
  });
});

function runTraceFixtureF(options: { secret?: string } = {}) {
  const analysis = Object.assign(makeFixtureFCaseAnalysis(), options.secret ? { extraText: options.secret } : {}) as CaseAnalysis;
  const doc = makeFixtureDocument();
  const matrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const context = createGenerationTraceContext({ generationId: 'fixture-f-generation', doc, options: { enabled: true } });
  context.snapshotCaseAnalysis(analysis);
  context.snapshotCoverageBefore(matrix);
  const task = {
    id: 'task-fixture-claim-1',
    sectionId: 'sec-prestaciones',
    sectionTitle: 'PRESTACIONES',
    taskType: 'CLAIM',
    complexity: 'SHORT',
    tokenBudget: 800,
    status: 'completed',
    coverageItemIds: ['cov-claim-fixture-f-claim-1'],
  } as unknown as GenerationTask;
  context.recordTaskPlanned(task);
  context.recordTaskExecution({ taskId: task.id, sectionId: task.sectionId, coverageItemIds: task.coverageItemIds ?? [], legalIssueIds: [], evidenceIds: [], factIds: [], claimIds: ['fixture-f-claim-1'], providerActuallyUsed: 'NONE', startedAt: new Date(0).toISOString(), responseStatus: 'completed', continuationCount: 0, retryCount: 0, fallbackUsed: false, origin: 'DETERMINISTIC_FALLBACK', finalBlockId: 'block-fixture-claim-1' });
  context.recordDraftBlock({ id: 'block-fixture-claim-1', text: 'Respuesta sustantiva de fixture', layer: 'AI_DRAFT', coverageItemIds: ['cov-claim-fixture-f-claim-1'], generationTaskId: task.id, generatedBy: 'AI' } as unknown as ContentBlock);
  context.recordCoverageTransition({ coverageItemId: 'cov-claim-fixture-f-claim-1', statusBefore: 'generated', statusAfter: 'covered', reason: 'VALID_SUBSTANTIVE_BLOCK', taskIds: [task.id], draftBlockIds: ['block-fixture-claim-1'] });
  context.snapshotCoverageAfter(matrix);
  return { trace: context.close() };
}

describe('rich Coverage trace reconstruction', () => {
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

  it('records review marker fallback metadata when inspecting GenerationTrace', async () => {
    const doc = makeFixtureDocument();
    doc.coverageMatrix = {
      documentId: doc.id,
      documentType: doc.documentType,
      items: [{
        id: 'cov-trace-conflict',
        category: 'CONFLICT_REVIEW',
        description: 'conflicto detectado en análisis',
        required: true,
        status: 'blocked',
        targetSectionIds: ['sec-hechos'],
        scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
        blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    };
    const context = createGenerationTraceContext({ generationId: 'trace-marker-run', doc, options: { enabled: true } });
    const task: GenerationTask = {
      id: 'task-trace-conflict',
      sectionId: 'sec-hechos',
      sectionTitle: 'HECHOS',
      taskType: 'COVERAGE_ITEM',
      complexity: 'SHORT',
      tokenBudget: 800,
      status: 'pending',
      coverageItemIds: ['cov-trace-conflict'],
    } as unknown as GenerationTask;

    const { block } = await executeGenerationTask(task, doc, undefined, async () => {
      throw new Error('provider generator should never be called for review markers');
    }, undefined, [], context);

    const closedTrace = context.close();

    // Inspect trace for marker behavior
    expect(closedTrace.generationTasks.length).toBe(1);
    expect(closedTrace.taskExecutions.length).toBe(1);
    expect(closedTrace.taskExecutions[0].responseStatus).toBe('fallback');
    expect(closedTrace.taskExecutions[0].fallbackUsed).toBe(true);
    expect(closedTrace.taskExecutions[0].fallbackReason).toBe('BLOCKING_CONFLICT_REQUIRES_REVIEW');
    expect(closedTrace.taskExecutions[0].providerActuallyUsed).toBe('NONE');

    expect(closedTrace.draftBlocks.length).toBe(1);
    expect(closedTrace.draftBlocks[0].id).toBe(block.id);
    expect(closedTrace.draftBlocks[0].fallbackStatus).toBe('LOCAL_PLACEHOLDER');
    expect(closedTrace.draftBlocks[0].fallbackReason).toBe('BLOCKING_CONFLICT_REQUIRES_REVIEW');
    expect(closedTrace.draftBlocks[0].generatedBy).toBe('FALLBACK');
    expect(closedTrace.draftBlocks[0].textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(closedTrace.draftBlocks[0].textHash).toBe(hashTraceText(block.text));
  });
});
