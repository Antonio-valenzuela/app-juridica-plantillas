import { describe, expect, it } from 'vitest';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type { LegalResearchProvider } from '@/lib/legal-engine/legal-research/adapters/types';
import { runLegalResearchOnly } from '@/lib/legal-engine/pipeline';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const fixture = {
  authorityType: 'STATUTE' as const,
  citation: 'Artículo rich fixture 14',
  canonicalCitation: 'ARTICULO RICH FIXTURE 14',
  sourceUrl: 'https://fixture.official.test/federal/rich-14',
  sourceDomain: 'fixture.official.test',
  issuingAuthority: 'Autoridad federal fixture',
  jurisdiction: 'FEDERAL',
  matter: 'civil',
  procedure: 'ordinario',
  publicationDate: '2020-01-01',
  effectiveFrom: '2020-01-02',
  locator: 'fixture:rich-14',
  proposition: 'El requisito rich debe acreditarse.',
  content: 'Contenido fixture acotado.',
};

function matrixFor(issueId: string, overrides: Partial<LegalIssueItem> = {}): LegalIssueMatrix {
  const issue: LegalIssueItem = {
    id: issueId,
    issueType: 'AUTHORITY_RESEARCH',
    question: '¿Qué requisito debe revisarse?',
    source: { mode: 'RICH_COVERAGE', coverageItemId: `coverage-${issueId}`, coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: ['authority-1'] },
    coverageItemIds: [`coverage-${issueId}`],
    claimIds: [],
    factIds: [],
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['authority-1'],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: true,
    status: 'NEEDS_RESEARCH',
    researchStatus: 'NEEDS_RESEARCH',
    provenance: [],
    relationStatus: 'EXPLICIT',
    ...overrides,
  };
  return {
    documentId: `document-${issueId}`,
    documentType: 'fixture',
    sourceMode: 'RICH',
    issues: [issue],
    summary: {
      total: 1,
      required: 1,
      blocked: 1,
      readyForGeneration: 0,
      needsLegalResearch: issue.researchStatus === 'NOT_REQUIRED' ? 0 : 1,
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
      authorities: [{ id: 'authority-1', authorityType: 'LAW', citationText: fixture.citation, verificationStatus: 'SOURCE_CITED', provenance: [] }],
      conflicts: [],
      missingData: [],
      sourcePosition: { mode: 'SOURCE_GROUNDED', confidence: 1, sourceIds: [] },
      extractionStats: {} as any,
      candidates: [],
    },
  } as unknown as CaseAnalysis;
}

function legacyAnalysis(): CaseAnalysis {
  return {
    parties: [],
    authorities: [],
    caseNumbers: [],
    proceduralTimeline: [],
    facts: [],
    claims: [],
    evidence: [],
  } as unknown as CaseAnalysis;
}

function provider(): LegalResearchProvider {
  return createFixtureOfficialAdapter([fixture], fixedClock);
}

describe('legal research legacy regressions', () => {
  it('uses rich entities when richCaseAnalysis exists and never projects through legacy issues', async () => {
    const matrix = matrixFor('issue-rich-1');
    const result = await runLegalResearchOnly({
      caseAnalysis: richAnalysis(),
      issueMatrix: matrix,
      provider: provider(),
      regimeInputsByIssue: { 'issue-rich-1': { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      clock: fixedClock,
    });

    expect(result.bundles[0].legalIssueId).toMatch(/^issue-/);
    expect(result.bundles[0].legalIssueId).not.toMatch(/^legacy-issue-/);
    expect(richAnalysis().richCaseAnalysis?.authorities[0].verificationStatus).toBe('SOURCE_CITED');
  });

  it('does not change a legacy matrix or invent research authorities', async () => {
    const legacyMatrix = matrixFor('legacy-issue-1');
    const matrixBefore = structuredClone(legacyMatrix);
    const result = await runLegalResearchOnly({
      caseAnalysis: legacyAnalysis(),
      issueMatrix: legacyMatrix,
      provider: provider(),
      regimeInputsByIssue: { 'legacy-issue-1': { legalContext: { country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario' } } },
      clock: fixedClock,
    });

    expect(legacyMatrix).toEqual(matrixBefore);
    expect(result.bundles.every((bundle) => bundle.verifiedAuthorities.length === 0)).toBe(true);
  });

  it('preserves the non-labor path without creating a research request', async () => {
    const matrix = matrixFor('issue-civil-1', {
      issueType: 'CLAIM_ELEMENT',
      authorityMentionIds: [],
      researchStatus: 'NOT_REQUIRED',
      status: 'READY_FOR_GENERATION',
    });
    const result = await runLegalResearchOnly({
      caseAnalysis: legacyAnalysis(),
      issueMatrix: matrix,
      provider: provider(),
      clock: fixedClock,
    });

    expect(result.requests).toEqual([]);
    expect(result.bundles).toEqual([]);
    expect(result.readiness.every((item) => item.legalIssueId)).toBe(true);
  });
});
