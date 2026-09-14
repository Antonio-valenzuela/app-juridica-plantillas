import { describe, expect, it } from 'vitest';
import { deriveIssueResearchReadiness } from '@/lib/legal-engine/legal-research/readiness';
import type { LegalIssueItem } from '@/lib/legal-engine/legalIssueMatrix';
import type { LegalRegimeResolution, LegalResearchBundle } from '@/lib/legal-engine/legal-research/types';

const regime: LegalRegimeResolution = {
  id: 'regime-federal-1',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-1',
};

function issueWith(overrides: Partial<LegalIssueItem> = {}): LegalIssueItem {
  return {
    id: 'issue-1',
    issueType: 'AUTHORITY_RESEARCH',
    question: '¿Qué requisito debe revisarse?',
    source: { mode: 'RICH_COVERAGE', coverageItemId: 'coverage-1', coverageCategory: 'AUTHORITY_MENTION', sourceEntityIds: ['authority-1'] },
    coverageItemIds: ['coverage-1'],
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
}

function sufficientBundleFor(legalIssueId: string): LegalResearchBundle {
  return {
    legalIssueId,
    requestId: `request-${legalIssueId}`,
    regimeResolution: regime,
    verifiedAuthorities: [{
      id: `authority-${legalIssueId}`,
      identity: {
        canonicalCitation: 'ARTICULO FEDERAL FIXTURE 14',
        authorityType: 'STATUTE',
        issuingAuthority: 'Autoridad federal fixture',
        identityKey: `identity-${legalIssueId}`,
      },
      source: {
        sourceUrl: 'https://fixture.official.test/federal/article-14',
        sourceDomain: 'fixture.official.test',
        sourceTier: 'OFFICIAL_PRIMARY',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        sourceHash: `source-${legalIssueId}`,
        isFixture: true,
      },
      temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-01-01T00:00:00.000Z', basis: ['fixture'] },
      jurisdictionValidity: { status: 'APPLICABLE', scope: 'FEDERAL', bindingCharacter: 'BINDING_WHEN_APPLICABLE', basis: ['fixture'] },
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
      verificationStatus: 'VERIFIED',
      supportsLegalIssueIds: [legalIssueId],
      sourceAuthorityMentionIds: [],
      verificationHash: `verification-${legalIssueId}`,
    }],
    rejectedCandidates: [],
    unresolvedQuestions: [],
    researchStatus: 'VERIFIED_SUFFICIENT',
    researchHash: `research-${legalIssueId}`,
  };
}

describe('legal research readiness', () => {
  it('derives readiness without changing the canonical NEEDS_RESEARCH status', () => {
    const issue = issueWith({ status: 'NEEDS_RESEARCH', researchStatus: 'NEEDS_RESEARCH' });
    const result = deriveIssueResearchReadiness(issue, sufficientBundleFor(issue.id));

    expect(result.canonicalStatus).toBe('NEEDS_RESEARCH');
    expect(result.researchReadiness).toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
    expect(issue.status).toBe('NEEDS_RESEARCH');
  });

  it('keeps client-position blocker precedence', () => {
    const result = deriveIssueResearchReadiness(
      issueWith({ status: 'NEEDS_CLIENT_POSITION', clientPositionStatus: 'UNKNOWN' }),
      sufficientBundleFor('issue-1'),
    );

    expect(result.blockers).toContain('MISSING_CLIENT_POSITION_REQUIRED');
    expect(result.researchReadiness).not.toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
  });

  it('keeps conflict blocker precedence', () => {
    const result = deriveIssueResearchReadiness(
      issueWith({ status: 'BLOCKED_BY_CONFLICT', conflictIds: ['conflict-1'] }),
      sufficientBundleFor('issue-1'),
    );

    expect(result.blockers).toContain('BLOCKING_CONFLICT_REQUIRES_REVIEW');
    expect(result.researchReadiness).not.toBe('READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH');
  });

  it('reports absent and unresolved research without making the issue ready', () => {
    const absent = deriveIssueResearchReadiness(issueWith(), undefined);
    const unresolved = deriveIssueResearchReadiness(issueWith(), {
      ...sufficientBundleFor('issue-1'),
      researchStatus: 'REGIME_UNRESOLVED',
    });

    expect(absent.researchReadiness).toBe('RESEARCH_REQUIRED');
    expect(unresolved.researchReadiness).toBe('LEGAL_REGIME_UNRESOLVED');
  });

  it('returns NOT_REQUIRED for an issue without a research dependency', () => {
    const result = deriveIssueResearchReadiness(issueWith({ researchStatus: 'NOT_REQUIRED', status: 'READY_FOR_GENERATION' }));

    expect(result.researchReadiness).toBe('NOT_REQUIRED');
    expect(result.blockers).toEqual([]);
  });
});
