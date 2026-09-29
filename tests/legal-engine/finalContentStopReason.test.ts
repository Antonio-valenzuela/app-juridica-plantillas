import { describe, expect, it } from 'vitest';
import { reconcileFinalContentStopReason } from '@/lib/legal-engine/generationExpansion';

describe('final content stop reason', () => {
  it('never says TARGET_REACHED when the final rendered PDF is below minimum', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'TARGET_REACHED', finalPages: 31, minPages: 35, hasRemainingSupportedAnalysis: true,
    })).toBe('RESOURCE_LIMIT');
  });

  it('uses CONTENT_LIMIT_REACHED only when legitimate supported analysis is exhausted', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'TARGET_REACHED', finalPages: 31, minPages: 35, hasRemainingSupportedAnalysis: false,
    })).toBe('CONTENT_LIMIT_REACHED');
  });

  it('reports target reached when the final materialized PDF is within range', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'RESOURCE_LIMIT', finalPages: 36, minPages: 35, hasRemainingSupportedAnalysis: false,
    })).toBe('TARGET_REACHED');
  });

  it('does not call pending Coverage attorney-input work CONTENT_LIMIT_REACHED', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'CONTENT_LIMIT_REACHED',
      finalPages: 8,
      minPages: 35,
      hasRemainingSupportedAnalysis: false,
      hasPendingCoverage: true,
    } as any)).toBe('ATTORNEY_INPUT_REQUIRED');
  });

  it('preserves a provider failure instead of relabeling it as content exhaustion', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'PROVIDER_UNAVAILABLE',
      finalPages: 8,
      minPages: 35,
      hasRemainingSupportedAnalysis: false,
    })).toBe('PROVIDER_UNAVAILABLE');
  });

  it('reports RESOURCE_LIMIT while calls, continuation budget, empty sections, or valid tasks remain', () => {
    for (const outstanding of [
      { hasAvailableCallBudget: true },
      { hasAvailableContinuationBudget: true },
      { hasEmptySubstantiveSections: true },
      { hasUnmaterializedValidTasks: true },
    ]) {
      expect(reconcileFinalContentStopReason({
        prior: 'CONTENT_LIMIT_REACHED',
        finalPages: 8,
        minPages: 35,
        hasRemainingSupportedAnalysis: false,
        ...outstanding,
      } as any)).toBe('RESOURCE_LIMIT');
    }
  });

  it('returns CONTENT_LIMIT_REACHED only when no support, pending coverage, resources, or valid tasks remain', () => {
    expect(reconcileFinalContentStopReason({
      prior: 'CONTENT_LIMIT_REACHED',
      finalPages: 8,
      minPages: 35,
      hasRemainingSupportedAnalysis: false,
      hasPendingCoverage: false,
      hasEmptySubstantiveSections: false,
      hasAvailableContinuationBudget: false,
      hasAvailableCallBudget: false,
      hasUnmaterializedValidTasks: false,
      hasUnresolvedAttorneyQuestions: false,
    } as any)).toBe('CONTENT_LIMIT_REACHED');
  });
});
