import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({ ok: true, context: { organizationId: 'test', userId: 'test', lawyerId: 'test' } }),
  executionOwnerKey: vi.fn(), ownsExecution: vi.fn(),
}));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: vi.fn().mockReturnValue({ ok: true }) }));
vi.mock('@/lib/security/aiCostControls', () => ({ checkGenerationAdmission: vi.fn().mockResolvedValue({ ok: true }), maxGenerationInputChars: () => 1_000_000 }));
import { POST } from '@/app/api/legal-engine/generate/route';
it.each(['contestacion_demanda_civil', 'apelacion_civil'])('preserves the actual route confirmation boundary for %s', async selectedDocumentType => {
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedDocumentType, draftDepth: 'INVALID', sourceDocuments: [] }) }));
  const result = await response.json();
  // Marker reaches the next validator for a response, without creating a job/provider call.
  expect(response.status).toBe(selectedDocumentType === 'apelacion_civil' ? 422 : 400);
  expect(result.errorCode).toBe(selectedDocumentType === 'apelacion_civil' ? 'NEEDS_USER_INPUT' : 'INVALID_DRAFT_DEPTH');
});
