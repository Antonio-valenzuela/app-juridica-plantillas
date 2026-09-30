import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ organization: { findUnique: vi.fn(), create: vi.fn() }, user: { findUnique: vi.fn(), create: vi.fn() }, legalTemplate: { findFirst: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { clearCachedLawyerContext } from '@/lib/security/lawyerAuth';
import { requireCaseAccess } from '@/lib/cases/access';
import { GET as metadata } from '@/app/api/operational-manual/route';
import { GET as original } from '@/app/api/operational-manual/original/route';
import { GET as templateFile } from '@/app/api/templates/files/[filename]/route';
import { GET as profile } from '@/app/api/workspace/lawyer-profile/route';

let capability = '';
beforeEach(() => {
  clearCachedLawyerContext(); vi.clearAllMocks();
  capability = randomBytes(32).toString('hex');
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('DEMO_MODE_ENABLED', 'false');
  vi.stubEnv('LEGAL_CASES_USER_EMAIL', 'configured-test@example.invalid'); vi.stubEnv('LEGAL_CASES_ORG_SLUG', 'configured-test');
  vi.stubEnv('LEX_RUNTIME_MODE', 'DESKTOP_LOCAL'); vi.stubEnv('LEX_DESKTOP_BIND_ADDRESS', '127.0.0.1');
  vi.stubEnv('LEX_DESKTOP_PORT', '3200'); vi.stubEnv('LEX_DESKTOP_CAPABILITY', capability);
  vi.stubEnv('LEX_DESKTOP_EXPIRES_AT', String(Date.now() + 60000));
  db.organization.findUnique.mockRejectedValue(new Error('TLS connection unavailable'));
});
afterEach(() => { clearCachedLawyerContext(); vi.unstubAllEnvs(); });
const request = (path: string, headers: Record<string,string> = {}) => new NextRequest(`http://127.0.0.1:3200${path}`, { headers });

describe('launcher-authorized desktop manual access', () => {
  it('metadata200 with a valid capability and unavailable DB, without organization query', async () => {
    const response = await metadata(request('/api/operational-manual', { 'x-lex-desktop-capability': capability }));
    expect(response.status).toBe(200);
    expect((await response.json()).manifest).toMatchObject({ version:'1.0',pageCount:212,fragmentCount:6860 });
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });
  it('original200 contains canonical PDF bytes without DB', async () => {
    const response = await original(request('/api/operational-manual/original', { 'x-lex-desktop-capability': capability }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex')).toBe('b3910bb8a0b44bd1a38d3fe9edbd32984ade48b6b66c7bf62b01db3e79348f25');
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });
  it.each([undefined, 'incorrect', 'a'.repeat(64)])('rejects missing/incorrect capability %s', async supplied => {
    const response = await metadata(request('/api/operational-manual', supplied ? { 'x-lex-desktop-capability': supplied } : {}));
    expect(response.status).toBe(403);
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });
  it('localhost + Origin + forged desktop flag never replaces a capability', async () => {
    const response = await metadata(new NextRequest('http://localhost:3200/api/operational-manual?mode=desktop', { headers: { Origin:'http://localhost:3200','x-mode':'desktop','x-forwarded-for':'127.0.0.1' } }));
    expect(response.status).toBe(403);
  });
  it('WEB retains the original authenticated DB-down behavior even with a desktop header', async () => {
    vi.stubEnv('LEX_RUNTIME_MODE','WEB');
    const response = await metadata(request('/api/operational-manual', { 'x-lex-desktop-capability':capability,'x-mode':'desktop' }));
    expect(response.status).toBe(503);
    expect(db.organization.findUnique).toHaveBeenCalled();
  });
  it.each(['0.0.0.0', '::', '192.168.1.10'])('rejects local runtime misconfigured on %s', async address => {
    vi.stubEnv('LEX_DESKTOP_BIND_ADDRESS',address);
    const response = await metadata(request('/api/operational-manual', { 'x-lex-desktop-capability':capability }));
    expect(response.status).toBe(503);
  });
  it('expired capability cannot reopen a previous session', async () => {
    vi.stubEnv('LEX_DESKTOP_EXPIRES_AT', String(Date.now()-1));
    const response = await metadata(request('/api/operational-manual', { 'x-lex-desktop-capability':capability }));
    expect(response.status).toBe(503);
  });
  it('case, persisted template file and workspace profile keep their guards', async () => {
    const headers = { 'x-lex-desktop-capability':capability };
    const access = await requireCaseAccess(request('/api/cases', headers));
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(503);
    const template = await templateFile(request('/api/templates/files/client.pdf', headers), { params:Promise.resolve({filename:'client.pdf'}) });
    expect(template.status).toBe(503);
    expect((await profile(request('/api/workspace/lawyer-profile',headers))).status).toBe(503);
    expect(db.legalTemplate.findFirst).not.toHaveBeenCalled();
    expect(db.organization.create).not.toHaveBeenCalled(); expect(db.user.create).not.toHaveBeenCalled();
  });
});
