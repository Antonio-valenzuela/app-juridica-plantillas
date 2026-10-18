import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import {
  WORKSPACE_CASE_SUMMARY_SQL,
  mapWorkspaceCaseSummaryRow,
  mapLegalDraftToWorkspaceCaseSummary,
  type WorkspaceCaseSummaryRow,
} from '@/lib/workspace/cases';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { desktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';
import { desktopCases, type DesktopCase } from '@/lib/workspace/desktopCaseRepository';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  try {
    const local = desktopDraftRepository(request);
    if (local && !local.ok) return local.response;
    if (local?.ok) {
      const drafts = await local.store.list();
      const cases = await desktopCases().list();
      const linked = new Set(cases.flatMap(item => item.draftIds));
      return NextResponse.json({ ok: true, storage: 'DESKTOP_LOCAL', cases: [...cases.map(item => ({ ...item,
        sourceCount: drafts.filter(draft => item.draftIds.includes(draft.id)).reduce((sum, draft) => sum + (Array.isArray(draft.sourceDocuments) ? draft.sourceDocuments.length : 0), 0),
        draftRecordId: item.draftIds[0] || null,
      })), ...drafts.filter(draft => !linked.has(draft.id)).map(draft => mapLegalDraftToWorkspaceCaseSummary({ ...draft,
        formData: draft.formData ?? null, structuredDoc: draft.structuredDoc ?? null, sourceDocuments: draft.sourceDocuments ?? null,
      }))] });
    }
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

const caseInput = z.object({
  title: z.string().trim().min(1).max(200), expediente: z.string().trim().max(100).nullable().optional(),
  matter: z.string().trim().max(100).nullable().optional(), jurisdiction: z.string().trim().max(100).nullable().optional(),
  actor: z.string().trim().max(200).nullable().optional(), counterparty: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(20000).optional(), draftIds: z.array(z.string().uuid()).max(500).optional(),
});
async function mutateCase(request: NextRequest, update: boolean) {
  const local = desktopDraftRepository(request);
  if (!local) {
    const auth = await requireCaseAccess(request);
    return auth.ok ? NextResponse.json({ ok: false, error: 'WEB_CASE_MUTATION_NOT_AVAILABLE' }, { status: 405 }) : auth.response;
  }
  if (!local.ok) return local.response;
  try {
    const body = await request.json();
    const id = update ? z.string().uuid().parse(body.id) : randomUUID();
    const parsed = update ? caseInput.partial().parse(body) : caseInput.parse(body);
    if (parsed.draftIds) {
      const drafts = await local.store.list();
      if (parsed.draftIds.some(id => !drafts.some(draft => draft.id === id))) return NextResponse.json({ ok: false, error: 'CASE_DRAFT_NOT_FOUND' }, { status: 404 });
      if ((await desktopCases().list()).some(item => item.id !== id && item.draftIds.some(draftId => parsed.draftIds!.includes(draftId)))) {
        return NextResponse.json({ ok: false, error: 'DRAFT_ALREADY_ASSOCIATED' }, { status: 409 });
      }
    }
    const now = new Date().toISOString();
    const item = await desktopCases().mutate(id, current => {
      if (update && !current) return null;
      return { ...(current || { id, kind: 'LOCAL_CASE', title: '', expediente: null, matter: null, jurisdiction: null, status: 'OPEN',
        actor: null, counterparty: null, sourceCount: 0, notes: '', draftIds: [], createdAt: now }), ...parsed, updatedAt: now } as DesktopCase;
    });
    return item ? NextResponse.json({ ok: true, case: item }, { status: update ? 200 : 201 })
      : NextResponse.json({ ok: false, error: 'CASE_NOT_FOUND' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof z.ZodError ? 'INVALID_CASE' : 'CASE_SAVE_FAILED' }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
export async function POST(request: NextRequest) { return mutateCase(request, false); }
export async function PATCH(request: NextRequest) { return mutateCase(request, true); }
