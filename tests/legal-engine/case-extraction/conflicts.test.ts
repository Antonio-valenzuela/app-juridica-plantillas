import { describe, expect, it } from 'vitest';
import { detectCaseConflicts } from '@/lib/legal-engine/case-extraction/conflicts';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { NormalizedAmount, NormalizedDate, RichCaseAnalysis, SourceAssertion } from '@/lib/legal-engine/case-extraction/types';

function amount(value: number, sourceId: string): NormalizedAmount {
  return {
    rawValue: `$${value}`,
    normalizedValue: value,
    currency: 'MXN',
    provenance: [createSourceProvenance({ sourceId, excerpt: `$${value}`, extractionMethod: 'NORMALIZATION', confidence: 1, inferenceLevel: 'NORMALIZED' })],
  };
}

function baseAnalysis(overrides: Partial<RichCaseAnalysis>): RichCaseAnalysis {
  return {
    parties: [], assertions: [], claims: [], facts: [], documents: [], evidenceMentions: [], evidenceOffers: [], arguments: [], authorities: [], dates: [], amounts: [], proceduralTimeline: [], conflicts: [], missingData: [],
    sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] },
    clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
    extractionStats: { sourceUnitCount: 0, candidatesDetected: 0, candidatesAccepted: 0, candidatesMerged: 0, candidatesRejected: 0, candidatesForReview: 0, rejectionReasons: {}, provenanceComplete: 0, provenancePartial: 0, provenanceMissing: 0 },
    candidates: [],
    ...overrides,
  };
}

function assertion(proposition: string, sourceId: string): SourceAssertion {
  return { id: `assertion-${sourceId}`, proposition, status: 'ALLEGED', provenance: [createSourceProvenance({ sourceId, excerpt: proposition, extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' })] };
}

function date(rawValue: string, normalizedValue: string, sourceId = 'src-a'): NormalizedDate {
  return {
    rawValue,
    normalizedValue,
    precision: normalizedValue.length === 4 ? 'YEAR' : normalizedValue.length === 7 ? 'MONTH' : 'DAY',
    provenance: [createSourceProvenance({ sourceId, excerpt: rawValue, extractionMethod: 'NORMALIZATION', confidence: 1, inferenceLevel: 'NORMALIZED' })],
  };
}

describe('detectCaseConflicts', () => {
  it('keeps contradictory amounts open for review', () => {
    const conflicts = detectCaseConflicts(baseAnalysis({ amounts: [amount(20000, 'src-a'), amount(25000, 'src-b')] }));

    expect(conflicts[0]).toMatchObject({ type: 'AMOUNT', requiresReview: true });
    expect(conflicts[0].sourceIds.sort()).toEqual(['src-a', 'src-b']);
  });

  it('detects opposing assertions without selecting the true one', () => {
    const analysis = baseAnalysis({ assertions: [assertion('hubo pago', 'src-a'), assertion('no hubo pago', 'src-b')] });
    const conflicts = detectCaseConflicts(analysis);

    expect(conflicts.some((conflict) => conflict.type === 'OPPOSING_ASSERTION')).toBe(true);
    expect(analysis.facts.every((fact) => fact.assertionStatus !== 'ESTABLISHED_FACT')).toBe(true);
  });

  it('does not classify dates from distinct semantic events as an incompatibility', () => {
    const analysis = baseAnalysis({
      dates: [
        date('La sentencia fue dictada el 10 de enero de 2024.', '2024-01-10'),
        date('La jurisprudencia fue publicada en junio de 2023.', '2023-06'),
      ],
    });

    expect(detectCaseConflicts(analysis).filter((conflict) => conflict.type === 'DATE')).toEqual([]);
  });

  it('keeps an incompatible date for the same semantic event open for review', () => {
    const analysis = baseAnalysis({
      dates: [
        date('El contrato de trabajo se celebró el 10 de enero de 2024.', '2024-01-10'),
        date('El contrato de trabajo se celebró el 12 de enero de 2024.', '2024-01-12'),
      ],
    });

    expect(detectCaseConflicts(analysis)).toEqual([
      expect.objectContaining({
        type: 'DATE',
        itemIds: ['date-0', 'date-1'],
        requiresReview: true,
      }),
    ]);
  });
});
