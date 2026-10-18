import { prisma } from '@/lib/prisma';
import { restoreGenerationJob } from './generationJobs';
import type { GenerationJob, GenerationJobStatus, GenerationTerminalStatus } from './generationJobs';
import { DesktopRecordRepository } from '@/lib/workspace/desktopRecordRepository';
import { getRuntimeMode } from '@/lib/security/desktopLocalAccess';
import { type ExecutionOwner, ownsExecution } from '@/lib/security/workspaceExecutionAccess';
import { DesktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';
import { findPersistedArtifact, saveGenerationArtifact } from './generationPersistence';
import { markDocumentAsReviewRequired } from './documentLifecycle';

type LocalJob = GenerationJob & { id: string; recoveryDraftRecordId?: string };
function localJobs() {
  return new DesktopRecordRepository<LocalJob>('jobs', job => job.id === job.jobId
    && typeof job.desktopOwnerId === 'string' && typeof job.status === 'string' && Number.isFinite(Date.parse(job.updatedAt)));
}

export async function listDesktopGenerationJobs(ownerId: string) {
  if (getRuntimeMode() !== 'DESKTOP_LOCAL') throw new Error('DESKTOP_JOB_WRONG_RUNTIME');
  return (await localJobs().list()).filter(job => job.desktopOwnerId === ownerId).map(job => ({
    id: job.jobId, documentId: job.documentId, status: job.status, terminalStatus: job.terminalStatus,
    errorCode: job.errorCode, warnings: job.warnings, createdAt: job.createdAt, updatedAt: job.updatedAt,
    startedAt: new Date(job.startedAt).toISOString(),
  }));
}

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
const localPersistenceErrors = new Map<string, Error>();

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
  if (job.desktopOwnerId) {
    if (getRuntimeMode() !== 'DESKTOP_LOCAL') throw new Error('DESKTOP_JOB_WRONG_RUNTIME');
    await localJobs().put({ ...job, id: job.jobId });
    return;
  }
  if (!isPersistenceEnabled()) return;
  if (!job.organizationId || !job.userId) throw new Error('GENERATION_OWNER_MISSING');
  const data = { ...toPersistence(job), organizationId: job.organizationId, userId: job.userId };
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
  if (!job.desktopOwnerId && !isPersistenceEnabled()) return;
  const snapshot = job.desktopOwnerId ? JSON.parse(JSON.stringify(job)) as GenerationJob : job;
  const previous = persistenceChains.get(job.jobId) || Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => persistGenerationJob(snapshot))
    .catch((error) => {
      if (job.desktopOwnerId) {
        localPersistenceErrors.set(job.jobId, error instanceof Error ? error : new Error(String(error)));
        if (!job.warnings.includes('DESKTOP_JOB_PERSISTENCE_FAILED')) job.warnings.push('DESKTOP_JOB_PERSISTENCE_FAILED');
      }
      if (process.env.NODE_ENV !== 'test') console.error('[GenerationJobPersistence] persist failed', error instanceof Error ? error.message : error);
    });
  persistenceChains.set(job.jobId, next);
  void next.finally(() => {
    if (persistenceChains.get(job.jobId) === next) persistenceChains.delete(job.jobId);
  });
}

export async function flushGenerationJobPersistence(jobId: string): Promise<void> {
  await persistenceChains.get(jobId);
  if (localPersistenceErrors.has(jobId)) throw localPersistenceErrors.get(jobId);
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
  if (getRuntimeMode() === 'DESKTOP_LOCAL') {
    const stored = await localJobs().find(jobId);
    if (!stored) return undefined;
    // A restarted process cannot continue an old promise. Preserve its checkpoint,
    // expose interruption, and never present an orphaned job as still running.
    if (stored.status === 'processing') {
      stored.status = 'failed'; stored.terminalStatus = 'FAILED'; stored.errorCode = 'DESKTOP_BACKEND_RESTARTED';
      stored.error = 'El backend se reinició. Revisa el borrador guardado antes de volver a generar.';
      stored.stage = 'Interrumpido por reinicio'; stored.updatedAt = new Date().toISOString();
      await localJobs().put(stored);
    }
    const checkpoint = stored.checkpointDocument;
    if (!stored.recoveryDraftRecordId && stored.errorCode === 'DESKTOP_BACKEND_RESTARTED' && checkpoint?.documentType && checkpoint.status === 'draft') {
      // Do not overwrite an existing draft: it may contain the lawyer's edits.
      const existing = findPersistedArtifact(await new DesktopDraftRepository().list(), checkpoint.id);
      const snapshot = !existing ? await saveGenerationArtifact({ desktopOwnerId: stored.desktopOwnerId,
        document: markDocumentAsReviewRequired(checkpoint), jobId: stored.jobId,
        progress: stored.percentage, terminalStatus: 'NEEDS_REVIEW', warnings: ['DESKTOP_BACKEND_RESTARTED', 'DOCUMENT_REQUIRES_REVIEW'] }) : null;
      stored.recoveryDraftRecordId = existing?.id || snapshot?.draftRecordId;
      await localJobs().put(stored);
    }
    return restoreGenerationJob(stored);
  }
  if (!isPersistenceEnabled()) return undefined;
  const row = await prisma.generationJob.findUnique({ where: { id: jobId } }) as PersistedGenerationJob | null;
  return row ? restoreGenerationJob(fromPersistence(row)) : undefined;
}

export async function recoverActiveGenerationJob(
  fingerprint: string | null,
  idempotencyKey: string | null,
  owner: ExecutionOwner,
): Promise<GenerationJob | undefined> {
  if (owner.desktopOwnerId) {
    const matches = (await localJobs().list()).filter(job => ownsExecution(job, owner) && job.status === 'processing'
      && ((fingerprint && job.fingerprint === fingerprint) || (idempotencyKey && job.idempotencyKey === idempotencyKey)));
    for (const job of matches) await recoverGenerationJob(job.jobId);
    return undefined;
  }
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
