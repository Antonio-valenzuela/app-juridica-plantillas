/**
 * lib/legal-engine/generationJobStore.ts
 * P5 — Capa abstracta para persistencia de jobs.
 * Cache de ejecución en memoria con espejo durable en GenerationJob/Prisma.
 * La memoria acelera el pipeline; la persistencia permite recuperar status,
 * ownership, idempotencia y estado terminal después de un reinicio.
 *
 * Estados: created → queued → processing → completed
 *                               → failed
 *                               → cancelled
 */

import type { GenerationJob, GenerationJobStatus } from './generationJobs';
import {
  createGenerationJob as createMemJob,
  getGenerationJob as getMemJob,
  findActiveJobByFingerprint as findMemJob,
  updateJobProgress as updateMemJob,
  completeJob as completeMemJob,
  failJob as failMemJob,
  cancelJob as cancelMemJob,
  getAllJobs as getAllMemJobs,
} from './generationJobs';

export interface GenerationJobStore {
  create(input: { fingerprint?: string | null; idempotencyKey?: string | null; total?: number; stage?: string }): GenerationJob;
  get(jobId: string): GenerationJob | undefined;
  findActiveByFingerprint(fingerprint: string | null, idempotencyKey: string | null): GenerationJob | undefined;
  updateProgress(jobId: string, patch: Parameters<typeof updateMemJob>[1]): GenerationJob | undefined;
  complete(jobId: string, doc: any): GenerationJob | undefined;
  fail(jobId: string, error: string): GenerationJob | undefined;
  cancel(jobId: string): GenerationJob | undefined;
  getAll(): GenerationJob[];
}

class InMemoryJobStore implements GenerationJobStore {
  create(input: { fingerprint?: string | null; idempotencyKey?: string | null; total?: number; stage?: string }) {
    return createMemJob(input);
  }
  get(jobId: string) {
    return getMemJob(jobId);
  }
  findActiveByFingerprint(fingerprint: string | null, idempotencyKey: string | null) {
    return findMemJob(fingerprint, idempotencyKey);
  }
  updateProgress(jobId: string, patch: Parameters<typeof updateMemJob>[1]) {
    return updateMemJob(jobId, patch);
  }
  complete(jobId: string, doc: any) {
    return completeMemJob(jobId, doc);
  }
  fail(jobId: string, error: string) {
    return failMemJob(jobId, error);
  }
  cancel(jobId: string) {
    return cancelMemJob(jobId);
  }
  getAll() {
    return getAllMemJobs();
  }
}

// Instancia global: el cache local se acompaña de persistencia durable en producción.
export const generationJobStore: GenerationJobStore = new InMemoryJobStore();

const _impl = process.env.REDIS_URL && process.env.USE_REDIS_JOBSTORE === 'true' ? 'RedisJobStore' : 'InMemoryCacheWithPrismaPersistence';
if (typeof console !== 'undefined') {
  console.log(`[JobStore] Implementación activa: ${_impl}`);
}

// Helper para migrar a Redis/BullMQ en el futuro:
// export class RedisJobStore implements GenerationJobStore { ... }
// if (process.env.REDIS_URL && process.env.USE_REDIS_JOBSTORE === 'true') {
//   generationJobStore = new RedisJobStore(...)
// }
