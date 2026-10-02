import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { desktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';
import { desktopAgenda, type DesktopAgendaEvent } from '@/lib/workspace/desktopAgendaRepository';
import { desktopCases } from '@/lib/workspace/desktopCaseRepository';
import { requireCaseAccess } from '@/lib/cases/access';
import { extractAgendaEvents } from '@/lib/workspace/agenda';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const date = z.string().refine(value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
const fields = z.object({ title: z.string().trim().min(1).max(300), dueDate: date,
  time: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).optional(), priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  status: z.enum(['PENDING', 'COMPLETED']).default('PENDING'), caseId: z.string().uuid().nullable().optional(),
  notes: z.string().max(20000).optional(), eventType: z.string().max(100).optional(),
});
async function access(request: NextRequest) {
  const local = desktopDraftRepository(request);
  if (local) return local.ok ? null : local.response;
  const web = await requireCaseAccess(request);
  return web.ok ? NextResponse.json({ ok: false, error: 'WEB_AGENDA_NOT_AVAILABLE' }, { status: 405 }) : web.response;
}
function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof z.ZodError ? 'INVALID_AGENDA_EVENT' : 'AGENDA_STORAGE_FAILED' }, { status: error instanceof z.ZodError ? 400 : 500 });
}
export async function GET(request: NextRequest) {
  const denied = await access(request); if (denied) return denied;
  try { return NextResponse.json({ ok: true, storage: 'DESKTOP_LOCAL', events: (await desktopAgenda().list()).filter(event => !event.deleted) }); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const denied = await access(request); if (denied) return denied;
  try {
    const body = await request.json();
    if (body.action === 'SYNC_DOCUMENT') {
      const parsed = z.object({ documentId: z.string().min(1).max(200), text: z.string().max(1000000),
        referenceDate: date.optional(), caseId: z.string().optional(), expediente: z.string().max(100).optional() }).parse(body);
      const previous = await desktopAgenda().list();
      const extracted = extractAgendaEvents(parsed.text, parsed);
      for (const candidate of extracted) {
        const sourceKey = createHash('sha256').update(`${parsed.documentId}\0${candidate.sourceText}`).digest('hex');
        const existing = previous.find(event => event.sourceKey === sourceKey);
        if (existing) continue; // Deleted and manually edited records must not be recreated/overwritten.
        const id = `${sourceKey.slice(0,8)}-${sourceKey.slice(8,12)}-5${sourceKey.slice(13,16)}-8${sourceKey.slice(17,20)}-${sourceKey.slice(20,32)}`;
        await desktopAgenda().mutate(id, current => current || { ...candidate, id, sourceKey, dueDate: candidate.needsReview ? '' : candidate.dueDate });
      }
      return NextResponse.json({ ok: true, candidates: extracted.length });
    }
    const parsed = fields.parse(body);
    if (parsed.caseId && !await desktopCases().find(parsed.caseId)) return NextResponse.json({ ok: false, error: 'CASE_NOT_FOUND' }, { status: 404 });
    const now = new Date().toISOString();
    const event: DesktopAgendaEvent = { ...parsed, caseId: parsed.caseId || undefined, id: randomUUID(), documentId: '',
      source: 'MANUAL', sourceText: '', needsReview: false, createdAt: now, updatedAt: now };
    await desktopAgenda().put(event);
    return NextResponse.json({ ok: true, event }, { status: 201 });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: NextRequest) {
  const denied = await access(request); if (denied) return denied;
  try {
    const body = await request.json();
    const id = z.string().uuid().parse(body.id);
    const parsed = fields.partial().parse(body);
    if (parsed.caseId && !await desktopCases().find(parsed.caseId)) return NextResponse.json({ ok: false, error: 'CASE_NOT_FOUND' }, { status: 404 });
    const event = await desktopAgenda().mutate(id, current => current && !current.deleted ? { ...current, ...parsed,
      caseId: parsed.caseId === null ? undefined : parsed.caseId ?? current.caseId,
      userEdited: true, needsReview: parsed.dueDate ? false : current.needsReview, updatedAt: new Date().toISOString() } : current);
    return event && !event.deleted ? NextResponse.json({ ok: true, event }) : NextResponse.json({ ok: false, error: 'EVENT_NOT_FOUND' }, { status: 404 });
  } catch (error) { return failure(error); }
}
export async function DELETE(request: NextRequest) {
  const denied = await access(request); if (denied) return denied;
  try {
    const id = z.string().uuid().parse((await request.json()).id);
    const event = await desktopAgenda().mutate(id, current => current ? { ...current, deleted: true, updatedAt: new Date().toISOString() } : null);
    return event ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: 'EVENT_NOT_FOUND' }, { status: 404 });
  } catch (error) { return failure(error); }
}
