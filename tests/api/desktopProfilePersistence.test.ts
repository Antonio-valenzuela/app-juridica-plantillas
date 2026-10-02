import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/workspace/lawyer-profile/route';
import { clearCachedLawyerContext } from '@/lib/security/lawyerAuth';
import { POST as saveParty, GET as readParties } from '@/app/api/legal-engine/parties/route';

let root: string;
const capability = 'a'.repeat(64);
function request(method = 'GET', body?: unknown, authorized = true) {
  return new NextRequest('http://127.0.0.1:3200/api/workspace/lawyer-profile', {
    method, headers: { 'content-type': 'application/json', ...(authorized ? { 'x-lex-desktop-capability': capability } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  clearCachedLawyerContext();
  vi.stubEnv('LEGAL_CASES_USER_EMAIL', '');
  vi.stubEnv('LEGAL_CASES_ORG_SLUG', '');
  vi.stubEnv('DEMO_MODE_ENABLED', 'false');
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-profile-'));
  vi.stubEnv('LEXPLANTILLAS_STORAGE_ROOT', root);
  vi.stubEnv('LEX_RUNTIME_MODE', 'DESKTOP_LOCAL');
  vi.stubEnv('LEX_DESKTOP_BIND_ADDRESS', '127.0.0.1');
  vi.stubEnv('LEX_DESKTOP_PORT', '3200');
  vi.stubEnv('LEX_DESKTOP_CAPABILITY', capability);
  vi.stubEnv('LEX_DESKTOP_EXPIRES_AT', String(Date.now() + 600000));
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('persists a workspace owner, never invents lawyer details, and saves the actual professional fields', async () => {
  const initial = await GET(request());
  expect(initial.status).toBe(200);
  const first = await initial.json();
  expect(first.profile.lawyerName).toBe('');
  expect(first.profile.firmName).toBe('');
  expect(first.ownerId).toMatch(/^[0-9a-f-]{36}$/);
  expect(first.configurationRequired).toBe(true);
  const saved = await PUT(request('PUT', { lawyerName: 'ABOGADO SINTETICO', firmName: 'PRUEBA', professionalLicense: 'SINTETICA', email: 'fixture@example.invalid', lawyerId: 'forged' }));
  expect(saved.status).toBe(200);
  const read = await (await GET(request())).json();
  expect(read.ownerId).toBe(first.ownerId);
  expect(read.profile.lawyerId).toBe(first.ownerId);
  expect(read.profile.professionalLicense).toBe('SINTETICA');
  expect(read.profile.email).toBe('fixture@example.invalid');
  expect(read.configurationRequired).toBe(false);
  expect((await PUT(request('PUT', { lawyerName: 'EDITADO' }))).status).toBe(200);
  expect((await (await GET(request())).json()).profile).toMatchObject({ lawyerName: 'EDITADO', email: 'fixture@example.invalid' });
});
it('rejects invalid local capability and leaves WEB authentication intact', async () => {
  expect((await GET(request('GET', undefined, false))).status).toBe(403);
  vi.stubEnv('LEX_RUNTIME_MODE', 'WEB');
  vi.stubEnv('NODE_ENV', 'production');
  clearCachedLawyerContext();
  expect((await GET(request())).status).toBe(401);
});
it('persists manually confirmed parties without allowing detected values to overwrite them', async () => {
  const partyRequest = (source: string, name: string) => new NextRequest('http://127.0.0.1:3200/api/legal-engine/parties', {
    method: 'POST', headers: { 'x-lex-desktop-capability': capability, 'content-type': 'application/json' },
    body: JSON.stringify({ caseKey: 'SINTETICO-PARTIES', role: 'demandado', name, source }),
  });
  expect((await saveParty(partyRequest('manual', 'PERSONA SINTETICA CONFIRMADA'))).status).toBe(200);
  expect((await saveParty(partyRequest('detected', 'NO DEBE REEMPLAZAR'))).status).toBe(200);
  const response = await readParties(new NextRequest('http://127.0.0.1:3200/api/legal-engine/parties?caseKey=SINTETICO-PARTIES', {
    headers: { 'x-lex-desktop-capability': capability },
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).parties[0].name).toBe('PERSONA SINTETICA CONFIRMADA');
});
