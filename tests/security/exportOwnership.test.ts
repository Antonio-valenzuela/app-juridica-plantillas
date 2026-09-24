import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { requireLawyerAccess, findMany } = vi.hoisted(() => ({
  requireLawyerAccess: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess }));
vi.mock('@/lib/prisma', () => ({ prisma: { legalDraft: { findMany } } }));

import { POST } from '@/app/api/legal-engine/export/pdf/route';

const ownerB = { organizationId: 'org-b', userId: 'user-b', lawyerId: 'user-b', role: 'lawyer' };

beforeEach(() => {
  (process.env as any).NODE_ENV = 'production';
  requireLawyerAccess.mockResolvedValue({ ok: true, context: ownerB });
  findMany.mockResolvedValue([]);
});

afterEach(() => {
  (process.env as any).NODE_ENV = 'test';
});

describe('export ownership', () => {
  it('denies export when the document belongs to another workspace', async () => {
    const response = await POST(new NextRequest('http://localhost/api/legal-engine/export/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: { id: 'doc-owner-a' } }),
    }));

    expect(response.status).toBe(404);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-b', userId: 'user-b' } }));
  });
});
