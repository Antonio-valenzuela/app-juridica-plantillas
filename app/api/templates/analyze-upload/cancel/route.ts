import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExecutionAccess, executionOwnerKey, type ExecutionOwner } from '@/lib/security/workspaceExecutionAccess';
import { cancelUploadAnalysisJob, getUploadAnalysisJob } from '@/lib/upload-analysis/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function ownerKey(context: ExecutionOwner): string {
  return executionOwnerKey(context);
}

export async function POST(request: NextRequest) {
  const access = await requireWorkspaceExecutionAccess(request);
  if (!access.ok) return access.response;
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim() || '';
  const job = getUploadAnalysisJob(jobId);
  if (!job || job.ownerKey !== ownerKey(access.context)) return NextResponse.json({ ok: false, error: 'JOB_NOT_FOUND' }, { status: 404 });
  const cancelled = cancelUploadAnalysisJob(jobId);
  return NextResponse.json({ ok: true, status: cancelled?.status || 'cancelled', analysisJobId: jobId });
}
