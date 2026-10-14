import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { buildCaseDossier, confirmDossier } from '@/lib/legal-engine/caseDossier';
import { expedienteApelacion } from '../fixtures/apelacionContrariaSintetica';

const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sync: true, ...body }),
}));

describe('ruta /generate con ficha del caso', () => {
  beforeEach(() => vi.mocked(runGenerationPipeline).mockClear());

  it('entrega al pipeline la ficha confirmada y activa contrato y anexo de revisión', async () => {
    const source = expedienteApelacion();
    const dossier = confirmDossier(buildCaseDossier([source]), { representedName: 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V', representedSide: 'demandado' });
    const response = await post({ selectedDocumentType: 'contestacion_agravios', userInstruction: 'Contestar agravios', sourceDocuments: [source], uncertifiedDraftAcknowledged: true, caseDossier: dossier, requireCaseDossier: true });
    expect(response.status).toBe(200);
    const input = vi.mocked(runGenerationPipeline).mock.calls.at(-1)![0];
    expect(input.caseDossier).toMatchObject({ confirmed: true, representedSide: 'demandado', expediente: dossier.expediente });
    expect(input.requireCaseDossier).toBe(true);
    expect(input.separateReviewAnnex).toBe(true);
  });

  it('rechaza una ficha con forma inválida sin llegar al pipeline', async () => {
    const response = await post({ selectedDocumentType: 'contestacion_demanda_civil', sourceDocuments: [], caseDossier: { version: 9 } });
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe('INVALID_CASE_DOSSIER');
    expect(runGenerationPipeline).not.toHaveBeenCalled();
  });

  it.each(['CASE_DOSSIER_REQUIRED', 'REQUIRED_SOURCE_MISSING'])('responde 422 con el código %s cuando el contrato pide ficha o fuente', async (code) => {
    vi.mocked(runGenerationPipeline).mockRejectedValueOnce(Object.assign(new Error(`${code}: falta algo`), { code, metadata: [] }));
    const response = await post({ selectedDocumentType: 'contestacion_agravios', uncertifiedDraftAcknowledged: true, sourceDocuments: [] });
    expect(response.status).toBe(422);
    expect((await response.json()).errorCode).toBe(code);
  });

  it('sin ficha no cambia el comportamiento previo', async () => {
    await post({ selectedDocumentType: 'contestacion_demanda_civil', sourceDocuments: [] });
    const input = vi.mocked(runGenerationPipeline).mock.calls.at(-1)![0];
    expect(input.caseDossier).toBeUndefined();
    expect(input.requireCaseDossier).toBe(false);
  });
});
