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

  it('keeps a public deed under an explicit public-document label', () => {
    const result = extractDocumentsAndEvidence(
      classified('1. DOCUMENTAL PÚBLICA: Copia certificada de la escritura pública número 12,450 que contiene el poder del apoderado.'),
      context(),
    );

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0]).toMatchObject({
      type: 'DOCUMENTAL PÚBLICA',
      description: 'Copia certificada de la escritura pública número 12,450 que contiene el poder del apoderado.',
      status: 'SOURCE_MENTIONED',
    });
    expect(result.evidenceOffers).toEqual([]);
  });

  it.each([
    { candidates: classified('PRUEBAS: Se celebrará escritura pública para formalizar la compraventa.') },
    { candidates: sourceAssertion('La parte actora se obliga a otorgar escritura pública en fecha posterior.', 'PRUEBAS') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública se otorgará en fecha posterior.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública será otorgada en fecha posterior.') },
    { candidates: classified('PRUEBAS: Las escrituras públicas serán formalizadas posteriormente.') },
    { candidates: classified('PRUEBAS: La escritura pública irá a formalizarse después.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública se otorgará conforme al contrato de compraventa.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública se otorgará el día número 3.') },
    { candidates: classified('PRUEBAS: La escritura pública será otorgada según el folio registral futuro.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública se otorgará conforme al instrumento de planeación.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La escritura pública se otorgará tras exhibir copia del contrato.') },
  ])('does not treat a prospective public deed as evidence under an explicit label', ({ candidates }) => {
    const result = extractDocumentsAndEvidence(candidates, context());

    expect(result.documents).toEqual([]);
    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('keeps an explicitly labelled public deed with a present documentary cue and identifier', () => {
    const result = extractDocumentsAndEvidence(
      classified('DOCUMENTAL PÚBLICA: Se exhibe escritura pública número 12,450.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([
      'Se exhibe escritura pública número 12,450.',
    ]);
  });

  it.each([
    { candidates: classified('PRUEBAS: La parte actora exhibió escritura pública.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: La demandada aportó escritura pública.') },
    { candidates: classified('PRUEBAS: El promovente ofreció escritura pública.') },
    { candidates: classified('PRUEBAS: El actor exhibió escritura pública.') },
    { candidates: classified('DOCUMENTAL PÚBLICA: El demandado aportó escritura pública.') },
    { candidates: classified('PRUEBAS: El quejoso ofreció escritura pública.') },
  ])('keeps an explicitly labelled public deed with a present party documentary act', ({ candidates }) => {
    const result = extractDocumentsAndEvidence(candidates, context());

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0]?.status).toBe('SOURCE_MENTIONED');
  });

  it.each([
    { candidates: classified('PRUEBAS: contrato que obliga a otorgar escritura pública.'), expected: 'contrato que obliga a otorgar escritura pública.' },
    { candidates: classified('DOCUMENTAL PRIVADA: Contrato de compraventa que obliga a otorgar escritura pública.'), expected: 'Contrato de compraventa que obliga a otorgar escritura pública.' },
    { candidates: classified('DOCUMENTAL PÚBLICA: Copia certificada del contrato que obliga a otorgar escritura pública.'), expected: 'Copia certificada del contrato que obliga a otorgar escritura pública.' },
  ])('preserves an explicit concrete document that mentions a future public deed', ({ candidates, expected }) => {
    const result = extractDocumentsAndEvidence(candidates, context());

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([expected]);
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

  it('keeps identifiers distinct for multiple embedded public deeds', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('En autos obran la escritura pública 12,450 y la escritura pública 67,890.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([
      'escritura pública 12,450',
      'escritura pública 67,890',
    ]);
    expect(new Set(result.evidenceMentions.map((item) => item.id)).size).toBe(2);
  });

  it.each([
    {
      text: 'En autos obran la escritura pública número 12,450 y la escritura pública número 67,890.',
      expected: ['escritura pública número 12,450', 'escritura pública número 67,890'],
    },
    {
      text: 'La parte actora ofreció el contrato, la escritura pública número 12,450 y la escritura pública número 67,890.',
      expected: ['contrato', 'escritura pública número 12,450', 'escritura pública número 67,890'],
    },
  ])('keeps every identified public deed in a direct evidence list: $text', ({ text, expected }) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.evidenceMentions.map((item) => item.description)).toEqual(expected);
    expect(new Set(result.evidenceMentions.map((item) => item.id)).size).toBe(expected.length);
  });

  it('keeps long ungrouped identifiers distinct for multiple embedded public deeds', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('En autos obran la escritura pública 1234567 y la escritura pública 1234568.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([
      'escritura pública 1234567',
      'escritura pública 1234568',
    ]);
    expect(new Set(result.evidenceMentions.map((item) => item.id)).size).toBe(2);
  });

  it('does not materialize a future public deed as source evidence', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('En autos se ordenó que las partes otorgaran escritura pública para formalizar la compraventa.'),
      context(),
    );

    expect(result.documents).toEqual([]);
    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it.each([
    'Se otorgará escritura pública para formalizar la compraventa.',
    'Se celebrará escritura para formalizar la compraventa.',
    'Las partes se obligan a otorgar escritura pública en fecha posterior.',
    'El vendedor se ofrece a otorgar escritura pública para formalizar la compraventa.',
    'La parte actora ofreció otorgar escritura pública para formalizar la compraventa.',
    'La parte actora ofreció suscribir escritura pública para formalizar la compraventa.',
    'La parte actora ofreció protocolizar escritura pública.',
    'La parte actora ofreció firmar escritura pública.',
  ])('does not materialize a future legal act as evidence: %s', (text) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.documents).toEqual([]);
    expect(result.evidenceMentions).toEqual([]);
    expect(result.evidenceOffers).toEqual([]);
  });

  it('keeps an offered contract while excluding its promised future public deed', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La parte actora ofreció el contrato que obliga a otorgar escritura pública.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual(['contrato']);
    expect(result.evidenceMentions.some((item) => /escritura pública/i.test(item.description))).toBe(false);
  });

  it('keeps a public deed that continues a direct documentary offer list', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La parte actora ofreció el contrato y la escritura pública número 12,450.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([
      'contrato',
      'escritura pública número 12,450',
    ]);
  });

  it.each([
    {
      text: 'La parte actora ofreció el contrato, la escritura pública número 12,450 y el recibo.',
      expected: ['contrato', 'escritura pública número 12,450', 'recibo'],
    },
    {
      text: 'La parte actora ofreció el contrato, el recibo y la escritura pública número 12,450.',
      expected: ['contrato', 'recibo', 'escritura pública número 12,450'],
    },
    {
      text: 'Se ofrece el contrato, el recibo y la escritura pública número 12,450.',
      expected: ['contrato', 'recibo', 'escritura pública número 12,450'],
    },
  ])('keeps every concrete item in a direct documentary list: $text', ({ text, expected }) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.evidenceMentions.map((item) => item.description)).toEqual(expected);
  });

  it('does not propagate a documentary offer across intervening future-act prose', () => {
    const result = extractDocumentsAndEvidence(
      sourceAssertion('La parte actora ofreció el contrato, pero se obligó a suscribir escritura pública.'),
      context(),
    );

    expect(result.evidenceMentions.map((item) => item.description)).toEqual(['contrato']);
  });

  it.each([
    'En autos obra escritura pública número 12,450.',
    'En autos consta escritura pública número 12,450.',
    'Se exhibe escritura pública número 12,450.',
    'Se ofrece escritura pública número 12,450.',
  ])('materializes documented public-deed evidence: %s', (text) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0]).toMatchObject({
      description: 'escritura pública número 12,450',
      status: 'SOURCE_MENTIONED',
      provenance: [expect.objectContaining({
        sourceId: 'src-real-pdf',
        page: 20,
        elementIndex: 270,
        excerpt: 'escritura pública número 12,450',
      })],
    });
  });

  it.each([
    'La parte actora ofreció escritura pública número 12,450.',
    'La demandada exhibió escritura pública número 12,450.',
    'En autos la parte actora aportó escritura pública número 12,450.',
  ])('materializes a public deed offered or produced by a party: %s', (text) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.evidenceMentions).toHaveLength(1);
    expect(result.evidenceMentions[0]?.description).toBe('escritura pública número 12,450');
  });

  it.each([
    'Se ofrece como prueba la escritura pública número 12,450.',
    'Se ofrece como prueba documental la escritura pública número 12,450.',
  ])('keeps the identified public deed when it is offered as documentary evidence: %s', (text) => {
    const result = extractDocumentsAndEvidence(sourceAssertion(text), context());

    expect(result.evidenceMentions.map((item) => item.description)).toEqual([
      'escritura pública número 12,450',
    ]);
  });

  it('preserves the source-unit-derived candidate identity for public-deed evidence', () => {
    const candidates = sourceAssertion('En autos obra escritura pública número 1234567.');
    candidates[0].candidateId = 'source-unit-27:candidate:0';
    candidates[0].provenance[0].candidateId = 'source-unit-27:candidate:0';

    const result = extractDocumentsAndEvidence(candidates, context());

    expect(result.evidenceMentions[0]?.provenance[0]).toMatchObject({
      candidateId: 'source-unit-27:candidate:0',
      excerpt: 'escritura pública número 1234567',
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
