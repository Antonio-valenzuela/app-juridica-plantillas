import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
vi.mock('@/lib/legal-engine/pipeline', () => ({ runGenerationPipeline: vi.fn().mockResolvedValue({ status: 'draft', generationMetadata: {} }) }));
vi.mock('@/lib/workspace/lawyerProfileStore', () => ({ loadLawyerProfile: vi.fn().mockResolvedValue({ profile: {}, fromDefault: true }) }));
vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({ ok: true, context: { organizationId: 'test', userId: 'test', lawyerId: 'test' } }),
  executionOwnerKey: vi.fn(), ownsExecution: vi.fn(),
}));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: vi.fn().mockReturnValue({ ok: true }) }));
vi.mock('@/lib/security/aiCostControls', () => ({ checkGenerationAdmission: vi.fn().mockResolvedValue({ ok: true }), maxGenerationInputChars: () => 1_000_000 }));
import { POST } from '@/app/api/legal-engine/generate/route';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
it.each(['contestacion_demanda_civil', 'apelacion_civil'])('preserves the actual route confirmation boundary for %s', async selectedDocumentType => {
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedDocumentType, draftDepth: 'INVALID', sourceDocuments: [] }) }));
  const result = await response.json();
  // Marker reaches the next validator for a response, without creating a job/provider call.
  expect(response.status).toBe(selectedDocumentType === 'apelacion_civil' ? 422 : 400);
  expect(result.errorCode).toBe(selectedDocumentType === 'apelacion_civil' ? 'NEEDS_USER_INPUT' : 'INVALID_DRAFT_DEPTH');
});

it('passes only the validated appeal expediente to the existing pipeline input', async () => {
  const { extractAppealResolutionReview } = await import('@/lib/legal-engine/case-extraction/appealResolutionReview');
  const review = extractAppealResolutionReview([appealResolutionSource]);
  const resolution = review.resolutions[1];
  const confirmation = {
    sourceFingerprint: review.sourceFingerprint,
    resolutionId: resolution.id,
    parties: resolution.parties,
    representedNames: resolution.parties.filter(p => p.role === 'actor').map(p => p.name),
    recipient: resolution.court,
    notification: 'Notificación confirmada por abogado para fixture sintético.',
    expediente: 'ANON-01',
    confirmed: true,
  };
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selectedDocumentType: 'apelacion_civil', userInstruction: 'Borrador de apelación sintético', sourceDocuments: [appealResolutionSource], appealConfirmation: confirmation, expediente: 'VALOR-PARALELO-IGNORADO', sync: true }),
  }));
  expect(response.status).toBe(200);
  expect(vi.mocked(runGenerationPipeline).mock.calls.at(-1)?.[0].expediente).toBe('ANON-01');
});

async function provisionalFor(hints: { expediente?: string } = {}) {
  const { extractAppealResolutionReview, deriveProvisionalAppealConfirmation } = await import('@/lib/legal-engine/case-extraction/appealResolutionReview');
  const review = extractAppealResolutionReview([appealResolutionSource]);
  return { review, provisional: deriveProvisionalAppealConfirmation(review, hints) };
}
const post = (appealConfirmation: unknown, extra: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ selectedDocumentType: 'apelacion_civil', userInstruction: 'Borrador de apelación sintético', sourceDocuments: [appealResolutionSource], appealConfirmation, sync: true, ...extra }),
}));

it('accepts the provisional confirmation derived from the principal resolution and passes only its own expediente', async () => {
  const { provisional } = await provisionalFor({ expediente: 'ANON-01' });
  const response = await post(provisional, { expediente: 'VALOR-PARALELO-IGNORADO' });
  expect(response.status).toBe(200);
  const input = vi.mocked(runGenerationPipeline).mock.calls.at(-1)![0] as any;
  expect(input.expediente).toBe('ANON-01');
  expect(input.appealConfirmation).toMatchObject({ provisional: true, confirmed: false });
});

it('with a pending expediente it never trusts a parallel expediente field from another case', async () => {
  // Fuente sin la línea EXPEDIENTE: el expediente queda pendiente en la confirmación provisional.
  const noExpediente = structuredClone(appealResolutionSource);
  noExpediente.pages![1].text = noExpediente.pages![1].text.replace(/EXPEDIENTE:.*\n/, '');
  const { extractAppealResolutionReview, deriveProvisionalAppealConfirmation } = await import('@/lib/legal-engine/case-extraction/appealResolutionReview');
  const provisional = deriveProvisionalAppealConfirmation(extractAppealResolutionReview([noExpediente]));
  expect(provisional.expediente).toBe('[A CONFIRMAR POR EL ABOGADO]');
  const response = await POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selectedDocumentType: 'apelacion_civil', userInstruction: 'Borrador sintético', sourceDocuments: [noExpediente], appealConfirmation: provisional, expediente: 'EXPEDIENTE-DE-OTRO-CASO', sync: true }),
  }));
  expect(response.status).toBe(200);
  expect((vi.mocked(runGenerationPipeline).mock.calls.at(-1)![0] as any).expediente).toBeUndefined();
});

it('rejects a provisional confirmation bound to another revision of the source', async () => {
  const { provisional } = await provisionalFor({ expediente: 'ANON-01' });
  const response = await post({ ...provisional, sourceFingerprint: 'otra-revision' });
  expect(response.status).toBe(422);
  expect((await response.json()).errorCode).toBe('NEEDS_USER_INPUT');
});

it('rejects a provisional confirmation that points to a resolution the source does not contain', async () => {
  const { provisional } = await provisionalFor({ expediente: 'ANON-01' });
  expect((await post({ ...provisional, resolutionId: 'resolucion-inventada' })).status).toBe(422);
});

it('rejects a request without any confirmation and one that merely claims to be provisional without being so', async () => {
  const { provisional } = await provisionalFor({ expediente: 'ANON-01' });
  expect((await post(undefined)).status).toBe(422);
  expect((await post({ ...provisional, provisional: false })).status).toBe(422);
});
