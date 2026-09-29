import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireLawyerAccessMock, rateLimitMock, generationAdmissionMock } = vi.hoisted(() => ({
  requireLawyerAccessMock: vi.fn(),
  rateLimitMock: vi.fn(),
  generationAdmissionMock: vi.fn(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: requireLawyerAccessMock }));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: rateLimitMock }));
vi.mock('@/lib/security/aiCostControls', () => ({
  checkGenerationAdmission: generationAdmissionMock,
  maxGenerationInputChars: () => 1_000_000,
}));

import { POST } from '@/app/api/legal-engine/generate/route';

describe('validación API del perfil de profundidad', () => {
  beforeEach(() => {
    requireLawyerAccessMock.mockResolvedValue({
      ok: true,
      context: { organizationId: 'local-test', userId: 'lawyer-test', lawyerId: 'lawyer-test' },
    });
    rateLimitMock.mockReturnValue({ ok: true });
    generationAdmissionMock.mockResolvedValue({ ok: true });
  });

  it('rechaza profundidad manipulada antes de iniciar generación', async () => {
    const request = new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftDepth: { targetPages: 100 }, sync: true }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({ ok: false, errorCode: 'INVALID_DRAFT_DEPTH' });
  });
});
