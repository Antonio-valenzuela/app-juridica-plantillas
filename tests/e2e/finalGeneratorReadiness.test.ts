import { describe, expect, it } from 'vitest';
import {
  assessFinalGeneratorReadiness,
  countIssueGenerationAttemptRecords,
} from '@/scripts/finalGeneratorReadiness';

const healthyEvidence = {
  exportAllowed: true,
  docxPresent: true,
  pdfPresent: true,
  actualPdfPages: 35,
  minimumPages: 30,
  substantiveWords: 6_000,
  minimumSubstantiveWords: 1_800,
  professionalQualityGate: 'REVIEW_REQUIRED' as const,
  criticalCheckIds: [],
  factualUnsupportedClaims: 0,
  unverifiedFactualClaims: 0,
  unsupportedLegalAuthorities: 0,
  factsTotal: 12,
  factsWithResponse: 12,
  claimsTotal: 7,
  claimsWithResponse: 7,
  providerBackedTasks: 15,
};

describe('final generator readiness assessment', () => {
  it('counts persisted issue-generation attempts and reports missing trace data as unavailable', () => {
    expect(countIssueGenerationAttemptRecords({ issueGenerationAttempts: [{}, {}, {}] })).toBe(3);
    expect(countIssueGenerationAttemptRecords({ issueGenerationAttempts: 'not-an-array' })).toBeNull();
    expect(countIssueGenerationAttemptRecords(null)).toBeNull();
  });

  it('does not pass on word count or file presence when integrity evidence is missing', () => {
    const result = assessFinalGeneratorReadiness({
      ...healthyEvidence,
      exportAllowed: false,
      pdfPresent: false,
      actualPdfPages: 11,
      criticalCheckIds: ['FACTUAL_CLAIM_AUDIT_MISSING', 'AUTHORITY_VERIFICATION_FAILED'],
      factualUnsupportedClaims: 1,
      unverifiedFactualClaims: 215,
      unsupportedLegalAuthorities: 17,
      factsWithResponse: 0,
      claimsWithResponse: 0,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'DRAFT_EXPORT_BLOCKED',
      'PDF_NOT_EXPORTED',
      'PAGE_TARGET_NOT_MET',
      'FACTUAL_CLAIM_AUDIT_MISSING',
      'AUTHORITY_VERIFICATION_FAILED',
      'UNSUPPORTED_FACTUAL_CLAIMS',
      'UNVERIFIED_FACTUAL_CLAIMS',
      'UNSUPPORTED_LEGAL_AUTHORITIES',
      'FACT_RESPONSES_INCOMPLETE',
      'CLAIM_RESPONSES_INCOMPLETE',
    ]));
  });

  it('allows a professionally sized DRAFT that is review-required but has clean integrity evidence', () => {
    expect(assessFinalGeneratorReadiness(healthyEvidence)).toEqual({ ready: true, blockers: [] });
  });

  it('fails closed when any required audit metric is unavailable', () => {
    const result = assessFinalGeneratorReadiness({
      ...healthyEvidence,
      unsupportedLegalAuthorities: null,
    });

    expect(result.ready).toBe(false);
    expect(result.blockers).toContain('AUTHORITY_AUDIT_UNAVAILABLE');
  });
});
