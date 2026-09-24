import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findFirstMock, deleteManyMock, lstatMock, unlinkMock } = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  deleteManyMock: vi.fn(),
  lstatMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    legalTemplate: {
      findFirst: findFirstMock,
      deleteMany: deleteManyMock,
    },
  },
}));

vi.mock('@/lib/cases/access', () => ({
  requireCaseAccess: vi.fn(async () => ({
    ok: true,
    context: { organizationId: 'org-test', userId: 'user-test', role: 'LAWYER' },
  })),
}));

vi.mock('node:fs/promises', () => ({ lstat: lstatMock, unlink: unlinkMock }));

import { DELETE } from '@/app/api/templates/custom/[id]/route';

describe('template deletion integrity', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    deleteManyMock.mockReset();
    lstatMock.mockReset();
    unlinkMock.mockReset();
    findFirstMock.mockResolvedValue({
      id: 'template-1',
      structureJson: { storage: { savedFileName: 'owned.pdf' } },
    });
    lstatMock.mockResolvedValue({ isFile: () => true });
    unlinkMock.mockResolvedValue(undefined);
    deleteManyMock.mockResolvedValue({ count: 1 });
  });

  it('cleans the owned physical file before deleting its scoped database row', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/templates/custom/template-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'template-1' }) },
    );

    expect(response.status).toBe(200);
    expect(unlinkMock).toHaveBeenCalledOnce();
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { id: 'template-1', organizationId: 'org-test' },
    });
  });

  it('does not delete the database row when the stored filename is unsafe', async () => {
    findFirstMock.mockResolvedValueOnce({
      id: 'template-1',
      structureJson: { storage: { savedFileName: '../outside.pdf' } },
    });

    const response = await DELETE(
      new NextRequest('http://localhost/api/templates/custom/template-1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'template-1' }) },
    );

    expect(response.status).toBe(409);
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });
});
