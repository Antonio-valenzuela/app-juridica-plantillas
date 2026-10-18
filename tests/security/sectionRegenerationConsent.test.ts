import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regenerar o revisar una sección vuelve a enviar contenido del expediente. El consentimiento vale por
 * solicitud: no se hereda del documento (un borrador generado con consentimiento conserva `true`).
 * Expediente sintético; el pipeline se sustituye por un doble que registra la bandera recibida.
 */
const received: Array<boolean | undefined> = [];
vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: async () => ({ ok: true, context: { kind: 'WEB', organizationId: 'org-sintetica', userId: 'usuario-sintetico' } }),
  executionOwnerKey: () => 'org-sintetica:usuario-sintetico',
}));
vi.mock('@/lib/legal-engine/pipeline', () => ({
  generateSection: async (document: { generationMetadata?: { externalProviderOptIn?: boolean } }) => {
    received.push(document.generationMetadata?.externalProviderOptIn);
    return { aiUsed: true, text: 'texto sintético', sources: [], warnings: [] };
  },
}));
vi.mock('@/lib/legal-engine/uncertifiedDraftAcknowledgement', () => ({
  getDraftRegenerationRoutingError: () => null,
  getUncertifiedDraftAcknowledgementError: () => null,
}));

const syntheticDocument = (storedConsent: boolean) => ({
  id: 'doc-sintetico', documentType: 'contestacion_demanda_civil', status: 'draft', sections: [{ id: 's1', content: [] }],
  generationMetadata: { externalProviderOptIn: storedConsent, readiness: 'NEEDS_REVIEW' },
});

async function postSection(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/legal-engine/generate-section/route');
  return POST(new NextRequest('http://localhost/api/legal-engine/generate-section', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

describe('generate-section: consentimiento por solicitud', () => {
  beforeEach(() => { received.length = 0; });

  it('un documento con consentimiento antiguo NO autoriza un nuevo envío', async () => {
    await postSection({ document: syntheticDocument(true), sectionId: 's1', instruction: 'reformular' });
    expect(received).toEqual([false]);
  });

  it('valores no estrictamente true no cuentan como consentimiento', async () => {
    for (const value of ['true', 1, {}, null]) await postSection({ document: syntheticDocument(true), sectionId: 's1', externalProviderOptIn: value });
    expect(received).toEqual([false, false, false, false]);
  });

  it('solo `externalProviderOptIn: true` en la solicitud actual habilita el envío', async () => {
    await postSection({ document: syntheticDocument(false), sectionId: 's1', externalProviderOptIn: true });
    expect(received).toEqual([true]);
  });
});
