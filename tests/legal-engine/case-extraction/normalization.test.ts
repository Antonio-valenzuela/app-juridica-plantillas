import { describe, expect, it } from 'vitest';
import { normalizeAmountCandidate, normalizeDateCandidate } from '@/lib/legal-engine/case-extraction/normalization';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';

function candidate(rawText: string): ExtractionCandidate {
  return {
    candidateId: 'candidate-1',
    kind: 'DATE',
    rawText,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: rawText, extractionMethod: 'PATTERN', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'ACCEPTED',
  };
}

describe('case extraction normalization', () => {
  it('preserves OCR provenance when a date is normalized', () => {
    const source = createSourceProvenance({
      sourceId: 'src-ocr',
      page: 7,
      excerpt: '3 de enero de 2026',
      extractionMethod: 'OCR',
      confidence: 0.94,
      inferenceLevel: 'LITERAL',
    });
    const date = normalizeDateCandidate({ ...candidate('3 de enero de 2026'), provenance: [source] });

    expect(date.normalizedValue).toBe('2026-01-03');
    expect(date.provenance[0]).toMatchObject({ sourceId: 'src-ocr', page: 7, extractionMethod: 'OCR', inferenceLevel: 'NORMALIZED' });
  });

  it('normalizes a complete date while preserving raw text', () => {
    const date = normalizeDateCandidate(candidate('3 de enero de 2026'));

    expect(date).toMatchObject({ rawValue: '3 de enero de 2026', normalizedValue: '2026-01-03', precision: 'DAY' });
  });

  it('keeps a partial month date without inventing a day', () => {
    const date = normalizeDateCandidate(candidate('enero de 2026'));

    expect(date).toMatchObject({ precision: 'MONTH', normalizedValue: '2026-01' });
    expect(date.normalizedValue).not.toContain('-01-');
  });

  it('normalizes an unambiguous peso amount and preserves the raw value', () => {
    const amount = normalizeAmountCandidate(candidate('$20,000.00 (veinte mil pesos 00/100 M.N.)'));

    expect(amount).toMatchObject({ normalizedValue: 20000, currency: 'MXN', rawValue: '$20,000.00 (veinte mil pesos 00/100 M.N.)' });
  });

  it('does not invent precision for an unknown or year-only date', () => {
    expect(normalizeDateCandidate(candidate('2026'))).toMatchObject({ precision: 'YEAR', normalizedValue: '2026' });
    expect(normalizeDateCandidate(candidate('fecha pendiente'))).toMatchObject({ precision: 'UNKNOWN', normalizedValue: undefined });
  });
});
