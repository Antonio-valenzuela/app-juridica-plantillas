import { describe, expect, it } from 'vitest';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { executeGenerationTask } from '@/lib/legal-engine/generationTasks';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

function task(): GenerationTask {
  return {
    id: 'task-trace-1',
    sectionId: 'sec-hechos',
    sectionTitle: 'CONTESTACIÓN DE HECHOS',
    taskType: 'FACT_RESPONSE',
    complexity: 'SHORT',
    tokenBudget: 1200,
    status: 'pending',
    coverageItemIds: ['cov-fact-1'],
    factIds: ['fact-1'],
    evidenceIds: ['ev-1'],
    claimIds: [],
    objective: 'Responder el hecho con la postura expresamente recibida.',
  };
}

describe('GenerationTask trace', () => {
  it('links task execution and DraftBlock under one generationId', async () => {
    const doc = createEmptyDocument({ id: 'doc-task-trace' });
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const currentTask = task();

    const { block } = await executeGenerationTask(
      currentTask,
      doc,
      undefined,
      async () => 'Se admite parcialmente el hecho conforme a la documentación recibida.',
      undefined,
      [],
      trace,
    );

    expect(trace.trace.generationTasks[0]).toMatchObject({
      taskId: currentTask.id,
      sectionId: currentTask.sectionId,
    });
    expect(trace.trace.taskExecutions[0]).toMatchObject({
      taskId: currentTask.id,
      finalBlockId: block.id,
    });
    expect(block.generationId).toBe(trace.generationId);
    expect(block.generationTaskId).toBe(currentTask.id);
    expect(block.generatedBy).toBeDefined();
    expect(trace.trace.draftBlocks[0].textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records a deterministic fallback as fallback provenance', async () => {
    const doc = createEmptyDocument({ id: 'doc-task-fallback' });
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const currentTask = task();
    const { block, result } = await executeGenerationTask(
      currentTask,
      doc,
      undefined,
      async () => { throw new Error('synthetic generator failure'); },
      undefined,
      [],
      trace,
    );
    expect(result.fallbackUsed).toBe(true);
    expect(block.generatedBy).toBe('FALLBACK');
    expect(trace.trace.taskExecutions[0].origin).toBe('DETERMINISTIC_FALLBACK');
    expect(trace.trace.taskExecutions[0].providerActuallyUsed).toBe('NONE');
  });
});
