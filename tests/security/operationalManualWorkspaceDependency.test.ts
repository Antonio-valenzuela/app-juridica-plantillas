import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';

const database = vi.hoisted(() => ({
  organization: { findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: database }));
import { clearCachedLawyerContext, requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { requireCaseAccess } from '@/lib/cases/access';
import { GET as metadata } from '@/app/api/operational-manual/route';
import { GET as original } from '@/app/api/operational-manual/original/route';
import { isLocalSameOriginDraftExportRequest } from '@/lib/security/localDraftExport';

beforeEach(() => {
  clearCachedLawyerContext();
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DEMO_MODE_ENABLED', 'false');
  vi.stubEnv('LEGAL_CASES_USER_EMAIL', 'configured-test@example.invalid');
  vi.stubEnv('LEGAL_CASES_ORG_SLUG', 'configured-test');
  database.organization.findUnique.mockRejectedValue(new Error('Error opening a TLS connection: No hay credenciales disponibles en el paquete de seguridad (os error -2146893042)'));
});
afterEach(() => { clearCachedLawyerContext(); vi.unstubAllEnvs(); });

describe('manual workspace dependency: characterization before any access exception', () => {
  it.each([['metadata', metadata], ['original', original]] as const)('%s returns 503 although canonical manual exists locally', async (name, handler) => {
    const manifest = JSON.parse(readFileSync('data/documents/operational-manual/v1.0/index.json', 'utf8')).manifest;
    expect(manifest.active).toBe(true);
    expect(manifest.detectedPages).toBe(212);
    const route = `/api/operational-manual${name === 'original' ? '/original' : ''}`;
    const response = await handler(new NextRequest(`http://localhost:3200${route}`, { headers: { Origin: 'http://localhost:3200' } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'WORKSPACE_UNAVAILABLE' });
    expect(database.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'configured-test' }, select: { id: true, slug: true } });
    expect(database.organization.create).not.toHaveBeenCalled();
    expect(database.user.create).not.toHaveBeenCalled();
  });
  it('case guard continues to reject inaccessible workspace', async () => {
    const result = await requireCaseAccess(new Request('http://localhost:3200/api/cases'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
    expect(database.organization.create).not.toHaveBeenCalled();
  });
  it('lawyer guard does not accept localhost Origin as authentication', async () => {
    const result = await requireLawyerAccess(new Request('http://localhost:3200/api/workspace/lawyer-profile', { headers: { Origin: 'http://localhost:3200' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });
  it('draft Origin helper identifies request labels, not deployment mode or trusted peer', () => {
    const request = new Request('http://localhost:3200/api/operational-manual', {
      headers: { Origin: 'http://localhost:3200', 'x-forwarded-for': '203.0.113.10', 'x-forwarded-host': 'remote.example.invalid' },
    });
    expect(isLocalSameOriginDraftExportRequest(request)).toBe(true);
    // Characterization: this helper alone is not a local-resource authorization guard.
  });
});
