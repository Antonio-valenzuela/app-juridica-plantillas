import { describe, expect, it } from 'vitest';
import {
  buildLegalResearchBundle,
  hashResearchBundle,
  recordHumanReviewDecision,
} from '@/lib/legal-engine/legal-research/researchBundle';
import type {
  AuthorityCandidate,
  LegalRegimeResolution,
  LegalResearchRequest,
  RejectedAuthorityCandidate,
  VerifiedAuthority,
} from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

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

const request: LegalResearchRequest = {
  id: 'request-1',
  legalIssueId: 'issue-1',
  coverageItemIds: ['coverage-1'],
  question: '¿Qué requisito debe revisarse?',
  jurisdiction: 'federal',
  matter: 'civil',
  procedure: 'ordinario',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-hash-1',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

function verifiedFor(
  legalIssueId: string,
  supportLevel: VerifiedAuthority['proposition']['supportLevel'] = 'DIRECT',
): VerifiedAuthority {
  return {
    id: `authority-${legalIssueId}-${supportLevel}`,
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
      retrievedAt: fixedClock().toISOString(),
      locator: 'fixture:article-14',
      sourceHash: `source-hash-${legalIssueId}`,
      excerptHash: `excerpt-hash-${legalIssueId}`,
      isFixture: true,
    },
    temporalValidity: {
      status: 'CURRENT_AND_APPLICABLE',
      checkedAt: fixedClock().toISOString(),
      basis: ['fixture'],
    },
    jurisdictionValidity: {
      status: 'APPLICABLE',
      country: 'MX',
      scope: 'FEDERAL',
      matter: 'civil',
      procedure: 'ordinario',
      bindingCharacter: 'BINDING_WHEN_APPLICABLE',
      basis: ['fixture'],
    },
    proposition: {
      text: 'El requisito fixture debe acreditarse.',
      supportLevel,
      sourceLocator: 'fixture:article-14',
      limitations: supportLevel === 'DIRECT' ? [] : ['La fuente no resuelve toda la cuestión.'],
    },
    verificationStatus: 'VERIFIED',
    supportsLegalIssueIds: [legalIssueId],
    sourceAuthorityMentionIds: [],
    verificationHash: `verification-hash-${legalIssueId}-${supportLevel}`,
  };
}

function rejectedCandidate(): RejectedAuthorityCandidate {
  const candidate: AuthorityCandidate = {
    id: 'candidate-rejected-1',
    requestId: request.id,
    authorityType: 'STATUTE',
    observedCitation: 'Cita no verificada',
    sourceTier: 'SECONDARY_SUPPORT',
    retrievedAt: fixedClock().toISOString(),
    metadataStatus: 'PARTIAL',
    candidateStatus: 'REJECTED',
  };
  return {
    candidate,
    reasons: ['NON_OFFICIAL_ONLY'],
    detail: ['Solo existe una fuente secundaria.'],
    rejectedAt: fixedClock().toISOString(),
  };
}

describe('legal research bundle', () => {
  it('returns VERIFIED_SUFFICIENT when essential propositions are officially supported', async () => {
    const bundle = await buildLegalResearchBundle({
      request,
      regime,
      verifications: [verifiedFor(request.legalIssueId)],
      unresolvedQuestions: [],
    });

    expect(bundle.researchStatus).toBe('VERIFIED_SUFFICIENT');
  });

  it('returns VERIFIED_PARTIAL when a material proposition is unsupported', async () => {
    const bundle = await buildLegalResearchBundle({
      request,
      regime,
      verifications: [verifiedFor(request.legalIssueId, 'LIMITED')],
      unresolvedQuestions: ['proposición esencial sin soporte'],
    });

    expect(bundle.researchStatus).toBe('VERIFIED_PARTIAL');
  });

  it('returns REGIME_UNRESOLVED without accepting candidates', async () => {
    const unresolvedRegime: LegalRegimeResolution = {
      ...regime,
      id: 'regime-unresolved-1',
      status: 'LEGAL_REGIME_UNRESOLVED',
      scope: 'UNKNOWN',
      unresolvedFields: ['federativeEntity'],
    };
    const bundle = await buildLegalResearchBundle({
      request: { ...request, status: 'BLOCKED', regimeResolutionId: unresolvedRegime.id },
      regime: unresolvedRegime,
      verifications: [verifiedFor('other-issue')],
    });

    expect(bundle.researchStatus).toBe('REGIME_UNRESOLVED');
    expect(bundle.verifiedAuthorities).toEqual([]);
  });

  it('does not leak an authority from issue A into issue B', async () => {
    const bundle = await buildLegalResearchBundle({
      request: { ...request, id: 'request-issue-b', legalIssueId: 'issue-B' },
      regime,
      verifications: [verifiedFor('issue-A')],
    });

    expect(bundle.verifiedAuthorities).toEqual([]);
    expect(bundle.researchStatus).toBe('NO_AUTHORITY_FOUND');
  });

  it('preserves rejected candidates and their explicit reasons', async () => {
    const bundle = await buildLegalResearchBundle({
      request,
      regime,
      verifications: [],
      rejections: [rejectedCandidate()],
    });

    expect(bundle.rejectedCandidates[0].reasons).toEqual(['NON_OFFICIAL_ONLY']);
    expect(bundle.researchStatus).toBe('NO_AUTHORITY_FOUND');
  });

  it('records human review without changing evidence or authority kind', () => {
    const decision = recordHumanReviewDecision({
      candidateId: 'candidate-1',
      authorityId: 'authority-1',
      decision: 'APPROVE_CONSUMPTION',
      reason: 'Metadata ambiguity reviewed against the same official evidence.',
      evidenceHash: 'evidence-hash-1',
      researchHash: 'research-hash-1',
      decidedAt: fixedClock().toISOString(),
    });

    expect(decision.candidateId).toBe('candidate-1');
    expect(decision.evidenceHash).toBe('evidence-hash-1');
    expect(decision.decision).toBe('APPROVE_CONSUMPTION');
  });

  it('keeps the research hash deterministic when attempt timestamps change', async () => {
    const base = await buildLegalResearchBundle({
      request,
      regime,
      verifications: [verifiedFor(request.legalIssueId)],
      unresolvedQuestions: [],
    });
    const changedMetadata = {
      ...base,
      verifiedAuthorities: base.verifiedAuthorities.map((authority) => ({
        ...authority,
        source: { ...authority.source, retrievedAt: '2026-02-01T00:00:00.000Z' },
        temporalValidity: { ...authority.temporalValidity, checkedAt: '2026-02-01T00:00:00.000Z' },
      })),
      researchHash: 'not-used-as-input',
    };

    await expect(hashResearchBundle(changedMetadata)).resolves.toBe(base.researchHash);
  });
});
