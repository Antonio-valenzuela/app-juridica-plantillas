import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rows, upsertMock, findUniqueMock } = vi.hoisted(() => {
  const rows = new Map<string, any>();
  const upsertMock = vi.fn(async ({ where, create, update }: any) => {
    const current = rows.get(where.id);
    const next = { ...(current || create), ...(current ? update : {}) };
    rows.set(where.id, next);
    return next;
  });
  const findUniqueMock = vi.fn(async ({ where }: any) => rows.get(where.id) || null);
  return { rows, upsertMock, findUniqueMock };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    generationJob: {
      upsert: upsertMock,
      findUnique: findUniqueMock,
    },
  },
}));

import {
  cancelJob,
  completeJob,
  createGenerationJob,
  evictGenerationJob,
  getGenerationJob,
  updateJobProgress,
} from '@/lib/legal-engine/generationJobs';
import {
  flushGenerationJobPersistence,
  recoverGenerationJob,
} from '@/lib/legal-engine/generationJobPersistence';

describe('GenerationJob durable persistence', () => {
  beforeEach(() => {
    (process.env as any).GENERATION_JOBS_PERSISTENCE = 'true';
    rows.clear();
    upsertMock.mockClear();
    findUniqueMock.mockClear();
  });

  it('persiste progreso, ownership y estado terminal; rehidrata tras evictar memoria', async () => {
    const job = createGenerationJob({
      organizationId: 'org-durable',
      userId: 'user-durable',
      fingerprint: 'durable-fingerprint',
      idempotencyKey: 'durable-idempotency',
      total: 4,
    });

    updateJobProgress(job.jobId, {
      completed: 2,
      currentBlock: 'Hechos',
      phase: 'compose',
      checkpointDocument: { id: 'document-durable' } as any,
    });
    await flushGenerationJobPersistence(job.jobId);

    expect(rows.get(job.jobId)).toMatchObject({
      id: job.jobId,
      organizationId: 'org-durable',
      userId: 'user-durable',
      documentId: null,
      progress: 50,
      status: 'processing',
      phase: 'compose',
      cancelRequested: false,
    });

    evictGenerationJob(job.jobId);
    expect(getGenerationJob(job.jobId)).toBeUndefined();

    const recovered = await recoverGenerationJob(job.jobId);
    expect(recovered).toMatchObject({
      jobId: job.jobId,
      organizationId: 'org-durable',
      userId: 'user-durable',
      status: 'processing',
      documentId: null,
      percentage: 50,
      phase: 'compose',
    });

    const terminal = completeJob(job.jobId, { id: 'document-durable', status: 'ready' } as any, {
      documentReadiness: 'READY',
      terminalStatus: 'COMPLETED',
    });
    await flushGenerationJobPersistence(job.jobId);
    expect(terminal).toMatchObject({ documentId: 'document-durable', terminalStatus: 'COMPLETED' });

    cancelJob(job.jobId);
    await flushGenerationJobPersistence(job.jobId);
    expect(rows.get(job.jobId)).toMatchObject({
      documentId: 'document-durable',
      status: 'completed',
      terminalStatus: 'COMPLETED',
      cancelRequested: false,
    });
  });

  it('conserva cancelRequested al persistir una cancelación en curso', async () => {
    const job = createGenerationJob({
      organizationId: 'org-cancel',
      userId: 'user-cancel',
      total: 1,
    });

    cancelJob(job.jobId);
    await flushGenerationJobPersistence(job.jobId);

    expect(rows.get(job.jobId)).toMatchObject({
      id: job.jobId,
      status: 'cancelled',
      terminalStatus: 'CANCELLED',
      cancelRequested: true,
    });
  });
});
