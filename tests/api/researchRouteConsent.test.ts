/**
 * Lote 7: la ruta de investigación exige consentimiento explícito y guarda los bundles en el servidor, por
 * propietario y expediente. Investigación simulada: ninguna petición real a DOF, SCJN ni otra fuente.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({ ok: true, context: { organizationId: 'org-t', userId: 'user-t', lawyerId: 'lawyer-t' } }),
  executionOwnerKey: vi.fn(() => 'owner-test'),
  ownsExecution: vi.fn(),
}));
vi.mock('@/lib/legal-engine/pipeline', () => ({
  runLegalResearchOnly: vi.fn().mockResolvedValue({
    requests: [], readiness: [], trace: [],
    bundles: [{ legalIssueId: 'issue-1', requestId: 'r1', researchStatus: 'VERIFIED_SUFFICIENT', researchHash: 'h1' }],
  }),
}));
vi.mock('@/lib/legal-engine/legal-research/adapters/dof', () => ({ createDofAdapter: vi.fn(() => ({})) }));

import { POST } from '@/app/api/legal-engine/research/route';
import { runLegalResearchOnly } from '@/lib/legal-engine/pipeline';
import { loadResearchBundles, researchStoreKey } from '@/lib/legal-engine/researchBundleStore';

const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/legal-engine/research', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

const base = { expediente: 'EXP-ROUTE/001', caseAnalysis: { facts: [] }, issueMatrix: { issues: [] } };

describe('ruta /research', () => {
  beforeEach(() => vi.mocked(runLegalResearchOnly).mockClear());

  it('sin consentimiento explícito no investiga y responde 403', async () => {
    const response = await post(base);
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('RESEARCH_CONSENT_REQUIRED');
    expect(runLegalResearchOnly).not.toHaveBeenCalled();
  });

  it('con consentimiento investiga y guarda los bundles para el propietario y el expediente', async () => {
    const response = await post({ ...base, externalResearchConsent: true });
    expect(response.status).toBe(200);
    expect(runLegalResearchOnly).toHaveBeenCalledTimes(1);
    expect(loadResearchBundles(researchStoreKey('owner-test', 'EXP-ROUTE/001')).has('issue-1')).toBe(true);
  });

  it('sin expediente responde 400 y no investiga', async () => {
    const response = await post({ caseAnalysis: {}, issueMatrix: {}, externalResearchConsent: true });
    expect(response.status).toBe(400);
    expect(runLegalResearchOnly).not.toHaveBeenCalled();
  });
});
