import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { requireCaseAccess, findFirst, existsSync, statSync, readFileSync } = vi.hoisted(() => ({
  requireCaseAccess: vi.fn(),
  findFirst: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('@/lib/cases/access', () => ({ requireCaseAccess }));
vi.mock('@/lib/prisma', () => ({ prisma: { legalTemplate: { findFirst } } }));
vi.mock('fs', () => ({ default: { existsSync, statSync, readFileSync } }));

import { GET } from '@/app/api/templates/files/[filename]/route';

const contextA = { organizationId: 'org-a', userId: 'user-a' };
const contextB = { organizationId: 'org-a', userId: 'user-b' };

function request() {
  return new NextRequest('http://localhost/api/templates/files/123-fixture.pdf');
}

beforeEach(() => {
  vi.clearAllMocks();
  existsSync.mockReturnValue(true);
  statSync.mockReturnValue({ isFile: () => true });
  readFileSync.mockReturnValue(Buffer.from('%PDF-fixture'));
  requireCaseAccess.mockResolvedValue({ ok: true, context: contextB });
});

describe('template file ownership', () => {
  it('denies a file when it is not linked to the authenticated workspace', async () => {
    findFirst.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ filename: '123-fixture.pdf' }) });

    expect(response.status).toBe(404);
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('serves a file linked to the authenticated workspace', async () => {
    requireCaseAccess.mockResolvedValue({ ok: true, context: contextA });
    findFirst.mockResolvedValue({ id: 'template-a' });

    const response = await GET(request(), { params: Promise.resolve({ filename: '123-fixture.pdf' }) });

    expect(response.status).toBe(200);
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});
