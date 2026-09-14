import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { getGenerationJob } from '@/lib/legal-engine/generationJobs';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

type CompletionDocument = UniversalLegalDocument & {
  documentAssemblyResult?: { readiness?: string };
  generationMetadata: UniversalLegalDocument['generationMetadata'] & { readiness?: string };
};

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId')?.trim() || url.searchParams.get('job_id')?.trim() || '';

  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'MISSING_JOBID' }, { status: 400 });
  }

  const job = getGenerationJob(jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'JOB_NOT_FOUND' }, { status: 404 });
  }

  // Respuesta conceptual solicitada: status, total, completed, percentage, currentBlock, aiUsed
  const completionDoc = job.document as CompletionDocument | null;
  return NextResponse.json({
    ok: true,
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    completed: job.completed,
    percentage: job.percentage,
    currentBlock: job.currentBlock,
    currentBlockIndex: job.currentBlockIndex,
    aiProvider: job.aiProvider,
    stage: job.stage,
    error: job.error,
    errorCode: job.errorCode,
    errorMetadata: job.errorMetadata,
    documentId: job.documentId,
    documentReadiness: job.documentReadiness || completionDoc?.documentAssemblyResult?.readiness || completionDoc?.generationMetadata.readiness || (job.document?.status === 'draft' ? 'REQUIRES_REVIEW' : 'READY'),
    redirectUrl: job.redirectUrl,
    // Compat: si completado, incluye documento (sin exponer log interno completo al cliente)
    document: job.status === 'completed' ? job.document : null,
  });
}
