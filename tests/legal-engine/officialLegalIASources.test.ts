import { describe, expect, it, vi } from 'vitest';
import { createDofAdapter } from '@/lib/legal-engine/legal-research/adapters/dof';
import { createScjnAdapter } from '@/lib/legal-engine/legal-research/adapters/scjn';
import { createDefaultResearchProviderRouter } from '@/lib/legal-engine/legal-research/researchProviderRouter';
import type {
  LegalRegimeResolution,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-02-05T00:00:00.000Z');

const regime: LegalRegimeResolution = {
  id: 'regime-federal-official',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'constitucional', displayName: 'Constitucional' },
  temporalPrecision: 'DAY',
  relevantDate: '2026-02-05',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-official',
};

const request: LegalResearchRequest = {
  id: 'req-official-1',
  legalIssueId: 'issue-official-1',
  coverageItemIds: ['cov-1'],
  question: 'decreto de reforma constitucional publicado en el dof',
  jurisdiction: 'federal',
  matter: 'constitucional',
  requestedAuthorityTypes: ['STATUTE', 'OFFICIAL_AGREEMENT'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-hash-official',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

const query: NormalizedResearchQuery = {
  requestId: request.id,
  normalizedQuery: 'decreto reforma constitucional dof',
  queryHash: 'qhash-official',
  explicitTerms: ['decreto', 'reforma', 'constitucional'],
  regimeHash: regime.resolutionHash,
};

describe('LegalIA-derived Official Legal Sources (DOF / SIDOF / SCJN SCOW)', () => {
  it('uses the current SIDOF public-alerts contract instead of the legacy date endpoint', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedMethod = init?.method || 'GET';
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({
        messageCode: 200,
        response: 'OK',
        alertas: [{ id: 1513, tipoAlerta: 'PUB', textoBusqueda: 'Convenio', descripcion: 'Convenios', codEstatus: 1, buscarEn: 'T' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const adapter = createDofAdapter({ fetch: fetchMock, clock: fixedClock });
    const search = await adapter.search({ request, query, regime });

    expect(search.status).toBe('PASS');
    expect(search.candidates).toHaveLength(1);
    expect(capturedUrl).toBe('https://sidof.segob.gob.mx/dof/sidof/alertas/obtieneAlertasPublicas');
    expect(capturedMethod).toBe('POST');
    expect(capturedBody).toBe('{}');
    expect(search.candidates[0].sourceTier).toBe('OFFICIAL_PRIMARY');
    expect(search.candidates[0].title).toBe('Convenios');
  });

  it('queries SIDOF REST API with date and User-Agent, returning official candidates without www subdomain', async () => {
    let capturedUrl = '';
    let capturedUserAgent = '';

    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedUserAgent = new Headers(init?.headers).get('user-agent') || '';

      if (capturedUrl.includes('/notas/nota/554433')) {
        return new Response(JSON.stringify({
          Nota: {
            codNota: 554433,
            titulo: 'DECRETO por el que se reforma el artículo 14 de la Constitución',
            cadenaContenido: '<p>Texto completo del decreto de reforma constitucional publicado en el DOF.</p>',
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (capturedUrl.includes('/notas/')) {
        return new Response(JSON.stringify({
          Notas: [{
            codNota: 554433,
            titulo: 'DECRETO por el que se reforma el artículo 14 de la Constitución',
            organo: 'SECRETARIA DE GOBERNACION',
            fecha: '05-02-2026',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      return new Response('Not Found', { status: 404 });
    });

    const adapter = createDofAdapter({
      fetch: fetchMock,
      clock: fixedClock,
      legacyNotesByDate: true,
    });

    const search = await adapter.search({ request, query, regime });
    expect(search.status).toBe('PASS');
    expect(search.candidates).toHaveLength(1);

    const candidate = search.candidates[0];
    expect(candidate.sourceTier).toBe('OFFICIAL_PRIMARY');
    expect(candidate.sourceDomain).toBe('dof.gob.mx');
    // Verifica la regla estricta de SSL documentada en LegalIA (sin www)
    expect(candidate.sourceUrl).not.toContain('www.dof.gob.mx');
    expect(candidate.sourceUrl).toContain('https://dof.gob.mx/nota_detalle.php?codigo=554433');
    expect(capturedUserAgent).toContain('DOF-JSON-Client');

    // Retrieve
    const retrieve = await adapter.retrieve({
      candidateId: candidate.id,
      requestId: request.id,
    });

    expect(retrieve.status).toBe('PASS');
    expect(retrieve.evidence?.sourceTier).toBe('OFFICIAL_PRIMARY');
    expect(retrieve.evidence?.sourceHash).toBeDefined();
    expect(retrieve.proposition?.text).toContain('reforma constitucional');
  });

  it('queries SCJN SCOW-API when legislation authority is requested (LegalIA pattern)', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedUserAgent = '';

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedUserAgent = new Headers(init?.headers).get('user-agent') || '';
      try {
        capturedBody = JSON.parse(String(init?.body || '{}'));
      } catch {}

      return new Response(JSON.stringify({
        codigo: 200,
        tamanio: 1,
        resultados: [{
          idOrdenamiento: '7788',
          ordenamiento: 'LEY DE AMPARO, REGLAMENTARIA DE LOS ARTÍCULOS 103 Y 107',
          vigencia: 'VIGENTE',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const scjnAdapter = createScjnAdapter({
      fetch: fetchMock,
    });

    const search = await scjnAdapter.search({ request, query, regime });
    expect(search.status).toBe('PASS');
    expect(search.candidates.length).toBeGreaterThan(0);

    const candidate = search.candidates[0];
    expect(candidate.sourceTier).toBe('OFFICIAL_PRIMARY');
    expect(candidate.sourceDomain).toBe('legislacion.scjn.gob.mx');
    expect(capturedUserAgent).toContain('LegalIA-scjn-crawler');
    expect(capturedBody?.q).toBeDefined();
    expect(capturedBody?.vigenciaF).toBe('VIGENTE');
  });

  it('createDefaultResearchProviderRouter initializes composite discovery (Corpus Iuris + lex-mx) and official sources (Cámara + SCJN + DOF)', async () => {
    const router = createDefaultResearchProviderRouter();
    expect(router.id).toBe('RESEARCH_ROUTER');
    expect(router.supportedAuthorityTypes).toEqual(expect.arrayContaining([
      'CONSTITUTION',
      'STATUTE',
      'JURISPRUDENCE',
      'THESIS',
      'OFFICIAL_AGREEMENT',
    ]));
  });
});
