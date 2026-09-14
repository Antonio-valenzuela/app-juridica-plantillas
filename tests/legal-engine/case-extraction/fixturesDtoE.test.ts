import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import {
  fixtureD_conflictingSources,
  fixtureE_incompleteCase,
} from '../../fixtures/caseAnalysisExtractionFixtures';

describe('synthetic extraction fixtures D-E', () => {
  it('Fixture D records conflicts without selecting a winning source', () => {
    const analysis = reconstructCaseAnalysis(fixtureD_conflictingSources(), 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(analysis.richCaseAnalysis?.conflicts.every((conflict) => conflict.requiresReview)).toBe(true);
  });

  it('Fixture E keeps partial dates and unknown client position', () => {
    const analysis = reconstructCaseAnalysis([fixtureE_incompleteCase()], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.clientPosition.status).toBe('UNKNOWN');
    expect(analysis.richCaseAnalysis?.dates.some((date) => date.precision === 'MONTH')).toBe(true);
    expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(0);
  });
});
