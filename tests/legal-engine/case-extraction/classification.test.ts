import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';

function candidates(...texts: string[]): ExtractionCandidate[] {
  return texts.map((text, index) => ({
    candidateId: `candidate-${index}`,
    kind: 'ASSERTION',
    rawText: text,
    provenance: [createSourceProvenance({
      sourceId: 'src-a',
      excerpt: text,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    })],
    decision: 'REQUIRES_REVIEW',
  }));
}

describe('classifyCandidates', () => {
  it('attributes an allegation to the speaking party', () => {
    const [candidate] = classifyCandidates(candidates('La actora afirma que el demandado incumplió.'));

    expect(candidate.classification?.label).toBe('SOURCE_ASSERTION');
    expect(candidate.speakerRole).toBe('PARTE_ACTORA');
    expect(candidate.kind).toBe('ASSERTION');
  });

  it('classifies explicit headings without treating them as legal conclusions', () => {
    const result = classifyCandidates(candidates('PRUEBAS: contrato, recibos'));

    expect(result.every((candidate) => candidate.kind === 'EVIDENCE' || candidate.kind === 'DOCUMENT')).toBe(true);
    expect(result.every((candidate) => candidate.classification?.label !== 'LEGALLY_VERIFIED')).toBe(true);
  });

  it('does not promote source wording to client or legal certainty', () => {
    const [candidate] = classifyCandidates(candidates('La actora sostiene que el artículo 14 fue vulnerado.'));

    expect(candidate.classification?.label).toBe('SOURCE_ASSERTION');
    expect(candidate.speakerRole).toBe('PARTE_ACTORA');
  });
});
