import { describe, expect, it } from 'vitest';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { extractAssertions, extractAtomicFacts } from '@/lib/legal-engine/case-extraction/facts';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';

function classified(text: string): ExtractionCandidate[] {
  return classifyCandidates([{
    candidateId: 'candidate-1',
    kind: 'ASSERTION',
    rawText: text,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: text, extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'REQUIRES_REVIEW',
  }]);
}

function attributionCandidate(
  text: string,
  options: Partial<Pick<ExtractionCandidate, 'kind' | 'speakerRole' | 'classification'>> = {},
): ExtractionCandidate {
  return {
    candidateId: `candidate-${text.slice(0, 12)}`,
    kind: options.kind || 'ASSERTION',
    rawText: text,
    provenance: [createSourceProvenance({
      sourceId: 'attribution-source',
      page: 1,
      section: 'SENTENCIA RECURRIDA',
      excerpt: text,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    })],
    ...(options.speakerRole ? { speakerRole: options.speakerRole } : {}),
    ...(options.classification ? { classification: options.classification } : {}),
    decision: 'ACCEPTED',
  };
}

describe('assertion and atomic fact extraction', () => {
  it('keeps the speaker and alleged status', () => {
    const result = extractAssertions(classified('La actora afirma que el demandado incumplió'));

    expect(result[0]).toMatchObject({ actorRole: 'PARTE_ACTORA', status: 'ALLEGED', proposition: 'el demandado incumplió' });
  });

  it('splits two dated events but does not split every sentence', () => {
    const facts = extractAtomicFacts(classified('El 3 de enero celebramos contrato y el 10 de enero entregué $20,000.'));

    expect(facts).toHaveLength(2);
    expect(facts.every((fact) => fact.provenance.length === 1)).toBe(true);
    expect(extractAtomicFacts(classified('La actora compareció y explicó su postura en la misma actuación.'))).toHaveLength(1);
  });

  it('never labels an ordinary source sentence as an established fact', () => {
    const [fact] = extractAtomicFacts(classified('La actora afirma que el contrato existe.'));

    expect(fact.assertionStatus).toBe('SOURCE_ASSERTION');
  });

  it('keeps a judicial finding as an established fact while preserving party allegations', () => {
    const judicialFinding = 'En la resolución, el tribunal tuvo por acreditado que la demandada recibió la notificación.';
    const partyAllegation = 'La parte actora afirma que la demandada incumplió el contrato.';
    const text = `${judicialFinding}\n${partyAllegation}`;
    const source = {
      id: 'facts-status-source',
      filename: 'judicial-resolution.txt',
      type: 'txt',
      extractedText: text,
      pages: [{ page: 1, text, chars: text.length }],
      sourceValidated: true,
    };

    const analysis = reconstructCaseAnalysis([source], 'Analizar hechos de una resolución.', '', { includeReferenceInAnalysis: false });
    const facts = analysis.richCaseAnalysis?.facts || [];

    expect(facts.some((fact) => fact.proposition.includes('el tribunal tuvo por acreditado'))).toBe(true);
    expect(facts.find((fact) => fact.proposition.includes('el tribunal tuvo por acreditado'))?.assertionStatus).toBe('ESTABLISHED_FACT');
    expect(facts.find((fact) => fact.proposition.includes('La parte actora afirma'))?.assertionStatus).toBe('SOURCE_ASSERTION');
  });

  it('attributes an own-voice court determination as an established fact', () => {
    const [fact] = extractAtomicFacts([attributionCandidate(
      'El tribunal determinó que la demandada recibió la notificación.',
      { speakerRole: 'RESOLUTOR' },
    )]);

    expect(fact.assertionStatus).toBe('ESTABLISHED_FACT');
  });

  it('does not let contaminated party metadata override local court voice', () => {
    const [fact] = extractAtomicFacts([attributionCandidate(
      'El tribunal determinó que la demandada recibió la notificación.',
      { speakerRole: 'PARTE_ACTORA', classification: { label: 'SOURCE_ASSERTION', confidence: 1, reason: 'wrapped-paragraph metadata' } },
    )]);

    expect(fact.assertionStatus).toBe('ESTABLISHED_FACT');
  });

  it('keeps a court-reported party allegation as a source assertion', () => {
    const [fact] = extractAtomicFacts([attributionCandidate(
      'La sentencia refiere que la parte actora manifestó que quedó acreditado el pago.',
      { speakerRole: 'PARTE_ACTORA', classification: { label: 'SOURCE_ASSERTION', confidence: 1, reason: 'test' } },
    )]);

    expect(fact.assertionStatus).toBe('SOURCE_ASSERTION');
  });

  it('keeps a quoted jurisprudence proposition out of established facts', () => {
    const [fact] = extractAtomicFacts([attributionCandidate(
      'JURISPRUDENCIA: "Se acreditó que la prestación era exigible."',
      { classification: { label: 'AUTHORITY', confidence: 1, reason: 'test' } },
    )]);

    expect(fact.assertionStatus).toBe('UNKNOWN');
  });

  it('keeps an unattributed finding verb ambiguous', () => {
    const [fact] = extractAtomicFacts([attributionCandidate('Se determinó que la prestación era exigible.')]);

    expect(fact.assertionStatus).toBe('UNKNOWN');
  });

  it('attributes the real-shape first-laudo determination as an established fact', () => {
    const [fact] = extractAtomicFacts([attributionCandidate(
      'El primer laudo, en el que se determinó lo siguiente:',
    )]);

    expect(fact.assertionStatus).toBe('ESTABLISHED_FACT');
  });
});
