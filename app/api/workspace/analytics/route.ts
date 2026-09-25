import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { buildAnalyticsDataset, type AnalyticsRangeDays } from '@/lib/workspace/analytics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseRangeDays(value: string | null): AnalyticsRangeDays {
  const parsed = Number(value);
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const rangeDays = parseRangeDays(new URL(request.url).searchParams.get('rangeDays'));
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
    start.setUTCHours(0, 0, 0, 0);
    const owner = { organizationId: access.context.organizationId, userId: access.context.userId };
    const [drafts, jobs] = await Promise.all([
      prisma.legalDraft.findMany({
        where: { ...owner, createdAt: { gte: start } },
        select: { id: true, documentType: true, matter: true, status: true, createdAt: true, updatedAt: true, validationResults: true, generationMetadata: true, structuredDoc: true, sourceDocuments: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.generationJob.findMany({
        where: { ...owner, createdAt: { gte: start } },
        select: { id: true, documentId: true, status: true, terminalStatus: true, errorCode: true, warnings: true, createdAt: true, updatedAt: true, startedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
    ]);
    const dataset = buildAnalyticsDataset({ drafts, jobs, rangeDays, now });
    return NextResponse.json({ ok: true, ...dataset });
  } catch (error) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'ANALYTICS_LOAD_FAILED', message: 'No fue posible cargar las analíticas reales del despacho.', internalError: error });
  }
}
