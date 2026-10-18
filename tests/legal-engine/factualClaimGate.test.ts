import { describe, expect, it } from 'vitest';
import { buildDeterministicFactualClaimAudit, evaluateFactualClaimGate, populateDeterministicFactualClaimAudit } from '@/lib/legal-engine/factualClaimGate';
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
  it('deterministically records an exact source allegation as an allegation, not an established fact', () => {
    const text = 'La actora alega que laboró hasta el 4 de abril de 2024.';
    const grounded = {
      ...source,
      sourceText: text,
      segments: [{ role: 'CASE_DOCUMENT', startOffset: 0, endOffset: text.length, text }],
    } as SourceGrounding;

    const records = buildDeterministicFactualClaimAudit([{ id: 'b-allegation', text }], [grounded]);

    expect(records).toMatchObject([{
      blockId: 'b-allegation',
      claim: text,
      status: 'OPPOSING_PARTY_ALLEGATION',
      classification: 'OPPOSING_ALLEGATION',
      sourceSpans: [{ sourceId: 'demanda-1', startOffset: 0, endOffset: text.length, text }],
    }]);
  });

  it('marks a generated time that conflicts with an otherwise exact source sentence as contradictory', () => {
    const sourceSentence = 'La jornada inició a las 16:30 horas.';
    const generatedSentence = 'La jornada inició a las 16:00 horas.';
    const grounded = {
      ...source,
      sourceText: sourceSentence,
      container: { ...source.container, documentFamily: 'CONTESTACION' },
      segments: [{ role: 'CASE_DOCUMENT', startOffset: 0, endOffset: sourceSentence.length, text: sourceSentence }],
    } as SourceGrounding;
    const records = buildDeterministicFactualClaimAudit([{ id: 'b-time', text: generatedSentence }], [grounded]);
    const result = evaluateFactualClaimGate({ blocks: [{ id: 'b-time', text: generatedSentence }], sourceGrounding: [grounded], claims: records });

    expect(records[0]).toMatchObject({
      status: 'CONTRADICTORY',
      classification: 'SOURCE_CONFLICT',
      sourceSpans: [{ sourceId: 'demanda-1', startOffset: 0, endOffset: sourceSentence.length, text: sourceSentence }],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.contradictoryClaims).toBe(1);
    expect(result.issues).toContain('SOURCE_CONTRADICTION:b-time');
  });

  it('records unsupported prose as UNVERIFIED and removes only the missing-audit error, not the factual blocker', () => {
    const claim = 'El demandado reconoció la deuda en una reunión privada.';
    const records = buildDeterministicFactualClaimAudit([{ id: 'b-unverified', text: claim }], [source]);
    const result = evaluateFactualClaimGate({ blocks: [{ id: 'b-unverified', text: claim }], sourceGrounding: [source], claims: records });

    expect(records[0]).toMatchObject({ status: 'UNVERIFIED', classification: 'CLIENT_POSTURE', sourceSpans: [] });
    expect(result.issues).toContain('CLAIM_UNVERIFIED:b-unverified');
    expect(result.issues).not.toContain('CLAIM_AUDIT_MISSING:b-unverified');
    expect(result.unverifiedClaims).toBe(1);
  });

  it('does not use an authority-only span as factual support', () => {
    const text = 'La tesis aislada sostiene una interpretación determinada.';
    const grounded = {
      ...source,
      sourceText: text,
      segments: [{ role: 'JURISPRUDENCE', startOffset: 0, endOffset: text.length, text }],
    } as SourceGrounding;
    const records = buildDeterministicFactualClaimAudit([{ id: 'b-authority', text }], [grounded]);

    expect(records[0]).toMatchObject({ status: 'UNVERIFIED', classification: 'LEGAL_ARGUMENT', sourceSpans: [] });
  });

  it('populates the document audit before Quality Gate without turning unverified text into support', () => {
    const doc = createEmptyDocument();
    const supportedAsAllegation = 'La actora alega que entregó $500 el 4 de abril de 2024.';
    doc.generationMetadata.draftDepth = 'PROFESSIONAL_20';
    doc.generationMetadata.sourceGrounding = [source];
    doc.sections.push({
      id: 'facts', type: 'background', title: 'HECHOS', order: 1,
      isRepeatable: false, isEditable: true, isGenerated: true, isManuallyEdited: false,
      variables: [], validationErrors: [], validationWarnings: [],
      content: [{ id: 'b-populate', layer: 'GENERATED_ARGUMENT', text: `${supportedAsAllegation} El demandado reconoció un hecho no descrito en la fuente.`, generatedBy: 'AI' }],
    });

    const records = populateDeterministicFactualClaimAudit(doc);
    const quality = runQualityGateCheck(doc);

    expect(records).toHaveLength(2);
    expect(doc.generationMetadata.factualClaims).toHaveLength(2);
    expect(quality.criticalErrors.some((error) => error.checkId === 'FACTUAL_CLAIM_AUDIT_MISSING')).toBe(false);
    expect(quality.criticalErrors.some((error) => error.checkId === 'FACTUAL_CLAIM_UNVERIFIED')).toBe(true);
  });

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
