import { describe, expect, it } from 'vitest';
import {
  cancelJob,
  completeJob,
  createGenerationJob,
  failJob,
  getGenerationJob,
  updateJobProgress,
} from '@/lib/legal-engine/generationJobs';

const documentStub = { id: 'generated-doc' } as any;

describe('GenerationJob — máquina de estados', () => {
  it('mantiene el progreso monotónico y acotado al total real', () => {
    const job = createGenerationJob({ fingerprint: `state-${Date.now()}-${Math.random()}`, total: 3 });

    updateJobProgress(job.jobId, { completed: 2, currentBlockIndex: 2 });
    updateJobProgress(job.jobId, { completed: 1, currentBlockIndex: 1 });

    expect(getGenerationJob(job.jobId)).toMatchObject({
      status: 'processing',
      completed: 2,
      percentage: 67,
      currentBlockIndex: 2,
    });

    updateJobProgress(job.jobId, { completed: 8, currentBlockIndex: 8 });
    expect(getGenerationJob(job.jobId)).toMatchObject({
      completed: 3,
      percentage: 100,
      currentBlockIndex: 3,
    });
  });

  it('no permite reabrir ni cambiar un job después de una transición terminal', () => {
    const completed = createGenerationJob({ fingerprint: `completed-${Date.now()}-${Math.random()}`, total: 1 });
    completeJob(completed.jobId, documentStub);
    updateJobProgress(completed.jobId, { completed: 0, stage: 'Error' });
    failJob(completed.jobId, 'late failure');
    cancelJob(completed.jobId);
    expect(getGenerationJob(completed.jobId)).toMatchObject({
      status: 'completed',
      completed: 1,
      percentage: 100,
      document: documentStub,
      error: null,
    });

    const cancelled = createGenerationJob({ fingerprint: `cancelled-${Date.now()}-${Math.random()}`, total: 2 });
    cancelJob(cancelled.jobId);
    completeJob(cancelled.jobId, documentStub);
    failJob(cancelled.jobId, 'late failure');
    expect(getGenerationJob(cancelled.jobId)).toMatchObject({
      status: 'cancelled',
      document: null,
      error: 'CANCELLED',
    });
  });
});
