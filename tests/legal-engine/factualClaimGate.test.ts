import { describe, expect, it } from 'vitest';
import { evaluateFactualClaimGate } from '@/lib/legal-engine/factualClaimGate';
import type { SourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';

const sourceText = 'La actora alega que entregó $500 el 4 de abril de 2024.';
const source = {
  sourceId: 'demanda-1',
  sourceText,
  container: { documentFamily: 'DEMANDA' },
} as SourceGrounding;

describe('factual claim gate', () => {
  it('prevents a depth-mode AI draft without claim audit from passing the document quality gate', () => {
    const doc = createEmptyDocument();
    doc.generationMetadata.draftDepth = 'PROFESSIONAL_20';
    doc.sections.push({
      id: 'facts', type: 'background', title: 'HECHOS', order: 1,
      isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false,
      variables: [], validationErrors: [], validationWarnings: [],
      content: [{ id: 'b1', layer: 'GENERATED_ARGUMENT', text: 'La actora entregó $500 el 4 de abril de 2024.', generatedBy: 'AI' }],
    });
    doc.generationMetadata.sourceGrounding = [source];

    const quality = runQualityGateCheck(doc);
    expect(quality.passed).toBe(false);
    expect(quality.criticalErrors.some((error) => error.checkId === 'FACTUAL_CLAIM_AUDIT_MISSING')).toBe(true);
  });

  it('blocks an AI paragraph with no per-claim audit instead of reporting zero unsupported facts', () => {
    const result = evaluateFactualClaimGate({
      blocks: [{ id: 'b1', text: 'La actora entregó $500 el 4 de abril de 2024.' }],
      sourceGrounding: [source],
      claims: [],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.unverifiedClaims).toBe(1);
    expect(result.issues).toContain('CLAIM_AUDIT_MISSING:b1');
  });

  it('does not promote an opposing pleading allegation into a proven fact', () => {
    const result = evaluateFactualClaimGate({
      blocks: [{ id: 'b1', text: 'La actora entregó $500 el 4 de abril de 2024.' }],
      sourceGrounding: [source],
      claims: [{
        blockId: 'b1', claim: 'La actora entregó $500 el 4 de abril de 2024.',
        status: 'SOURCE_SUPPORTED',
        sourceSpans: [{ sourceId: 'demanda-1', startOffset: 0, endOffset: sourceText.length, text: sourceText }],
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.unsupportedClaims).toBe(1);
    expect(result.issues).toContain('OPPOSING_ALLEGATION_AS_FACT:b1');
  });

  it('accepts a correctly attributed opposing allegation with an exact source span', () => {
    const claim = 'La actora alega que entregó $500 el 4 de abril de 2024.';
    const result = evaluateFactualClaimGate({
      blocks: [{ id: 'b1', text: claim }],
      sourceGrounding: [source],
      claims: [{
        blockId: 'b1', claim, status: 'OPPOSING_PARTY_ALLEGATION',
        sourceSpans: [{ sourceId: 'demanda-1', startOffset: 0, endOffset: sourceText.length, text: sourceText }],
      }],
    });

    expect(result.status).toBe('PASS');
    expect(result.unsupportedClaims).toBe(0);
    expect(result.unverifiedClaims).toBe(0);
  });

  it('rejects a fabricated source span even when a claim is labeled supported', () => {
    const claim = 'La actora alega que entregó $500 el 4 de abril de 2024.';
    const result = evaluateFactualClaimGate({
      blocks: [{ id: 'b1', text: claim }],
      sourceGrounding: [source],
      claims: [{
        blockId: 'b1', claim, status: 'OPPOSING_PARTY_ALLEGATION',
        sourceSpans: [{ sourceId: 'demanda-1', startOffset: 1, endOffset: sourceText.length, text: sourceText }],
      }],
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('SOURCE_SPAN_INVALID:b1');
  });

  it('does not let a model hide an unsupported fact behind a LEGAL_ARGUMENT label', () => {
    const claim = 'El demandado reconoció la deuda.';
    const result = evaluateFactualClaimGate({
      blocks: [{ id: 'b1', text: claim }],
      sourceGrounding: [source],
      claims: [{ blockId: 'b1', claim, status: 'LEGAL_ARGUMENT', sourceSpans: [] }],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toContain('LEGAL_ARGUMENT_REVIEW_REQUIRED:b1');
  });
});
