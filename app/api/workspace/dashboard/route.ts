import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, any>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function statusOfDraft(draft: { status: string; validationResults: unknown; generationMetadata: unknown }): 'generated' | 'review' | 'failed' {
  const metadata = asRecord(draft.generationMetadata);
  const persistence = asRecord(metadata.persistence);
  const quality = asRecord(asRecord(persistence.qualityState).qualityGate);
  const validation = asRecord(draft.validationResults);
  if (draft.status === 'FAILED' || metadata.errorCode || persistence.terminalStatus === 'FAILED') return 'failed';
  if (persistence.terminalStatus === 'NEEDS_REVIEW' || metadata.readiness === 'REQUIRES_REVIEW' || quality.passed === false || validation.isValid === false) return 'review';
  return 'generated';
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;

    const [drafts, jobs] = await Promise.all([
      prisma.legalDraft.findMany({
        where: { organizationId: access.context.organizationId, userId: access.context.userId },
        select: { id: true, title: true, documentType: true, matter: true, status: true, updatedAt: true, createdAt: true, validationResults: true, generationMetadata: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.generationJob.findMany({
        where: { organizationId: access.context.organizationId, userId: access.context.userId },
        select: { id: true, documentId: true, status: true, terminalStatus: true, errorCode: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const counts = { generated: 0, review: 0, failed: 0 };
    const recentDocuments = drafts.slice(0, 8).map((draft) => {
      const status = statusOfDraft(draft);
      counts[status] += 1;
      return {
        id: draft.id,
        title: draft.title,
        documentType: draft.documentType,
        matter: draft.matter,
        status,
        updatedAt: draft.updatedAt.toISOString(),
      };
    });
    for (const draft of drafts.slice(8)) counts[statusOfDraft(draft)] += 1;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    const daily = new Map<string, number>();
    for (let cursor = new Date(start); cursor <= now; cursor.setDate(cursor.getDate() + 1)) daily.set(dayKey(cursor), 0);
    for (const draft of drafts) {
      if (draft.createdAt >= start) daily.set(dayKey(draft.createdAt), (daily.get(dayKey(draft.createdAt)) || 0) + 1);
    }
    const generationTimes = drafts.map((draft) => Number(asRecord(draft.generationMetadata).generationTimeMs)).filter((value) => Number.isFinite(value) && value > 0);
    const pendingReview = drafts.filter((draft) => statusOfDraft(draft) === 'review').length;
    const latestFailure = jobs.find((job) => job.status === 'failed' || job.terminalStatus === 'FAILED');

    return NextResponse.json({
      ok: true,
      source: 'LegalDraft + GenerationJob',
      stats: { ...counts, pendingReview, totalDocuments: drafts.length, averageGenerationMs: generationTimes.length ? Math.round(generationTimes.reduce((sum, value) => sum + value, 0) / generationTimes.length) : null },
      daily: Array.from(daily, ([date, count]) => ({ date, count })),
      recentDocuments,
      health: {
        status: latestFailure ? 'attention' : 'operativo',
        latestFailure: latestFailure ? { code: latestFailure.errorCode, at: latestFailure.updatedAt.toISOString() } : null,
        persistedDocuments: drafts.length,
        persistedJobs: jobs.length,
      },
    });
  } catch (error) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'DASHBOARD_LOAD_FAILED', message: 'No fue posible cargar las métricas reales del despacho.', internalError: error });
  }
}
