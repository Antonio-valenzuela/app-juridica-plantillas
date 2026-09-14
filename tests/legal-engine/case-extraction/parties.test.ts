import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { extractParties } from '@/lib/legal-engine/case-extraction/parties';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';

function classified(text: string): ExtractionCandidate[] {
  return classifyCandidates(text.split('\n').map((rawText, index) => ({
    candidateId: `candidate-${index}`,
    kind: 'PARTY',
    rawText,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: rawText, extractionMethod: 'PATTERN', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'REQUIRES_REVIEW',
  })));
}

describe('extractParties', () => {
  it('extracts actor and defendant with separate roles and provenance', () => {
    const result = extractParties(classified('ACTOR: Ana López\nDEMANDADO: Luis Pérez'));

    expect(result.parties.map((party) => party.role)).toEqual(['ACTOR', 'DEMANDADO']);
    expect(result.parties.every((party) => party.provenance.length > 0 && party.confirmed === false)).toBe(true);
    expect(result.parties.map((party) => party.name)).toEqual(['Ana López', 'Luis Pérez']);
  });

  it('does not merge similar names without explicit confirmation', () => {
    const result = extractParties(classified('ACTOR: Ana López\nREPRESENTANTE: Ana L.'));

    expect(result.parties).toHaveLength(2);
    expect(result.reviewReasons).toContain('POSSIBLE_IDENTITY_ALIAS_REQUIRES_REVIEW');
  });
});
