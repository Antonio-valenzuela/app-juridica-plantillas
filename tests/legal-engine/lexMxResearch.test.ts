import { describe, expect, it } from 'vitest';
import {
  createLexMxAdapter,
  detectArticleNumber,
  extractArticleFromMarkdown,
} from '@/lib/legal-engine/legal-research/adapters/lexMx';
import { createResearchProviderRouter } from '@/lib/legal-engine/legal-research/researchProviderRouter';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type {
  LegalRegimeResolution,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const regime: LegalRegimeResolution = {
  id: 'regime-federal-lexmx',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'amparo', displayName: 'Amparo' },
  procedure: { code: 'indirecto', displayName: 'Indirecto' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-lexmx',
};

const request: LegalResearchRequest = {
  id: 'req-lexmx-1',
  legalIssueId: 'issue-lexmx-1',
  coverageItemIds: ['cov-1'],
  question: 'requisitos de la demanda artículo 17 ley de amparo',
  jurisdiction: 'federal',
  matter: 'amparo',
  procedure: 'indirecto',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-hash-lexmx',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

const query: NormalizedResearchQuery = {
  requestId: request.id,
  normalizedQuery: 'requisitos demanda articulo 17 ley amparo lamp',
  queryHash: 'qhash-lexmx',
  explicitTerms: ['articulo', '17', 'ley', 'amparo', 'lamp'],
  regimeHash: regime.resolutionHash,
};

describe('Lex MX Local Corpus Adapter', () => {
  it('detects article numbers reliably from user or issue queries', () => {
    expect(detectArticleNumber('artículo 14 constitucional')).toBe('14');
    expect(detectArticleNumber('conforme al art. 1o de la ley')).toBe('1o');
    expect(detectArticleNumber('artículo 17 bis fracción II')).toBe('17 bis');
    expect(detectArticleNumber('sin cita numerica')).toBeNull();
  });

  it('extracts specific article content from markdown', () => {
    const sampleMd = `
# Ley de Prueba
**Artículo 1o.** Todas las personas gozarán de los derechos humanos.

**Artículo 2o.** Queda prohibida toda discriminación.
## TÍTULO SEGUNDO
`;
    const art1 = extractArticleFromMarkdown(sampleMd, '1o');
    expect(art1).toContain('Todas las personas gozarán de los derechos humanos.');
    expect(art1).not.toContain('Queda prohibida toda discriminación');

    const art2 = extractArticleFromMarkdown(sampleMd, '2o');
    expect(art2).toContain('Queda prohibida toda discriminación.');
  });

  it('searches the local catalog and returns candidates as SECONDARY_SUPPORT (never auto-VERIFIED)', async () => {
    const adapter = createLexMxAdapter({ clock: fixedClock });
    const search = await adapter.search({ request, query, regime });

    expect(search.status).toBe('PASS');
    expect(search.candidates.length).toBeGreaterThan(0);

    const lampCandidate = search.candidates.find((c) => c.identifier === 'LAmp');
    expect(lampCandidate).toBeDefined();
    expect(lampCandidate?.sourceTier).toBe('SECONDARY_SUPPORT');
    expect(lampCandidate?.candidateStatus).toBe('DISCOVERED');
    expect(lampCandidate?.sourceUrl).toContain('diputados.gob.mx');
    expect(lampCandidate?.issuingAuthority).toContain('Cámara de Diputados');
  });

  it('retrieves article text as a proposition with appropriate limitations', async () => {
    const adapter = createLexMxAdapter({ clock: fixedClock });
    const search = await adapter.search({ request, query, regime });
    const lampCandidate = search.candidates.find((c) => c.identifier === 'LAmp')!;

    const retrieved = await adapter.retrieve({
      candidateId: lampCandidate.id,
      requestId: request.id,
    });

    expect(retrieved.status).toBe('PASS');
    expect(retrieved.candidate?.candidateStatus).toBe('RETRIEVED');
    expect(retrieved.proposition?.text).toBeDefined();
    expect(retrieved.proposition?.limitations[0]).toContain('Requiere verificación');
  });

  it('lex-mx candidate does NOT become VERIFIED without matching official verification', async () => {
    const lexMxAdapter = createLexMxAdapter({ clock: fixedClock });
    // Router sin official provider coincidente
    const emptyOfficial = createFixtureOfficialAdapter([], fixedClock);
    const router = createResearchProviderRouter({
      discoveryProvider: lexMxAdapter,
      officialProviders: [emptyOfficial],
    });

    const search = await router.search({ request, query, regime });
    expect(search.candidates.length).toBeGreaterThan(0);
    const candidate = search.candidates[0];

    // Intentar retrieve a través del router para un candidato no corroborado por fuente oficial
    const retrieveResult = await router.retrieve({
      candidateId: candidate.id,
      requestId: request.id,
    });
    expect(retrieveResult.status).toBe('FAIL');
    expect(retrieveResult.errorCode).toBe('NON_OFFICIAL_ONLY');
  });

  it('promotes lex-mx candidate only when official provider validates it', async () => {
    const lexMxAdapter = createLexMxAdapter({ clock: fixedClock });
    const officialFixture = createFixtureOfficialAdapter([{
      authorityType: 'STATUTE',
      citation: 'Artículo 17 de la Ley de Amparo, Reglamentaria de los artículos 103 y 107 de la Constitución Política de los Estados Unidos Mexicanos',
      canonicalCitation: 'Artículo 17 de la Ley de Amparo, Reglamentaria de los artículos 103 y 107 de la Constitución Política de los Estados Unidos Mexicanos',
      sourceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
      sourceDomain: 'www.diputados.gob.mx',
      issuingAuthority: 'Congreso de la Unión',
      jurisdiction: 'FEDERAL',
      matter: 'amparo',
      locator: 'Artículo 17',
      proposition: 'El plazo para presentar la demanda de amparo es de quince días.',
      content: 'Texto oficial del artículo 17.',
    }], fixedClock);

    const router = createResearchProviderRouter({
      discoveryProvider: lexMxAdapter,
      officialProviders: [officialFixture],
    });

    const search = await router.search({ request, query, regime });
    const lampCandidate = search.candidates.find((c) => c.identifier === 'LAmp');
    expect(lampCandidate).toBeDefined();

    const retrieved = await router.retrieve({
      candidateId: lampCandidate!.id,
      requestId: request.id,
    });

    expect(retrieved.status).toBe('PASS');
    expect(retrieved.evidence?.sourceTier).toBe('OFFICIAL_PRIMARY');
  });
});
