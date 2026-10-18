import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { extractClaims } from '@/lib/legal-engine/case-extraction/claims';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { ClaimExtractionContext, ExtractionCandidate, PartyRole } from '@/lib/legal-engine/case-extraction/types';

function classified(text: string): ExtractionCandidate[] {
  return classifyCandidates([{
    candidateId: 'candidate-1',
    kind: 'CLAIM',
    rawText: text,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: text, section: 'PRESTACIONES', extractionMethod: 'PATTERN', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'REQUIRES_REVIEW',
  }]);
}

function context(): ClaimExtractionContext {
  const partyIdsByRole = {} as Record<PartyRole, string[]>;
  return { partyIdsByRole, factIds: ['fact-1'], evidenceMentionIds: ['evidence-1'] };
}

describe('extractClaims', () => {
  it('separates two independent reliefs and keeps one source provenance', () => {
    const result = extractClaims(classified('PRESTACIONES: cumplimiento del contrato y pago de daños y perjuicios'), context());

    expect(result.claims.map((claim) => claim.requestedRelief)).toEqual(['cumplimiento del contrato', 'pago de daños y perjuicios']);
    expect(result.claims.every((claim) => claim.provenance.length === 1)).toBe(true);
    expect(result.claims.every((claim) => claim.status === 'SOURCE_MENTIONED')).toBe(true);
  });

  it('keeps one claim when the phrase is one inseparable relief', () => {
    expect(extractClaims(classified('PRESTACIONES: declaración de nulidad y sus efectos inherentes'), context()).claims).toHaveLength(1);
  });
});

// Lote 5 (P1-5): fórmulas introductorias, de transición y textos que terminan en «:» no son pretensiones.
describe('extractClaims: fórmulas que no son pretensiones', () => {
  it.each([
    'PRESTACIONES: En consecuencia, se solicita lo siguiente:',
    'PRESTACIONES: Por lo anterior expuesto, se solicita a Su Señoría:',
    'PRESTACIONES: De lo anterior se advierte la siguiente situación:',
  ])('no extrae pretensión de: %s', (text) => {
    expect(extractClaims(classified(text), context()).claims).toEqual([]);
  });

  it('conserva una pretensión con inciso aunque el texto sea breve', () => {
    const result = extractClaims(classified('PRESTACIONES: a) El pago de la suerte principal;'), context());
    expect(result.claims.length).toBeGreaterThan(0);
  });
});

describe('extractClaims: términos de pretensión con acentos', () => {
  it.each(['PRESTACIONES: Indemnización por daños', 'PRESTACIONES: Prestaciones proporcionales de ley'])('conserva la pretensión: %s', (text) => {
    expect(extractClaims(classified(text), context()).claims.length).toBeGreaterThan(0);
  });
});
