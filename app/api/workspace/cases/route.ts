import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import {
  WORKSPACE_CASE_SUMMARY_SQL,
  mapWorkspaceCaseSummaryRow,
  type WorkspaceCaseSummaryRow,
} from '@/lib/workspace/cases';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;

    const drafts = await prisma.$queryRawUnsafe<WorkspaceCaseSummaryRow[]>(
      WORKSPACE_CASE_SUMMARY_SQL,
      access.context.organizationId,
      access.context.userId,
    );

    return NextResponse.json({ ok: true, cases: drafts.map(mapWorkspaceCaseSummaryRow) });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'CASES_LOAD_FAILED', message: 'No fue posible cargar los asuntos.', internalError: error });
  }
}
