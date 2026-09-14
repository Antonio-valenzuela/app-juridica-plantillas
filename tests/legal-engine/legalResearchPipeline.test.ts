import { describe, expect, it, vi } from 'vitest';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { SourceAuthorityMention } from '@/lib/legal-engine/case-extraction/types';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type { LegalResearchProvider } from '@/lib/legal-engine/legal-research/adapters/types';

import { runLegalResearchOnly } from '@/lib/legal-engine/pipeline';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

function authority(id: string, authorityType: SourceAuthorityMention['authorityType'], citationText: string): SourceAuthorityMention {
  return { id, authorityType, citationText, verificationStatus: 'SOURCE_CITED', provenance: [] };
}

function richAnalysis(authorities: SourceAuthorityMention[]): CaseAnalysis {
  return {
    richCaseAnalysis: {
      parties: [],
      claims: [],
      facts: [],
      evidenceMentions: [],
      evidenceOffers: [],
      arguments: [],
      authorities,
      conflicts: [],
      missingData: [],
      clientPosition: undefined,
      sourcePosition: { mode: 'SOURCE_GROUNDED', confidence: 1, sourceIds: [] },
      extractionStats: {} as any,
      candidates: [],
    },
  } as unknown as CaseAnalysis;
}

function issue(id: string, authorityMentionIds: string[]): LegalIssueItem {
  return {
    id,
    issueType: 'AUTHORITY_RESEARCH',
    question: `¿Qué requisito aplica a ${id}?`,
    source: { mode: 'RICH_COVERAGE', coverageItemId: `coverage-${id}`, coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: authorityMentionIds },
    coverageItemIds: [`coverage-${id}`],
    claimIds: [],
    factIds: [],
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds,
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

function matrixWithIssues(issues: LegalIssueItem[]): LegalIssueMatrix {
  return {
    documentId: 'document-research-fixture',
    documentType: 'fixture',
    sourceMode: 'RICH',
    issues,
    summary: {
      total: issues.length,
      required: issues.length,
      blocked: issues.length,
      readyForGeneration: 0,
      needsLegalResearch: issues.length,
      needsClientPosition: 0,
      unresolvedConflict: 0,
      unlinked: 0,
    },
  };
}

const federalFixture = {
  authorityType: 'STATUTE' as const,
  citation: 'Artículo 14 de la Constitución',
  canonicalCitation: 'ARTICULO 14 DE LA CONSTITUCION',
  sourceUrl: 'https://fixture.official.test/federal/article-14',
  sourceDomain: 'fixture.official.test',
  issuingAuthority: 'Autoridad federal fixture',
  jurisdiction: 'FEDERAL',
  matter: 'civil',
  procedure: 'ordinario',
  publicationDate: '2020-01-01',
  effectiveFrom: '2020-01-02',
  locator: 'fixture:federal-14',
  proposition: 'El requisito federal debe acreditarse.',
  content: 'Texto sintético federal fixture.',
};

const stateFixture = {
  ...federalFixture,
  authorityType: 'CODE' as const,
  citation: 'Código estatal fixture de Jalisco',
  canonicalCitation: 'CODIGO ESTATAL FIXTURE DE JALISCO',
  sourceUrl: 'https://fixture.official.test/state/mx-jal/code',
  jurisdiction: 'STATE:MX-JAL',
  issuingAuthority: 'Fuente estatal fixture de Jalisco',
  locator: 'fixture:state-jal-code',
  proposition: 'El código estatal fixture debe revisarse.',
};

const mismatchFixture = {
  ...federalFixture,
  citation: 'Artículo 16 de la Constitución',
  canonicalCitation: 'ARTICULO 16 DE LA CONSTITUCION',
  sourceUrl: 'https://fixture.official.test/federal/article-16',
  locator: 'fixture:federal-16',
};

const temporalFixture = {
  ...federalFixture,
  citation: 'Artículo temporal fixture',
  canonicalCitation: 'ARTICULO TEMPORAL FIXTURE',
  sourceUrl: 'https://fixture.official.test/federal/temporal',
  locator: 'fixture:federal-temporal',
};

function provider(records = [federalFixture, stateFixture, mismatchFixture, temporalFixture]): LegalResearchProvider {
  return createFixtureOfficialAdapter(records, fixedClock);
}

function regimeInputs(issues: LegalIssueItem[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(issues.map((item) => [item.id, {
    legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' },
  }]));
}

describe('research-only legal pipeline', () => {
  it('does not invoke final generation automatically after producing research artifacts', async () => {
    const issueA = issue('issue-research-only', ['authority-federal']);
    const finalProvider = vi.fn();

    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueA]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: regimeInputs([issueA]),
      invokeFinalProvider: finalProvider,
      clock: fixedClock,
    });

    expect(result.bundles).toHaveLength(1);
    expect(finalProvider).not.toHaveBeenCalled();
  });

  it('runs a federal slice without calling the final-generation provider', async () => {
    const issueA = issue('issue-federal', ['authority-federal']);
    const finalProvider = vi.fn();
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueA]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: regimeInputs([issueA]),
      invokeFinalProvider: finalProvider,
      clock: fixedClock,
    });

    expect(result.bundles[0].researchStatus).toBe('VERIFIED_SUFFICIENT');
    expect(result.readiness[0].researchReadiness).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
    expect(finalProvider).not.toHaveBeenCalled();
  });

  it('does not create facts from a verified authority', async () => {
    const issueA = issue('issue-no-fact', ['authority-federal']);
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueA]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: regimeInputs([issueA]),
      clock: fixedClock,
    });

    expect(result).not.toHaveProperty('facts');
  });

  it('does not create EvidenceOffer records from a verified authority', async () => {
    const issueA = issue('issue-no-offer', ['authority-federal']);
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueA]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: regimeInputs([issueA]),
      clock: fixedClock,
    });

    expect(result).not.toHaveProperty('evidenceOffers');
  });

  it('does not create a ClientPosition from a verified authority', async () => {
    const issueA = issue('issue-no-position', ['authority-federal']);
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueA]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: regimeInputs([issueA]),
      clock: fixedClock,
    });

    expect(result).not.toHaveProperty('clientPosition');
  });

  it('runs a state slice with an explicit federative entity', async () => {
    const issueB = issue('issue-state', ['authority-state']);
    const stateRegime = {
      legalContext: { country: 'MX', scope: 'STATE', federativeEntity: 'MX-JAL', matter: 'civil', procedure: 'ordinario' },
    };
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-state', 'CODE', stateFixture.citation)]),
      issueMatrix: matrixWithIssues([issueB]),
      provider: provider([stateFixture]),
      regimeInputsByIssue: { [issueB.id]: stateRegime },
      clock: fixedClock,
    });

    expect(result.bundles[0].regimeResolution.scope).toBe('STATE');
    expect(result.bundles[0].regimeResolution.federativeEntity?.code).toBe('MX-JAL');
    expect(result.bundles[0].researchStatus).toBe('VERIFIED_SUFFICIENT');
  });

  it('fails closed for an unresolved regime without false verification', async () => {
    const issueC = issue('issue-unresolved', ['authority-federal']);
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([authority('authority-federal', 'LAW', federalFixture.citation)]),
      issueMatrix: matrixWithIssues([issueC]),
      provider: provider([federalFixture]),
      regimeInputsByIssue: { [issueC.id]: { legalContext: { scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      clock: fixedClock,
    });

    expect(result.bundles[0].researchStatus).toBe('REGIME_UNRESOLVED');
    expect(result.bundles[0].verifiedAuthorities).toEqual([]);
  });

  it('runs SOURCE_CITED, mismatch, and temporal rejection slices', async () => {
    const cited = issue('issue-cited', ['authority-cited']);
    const mismatch = issue('issue-mismatch', ['authority-mismatch']);
    const temporal = issue('issue-temporal', ['authority-temporal']);
    const analysis = richAnalysis([
      authority('authority-cited', 'LAW', federalFixture.citation),
      authority('authority-mismatch', 'LAW', federalFixture.citation),
      authority('authority-temporal', 'LAW', temporalFixture.citation),
    ]);
    const inputs = {
      [cited.id]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } },
      [mismatch.id]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } },
      [temporal.id]: { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario', relevantDate: '2018', temporalPrecision: 'YEAR' } },
    };
    const result = await runLegalResearchOnly({
      caseAnalysis: analysis,
      issueMatrix: matrixWithIssues([cited, mismatch, temporal]),
      provider: provider([federalFixture, mismatchFixture, temporalFixture]),
      regimeInputsByIssue: inputs,
      clock: fixedClock,
    });

    expect(result.bundles.find((bundle) => bundle.legalIssueId === cited.id)?.researchStatus).toBe('VERIFIED_SUFFICIENT');
    expect(result.bundles.flatMap((bundle) => bundle.rejectedCandidates.flatMap((item) => item.reasons)))
      .toEqual(expect.arrayContaining(['MISMATCH', 'OUTDATED']));
    const citedMention = analysis.richCaseAnalysis?.authorities.find((item) => item.id === 'authority-cited');
    expect(citedMention?.verificationStatus).toBe('SOURCE_CITED');
  });

  it('keeps cross-issue retrieval isolated when a provider returns another request candidate', async () => {
    const issueA = issue('issue-A', ['authority-A']);
    const issueB = issue('issue-B', ['authority-B']);
    const fixture = provider([federalFixture]);
    const leakingProvider: LegalResearchProvider = {
      ...fixture,
      async search(input) {
        const result = await fixture.search({ ...input, request: { ...input.request, id: 'request-from-issue-A' } });
        return result;
      },
    };
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis([
        authority('authority-A', 'LAW', federalFixture.citation),
        authority('authority-B', 'LAW', federalFixture.citation),
      ]),
      issueMatrix: matrixWithIssues([issueA, issueB]),
      provider: leakingProvider,
      regimeInputsByIssue: regimeInputs([issueA, issueB]),
      clock: fixedClock,
    });

    expect(result.bundles.find((bundle) => bundle.legalIssueId === issueB.id)?.verifiedAuthorities).toEqual([]);
  });
});
