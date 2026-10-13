import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateSection: vi.fn(),
  loadWorkspaceGenerationArtifact: vi.fn(),
  saveGenerationArtifact: vi.fn(),
  runVerificationContinuation: vi.fn(),
  pendingItems: [] as Array<{ id: string; type: string; affectedSections: string[] }>,
}));

vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({
    ok: true,
    context: { organizationId: 'test', userId: 'test', lawyerId: 'test' },
  }),
  executionOwnerKey: vi.fn(() => 'test-owner'),
}));
vi.mock('@/lib/security/rateLimit', () => ({
  checkRequestRateLimit: vi.fn().mockReturnValue({ ok: true }),
}));
vi.mock('@/lib/legal-engine/pipeline', () => ({ generateSection: mocks.generateSection }));
vi.mock('@/lib/legal-engine/documentLifecycle', () => ({
  readDocumentExportReadiness: vi.fn(() => 'DRAFT'),
}));
vi.mock('@/lib/legal-engine/generationPersistence', () => ({
  loadWorkspaceGenerationArtifact: mocks.loadWorkspaceGenerationArtifact,
  saveGenerationArtifact: mocks.saveGenerationArtifact,
}));
vi.mock('@/lib/legal-engine/reviewRequest', () => ({
  buildReviewRequest: vi.fn(() => ({ pendingItems: mocks.pendingItems })),
}));
vi.mock('@/lib/legal-engine/verificationContinuation', () => ({
  runVerificationContinuation: mocks.runVerificationContinuation,
}));

import { POST as generateSectionPost } from '@/app/api/legal-engine/generate-section/route';
import { POST as reviewPost } from '@/app/api/legal-engine/review/route';

function draft(documentType: string) {
  return {
    id: 'draft-1',
    documentType,
    sections: [{ id: 'section-1', content: [{ id: 'block-1', text: 'Contenido de borrador.' }] }],
    missingFields: [],
    generationMetadata: {},
  } as any;
}

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateSection.mockResolvedValue({ aiUsed: true, text: 'Apartado actualizado.', sources: [], warnings: [] });
  mocks.loadWorkspaceGenerationArtifact.mockImplementation(async (_context, id) => id === 'draft-1' ? draft('contestacion_proveedor') : null);
  mocks.saveGenerationArtifact.mockResolvedValue(undefined);
  mocks.runVerificationContinuation.mockImplementation((document: any) => ({
    document,
    qualityGate: { passed: false },
    validation: {},
  }));
  mocks.pendingItems = [{ id: 'position-1', type: 'CLIENT_POSITION', affectedSections: ['section-1'] }];
});

function sectionRequest(documentType: string, acknowledgement?: unknown) {
  return request('/api/legal-engine/generate-section', {
    document: draft(documentType),
    sectionId: 'section-1',
    instruction: 'Revisar apartado',
    ...(acknowledgement === undefined ? {} : { uncertifiedDraftAcknowledged: acknowledgement }),
  });
}

it('generate-section rechaza FAIL sin acknowledgement', async () => {
  const response = await generateSectionPost(sectionRequest('contestacion_proveedor'));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ errorCode: 'UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED' });
  expect(mocks.generateSection).not.toHaveBeenCalled();
});

it('generate-section no interpreta un string truthy como acknowledgement', async () => {
  const response = await generateSectionPost(sectionRequest('contestacion_proveedor', 'true'));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ errorCode: 'UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED' });
  expect(mocks.generateSection).not.toHaveBeenCalled();
});

it('generate-section con FAIL y acknowledgement continúa a la regeneración existente', async () => {
  const response = await generateSectionPost(sectionRequest('contestacion_proveedor', true));
  expect(response.status).toBe(200);
  expect(mocks.generateSection).toHaveBeenCalledOnce();
});

it('generate-section con PASS no exige acknowledgement', async () => {
  const response = await generateSectionPost(sectionRequest('contestacion_demanda_civil'));
  expect(response.status).toBe(200);
  expect(mocks.generateSection).toHaveBeenCalledOnce();
});

it.each(['conclusiones_civil', 'solicitud_registro_marca'])(
  'generate-section conserva routing fail-closed para %s aun con acknowledgement',
  async (documentType) => {
    const response = await generateSectionPost(sectionRequest(documentType, true));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errorCode: 'DOCUMENT_TYPE_NOT_IMPLEMENTED' });
    expect(mocks.generateSection).not.toHaveBeenCalled();
  },
);

function reviewRequestBody(acknowledgement?: unknown) {
  return {
    documentId: 'draft-1',
    answers: [{ itemId: 'position-1', answer: 'La postura confirmada es esta.' }],
    ...(acknowledgement === undefined ? {} : { uncertifiedDraftAcknowledged: acknowledgement }),
  };
}

it('review POST rechaza una respuesta que regenera un FAIL sin acknowledgement', async () => {
  const response = await reviewPost(request('/api/legal-engine/review', reviewRequestBody()));
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({ errorCode: 'UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED' });
  expect(mocks.generateSection).not.toHaveBeenCalled();
  expect(mocks.saveGenerationArtifact).not.toHaveBeenCalled();
});

it('review POST con FAIL y acknowledgement continúa a la regeneración existente', async () => {
  const response = await reviewPost(request('/api/legal-engine/review', reviewRequestBody(true)));
  expect(response.status).toBe(200);
  expect(mocks.generateSection).toHaveBeenCalledOnce();
});

it('review POST con PASS no exige acknowledgement para regenerar', async () => {
  mocks.loadWorkspaceGenerationArtifact.mockImplementation(async () => draft('contestacion_demanda_civil'));
  const response = await reviewPost(request('/api/legal-engine/review', reviewRequestBody()));
  expect(response.status).toBe(200);
  expect(mocks.generateSection).toHaveBeenCalledOnce();
});

it('review POST que no regenera conserva el flujo de metadatos sin acknowledgement', async () => {
  mocks.pendingItems = [{ id: 'filing-1', type: 'FILING_METADATA', affectedSections: ['section-1'] }];
  const response = await reviewPost(request('/api/legal-engine/review', {
    documentId: 'draft-1',
    answers: [{ itemId: 'filing-1', answer: 'Dato confirmado por el abogado.' }],
  }));
  expect(response.status).toBe(200);
  expect(mocks.generateSection).not.toHaveBeenCalled();
});
