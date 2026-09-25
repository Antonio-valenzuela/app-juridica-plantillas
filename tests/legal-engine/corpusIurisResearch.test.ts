import { describe, expect, it, vi } from 'vitest';
import { normalizeResearchQuery } from '@/lib/legal-engine/legal-research/researchRequest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type {
  LegalRegimeResolution,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';
import { createCorpusIurisAdapter } from '@/lib/legal-engine/legal-research/adapters/corpusIuris';
import type { LegalResearchProvider } from '@/lib/legal-engine/legal-research/adapters/types';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import { createResearchProviderRouter } from '@/lib/legal-engine/legal-research/researchProviderRouter';
import { runAutomaticLegalResearch } from '@/lib/legal-engine/pipeline';
import { validateIssueDraftResult } from '@/lib/legal-engine/issueDraftResult';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const regime: LegalRegimeResolution = {
  id: 'regime-federal-corpus',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-corpus',
};

const request: LegalResearchRequest = {
  id: 'request-corpus-1',
  legalIssueId: 'issue-corpus-1',
  coverageItemIds: ['coverage-corpus-1'],
  question: 'fundamentación y motivación del acto de autoridad',
  jurisdiction: 'federal',
  matter: 'civil',
  procedure: 'ordinario',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-hash-corpus',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

const query: NormalizedResearchQuery = {
  requestId: request.id,
  normalizedQuery: 'fundamentacion motivacion acto autoridad mx federal civil ordinario statute',
  queryHash: 'query-hash-corpus',
  explicitTerms: ['fundamentacion', 'motivacion', 'acto', 'autoridad'],
  regimeHash: regime.resolutionHash,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function issue(question = request.question): LegalIssueItem {
  return {
    id: request.legalIssueId,
    issueType: 'AUTHORITY_RESEARCH',
    question,
    source: { mode: 'RICH_COVERAGE', coverageItemId: 'coverage-corpus-1', coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: [] },
    coverageItemIds: ['coverage-corpus-1'],
    claimIds: [],
    factIds: [],
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: [],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: true,
    status: 'NEEDS_RESEARCH',
    researchStatus: 'NEEDS_RESEARCH',
    provenance: [],
    relationStatus: 'EXPLICIT',
  };
}

function matrixFor(item: LegalIssueItem): LegalIssueMatrix {
  return {
    documentId: 'document-corpus-1',
    documentType: 'fixture',
    sourceMode: 'RICH',
    issues: [item],
    summary: {
      total: 1,
      required: 1,
      blocked: 1,
      readyForGeneration: 0,
      needsLegalResearch: 1,
      needsClientPosition: 0,
      unresolvedConflict: 0,
      unlinked: 0,
    },
  };
}

function richAnalysis(): CaseAnalysis {
  return {
    richCaseAnalysis: {
      parties: [],
      claims: [],
      facts: [],
      evidenceMentions: [],
      evidenceOffers: [],
      arguments: [],
      authorities: [],
      conflicts: [],
      missingData: [],
      sourcePosition: { mode: 'SOURCE_GROUNDED', confidence: 1, sourceIds: [] },
      extractionStats: {} as unknown as NonNullable<CaseAnalysis['richCaseAnalysis']>['extractionStats'],
      candidates: [],
    },
  } as unknown as CaseAnalysis;
}

const corpusRecord = {
  id: 'ley-fundamentacion-14',
  titulo: 'Constitución Política de los Estados Unidos Mexicanos',
  referencia: 'Artículo 14',
  fragmento: 'Nadie podrá ser privado de la libertad o de sus propiedades sino mediante juicio.',
  url: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/CPEUM.pdf',
  vigencia: { fecha_ultima_reforma: '2025-01-01', verificado_al: '2026-01-01' },
  tipo: 'ley',
};

const officialRecord = {
  authorityType: 'STATUTE' as const,
  citation: 'Artículo 14',
  canonicalCitation: 'ARTICULO 14',
  sourceUrl: 'https://fixture.official.test/federal/article-14',
  sourceDomain: 'fixture.official.test',
  issuingAuthority: 'Cámara de Diputados fixture',
  jurisdiction: 'FEDERAL',
  matter: 'civil',
  procedure: 'ordinario',
  publicationDate: '2020-01-01',
  effectiveFrom: '2020-01-02',
  locator: 'artículo 14',
  proposition: 'El juicio previo es exigible para la privación de derechos.',
  content: 'Texto oficial fixture del artículo 14.',
};

function corpusProvider(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): LegalResearchProvider {
  return createCorpusIurisAdapter({
    searchUrl: 'https://corpusiuris.test/api/agent/v1/search',
    documentUrl: 'https://corpusiuris.test/api/agent/v1/documento',
    fetch: fetchImpl,
    clock: fixedClock,
  });
}

describe('Corpus Iuris discovery and official verification boundary', () => {
  it('automatically runs research before the generation seam for a required issue', async () => {
    const provider = corpusProvider(vi.fn(async () => response({ leyes: [corpusRecord] })));
    const result = await runAutomaticLegalResearch({
      caseAnalysis: richAnalysis(),
      issueMatrix: matrixFor(issue()),
      provider,
      regimeInputsByIssue: { [request.legalIssueId]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      requestedAuthorityTypesByIssue: { [request.legalIssueId]: ['STATUTE'] },
      clock: fixedClock,
    });

    expect(result.requests).toHaveLength(1);
    expect(result.trace[0].attempts.length).toBeGreaterThan(0);
  });

  it('maps Corpus Iuris results as secondary discovered candidates and keeps the query abstract', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('q')).toContain('fundamentacion');
      return response({ leyes: [corpusRecord], tesis: [], precedentes: [] });
    });
    const found = await corpusProvider(fetchMock).search({ request, query, regime });

    expect(found.status).toBe('PASS');
    expect(found.candidates[0]).toMatchObject({
      sourceTier: 'SECONDARY_SUPPORT',
      candidateStatus: 'DISCOVERED',
      provider: 'CORPUS_IURIS',
    });
  });

  it('does not promote a Corpus candidate when official verification finds no match', async () => {
    const corpus = corpusProvider(vi.fn(async () => response({ leyes: [corpusRecord] })));
    const official = createFixtureOfficialAdapter([], fixedClock);
    const provider = createResearchProviderRouter({ discoveryProvider: corpus, officialProviders: [official] });
    const result = await runAutomaticLegalResearch({
      caseAnalysis: richAnalysis(),
      issueMatrix: matrixFor(issue()),
      provider,
      regimeInputsByIssue: { [request.legalIssueId]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      requestedAuthorityTypesByIssue: { [request.legalIssueId]: ['STATUTE'] },
      clock: fixedClock,
    });

    expect(result.bundles[0].verifiedAuthorities).toEqual([]);
    expect(result.bundles[0].researchStatus).toBe('NO_AUTHORITY_FOUND');
  });

  it('promotes only after an official adapter matches and retrieves the candidate', async () => {
    const corpus = corpusProvider(vi.fn(async () => response({ leyes: [corpusRecord] })));
    const official = createFixtureOfficialAdapter([officialRecord], fixedClock);
    const provider = createResearchProviderRouter({ discoveryProvider: corpus, officialProviders: [official] });
    const result = await runAutomaticLegalResearch({
      caseAnalysis: richAnalysis(),
      issueMatrix: matrixFor(issue()),
      provider,
      regimeInputsByIssue: { [request.legalIssueId]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      requestedAuthorityTypesByIssue: { [request.legalIssueId]: ['STATUTE'] },
      clock: fixedClock,
    });

    expect(result.bundles[0].researchStatus).toBe('VERIFIED_SUFFICIENT');
    expect(result.bundles[0].verifiedAuthorities[0].source.sourceTier).toBe('OFFICIAL_PRIMARY');
  });

  it('maps Corpus HTTP 429 to a controlled failure without fabricating authority', async () => {
    const result = await corpusProvider(vi.fn(async () => response({ error: 'rate limited' }, 429))).search({ request, query, regime });
    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe('CORPUS_IURIS_RATE_LIMITED');
    expect(result.candidates).toEqual([]);
  });

  it.each([401, 403, 500])('maps Corpus HTTP %s to a controlled failure', async (status) => {
    const result = await corpusProvider(vi.fn(async () => response({ error: 'unavailable' }, status))).search({ request, query, regime });
    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe(`CORPUS_IURIS_HTTP_${status}`);
    expect(result.candidates).toEqual([]);
  });

  it('maps an invalid Corpus payload without fabricating a result', async () => {
    const result = await corpusProvider(vi.fn(async () => new Response('not-json', { status: 200 }))).search({ request, query, regime });
    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe('CORPUS_IURIS_PARSE_FAILED');
    expect(result.candidates).toEqual([]);
  });

  it('maps Corpus timeout to a controlled failure without fabricating authority', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const result = await corpusProvider(vi.fn(async () => { throw timeout; })).search({ request, query, regime });
    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe('CORPUS_IURIS_TIMEOUT');
    expect(result.candidates).toEqual([]);
  });

  it('blocks generation readiness when research is required but no authority is verified', async () => {
    const provider = createResearchProviderRouter({
      discoveryProvider: corpusProvider(vi.fn(async () => response({ leyes: [] }))),
      officialProviders: [createFixtureOfficialAdapter([], fixedClock)],
    });
    const result = await runAutomaticLegalResearch({
      caseAnalysis: richAnalysis(),
      issueMatrix: matrixFor(issue()),
      provider,
      regimeInputsByIssue: { [request.legalIssueId]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      requestedAuthorityTypesByIssue: { [request.legalIssueId]: ['STATUTE'] },
      clock: fixedClock,
    });
    expect(result.readiness[0].researchReadiness).toBe('RESEARCH_REQUIRED');
    expect(result.readiness[0].blockers).toContain('LEGAL_RESEARCH_OR_SOURCE_VERIFICATION_REQUIRED');
  });

  it('does not send names, expediente, or domicilio to Corpus Iuris', async () => {
    const privateIssue = issue('¿Qué criterio aplica a Juan Pérez en el expediente 123/2026 y domicilio Calle Reforma 10?');
    const privateQuery = await normalizeResearchQuery({ ...request, question: privateIssue.question }, regime);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const queryValue = url.searchParams.get('q') || '';
      expect(queryValue).not.toMatch(/Juan|Pérez|123\/2026|Reforma|domicilio/i);
      return response({ leyes: [] });
    });
    await corpusProvider(fetchMock).search({ request: { ...request, question: privateIssue.question }, query: privateQuery, regime });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a model authority outside the scoped verified allowlist', () => {
    const validation = validateIssueDraftResult({
      legalIssueId: request.legalIssueId,
      issueType: 'AUTHORITY_RESEARCH',
      coverageItemIds: request.coverageItemIds,
      thesis: 'La tesis inventada sostiene la conclusión.',
      factualDevelopment: ['Hecho permitido.'],
      evidentiaryDevelopment: ['Evidencia permitida.'],
      legalDevelopment: ['Conforme al artículo 999 inexistente, procede.'],
      application: 'Aplicación limitada.',
      conclusion: 'Conclusión provisional.',
      sourceEntityIds: [],
      authorityMentionIds: [],
      verifiedAuthorityIds: ['authority-invented'],
      unresolvedRequirements: [],
      generationMetadata: {
        promptVersion: 'test',
        contextHash: 'context-hash-corpus',
        providerRequested: 'TEST',
        providerActuallyUsed: 'TEST',
        attemptCount: 1,
      },
    }, {
      expectedLegalIssueId: request.legalIssueId,
      issueType: 'AUTHORITY_RESEARCH',
      allowedCoverageItemIds: request.coverageItemIds,
      allowedSourceEntityIds: [],
      allowedAuthorityMentionIds: [],
      allowedVerifiedAuthorityIds: ['authority-official'],
      contextHash: 'context-hash-corpus',
      promptVersion: 'test',
    });
    expect(validation.errors).toEqual(expect.arrayContaining(['VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE']));
  });

  it('sends official User-Agent and handles mensaje_para_tu_usuario from API', async () => {
    let capturedHeaders: Headers | undefined;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        error: 'Cuota excedida',
        mensaje_para_tu_usuario: 'Has alcanzado el límite diario de consultas anónimas en Corpus Iuris.',
      }), { status: 429 });
    });

    const adapter = createCorpusIurisAdapter({ fetch: fetchMock });
    const result = await adapter.search({ request, query, regime });
    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe('CORPUS_IURIS_RATE_LIMITED');
    expect(capturedHeaders?.get('user-agent')).toContain('corpus-iuris-mcp/1.0.0');
  });

  it('parses vigencia.fuente_oficial and distinguishes tesis from binding jurisprudencia based on fuerza field', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({
        leyes: [{
          id: 'ley-amparo/17',
          tipo: 'ley',
          titulo: 'Ley de Amparo',
          referencia: 'Art. 17',
          url: 'https://corpusiuris.mx/ley/ley-de-amparo/articulo/17',
          vigencia: {
            estado: 'VIGENTE',
            fuente_oficial: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
          },
        }],
        tesis: [{
          id: '2020123',
          tipo: 'tesis',
          titulo: 'Acto de autoridad. Requisitos.',
          referencia: 'Registro digital 2020123',
          fuerza: {
            es_jurisprudencia_obligatoria: true,
          },
        }],
      }), { status: 200 });
    });

    const adapter = createCorpusIurisAdapter({ fetch: fetchMock });
    const result = await adapter.search({ request, query, regime });
    expect(result.status).toBe('PASS');
    expect(result.candidates).toHaveLength(2);

    const leyCandidate = result.candidates.find((c) => c.authorityType === 'STATUTE');
    expect(leyCandidate).toBeDefined();
    expect(leyCandidate?.sourceUrl).toBe('https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf');

    const jurisprudenciaCandidate = result.candidates.find((c) => c.authorityType === 'JURISPRUDENCE');
    expect(jurisprudenciaCandidate).toBeDefined();
    expect(jurisprudenciaCandidate?.observedCitation).toBe('Registro digital 2020123');
  });
});
