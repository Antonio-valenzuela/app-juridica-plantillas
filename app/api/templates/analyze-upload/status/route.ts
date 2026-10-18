import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExecutionAccess, executionOwnerKey, type ExecutionOwner } from '@/lib/security/workspaceExecutionAccess';
import { getUploadAnalysisJob } from '@/lib/upload-analysis/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function ownerKey(context: ExecutionOwner): string {
  return executionOwnerKey(context);
}

export async function GET(request: NextRequest) {
  const access = await requireWorkspaceExecutionAccess(request);
  if (!access.ok) return access.response;
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim() || '';
  if (!jobId) return NextResponse.json({ ok: false, error: 'MISSING_JOBID' }, { status: 400 });
  const job = getUploadAnalysisJob(jobId);
  if (!job || job.ownerKey !== ownerKey(access.context)) return NextResponse.json({ ok: false, error: 'JOB_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    analysisJobId: job.analysisJobId,
    status: job.status,
    phase: job.phase,
    processedPages: job.processedPages,
    totalPages: job.totalPages,
    ocrPages: job.ocrPages,
    percentage: job.percentage,
    warningsCount: job.warningsCount,
    cacheHit: job.cacheHit,
    metrics: job.metrics,
    error: job.error,
    result: job.status === 'completed' ? job.result : null,
  });
}
