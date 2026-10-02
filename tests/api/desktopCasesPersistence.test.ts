import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import * as route from '@/app/api/workspace/cases/route';
let root: string;
function req(method = 'GET', body?: unknown) { return new NextRequest('http://127.0.0.1:3200/api/workspace/cases', {
  method, headers: { 'x-lex-desktop-capability': 'c'.repeat(64), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
}); }
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-cases-'));
  for (const [key, value] of Object.entries({ LEXPLANTILLAS_STORAGE_ROOT: root, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1',
    LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: 'c'.repeat(64), LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 600000), NODE_ENV: 'production' })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('creates an independent case before any draft exists and retains edits on disk', async () => {
  const post = (route as Record<string, unknown>).POST as ((req: NextRequest) => Promise<Response>) | undefined;
  const response = post ? await post(req('POST', { title: 'EXPEDIENTE SINTETICO', expediente: 'SINTETICO-001', matter: 'Civil', notes: 'Solo prueba' })) : new Response(null, { status: 405 });
  expect(response.status).toBe(201);
  const { case: item } = await response.json();
  const patch = (route as Record<string, unknown>).PATCH as (req: NextRequest) => Promise<Response>;
  expect((await patch(req('PATCH', { id: item.id, title: 'EDITADO', notes: 'Metadata conservada' }))).status).toBe(200);
  const stored = await (await route.GET(req())).json();
  expect(stored.cases).toHaveLength(1);
  expect(stored.cases[0]).toMatchObject({ id: item.id, title: 'EDITADO', expediente: 'SINTETICO-001', notes: 'Metadata conservada', sourceCount: 0 });
});
