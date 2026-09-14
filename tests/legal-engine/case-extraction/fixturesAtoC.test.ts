import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import {
  fixtureA_cleanText,
  fixtureB_continuousText,
  fixtureC_commaEvidence,
} from '@/tests/fixtures/caseAnalysisExtractionFixtures';

describe('synthetic extraction fixtures A-C', () => {
  it('Fixture A extracts the conventional structure', () => {
    const analysis = reconstructCaseAnalysis([fixtureA_cleanText()], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.parties.length).toBeGreaterThanOrEqual(2);
    expect(analysis.richCaseAnalysis?.claims.length).toBeGreaterThanOrEqual(2);
  });

  it('Fixture B keeps continuous prose conservative', () => {
    const analysis = reconstructCaseAnalysis([fixtureB_continuousText()], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.assertions.some((item) => item.status === 'ALLEGED')).toBe(true);
    expect(analysis.richCaseAnalysis?.facts.length).toBeLessThanOrEqual(2);
  });

  it('Fixture C produces evidence mentions from comma-separated text', () => {
    const analysis = reconstructCaseAnalysis([fixtureC_commaEvidence()], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.evidenceMentions.length).toBe(3);
    expect(analysis.richCaseAnalysis?.evidenceOffers).toHaveLength(0);
  });
});
