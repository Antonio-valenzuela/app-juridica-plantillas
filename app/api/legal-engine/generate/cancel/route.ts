import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { cancelJob, getGenerationJob } from '@/lib/legal-engine/generationJobs';
import { recoverGenerationJob } from '@/lib/legal-engine/generationJobPersistence';
import { logger, generateRequestId } from '@/lib/logger';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cancelSchema = z.object({
  jobId: z.string().min(1).max(100),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const jobId = body.jobId || new URL(req.url).searchParams.get('jobId');
  const parsed = cancelSchema.safeParse({ jobId });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'MISSING_JOBID', details: parsed.error.issues }, { status: 400 });
  }

  const job = getGenerationJob(parsed.data.jobId) || await recoverGenerationJob(parsed.data.jobId);
  if (!job || job.organizationId !== auth.context.organizationId || job.userId !== auth.context.userId) {
    return NextResponse.json({ ok: false, error: 'JOB_NOT_FOUND' }, { status: 404 });
  }

  // Solo el owner puede cancelar (en single-tenant demo, basta con validar que el job existe;
  // en multi-tenant real se validaría fingerprint/organizationId si se persiste en DB)
  const cancelled = cancelJob(parsed.data.jobId);
  logger.info('Job cancelado', {
    requestId,
    jobId: parsed.data.jobId,
    userId: auth.context.userId,
    organizationId: auth.context.organizationId,
    operation: 'generate_cancel',
    status: 'cancelled',
  });

  return NextResponse.json({ ok: true, jobId: cancelled?.jobId, status: cancelled?.status });
}

export async function GET(req: NextRequest) {
  // Alias GET para compatibilidad con frontend que usa POST pero también soporta GET
  return POST(req);
}
