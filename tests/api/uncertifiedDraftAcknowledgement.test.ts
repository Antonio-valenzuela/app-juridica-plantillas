import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ runGenerationPipeline: vi.fn() }));

vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({
    ok: true,
    context: { organizationId: 'test', userId: 'test', lawyerId: 'test' },
  }),
  executionOwnerKey: vi.fn(() => 'test-owner'),
  ownsExecution: vi.fn(),
}));
vi.mock('@/lib/security/rateLimit', () => ({
  checkRequestRateLimit: vi.fn().mockReturnValue({ ok: true }),
}));
vi.mock('@/lib/security/aiCostControls', () => ({
  checkGenerationAdmission: vi.fn().mockResolvedValue({ ok: true }),
  maxGenerationInputChars: () => 1_000_000,
}));
vi.mock('@/lib/legal-engine/pipeline', () => ({
  runGenerationPipeline: mocks.runGenerationPipeline,
}));

import { POST } from '@/app/api/legal-engine/generate/route';

beforeEach(() => {
  mocks.runGenerationPipeline.mockReset();
  mocks.runGenerationPipeline.mockResolvedValue({ ok: true, document: { id: 'draft-test' } });
});

it('rechaza un request directo para IMPLEMENTED + FAIL si falta el acknowledgement', async () => {
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      selectedDocumentType: 'contestacion_proveedor',
      sourceDocuments: [],
      lawyerProfile: {},
      userInstruction: 'Preparar borrador',
    }),
  }));

  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ errorCode: 'UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED' });
  expect(mocks.runGenerationPipeline).not.toHaveBeenCalled();
});

it('acepta el acknowledgement explícito en la frontera de API y sigue delegando al pipeline', async () => {
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      selectedDocumentType: 'contestacion_proveedor',
      sourceDocuments: [],
      lawyerProfile: {},
      userInstruction: 'Preparar borrador',
      uncertifiedDraftAcknowledged: true,
    }),
  }));

  expect(response.status).not.toBe(422);
  expect(mocks.runGenerationPipeline).toHaveBeenCalled();
});

it('no exige acknowledgement para un tipo IMPLEMENTED + PASS', async () => {
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [],
      lawyerProfile: {},
      userInstruction: 'Preparar borrador libre',
    }),
  }));

  expect(response.status).not.toBe(422);
  expect(mocks.runGenerationPipeline).toHaveBeenCalled();
});
