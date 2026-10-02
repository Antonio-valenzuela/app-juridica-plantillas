import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST, GET } from '@/app/api/templates/custom/route';
import { GET as open, PATCH, DELETE } from '@/app/api/templates/custom/[id]/route';
let root: string;
function req(method = 'GET', body?: unknown, id?: string) {
  return new NextRequest(`http://127.0.0.1:3200/api/templates/custom${id ? '/' + id : ''}`, {
    method, headers: { 'x-lex-desktop-capability': 'b'.repeat(64), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-templates-'));
  for (const [key, value] of Object.entries({ LEXPLANTILLAS_STORAGE_ROOT: root, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1',
    LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: 'b'.repeat(64), LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 600000),
    NODE_ENV: 'production', LEGAL_CASES_USER_EMAIL: '', LEGAL_CASES_ORG_SLUG: '', DEMO_MODE_ENABLED: 'false' })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('creates, lists, reopens, edits and deletes an explicit template using real local disk', async () => {
  expect((await POST(req('POST', { title: 'NO ES PLANTILLA', content: 'Texto' }))).status).toBe(400);
  const response = await POST(req('POST', { entityKind: 'TEMPLATE', creationIntent: 'EXPLICIT_TEMPLATE',
    title: 'MACHOTE SINTETICO', category: 'Civil', content: 'EXPEDIENTE: 111/2026\nC. JUEZ COMPETENTE\nComparece PERSONA SINTETICA a solicitar una actuación.' }));
  expect(response.status).toBe(201);
  const { template } = await response.json();
  const params = { params: Promise.resolve({ id: template.id }) };
  expect((await (await GET(req())).json()).templates).toHaveLength(1);
  expect((await (await open(req('GET', undefined, template.id), params)).json()).template.content).not.toContain('111/2026');
  expect((await PATCH(req('PATCH', { title: 'MACHOTE EDITADO' }, template.id), params)).status).toBe(200);
  expect((await (await open(req('GET', undefined, template.id), params)).json()).template.title).toBe('MACHOTE EDITADO');
  expect((await DELETE(req('DELETE', undefined, template.id), params)).status).toBe(200);
  expect((await (await GET(req())).json()).templates).toHaveLength(0);
});
