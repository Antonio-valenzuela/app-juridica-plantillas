import { describe, expect, it } from 'vitest';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type {
  LegalRegimeResolution,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const federalRegime: LegalRegimeResolution = {
  id: 'regime-federal-1',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-federal',
};

const stateRegime: LegalRegimeResolution = {
  ...federalRegime,
  id: 'regime-state-1',
  scope: 'STATE',
  federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' },
  resolutionHash: 'regime-hash-state',
};

const federalRequest: LegalResearchRequest = {
  id: 'request-federal-1',
  legalIssueId: 'issue-federal-1',
  coverageItemIds: ['coverage-federal-1'],
  question: '¿Qué requisito debe revisarse?',
  jurisdiction: 'federal',
  matter: 'civil',
  procedure: 'ordinario',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-federal-1',
  regimeResolutionId: federalRegime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

const federalQuery: NormalizedResearchQuery = {
  requestId: federalRequest.id,
  normalizedQuery: 'requisito mx federal civil ordinario statute',
  queryHash: 'query-federal-1',
  explicitTerms: ['requisito', 'mx', 'federal', 'civil', 'ordinario', 'statute'],
  regimeHash: federalRegime.resolutionHash,
};

const stateRequest: LegalResearchRequest = {
  ...federalRequest,
  id: 'request-state-1',
  legalIssueId: 'issue-state-1',
  jurisdiction: 'state',
  requestedAuthorityTypes: ['CODE'],
  regimeResolutionId: stateRegime.id,
};

const stateQuery: NormalizedResearchQuery = {
  ...federalQuery,
  requestId: stateRequest.id,
  normalizedQuery: 'requisito mx state mx-jal civil ordinario statute',
  regimeHash: stateRegime.resolutionHash,
};

const federalFixture = {
  authorityType: 'STATUTE' as const,
  citation: 'Artículo federal fixture 14',
  canonicalCitation: 'ARTICULO FEDERAL FIXTURE 14',
  sourceUrl: 'https://fixture.official.test/federal/article-14',
  sourceDomain: 'fixture.official.test',
  issuingAuthority: 'Autoridad federal fixture',
  jurisdiction: 'FEDERAL',
  matter: 'civil',
  procedure: 'ordinario',
  publicationDate: '2020-01-01',
  effectiveFrom: '2020-01-02',
  locator: 'fixture:article-14',
  proposition: 'El requisito fixture debe acreditarse.',
  content: 'Texto sintético y recortado de la fuente fixture.',
};

const stateFixture = {
  ...federalFixture,
  authorityType: 'CODE' as const,
  citation: 'Código estatal fixture de Jalisco',
  canonicalCitation: 'CODIGO ESTATAL FIXTURE DE JALISCO',
  sourceUrl: 'https://fixture.official.test/state/mx-jal/code',
  jurisdiction: 'STATE:MX-JAL',
  issuingAuthority: 'Fuente estatal fixture de Jalisco',
};

describe('FIXTURE_OFFICIAL adapter', () => {
  it('returns a synthetic official candidate for a resolved federal query', async () => {
    const adapter = createFixtureOfficialAdapter([federalFixture], fixedClock);
    const result = await adapter.search({ request: federalRequest, query: federalQuery, regime: federalRegime });

    expect(result.status).toBe('PASS');
    expect(result.candidates[0].sourceTier).toBe('OFFICIAL_PRIMARY');
    expect(result.candidates[0].sourceUrl).toMatch(/^https:\/\/fixture\.official\.test\//);
  });

  it('preserves a state entity in the request and candidate path', async () => {
    const adapter = createFixtureOfficialAdapter([stateFixture], fixedClock);
    const result = await adapter.search({ request: stateRequest, query: stateQuery, regime: stateRegime });

    expect(result.status).toBe('PASS');
    expect(result.candidates[0].jurisdiction).toContain('MX-JAL');
    expect(result.candidates[0].sourceUrl).toContain('/state/mx-jal/');
  });

  it('marks every fixture candidate and evidence as fixture-only', async () => {
    const adapter = createFixtureOfficialAdapter([federalFixture], fixedClock);
    const search = await adapter.search({ request: federalRequest, query: federalQuery, regime: federalRegime });
    const retrieved = await adapter.retrieve({ candidateId: search.candidates[0].id, requestId: federalRequest.id });

    expect(retrieved.evidence?.isFixture).toBe(true);
    expect(retrieved.candidate?.candidateStatus).toBe('RETRIEVED');
  });

  it('returns an isolated failure for an unknown candidate', async () => {
    const adapter = createFixtureOfficialAdapter([federalFixture], fixedClock);
    const result = await adapter.retrieve({ candidateId: 'candidate-missing', requestId: federalRequest.id });

    expect(result.status).toBe('FAIL');
    expect(result.errorCode).toBe('NOT_FOUND');
  });
});
