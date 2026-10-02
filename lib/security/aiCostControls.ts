import { prisma } from '@/lib/prisma';
import { isLocalDevelopmentWorkspaceContext } from '@/lib/security/lawyerAuth';
import { type ExecutionOwner, ownsExecution } from './workspaceExecutionAccess';
import { getAllJobs } from '@/lib/legal-engine/generationJobs';

export type GenerationAdmission =
  | { ok: true; active: number; limit: number }
  | { ok: false; active: number; limit: number; errorCode: 'GENERATION_CONCURRENCY_LIMIT' | 'GENERATION_CAPACITY_UNAVAILABLE' };

function configuredLimit(): number {
  const value = Number(process.env.MAX_CONCURRENT_GENERATIONS || 3);
  return Number.isFinite(value) && value >= 1 ? Math.min(20, Math.floor(value)) : 3;
}

export async function checkGenerationAdmission(owner: ExecutionOwner, limit = configuredLimit()): Promise<GenerationAdmission> {
  if (owner.desktopOwnerId) {
    const active = getAllJobs().filter(job => job.status === 'processing' && ownsExecution(job, owner)).length;
    return active >= limit ? { ok: false, active, limit, errorCode: 'GENERATION_CONCURRENCY_LIMIT' } : { ok: true, active, limit };
  }
  if (!owner.organizationId || !owner.userId) return { ok: false, active: 0, limit, errorCode: 'GENERATION_CAPACITY_UNAVAILABLE' };
  // En la edición local el job vive en memoria y no requiere la tabla remota.
  // El contexto solo puede provenir de los endpoints locales de desarrollo.
  if (isLocalDevelopmentWorkspaceContext({ organizationId: owner.organizationId, userId: owner.userId })) {
    return { ok: true, active: 0, limit };
  }
  try {
    const generationJob = (prisma as any).generationJob;
    if (!generationJob || typeof generationJob.count !== 'function') {
      if (process.env.NODE_ENV === 'test') return { ok: true, active: 0, limit };
      return { ok: false, active: 0, limit, errorCode: 'GENERATION_CAPACITY_UNAVAILABLE' };
    }
    const active = await generationJob.count({
      where: {
        organizationId: owner.organizationId,
        userId: owner.userId,
        status: 'processing',
      },
    });
    return active >= limit
      ? { ok: false, active, limit, errorCode: 'GENERATION_CONCURRENCY_LIMIT' }
      : { ok: true, active, limit };
  } catch {
    if (process.env.NODE_ENV === 'test') return { ok: true, active: 0, limit };
    return { ok: false, active: 0, limit, errorCode: 'GENERATION_CAPACITY_UNAVAILABLE' };
  }
}

export function maxGenerationInputChars(): number {
  const value = Number(process.env.MAX_GENERATION_INPUT_CHARS || 200_000);
  return Number.isFinite(value) && value >= 10_000 ? Math.min(1_000_000, Math.floor(value)) : 200_000;
}
