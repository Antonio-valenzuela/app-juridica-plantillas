import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaceAccess: vi.fn(), caseAccess: vi.fn(), ownerKey: vi.fn(),
  requestRateLimit: vi.fn(), ipRateLimit: vi.fn(), admission: vi.fn(), maxInput: vi.fn(),
  runLegalAI: vi.fn(),
}));

vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: mocks.workspaceAccess,
  executionOwnerKey: mocks.ownerKey,
}));
vi.mock('@/lib/cases/access', () => ({ requireCaseAccess: mocks.caseAccess }));
vi.mock('@/lib/security/rateLimit', () => ({
  checkRequestRateLimit: mocks.requestRateLimit,
  checkRateLimit: mocks.ipRateLimit,
  extractIp: () => '127.0.0.1',
}));
vi.mock('@/lib/security/aiCostControls', () => ({
  checkGenerationAdmission: mocks.admission,
  maxGenerationInputChars: mocks.maxInput,
}));
vi.mock('@/lib/ai/orchestrator', () => ({ runLegalAI: mocks.runLegalAI }));

import { POST } from '@/app/api/legal-engine/appeal/reasoning-classification/route';

const payload = () => {
  const sourceText = 'El órgano jurisdiccional considera insuficiente la prueba.';
  return {
    documentType: 'apelacion_civil', resolutionId: 'resolution-test', representedRole: 'actor',
    representedNames: ['PARTE_ACTORA_1'],
    globalOutcome: { impact: 'ADVERSE', classificationReason: 'Resultado adverso confirmado.' },
    externalProviderOptIn: false,
    blocks: [{
      id: 'block-test', resolutionId: 'resolution-test', section: 'CONSIDERANDO PRIMERO', kind: 'REASONING',
      pages: [5], sourceText,
      sourceSpans: [{ sourceId: 'source-test', page: 5, excerpt: sourceText, start: 0, end: sourceText.length }],
      fallback: { impact: 'UNDETERMINED', appliedRule: 5, classificationReason: 'Revisión humana requerida.' },
    }],
  };
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/legal-engine/appeal/reasoning-classification', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('appeal reasoning classification shares the generation execution boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspaceAccess.mockResolvedValue({ ok: true, context: { organizationId: 'org-test', userId: 'user-test' } });
    mocks.caseAccess.mockResolvedValue({ ok: true, context: {} });
    mocks.ownerKey.mockReturnValue('owner-test');
    mocks.requestRateLimit.mockReturnValue({ ok: true });
    mocks.ipRateLimit.mockReturnValue({ ok: true });
    mocks.admission.mockResolvedValue({ ok: true, active: 0, limit: 3 });
    mocks.maxInput.mockReturnValue(200_000);
  });

  it('uses workspace auth, owner rate limit, concurrency admission, input cap, and respects no-consent', async () => {
    const req = request(payload());
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mocks.workspaceAccess).toHaveBeenCalledWith(req, true);
    expect(mocks.caseAccess).not.toHaveBeenCalled();
    expect(mocks.ownerKey).toHaveBeenCalledWith({ organizationId: 'org-test', userId: 'user-test' });
    expect(mocks.requestRateLimit).toHaveBeenCalledWith(req, 'generation', 10, 'owner-test');
    expect(mocks.admission).toHaveBeenCalledWith({ organizationId: 'org-test', userId: 'user-test', desktopOwnerId: undefined });
    expect(mocks.maxInput).toHaveBeenCalledOnce();
    expect(mocks.runLegalAI).not.toHaveBeenCalled();
  });

  it('rejects an oversized body before classification', async () => {
    mocks.maxInput.mockReturnValue(256);
    const response = await POST(request(payload()));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ ok: false, errorCode: 'GENERATION_INPUT_TOO_LARGE' });
    expect(mocks.runLegalAI).not.toHaveBeenCalled();
  });

  it('rejects when the generation concurrency admission is full', async () => {
    mocks.admission.mockResolvedValue({ ok: false, active: 3, limit: 3, errorCode: 'GENERATION_CONCURRENCY_LIMIT' });
    const response = await POST(request(payload()));
    expect(response.status).toBe(429);
    expect(mocks.maxInput).not.toHaveBeenCalled();
    expect(mocks.runLegalAI).not.toHaveBeenCalled();
  });
});
