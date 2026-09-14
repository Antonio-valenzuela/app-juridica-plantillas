import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { extractArguments, extractAuthorityMentions } from '@/lib/legal-engine/case-extraction/arguments';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { ArgumentExtractionContext, ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';

function classified(text: string): ExtractionCandidate[] {
  return classifyCandidates([{
    candidateId: 'candidate-1',
    kind: 'ARGUMENT',
    rawText: text,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: text, section: 'ARGUMENTOS', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'REQUIRES_REVIEW',
  }]);
}

function context(): ArgumentExtractionContext {
  return { factIds: ['fact-1'], authorityIds: ['authority-1'] };
}

describe('source arguments and authority mentions', () => {
  it('keeps an argument separate from a fact', () => {
    const result = extractArguments(classified('La acción es improcedente porque la contraparte no acreditó su pretensión.'), context());

    expect(result.arguments[0].proposition).toMatch(/improcedente/i);
    expect(result.facts).toHaveLength(0);
  });

  it('records a cited article without legal verification', () => {
    const [authority] = extractAuthorityMentions(classified('Con fundamento en el artículo 14 constitucional y la tesis 123/2024'));

    expect(authority.verificationStatus).toBe('SOURCE_CITED');
    expect(authority.provenance.length).toBeGreaterThan(0);
  });
});
