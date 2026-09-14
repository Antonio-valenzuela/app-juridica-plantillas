import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
import { extractDocumentsAndEvidence } from '@/lib/legal-engine/case-extraction/evidence';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { EvidenceExtractionContext, ExtractionCandidate } from '@/lib/legal-engine/case-extraction/types';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

function classified(text: string): ExtractionCandidate[] {
  return classifyCandidates([{
    candidateId: 'candidate-1',
    kind: 'EVIDENCE',
    rawText: text,
    provenance: [createSourceProvenance({ sourceId: 'src-a', excerpt: text, section: 'PRUEBAS', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' })],
    decision: 'REQUIRES_REVIEW',
  }]);
}

function context(): EvidenceExtractionContext {
  return { factIdsByNumber: { '1': 'fact-1' }, claimIds: ['claim-1'] };
}

function sourceAssertion(text: string, section = 'AARON EFRAIN SILVA DE ANDA'): ExtractionCandidate[] {
  return classifyCandidates([{
    candidateId: 'source-assertion-1',
    kind: 'ASSERTION',
    rawText: text,
    provenance: [createSourceProvenance({
      sourceId: 'src-real-pdf',
      page: 20,
      elementIndex: 270,
      excerpt: text,
      section,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    })],
    decision: 'REQUIRES_REVIEW',
  }]);
}

describe('documents and evidence mentions', () => {
  it('extracts comma-separated evidence without confirming it', () => {
    const result = extractDocumentsAndEvidence(classified('PRUEBAS: contrato, comprobantes de pago y requerimiento'), context());

    expect(result.evidenceMentions).toHaveLength(3);
    expect(result.evidenceMentions.every((item) => item.status === 'SOURCE_MENTIONED')).toBe(true);
    expect(result.evidenceOffers).toHaveLength(0);
  });

  it('keeps an explicit fact relation and stated purpose', () => {
    const item = extractDocumentsAndEvidence(
      classified('1. DOCUMENTAL PRIVADA: pagaré para acreditar el pago relacionado con el hecho 1'),
      context(),
    ).evidenceMentions[0];

    expect(item.relatedFactIds).toContain('fact-1');
    expect(item.statedPurpose).toMatch(/acreditar el pago/i);
  });

  it('extracts concrete evidence embedded in a source assertion and keeps a reported offer separate', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('Luego, de las actuaciones que integran el juicio laboral se tiene que la parte actora ofreció prueba confesional a cargo del director operativo.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0]).toMatchObject({
      description: expect.stringMatching(/confesional/i),
      status: 'SOURCE_MENTIONED',
    });
    expect(result.evidenceOffers).toHaveLength(1);
    expect(result.evidenceOffers[0]).toMatchObject({
      evidenceMentionId: result.evidenceMentions[0].id,
      status: 'PARTY_OFFERED',
    });
  });

  it('extracts each concrete medium from a reported source offer without treating the paragraph as one giant mention', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('Luego, de las actuaciones que integran el juicio laboral se tiene que la parte actora ofreció los siguientes medios de convicción: documentales, confesional a cargo de servidores públicos adscritos al Ayuntamiento demandado, testimoniales y presuncional en su doble aspecto e instrumental de actuaciones.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(5);
    expect(result.evidenceMentions.map((item) => item.description).join(' | ')).toMatch(/documentales/i);
    expect(result.evidenceMentions.map((item) => item.description).join(' | ')).toMatch(/confesional.*cargo/i);
    expect(result.evidenceMentions.map((item) => item.description).join(' | ')).toMatch(/instrumental de actuaciones/i);
    expect(result.evidenceOffers).toHaveLength(5);
    expect(result.evidenceOffers.every((offer) => offer.status === 'PARTY_OFFERED')).toBe(true);
    expect(result.evidenceOffers.every((offer) => result.evidenceMentions.some((mention) => mention.id === offer.evidenceMentionId))).toBe(true);
  });

  it('rejects abstract proof language and jurisprudence evidence language', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La jurisprudencia sostiene que quien afirma está obligado a probar y que la carga de la prueba corresponde a quien afirma.', 'DERECHO'),
      context(),
    );

    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('rejects abstract proof language even under an explicit PRUEBAS label', () => {
    const result = extractDocumentsAndEvidence(
      classified('PRUEBAS: La carga de la prueba corresponde a quien afirma y la autoridad admitió las pruebas.'),
      context(),
    );

    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('does not extract a concrete proof noun that belongs only to a jurisprudential statement', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La jurisprudencia sostiene que en autos la prueba documental basta para acreditar la pretensión.', 'DERECHO'),
      context(),
    );

    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('does not turn generic admission or rejection of proof into an EvidenceOffer', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La autoridad admitió las pruebas y rechazó las demás, sin identificar un medio probatorio concreto.'),
      context(),
    );

    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('bounds a concrete source evidence description before later valuation language', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('Las confesionales ofrecidas por la parte actora no fueron suficientes para acreditar la jornada extraordinaria.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0].description).toMatch(/^confesionales ofrecidas por la parte actora$/i);
    expect(result.evidenceOffers[0]?.status).toBe('PARTY_OFFERED');
  });

  it('keeps a concrete medium after a normal determiner instead of treating it as an anaphoric repeat', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('En el juicio de origen se identificó, como la confesional a cargo del director operativo, un medio concreto.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0].description).toMatch(/^confesional a cargo del director operativo$/i);
  });

  it('associates an offer with a later occurrence when the first occurrence is only a mention', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('Se mencionó el contrato en autos. Después, ofrezco el contrato.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceOffers).toHaveLength(1);
    expect(result.evidenceOffers[0].evidenceMentionId).toBe(result.evidenceMentions[0].id);
  });

  it('keeps the stated purpose and fact relation on an embedded evidence mention', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('En autos se mencionó prueba documental para acreditar el hecho 1.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0].description).toMatch(/para acreditar el hecho 1$/i);
    expect(result.evidenceMentions[0].relatedFactIds).toEqual(['fact-1']);
    expect(result.evidenceMentions[0].statedPurpose).toMatch(/el hecho 1/i);
  });

  it('deduplicates repeated concrete evidence without leaving dangling offer links', () => {
    const text = 'Luego, de las actuaciones que integran el juicio laboral se tiene que la parte actora ofreció prueba confesional a cargo del director operativo.';
    const source = (id: string): UploadedSourceDocument => ({
      id,
      filename: `${id}.txt`,
      type: 'txt',
      content: text,
      extractedText: text,
      sourceValidated: true,
    });
    const rich = reconstructCaseAnalysis([source('src-a'), source('src-b')], 'Analizar', '', { includeReferenceInAnalysis: false }).richCaseAnalysis!;

    expect(rich.evidenceMentions).toHaveLength(1);
    expect(rich.evidenceMentions[0].provenance.map((item) => item.sourceId).sort()).toEqual(['src-a', 'src-b']);
    expect(rich.evidenceOffers).toHaveLength(1);
    expect(rich.evidenceOffers.every((offer) => rich.evidenceMentions.some((mention) => mention.id === offer.evidenceMentionId))).toBe(true);
  });
});
