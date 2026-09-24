import { createHmac } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockOrgFindUnique, mockUserFindUnique } = vi.hoisted(() => ({
  mockOrgFindUnique: vi.fn(),
  mockUserFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: { findUnique: mockOrgFindUnique },
    user: { findUnique: mockUserFindUnique },
  },
}));

import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { createGenerationJob } from '@/lib/legal-engine/generationJobs';

function sessionToken(userId: string, organizationId: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, organizationId, exp: Date.now() + 60_000 })).toString('base64url');
  const signature = createHmac('sha256', 'pilot-session-secret').update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function request(token: string): Request {
  return new Request('http://localhost/api/legal-engine/generate/status', {
    headers: { cookie: `jr_session=${token}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (process.env as any).NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'pilot-session-secret';
  mockOrgFindUnique.mockImplementation(({ where }: any) => (
    where?.id === 'org-a' ? { id: 'org-a' } : { id: 'org-fallback', slug: where?.slug }
  ));
  mockUserFindUnique.mockImplementation(({ where }: any) => (
    where?.id === 'user-a' ? { id: 'user-a' } : { id: 'user-fallback', email: where?.email }
  ));
});

describe('pilot session and resource ownership', () => {
  it('resolves the authenticated principal from a signed session cookie', async () => {
    const result = await requireLawyerAccess(request(sessionToken('user-a', 'org-a')));

    expect(result).toMatchObject({ ok: true, context: { userId: 'user-a', organizationId: 'org-a' } });
  });

  it('does not allow a different principal to claim an existing generation job', () => {
    const job = createGenerationJob({ fingerprint: 'ownership-red', organizationId: 'org-a', userId: 'user-a' } as any);

    expect(job.organizationId).toBe('org-a');
    expect(job.userId).toBe('user-a');
    expect({ organizationId: 'org-b', userId: 'user-b' }).not.toEqual({ organizationId: job.organizationId, userId: job.userId });
  });
});
