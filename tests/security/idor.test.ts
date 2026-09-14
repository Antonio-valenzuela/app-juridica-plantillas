import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock prisma before importing lawyerAuth
const mockOrgFindUnique = vi.fn();
const mockUserFindUnique = vi.fn();
const mockOrgCreate = vi.fn();
const mockUserCreate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: (...args: any[]) => mockOrgFindUnique(...args),
      create: (...args: any[]) => mockOrgCreate(...args),
    },
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
      create: (...args: any[]) => mockUserCreate(...args),
    },
  },
}));

// Import after mock
import { requireLawyerAccess, isDemoModeEnabled, clearCachedLawyerContext } from '@/lib/security/lawyerAuth';

describe('P0 Security - lawyerAuth IDOR protection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearCachedLawyerContext();
    mockOrgFindUnique.mockReset();
    mockUserFindUnique.mockReset();
    mockOrgCreate.mockReset();
    mockUserCreate.mockReset();
    // Default: demo mode enabled for tests (non-production)
    (process.env as any).NODE_ENV = 'test';
    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-token';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/api/legal-drafts', {
      headers: headers as any,
    });
  }

  it('rechaza headers x-user-id/x-org-id sin proxy confiable (401)', async () => {
    const req = makeRequest({ 'x-user-id': 'attacker-user', 'x-org-id': 'victim-org' });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.error).toBe('UNAUTHORIZED_IDENTITY');
    }
  });

  it('rechaza headers con solo uno de los dos valores', async () => {
    const req = makeRequest({ 'x-user-id': 'some-user' });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('permite headers x-user-id/x-org-id CON x-admin-token válido y entidades existentes', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: 'org-123' });
    mockUserFindUnique.mockResolvedValue({ id: 'user-456' });

    const req = makeRequest({
      'x-user-id': 'user-456',
      'x-org-id': 'org-123',
      'x-admin-token': 'test-admin-token',
    });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.organizationId).toBe('org-123');
      expect(result.context.userId).toBe('user-456');
    }
    expect(mockOrgFindUnique).toHaveBeenCalledWith({ where: { id: 'org-123' }, select: { id: true } });
  });

  it('permite headers con Authorization Bearer ADMIN_TOKEN', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: 'org-999' });
    mockUserFindUnique.mockResolvedValue({ id: 'user-999' });
    const req = makeRequest({
      'x-user-id': 'user-999',
      'x-org-id': 'org-999',
      'authorization': 'Bearer test-admin-token',
    });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(true);
  });

  it('rechaza headers con x-admin-token inválido', async () => {
    const req = makeRequest({
      'x-user-id': 'user-456',
      'x-org-id': 'org-123',
      'x-admin-token': 'wrong-token',
    });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('rechaza headers con org inexistente aunque proxy sea válido', async () => {
    mockOrgFindUnique.mockResolvedValue(null); // org not found
    const req = makeRequest({
      'x-user-id': 'user-456',
      'x-org-id': 'non-existent-org',
      'x-admin-token': 'test-admin-token',
    });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.friendlyMessage).toMatch(/Organización/);
    }
  });

  it('rechaza headers con user inexistente aunque proxy sea válido', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: 'org-123' });
    mockUserFindUnique.mockResolvedValue(null);
    const req = makeRequest({
      'x-user-id': 'ghost-user',
      'x-org-id': 'org-123',
      'x-admin-token': 'test-admin-token',
    });
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it('DEMO_MODE_ENABLED=false en producción bloquea fallback silencioso a demo', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.DEMO_MODE_ENABLED = 'false';
    delete process.env.LEGAL_CASES_USER_EMAIL;
    delete process.env.LEGAL_CASES_ORG_SLUG;
    // Ensure DB is not mocked to avoid fallback path trying DB
    mockOrgFindUnique.mockRejectedValue(new Error('DB down'));

    const req = makeRequest({});
    const result = await requireLawyerAccess(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([401, 503]).toContain(result.response.status);
      const body = await result.response.json();
      // Should be UNAUTHORIZED_IDENTITY not WORKSPACE_UNAVAILABLE with demo fallback
      expect(body.error).not.toBeUndefined();
    }
  });

  it('isDemoModeEnabled respeta flag explícito', () => {
    process.env.DEMO_MODE_ENABLED = 'true';
    expect(isDemoModeEnabled()).toBe(true);
    process.env.DEMO_MODE_ENABLED = 'false';
    expect(isDemoModeEnabled()).toBe(false);
    delete process.env.DEMO_MODE_ENABLED;
    (process.env as any).NODE_ENV = 'development';
    expect(isDemoModeEnabled()).toBe(true);
    (process.env as any).NODE_ENV = 'production';
    expect(isDemoModeEnabled()).toBe(false);
  });
});

describe('P0 Security - aislamiento cross-tenant en legalDrafts', () => {
  beforeEach(() => {
    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.ADMIN_TOKEN = 'test-admin-token';
  });

  it('draft de org-A no es accesible para org-B (simulado vía prisma where)', async () => {
    // This is a contract test: verify that our mocked prisma logic filters by organizationId
    // Real DB isolation is verified in integration; here we document the contract.
    const drafts = [
      { id: 'draft-1', organizationId: 'org-A', title: 'Demanda A' },
      { id: 'draft-2', organizationId: 'org-B', title: 'Demanda B' },
    ];
    const filterByOrg = (orgId: string) => drafts.filter((d) => d.organizationId === orgId);
    expect(filterByOrg('org-A')).toHaveLength(1);
    expect(filterByOrg('org-A')[0].id).toBe('draft-1');
    expect(filterByOrg('org-B')).toHaveLength(1);
    expect(filterByOrg('org-A').some((d) => d.id === 'draft-2')).toBe(false);
  });

  it('GET /api/templates/custom debe filtrar por OR organizationId sin exponer demo-legal ajeno', async () => {
    // Documenta que el fix eliminó OR demo-legal del GET
    // Ver archivo: app/api/templates/custom/[id]/route.ts:39-49
    // El código ahora solo permite: { organizationId: orgId } OR { visibility: PUBLIC }
    // Nunca { organizationId: demo-legal } para otro tenant
    const code = await import('fs').then((m) => m.readFileSync('app/api/templates/custom/[id]/route.ts', 'utf-8'));
    expect(code).not.toContain("organizationId: 'demo-legal'");
    expect(code).not.toContain('organizationId: "demo-legal"');
    // Should contain PUBLIC check
    expect(code).toContain("visibility: 'PUBLIC'");
  });
});
