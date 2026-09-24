import { prisma } from '@/lib/prisma';
import { restoreGenerationJob } from './generationJobs';
import type { GenerationJob, GenerationJobStatus, GenerationTerminalStatus } from './generationJobs';

type PersistedGenerationJob = {
  id: string;
  organizationId: string;
  userId: string;
  documentId: string | null;
  fingerprint: string | null;
  idempotencyKey: string | null;
  phase: string | null;
  progress: number;
  status: string;
  terminalStatus: string | null;
  cancelRequested: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date;
};

const persistenceChains = new Map<string, Promise<void>>();

function isPersistenceEnabled(): boolean {
  return process.env.GENERATION_JOBS_PERSISTENCE === 'true' || process.env.NODE_ENV === 'production';
}

function asTerminalStatus(value: string | null): GenerationTerminalStatus | undefined {
  if (value === 'COMPLETED' || value === 'COMPLETED_WITH_WARNINGS' || value === 'FAILED' || value === 'NEEDS_REVIEW' || value === 'CANCELLED') return value;
  return undefined;
}

function asJobStatus(value: string): GenerationJobStatus {
  if (value === 'completed' || value === 'failed' || value === 'cancelled') return value;
  return 'processing';
}

function toPersistence(job: GenerationJob) {
  return {
    id: job.jobId,
    organizationId: job.organizationId,
    userId: job.userId,
    documentId: job.documentId,
    fingerprint: job.fingerprint,
    idempotencyKey: job.idempotencyKey,
    phase: job.phase || null,
    progress: job.percentage,
    status: job.status,
    terminalStatus: job.terminalStatus || null,
    cancelRequested: job.cancelRequested,
    errorCode: job.errorCode,
    errorMessage: job.error,
    warnings: job.warnings,
    createdAt: new Date(job.createdAt),
    updatedAt: new Date(job.updatedAt),
    startedAt: new Date(job.startedAt),
  };
}

export async function persistGenerationJob(job: GenerationJob): Promise<void> {
  if (!isPersistenceEnabled()) return;
  const data = toPersistence(job);
  await prisma.generationJob.upsert({
    where: { id: data.id },
    create: data,
    update: {
      organizationId: data.organizationId,
      userId: data.userId,
      documentId: data.documentId,
      fingerprint: data.fingerprint,
      idempotencyKey: data.idempotencyKey,
      phase: data.phase,
      progress: data.progress,
      status: data.status,
      terminalStatus: data.terminalStatus,
      cancelRequested: data.cancelRequested,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      warnings: data.warnings,
    },
  });
}

export function enqueueGenerationJobPersistence(job: GenerationJob): void {
  if (!isPersistenceEnabled()) return;
  const previous = persistenceChains.get(job.jobId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => persistGenerationJob(job))
    .catch((error) => {
      if (process.env.NODE_ENV !== 'test') console.error('[GenerationJobPersistence] persist failed', error instanceof Error ? error.message : error);
    });
  persistenceChains.set(job.jobId, next);
  void next.finally(() => {
    if (persistenceChains.get(job.jobId) === next) persistenceChains.delete(job.jobId);
  });
}

export async function flushGenerationJobPersistence(jobId: string): Promise<void> {
  await persistenceChains.get(jobId);
}

function fromPersistence(row: PersistedGenerationJob): GenerationJob {
  const warnings = Array.isArray(row.warnings) ? row.warnings.filter((warning): warning is string => typeof warning === 'string') : [];
  const status = asJobStatus(row.status);
  const percentage = Math.max(0, Math.min(100, Number(row.progress) || 0));
  return {
    jobId: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    status,
    terminalStatus: asTerminalStatus(row.terminalStatus),
    total: 0,
    completed: 0,
    percentage,
    currentBlock: null,
    currentBlockIndex: null,
    aiProvider: null,
    stage: status === 'completed' ? 'Documento generado' : status === 'failed' ? 'Error' : status === 'cancelled' ? 'Cancelado por el usuario' : 'Procesando',
    error: row.errorMessage,
    errorCode: row.errorCode,
    errorMetadata: null,
    document: null,
    documentId: row.documentId,
    documentReadiness: null,
    redirectUrl: null,
    fingerprint: row.fingerprint,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt.getTime(),
    log: [`[GenerationJobPersistence] Job ${row.id} rehidratado`],
    phase: row.phase || undefined,
    warnings,
    checkpointDocument: null,
    cancelRequested: row.cancelRequested,
  };
}

export async function recoverGenerationJob(jobId: string): Promise<GenerationJob | undefined> {
  if (!isPersistenceEnabled()) return undefined;
  const row = await prisma.generationJob.findUnique({ where: { id: jobId } }) as PersistedGenerationJob | null;
  return row ? restoreGenerationJob(fromPersistence(row)) : undefined;
}

export async function recoverActiveGenerationJob(
  fingerprint: string | null,
  idempotencyKey: string | null,
  owner: { organizationId: string; userId: string },
): Promise<GenerationJob | undefined> {
  if (!isPersistenceEnabled() || (!fingerprint && !idempotencyKey)) return undefined;
  const clauses = [
    ...(idempotencyKey ? [{ idempotencyKey }] : []),
    ...(fingerprint ? [{ fingerprint }] : []),
  ];
  const row = await prisma.generationJob.findFirst({
    where: {
      organizationId: owner.organizationId,
      userId: owner.userId,
      status: 'processing',
      OR: clauses,
    },
    orderBy: { updatedAt: 'desc' },
  }) as PersistedGenerationJob | null;
  return row ? restoreGenerationJob(fromPersistence(row)) : undefined;
}
