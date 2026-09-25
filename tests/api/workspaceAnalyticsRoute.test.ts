import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { requireCaseAccess, draftsFindMany, jobsFindMany } = vi.hoisted(() => ({
  requireCaseAccess: vi.fn(),
  draftsFindMany: vi.fn(),
  jobsFindMany: vi.fn(),
}));

vi.mock('@/lib/cases/access', () => ({ requireCaseAccess }));
vi.mock('@/lib/prisma', () => ({ prisma: { legalDraft: { findMany: draftsFindMany }, generationJob: { findMany: jobsFindMany } } }));

import { GET } from '@/app/api/workspace/analytics/route';

const access = { ok: true as const, context: { organizationId: 'org-a', userId: 'user-a', role: 'lawyer' } };
const at = '2026-09-23T12:00:00.000Z';

function request(rangeDays = 30) {
  return new NextRequest(`http://localhost/api/workspace/analytics?rangeDays=${rangeDays}`);
}

function draft(id: string, jobId: string, terminalStatus: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: 'contenido sensible que no debe salir',
    documentType: 'apelacion_civil',
    matter: 'Civil',
    status: 'DRAFT',
    createdAt: at,
    updatedAt: at,
    validationResults: { isValid: terminalStatus === 'COMPLETED', errors: terminalStatus === 'COMPLETED' ? [] : [{ checkId: 'review' }], warnings: [] },
    generationMetadata: { persistence: { jobId, terminalStatus }, ...extra },
    structuredDoc: { privateFacts: 'no debe salir' },
    sourceDocuments: [{ sourceValidated: true, sourceQualityStatus: 'READY', pages: [{ page: 1 }] }],
  };
}

function job(id: string, documentId: string | null, terminalStatus: string, status = 'completed') {
  return { id, documentId, status, terminalStatus, errorCode: terminalStatus === 'FAILED' ? 'PROVIDER_TIMEOUT' : null, warnings: [], createdAt: at, updatedAt: at, startedAt: '2026-09-23T11:59:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireCaseAccess.mockResolvedValue(access);
  draftsFindMany.mockResolvedValue([
    draft('doc-1', 'job-1', 'COMPLETED'),
    draft('doc-2', 'job-2', 'NEEDS_REVIEW'),
    draft('doc-4', 'job-4', 'COMPLETED', { generationExtension: { targetPages: 40, minPages: 40, maxPages: 44, actualPages: 42, extensionTargetUnmet: false } }),
    draft('doc-5', 'job-5', 'NEEDS_REVIEW', { generationExtension: { targetPages: 40, minPages: 40, maxPages: 44, actualPages: 27, extensionTargetUnmet: true } }),
  ]);
  jobsFindMany.mockResolvedValue([
    job('job-1', 'doc-1', 'COMPLETED'),
    job('job-2', 'doc-2', 'NEEDS_REVIEW'),
    job('job-3', null, 'FAILED', 'failed'),
    job('job-4', 'doc-4', 'COMPLETED'),
    job('job-5', 'doc-5', 'NEEDS_REVIEW'),
  ]);
});

describe('GET /api/workspace/analytics', () => {
  it('returns the five-generation dataset without double counting or sensitive fields', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ ok: true, rangeDays: 30, totals: { total: 5, completed: 2, needsReview: 2, failed: 1 } });
    expect(payload.extension).toMatchObject({ achieved: 1, unmet: 1 });
    expect(payload.recent).toContainEqual(expect.objectContaining({ targetPages: 40, actualPages: 27, extensionTargetUnmet: true, status: 'NEEDS_REVIEW' }));
    expect(JSON.stringify(payload)).not.toContain('contenido sensible');
    expect(JSON.stringify(payload)).not.toContain('privateFacts');
  });

  it('passes organization and user isolation to both persisted queries', async () => {
    await GET(request(7));
    expect(draftsFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a', userId: 'user-a' }) }));
    expect(jobsFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a', userId: 'user-a' }) }));
  });
});
