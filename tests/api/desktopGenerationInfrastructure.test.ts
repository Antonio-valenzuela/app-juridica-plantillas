import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/legal-engine/generate/route';
import { PUT } from '@/app/api/workspace/lawyer-profile/route';
import { POST as upload } from '@/app/api/templates/analyze-upload/route';
let root: string;
function request(url: string, body: unknown) {
  return new NextRequest(`http://127.0.0.1:3200${url}`, { method: url.includes('lawyer-profile') ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json', 'x-lex-desktop-capability': 'a'.repeat(64) }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'lex-generation-'));
  for (const [key, value] of Object.entries({ LEXPLANTILLAS_STORAGE_ROOT: root, LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1',
    LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: 'a'.repeat(64), LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 600000),
    NODE_ENV: 'production', LEGAL_CASES_USER_EMAIL: '', LEGAL_CASES_ORG_SLUG: '', DEMO_MODE_ENABLED: 'false' })) vi.stubEnv(key, value);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
it('requires explicit local profile configuration before any generation/provider work', async () => {
  const response = await POST(request('/api/legal-engine/generate', { draftDepth: 'INVALID' }));
  expect(response.status).toBe(422);
  expect((await response.json()).errorCode).toBe('DESKTOP_PROFILE_CONFIGURATION_REQUIRED');
});
it('reaches the existing input validator with the real local owner, without remote admission', async () => {
  expect((await PUT(request('/api/workspace/lawyer-profile', { lawyerName: 'ABOGADO SINTETICO' }))).status).toBe(200);
  const response = await POST(request('/api/legal-engine/generate', { draftDepth: 'INVALID' }));
  expect(response.status).toBe(400);
  expect((await response.json()).errorCode).toBe('INVALID_DRAFT_DEPTH');
});
it('permits local upload validation without any WEB identity or invented lawyer information', async () => {
  const response = await upload(new NextRequest('http://127.0.0.1:3200/api/templates/analyze-upload', {
    method: 'POST', headers: { 'x-lex-desktop-capability': 'a'.repeat(64) }, body: new FormData(),
  }));
  expect(response.status).toBe(400);
  expect((await response.json()).message).toBe('No se recibió ningún archivo.');
});
