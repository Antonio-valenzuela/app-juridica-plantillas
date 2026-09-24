import { describe, expect, it } from 'vitest';
import { buildReviewRequest, deduplicateReviewItems } from '@/lib/legal-engine/reviewRequest';

describe('review request', () => {
  it('keeps only human decisions and preserves the document identity', () => {
    const request = buildReviewRequest({
      id: 'doc-review-1',
      sections: [
        { id: 'personality-section', title: 'COMPARECENCIA Y PERSONALIDAD' },
        { id: 'petition-section', title: 'PUNTOS PETITORIOS' },
      ],
      validation: { isValid: false, errors: [
        { checkId: 'missing_fields', message: 'Falta personalidad' },
        { checkId: 'needs_client_position', message: 'Falta postura del cliente para el hecho fact-1' },
        { checkId: 'missing_effect', message: 'Falta efecto solicitado en petitorios' },
      ], warnings: [] },
    } as any);

    expect(request.documentId).toBe('doc-review-1');
    expect(request.pendingItems.map((item) => item.id)).toEqual(['personality', 'position-fact-1', 'requested-effect']);
  });

  it('enriches fact decisions from persisted rich facts and real coverage targets', () => {
    const request = buildReviewRequest({
      id: 'doc-review-context',
      title: 'Recurso de apelación civil',
      documentType: 'apelacion_civil',
      proceduralIdentity: { objective: 'Interponer recurso contra sentencia.', proceduralPosition: 'parte_interesada' },
      sourceDocuments: [{ id: 'source.pdf', filename: 'source.pdf' }],
      sections: [
        { id: 'section-fact', title: 'RESOLUCIÓN RECURRIDA' },
        { id: 'section-general', title: 'AGRAVIOS' },
        { id: 'unrelated', title: 'PETITORIOS' },
      ],
      validation: { isValid: false, errors: [
        { checkId: 'needs_client_position', message: 'Falta postura del cliente para el hecho fact-1', sectionId: 'unrelated' },
        { checkId: 'needs_client_position', message: 'Falta postura del cliente para el hecho fact-2', sectionId: 'unrelated' },
        { checkId: 'missing_client_position', message: 'No existe postura clientPosition', sectionId: 'unrelated' },
      ], warnings: [] },
      caseAnalysis: {
        challengedActs: [{ page: 3, actDescription: 'SENTENCIA', excerpt: 'source.pdf: SENTENCIA' }],
        proceduralPosture: { proceduralWrit: 'recurso de apelación civil' },
        richCaseAnalysis: {
          facts: [
            { id: 'fact-1', proposition: 'La parte demandada sostiene que el auto de fecha 08 de septiembre de 2025 quedó firme y produjo efectos de cosa juzgada.', provenance: [{ page: 10, sourceId: 'source.pdf', excerpt: 'La parte demandada sostiene que el auto de fecha 08 de septiembre de 2025 quedó firme y produjo efectos de cosa juzgada.' }] },
            { id: 'fact-2', proposition: 'La parte actora sostiene que la edad de Sebastiana Meza González generaba dudas sobre su capacidad para otorgar testamento.', provenance: [{ page: 15, sourceId: 'source.pdf', excerpt: 'La parte actora sostiene que la edad de Sebastiana Meza González generaba dudas sobre su capacidad para otorgar testamento.' }] },
          ],
          missingData: [{ field: 'clientPosition', reason: 'No explicit client posture was found.', sourceSearched: ['source.pdf'] }],
          clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
          sourcePosition: { status: 'KNOWN', assertionIds: [], provenance: [] },
        },
      },
      coverageMatrix: { items: [
        { id: 'cov-fact-1', factIds: ['fact-1'], targetSectionIds: ['section-fact'] },
        { id: 'cov-fact-2', factIds: ['fact-2'], targetSectionIds: ['section-fact'] },
        { id: 'cov-general', missingDataIds: ['missing-data-clientPosition-1'], targetSectionIds: ['section-general'] },
      ] },
      legalIssueMatrix: { issues: [
        { factIds: ['fact-1'], missingDataIds: [], coverageItemIds: ['cov-fact-1'], clientPositionStatus: 'UNKNOWN' },
        { factIds: ['fact-2'], missingDataIds: [], coverageItemIds: ['cov-fact-2'], clientPositionStatus: 'UNKNOWN' },
        { factIds: [], missingDataIds: ['missing-data-clientPosition-1'], coverageItemIds: ['cov-general'], clientPositionStatus: 'UNKNOWN' },
      ] },
    } as any);

    expect(request.pendingItems).toHaveLength(3);
    expect(request.pendingItems[0]).toMatchObject({
      id: 'position-fact-1',
      rootDecisionKey: 'CLIENT_POSITION:FACT:fact-1',
      type: 'CLIENT_POSITION',
      question: 'Respecto del siguiente hecho, ¿qué postura debe asumir el recurso?',
      neutralContext: 'La parte demandada sostiene que el auto de fecha 08 de septiembre de 2025 quedó firme y produjo efectos de cosa juzgada.',
      sourcePage: 10,
      sourceExcerpt: 'La parte demandada sostiene que el auto de fecha 08 de septiembre de 2025 quedó firme y produjo efectos de cosa juzgada.',
      sourceRefs: [{ documentId: 'source.pdf', page: 10 }],
      affectedSections: ['section-fact'],
      allowedAnswers: ['ADMITIR', 'NEGAR', 'NO_CONTROVERTIR', 'PRECISAR'],
    });
    expect(request.pendingItems[1]).toMatchObject({
      id: 'position-fact-2',
      rootDecisionKey: 'CLIENT_POSITION:FACT:fact-2',
      neutralContext: 'La parte actora sostiene que la edad de Sebastiana Meza González generaba dudas sobre su capacidad para otorgar testamento.',
      sourcePage: 15,
      affectedSections: ['section-fact'],
    });
    expect(request.pendingItems[2]).toMatchObject({
      id: 'client-position',
      rootDecisionKey: 'CLIENT_POSITION:GENERAL:SOURCE_DECISION',
      question: '¿Qué postura general debe sostener el recurso frente a la sentencia impugnada?',
      neutralContext: 'El expediente se analiza como un recurso de apelación civil contra una sentencia; la postura general de la parte representada frente a ese acto no está confirmada.',
      sourcePage: 3,
      sourceExcerpt: 'source.pdf: SENTENCIA',
      affectedSections: ['section-general'],
    });
  });

  it('deduplicates human items by stable decision key rather than generated wording', () => {
    const items = [
      { id: 'position-fact-1', rootDecisionKey: 'CLIENT_POSITION:FACT:fact-1' },
      { id: 'legacy-position-fact-1', rootDecisionKey: 'CLIENT_POSITION:FACT:fact-1' },
    ] as any;

    const result = deduplicateReviewItems(items);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.rootDecisionKey).toBe('CLIENT_POSITION:FACT:fact-1');
    expect(result.duplicatesRemoved).toBe(1);
  });
});
