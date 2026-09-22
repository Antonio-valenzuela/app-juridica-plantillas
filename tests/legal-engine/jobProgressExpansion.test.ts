import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createGenerationJob, updateJobProgress, completeJob, getGenerationJob } from '@/lib/legal-engine/generationJobs';

describe('JOB PROGRESS - Expansion phase tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RED: job should NOT reach 100% percentage until expansion is complete', () => {
    const job = createGenerationJob({ total: 10, stage: 'Generando secciones' });
    
    // Simulate section generation progress
    updateJobProgress(job.jobId, { completed: 5, stage: 'Generando secciones' });
    let jobState = getGenerationJob(job.jobId);
    expect(jobState?.percentage).toBe(50);
    expect(jobState?.status).toBe('processing');

    // Simulate ALL sections done but expansion NOT started yet
    // The fix: when expansionTotal > 0 and expansionCompleted < expansionTotal, percentage should be < 100
    updateJobProgress(job.jobId, { completed: 10, expansionTotal: 5, expansionCompleted: 0, stage: 'Iniciando expansión' });
    jobState = getGenerationJob(job.jobId);
    
    // FIX: percentage should be < 100 when expansion is pending
    expect(jobState?.percentage).toBeLessThan(100);
    expect(jobState?.status).toBe('processing');
    expect(jobState?.phase).toBe('expanding');
  });

  it('RED: job total should include expansion work units', () => {
    const job = createGenerationJob({ total: 10, stage: 'Generando secciones' });
    
    // Total should be able to increase when expansion adds work
    let jobState = getGenerationJob(job.jobId);
    expect(jobState?.total).toBe(10);
    
    // When expansion is configured with 5 passes, total should increase
    // to reflect the additional work
    updateJobProgress(job.jobId, { total: 15, expansionTotal: 5 });
    jobState = getGenerationJob(job.jobId);
    expect(jobState?.total).toBe(15);
    expect(jobState?.expansionTotal).toBe(5);
  });

  it('RED: job should NOT be marked completed until expansion finishes', () => {
    const job = createGenerationJob({ total: 10, stage: 'Generando secciones' });
    
    // Simulate completion of sections but expansion still pending
    updateJobProgress(job.jobId, { completed: 10, expansionTotal: 5, expansionCompleted: 0, stage: 'Iniciando expansión' });
    
    // Job should NOT be marked completed yet
    let jobState = getGenerationJob(job.jobId);
    expect(jobState?.status).toBe('processing');
    expect(jobState?.percentage).toBeLessThan(100);
    
    // Only after expansion completes should it be marked completed
    // Simulate expansion completion
    updateJobProgress(job.jobId, { expansionCompleted: 5 });
    // Now completeJob should work
    completeJob(job.jobId, { sections: [] } as any);
    jobState = getGenerationJob(job.jobId);
    expect(jobState?.status).toBe('completed');
    expect(jobState?.percentage).toBe(100);
  });
});