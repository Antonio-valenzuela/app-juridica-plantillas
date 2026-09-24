import { prisma } from '@/lib/prisma';

export type GenerationAdmission =
  | { ok: true; active: number; limit: number }
  | { ok: false; active: number; limit: number; errorCode: 'GENERATION_CONCURRENCY_LIMIT' | 'GENERATION_CAPACITY_UNAVAILABLE' };

function configuredLimit(): number {
  const value = Number(process.env.MAX_CONCURRENT_GENERATIONS || 3);
  return Number.isFinite(value) && value >= 1 ? Math.min(20, Math.floor(value)) : 3;
}

export async function checkGenerationAdmission(owner: { organizationId: string; userId: string }, limit = configuredLimit()): Promise<GenerationAdmission> {
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
