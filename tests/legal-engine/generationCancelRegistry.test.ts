import { describe, expect, it } from 'vitest';
import { cancelJob, createGenerationJob, registerJobAbort, unregisterJobAbort } from '@/lib/legal-engine/generationJobs';
import { runWithGenerationDeadline } from '@/lib/legal-engine/generationDeadline';
import { GenerationCancelledError } from '@/lib/ai/abortContext';

const owner = { organizationId: 'test', userId: 'test', lawyerId: 'test' } as any;

describe('cancelación de un trabajo en curso', () => {
  it('cancelJob aborta el pipeline registrado con causa GENERATION_CANCELLED', () => {
    const job = createGenerationJob({ ...owner, fingerprint: 'cancel-registry', total: 1 });
    const controller = new AbortController();
    registerJobAbort(job.jobId, controller);
    cancelJob(job.jobId);
    expect(controller.signal.aborted).toBe(true);
    expect((controller.signal.reason as { code?: string }).code).toBe('GENERATION_CANCELLED');
    unregisterJobAbort(job.jobId);
  });

  it('una cancelación externa rechaza aunque el pipeline nunca responda', async () => {
    const controller = new AbortController();
    const pending = runWithGenerationDeadline(() => new Promise<never>(() => undefined), 60_000, controller);
    setTimeout(() => controller.abort(new GenerationCancelledError()), 10);
    await expect(pending).rejects.toMatchObject({ code: 'GENERATION_CANCELLED' });
  });
});
