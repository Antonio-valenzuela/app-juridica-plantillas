import { describe, expect, it } from 'vitest';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import { isFinalGenerationEligible, type IssueContextPack } from '@/lib/legal-engine/issueScopedGeneration';
import { buildVerifiedResearchContext } from '@/lib/legal-engine/issueScopedGeneration';
import type { LegalResearchBundle, VerifiedAuthority } from '@/lib/legal-engine/legal-research/types';

function authorityFor(issueId: string): VerifiedAuthority {
  return {
    id: `authority-${issueId}`,
    identity: {
      canonicalCitation: 'ARTICULO FEDERAL FIXTURE 14',
      authorityType: 'STATUTE',
      issuingAuthority: 'Autoridad federal fixture',
      identityKey: `identity-${issueId}`,
    },
    source: {
      sourceUrl: 'https://fixture.official.test/federal/article-14',
      sourceDomain: 'fixture.official.test',
      sourceTier: 'OFFICIAL_PRIMARY',
      retrievedAt: '2026-01-01T00:00:00.000Z',
      sourceHash: `source-${issueId}`,
      isFixture: true,
    },
    temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-01-01T00:00:00.000Z', basis: ['fixture'] },
    jurisdictionValidity: { status: 'APPLICABLE', scope: 'FEDERAL', bindingCharacter: 'BINDING_WHEN_APPLICABLE', basis: ['fixture'] },
    proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    verificationStatus: 'VERIFIED',
    supportsLegalIssueIds: [issueId],
    sourceAuthorityMentionIds: [],
    verificationHash: `verification-${issueId}`,
  };
}

function bundleWithAuthorities(...issueIds: string[]): LegalResearchBundle {
  return {
    legalIssueId: issueIds[0],
    requestId: `request-${issueIds[0]}`,
    regimeResolution: {
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
    },
    verifiedAuthorities: issueIds.map(authorityFor),
    rejectedCandidates: [],
    unresolvedQuestions: [],
    researchStatus: 'VERIFIED_SUFFICIENT',
    researchHash: 'research-hash-1',
  };
}

function researchTaskFor(issueId: string): GenerationTask {
  return {
    id: `research-task-${issueId}`,
    sectionId: 'section-1',
    sectionTitle: 'Investigación',
    taskType: 'LEGAL_RESEARCH',
    complexity: 'SHORT',
    tokenBudget: 100,
    status: 'pending',
    legalIssueIds: [issueId],
  };
}

describe('future verified research re-entry contract', () => {
  it('projects only verified authorities for the requested issue', () => {
    const context = buildVerifiedResearchContext(bundleWithAuthorities('issue-A', 'issue-B'), 'issue-A');

    expect(context.authorities.map((authority) => authority.id)).toEqual(['authority-issue-A']);
    expect(context).not.toHaveProperty('rejectedCandidates');
    expect(context).not.toHaveProperty('secondaryAuthorities');
  });

  it('returns an empty context when the bundle belongs to another issue', () => {
    const context = buildVerifiedResearchContext(bundleWithAuthorities('issue-A'), 'issue-B');

    expect(context.authorities).toEqual([]);
    expect(context.legalIssueId).toBe('issue-B');
  });

  it('does not translate derived readiness into current final-generation eligibility', () => {
    const issue = {
      id: 'issue-A',
      relationStatus: 'EXPLICIT',
      status: 'NEEDS_RESEARCH',
    } as any;

    expect(isFinalGenerationEligible(issue, researchTaskFor(issue.id))).toBe(false);
  });

  it('keeps the verified research context additive to the existing pack allowlist', () => {
    const context = buildVerifiedResearchContext(bundleWithAuthorities('issue-A'), 'issue-A');
    const futurePack: Pick<IssueContextPack, 'legalIssue' | 'contextHash'> & { verifiedResearch?: typeof context } = {
      legalIssue: { id: 'issue-A', issueType: 'AUTHORITY_RESEARCH', question: 'Pregunta', status: 'NEEDS_RESEARCH', relationStatus: 'EXPLICIT', required: true },
      contextHash: 'context-hash-1',
      verifiedResearch: context,
    };

    expect(futurePack.verifiedResearch?.authorities).toHaveLength(1);
    expect(futurePack.verifiedResearch).not.toHaveProperty('rejectedCandidates');
  });
});
