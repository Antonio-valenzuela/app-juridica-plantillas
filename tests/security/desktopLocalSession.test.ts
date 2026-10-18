import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/desktop-local/session/route';
import { requireDesktopLocalAccess } from '@/lib/security/desktopLocalAccess';
let secret: string;
beforeEach(() => {
  secret = randomBytes(32).toString('hex');
  for (const [key, value] of Object.entries({ LEX_RUNTIME_MODE: 'DESKTOP_LOCAL', LEX_DESKTOP_BIND_ADDRESS: '127.0.0.1', LEX_DESKTOP_PORT: '3200', LEX_DESKTOP_CAPABILITY: secret, LEX_DESKTOP_EXPIRES_AT: String(Date.now() + 60000) })) vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it('issues a narrowly scoped HttpOnly cookie that authorizes the manual', async () => {
  const response = await POST(new NextRequest('http://127.0.0.1:3200/api/desktop-local/session', { method: 'POST', headers: { 'x-lex-desktop-capability': secret } }));
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  const cookie = response.headers.get('set-cookie')!;
  // Header casing varies across NextResponse serializers; test semantics and
  // never include the secret cookie value in an assertion failure.
  expect(/path=\/api\/operational-manual(?:;|$)/i.test(cookie)).toBe(true);
  expect(/(?:^|;)\s*httponly(?:;|$)/i.test(cookie)).toBe(true);
  expect(/(?:^|;)\s*samesite=strict(?:;|$)/i.test(cookie)).toBe(true);
  expect(requireDesktopLocalAccess(new NextRequest('http://127.0.0.1:3200/api/operational-manual', { headers: { cookie: cookie.split(';')[0] } })).ok).toBe(true);
});
it('a cookie cannot mint another session', async () => {
  const response = await POST(new NextRequest('http://127.0.0.1:3200/api/desktop-local/session', { method:'POST', headers: { cookie: `lex_desktop_manual_cap=${secret}` } }));
  expect(response.status).toBe(403);
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('WEB does not expose the local exchange', async () => {
  vi.stubEnv('LEX_RUNTIME_MODE', 'WEB');
  expect((await POST(new NextRequest('http://127.0.0.1:3200/api/desktop-local/session', { method:'POST', headers: { 'x-lex-desktop-capability':secret } }))).status).toBe(404);
});
