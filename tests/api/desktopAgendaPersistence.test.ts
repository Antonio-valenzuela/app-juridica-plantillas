import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
let root: string;
function req(method = 'GET', body?: unknown) { return new NextRequest('http://127.0.0.1:3200/api/workspace/agenda', {
  method, headers: { 'x-lex-desktop-capability': 'd'.repeat(64), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
}); }
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-agenda-'));
  for (const [key, value] of Object.entries({ LEXPLANTILLAS_STORAGE_ROOT: root, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1',
    LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: 'd'.repeat(64), LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 600000), NODE_ENV: 'production' })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('serializes concurrent sync by logical source identity and retains manual edits and tombstones', async () => {
  const route = await import('@/app/api/workspace/agenda/route');
  const sync = { action: 'SYNC_DOCUMENT', documentId: 'SYN-CONCURRENT', text: 'Audiencia el 10 de octubre de 2026.', referenceDate: '2026-10-01' };
  await Promise.all([route.POST(req('POST', sync)), route.POST(req('POST', sync))]);
  const events = (await (await route.GET(req())).json()).events;
  expect(events).toHaveLength(1);
  const id = events[0].id;
  await route.PATCH(req('PATCH', { id, title: 'CONFIRMADO MANUALMENTE', dueDate: '2026-10-12' }));
  await Promise.all([route.POST(req('POST', sync)), route.POST(req('POST', sync))]);
  expect((await (await route.GET(req())).json()).events).toEqual([expect.objectContaining({ id, title: 'CONFIRMADO MANUALMENTE', dueDate: '2026-10-12' })]);
  await route.DELETE(req('DELETE', { id }));
  await Promise.all([route.POST(req('POST', sync)), route.POST(req('POST', sync))]);
  expect((await (await route.GET(req())).json()).events).toHaveLength(0);
});
it('persists full CRUD and preserves deletion when a document is scanned again', async () => {
  const route = await import('@/app/api/workspace/agenda/route').catch(() => null);
  const created = route ? await route.POST(req('POST', { title: 'AUDIENCIA SINTETICA', dueDate: '2026-10-05', time: '16:30', priority: 'HIGH', notes: 'PRUEBA', eventType: 'AUDIENCIA' })) : new Response(null, { status: 404 });
  expect(created.status).toBe(201);
  const { event } = await created.json();
  expect((await route!.PATCH(req('PATCH', { id: event.id, dueDate: '2026-10-06', priority: 'LOW', title: 'EDITADO' }))).status).toBe(200);
  expect((await (await route!.GET(req())).json()).events[0]).toMatchObject({ dueDate: '2026-10-06', title: 'EDITADO', time: '16:30', notes: 'PRUEBA' });
  expect((await route!.DELETE(req('DELETE', { id: event.id }))).status).toBe(200);
  expect((await (await route!.GET(req())).json()).events).toHaveLength(0);
  const sync = { action: 'SYNC_DOCUMENT', documentId: 'DOC-SINTETICO', text: 'Audiencia el 10 de octubre de 2026. Presentar escrito dentro de 5 días.', referenceDate: '2026-10-01' };
  expect((await route!.POST(req('POST', sync))).status).toBe(200);
  const items = (await (await route!.GET(req())).json()).events;
  expect(items).toHaveLength(2);
  expect(items.find((item: { needsReview: boolean }) => item.needsReview).dueDate).toBe('');
  const explicit = items.find((item: { needsReview: boolean }) => !item.needsReview);
  await route!.DELETE(req('DELETE', { id: explicit.id }));
  expect((await route!.PATCH(req('PATCH', { id: explicit.id, title: 'NO RESTAURAR' }))).status).toBe(404);
  await route!.POST(req('POST', sync));
  expect((await (await route!.GET(req())).json()).events).toHaveLength(1);
});
