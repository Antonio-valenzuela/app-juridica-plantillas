import 'server-only';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { desktopDraftRepository } from './desktopDraftRepository';
import { DesktopRecordRepository } from './desktopRecordRepository';

interface Party { id: string; caseKey: string; role: string; name: string; source: 'manual' | 'detected'; confidence: number | null }
const store = () => new DesktopRecordRepository<Party>('parties', party => typeof party.caseKey === 'string' && typeof party.name === 'string' && ['manual', 'detected'].includes(party.source));
export async function localPartiesRead(request: NextRequest): Promise<Response | null> {
  const access = desktopDraftRepository(request);
  if (!access) return null;
  if (!access.ok) return access.response;
  const caseKey = new URL(request.url).searchParams.get('caseKey')?.trim();
  if (!caseKey) return NextResponse.json({ ok: false, error: 'MISSING_CASE_KEY' }, { status: 400 });
  try { return NextResponse.json({ ok: true, parties: (await store().list()).filter(party => party.caseKey === caseKey) }); }
  catch { return NextResponse.json({ ok: false, error: 'PARTIES_QUERY_FAILED' }, { status: 500 }); }
}
export async function localPartiesDelete(request: NextRequest): Promise<Response | null> {
  const access = desktopDraftRepository(request);
  if (!access) return null;
  if (!access.ok) return access.response;
  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false, error: 'INVALID_ID' }, { status: 400 });
  try {
    if (!await store().find(id)) return NextResponse.json({ ok: false, error: 'PARTY_NOT_FOUND' }, { status: 404 });
    await store().mutate(id, () => null);
    return NextResponse.json({ ok: true, deleted: true });
  } catch { return NextResponse.json({ ok: false, error: 'PARTY_DELETE_FAILED' }, { status: 500 }); }
}
export async function saveLocalParty(data: Omit<Party, 'id'>): Promise<Response> {
  // Stable key serializes concurrent updates for the same case/role without WEB identity.
  const hash = createHash('sha256').update(JSON.stringify([data.caseKey, data.role])).digest('hex');
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
  try {
    const party = await store().mutate(id, existing => {
      if (!data.name) return null;
      if (existing?.source === 'manual' && data.source === 'detected') return existing;
      return { ...data, id, confidence: data.confidence ?? existing?.confidence ?? null };
    });
    return NextResponse.json(party ? { ok: true, party } : { ok: true, deleted: true });
  } catch { return NextResponse.json({ ok: false, error: 'PARTY_SAVE_FAILED' }, { status: 500 }); }
}
