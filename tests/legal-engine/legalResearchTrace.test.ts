import { describe, expect, it } from 'vitest';
import { createResearchTraceRecorder } from '@/lib/legal-engine/legal-research/researchTrace';
import type {
  LegalRegimeResolution,
  LegalResearchBundle,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';
import type { DerivedIssueReadiness } from '@/lib/legal-engine/legal-research/types';

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

const query: NormalizedResearchQuery = {
  requestId: request.id,
  normalizedQuery: 'art 14 mx federal civil ordinario statute',
  queryHash: 'query-hash-1',
  explicitTerms: ['art', '14', 'mx', 'federal', 'civil', 'ordinario', 'statute'],
  regimeHash: regime.resolutionHash,
};

const bundle: LegalResearchBundle = {
  legalIssueId: request.legalIssueId,
  requestId: request.id,
  regimeResolution: regime,
  verifiedAuthorities: [],
  rejectedCandidates: [],
  unresolvedQuestions: [],
  researchStatus: 'NO_AUTHORITY_FOUND',
  researchHash: 'research-hash-1',
};

const readiness: DerivedIssueReadiness = {
  legalIssueId: request.legalIssueId,
  canonicalStatus: 'NEEDS_RESEARCH',
  researchReadiness: 'RESEARCH_REQUIRED',
  researchBundleHash: bundle.researchHash,
  blockers: ['LEGAL_RESEARCH_OR_SOURCE_VERIFICATION_REQUIRED'],
};

describe('legal research trace', () => {
  it('records the request-to-bundle chain with bounded metadata', () => {
    const trace = createResearchTraceRecorder({ clock: fixedClock });
    trace.recordRequest(request, regime);
    trace.recordQuery(query);
    trace.recordAttempt({
      adapterId: 'FIXTURE_OFFICIAL',
      outcome: 'PASS',
      candidateIds: ['candidate-1'],
      acceptedAuthorityIds: ['authority-1'],
      rejectedCandidateIds: [],
      officialUrls: ['https://fixture.official.test/a'],
      sourceHashes: ['hash-1'],
      reasons: [],
    });
    trace.recordBundle(bundle, readiness);

    const result = trace.close();
    expect(result.requestId).toBe(request.id);
    expect(result.status).toBe(bundle.researchStatus);
    expect(result.attempts).toHaveLength(1);
    expect(result.bundle?.researchHash).toBe(bundle.researchHash);
    expect(result.readiness?.researchReadiness).toBe('RESEARCH_REQUIRED');
  });

  it('does not store corpus or secrets', () => {
    const result = createResearchTraceRecorder({ clock: fixedClock }).close();

    expect(JSON.stringify(result)).not.toContain('full source corpus');
    expect(JSON.stringify(result)).not.toMatch(/api[_-]?key|bearer/i);
  });

  it('records candidates and verification outcomes without source content', () => {
    const trace = createResearchTraceRecorder({ clock: fixedClock });
    trace.recordRequest(request, regime);
    trace.recordCandidate({
      candidateId: 'candidate-1',
      requestId: request.id,
      authorityType: 'STATUTE',
      sourceTier: 'OFFICIAL_PRIMARY',
      sourceUrl: 'https://fixture.official.test/a',
      sourceHash: 'hash-1',
      status: 'RETRIEVED',
    });
    trace.recordVerification({
      authorityId: 'authority-1',
      candidateId: 'candidate-1',
      status: 'VERIFIED',
      verificationHash: 'verification-hash-1',
      reasons: [],
    });

    const result = trace.close();
    expect(result.candidates[0].candidateId).toBe('candidate-1');
    expect(result.verifications[0].verificationHash).toBe('verification-hash-1');
    expect(JSON.stringify(result)).not.toContain('Texto completo de la fuente');
  });
});
