import type { AnalyzedFact } from '@/lib/legal-engine/types';
import { describe, expect, it } from 'vitest';
import { buildFactResponseText } from '@/lib/legal-engine/pipeline';
import {
  buildFactResponseMatrix,
  buildLegalDocumentPlan,
} from '@/lib/legal-engine/legalDocumentPlan';

function fact(input: Partial<AnalyzedFact> & Pick<AnalyzedFact, 'id' | 'number' | 'text'>): AnalyzedFact {
  return {
    confidence: 1,
    ...input,
  };
}

describe('matriz de respuesta fáctica y plan profesional', () => {
  it('no transforma una postura propuesta por el modelo en decisión confirmada del abogado', () => {
    const matrix = buildFactResponseMatrix([
      fact({
        id: 'fact-1',
        number: '1',
        text: 'La fuente afirma que se entregó una notificación.',
        sourceFact: 'La fuente afirma que se entregó una notificación.',
        documentId: 'source-1',
        proposedPosture: 'ADMIT',
        proposedResponse: 'La parte reconoce la notificación.',
        relatedEvidenceIds: ['evidence-1'],
      }),
      fact({
        id: 'fact-2',
        number: '2',
        text: 'La fuente afirma una fecha de pago.',
        documentId: 'source-1',
        proposedPosture: 'DENY',
      }),
    ]);

    expect(matrix.rows.map((row) => row.positionStatus)).toEqual(['PENDING', 'PENDING']);
    expect(matrix.rows[0]).toMatchObject({
      factId: 'fact-1',
      sourceDocumentIds: ['source-1'],
      evidenceIds: ['evidence-1'],
    });
    expect(JSON.stringify(matrix)).not.toContain('La parte reconoce la notificación');
    expect(matrix.attorneyInputRequirements).toHaveLength(1);
    expect(matrix.attorneyInputRequirements[0]?.factIds).toEqual(['fact-1', 'fact-2']);
  });

  it('solo usa una postura expresamente registrada como posición del abogado', () => {
    const matrix = buildFactResponseMatrix([
      fact({
        id: 'fact-3',
        number: '3',
        text: 'Hecho con postura confirmada.',
        lawyerPosition: 'DENY',
        manualResponse: 'La parte niega el hecho por la razón asentada en la entrevista.',
      }),
    ]);

    expect(matrix.rows[0]).toMatchObject({
      positionStatus: 'CONFIRMED',
      lawyerPosition: 'DENY',
      responseText: 'La parte niega el hecho por la razón asentada en la entrevista.',
    });
    expect(matrix.attorneyInputRequirements).toHaveLength(0);
  });

  it('no convierte position, observaciones ni soporte generado en postura o respuesta del abogado', () => {
    const text = buildFactResponseText({
      facts: [
        fact({
          id: 'fact-inferred',
          number: '1',
          text: 'La fuente afirma que se entregó un aviso.',
          position: 'ADMIT',
          proposedPosture: 'DENY',
          proposedResponse: 'Respuesta propuesta por el modelo.',
          lawyerObservation: 'Observación no adoptada por el abogado.',
          support: ['Sustento generado sin evidencia vinculada.'],
        }),
        fact({
          id: 'fact-confirmed',
          number: '2',
          text: 'La fuente afirma una fecha de pago.',
          lawyerPosition: 'DENY',
          manualResponse: 'La parte niega el dato por la razón asentada en entrevista.',
        }),
      ],
    } as any);

    expect(text).toContain('[REQUIERE DEFINIR POSTURA DEL ABOGADO]');
    expect(text).not.toContain('SE ADMITE');
    expect(text).not.toContain('Respuesta propuesta por el modelo');
    expect(text).not.toContain('Observación no adoptada');
    expect(text).not.toContain('Sustento generado sin evidencia');
    expect(text).not.toContain('La fuente afirma que se entregó un aviso.');
    expect(text).toContain('La parte niega el dato por la razón asentada en entrevista.');
  });

  it('agrupa hechos sin postura confirmada y muestra la advertencia una sola vez', () => {
    const text = buildFactResponseText({
      facts: [
        fact({ id: 'fact-pending-1', number: '1', text: 'Afirmación fuente 1.', sourceReference: { documentId: 'source-a', page: 2 } }),
        fact({ id: 'fact-pending-2', number: '2', text: 'Afirmación fuente 2.', sourceReference: { documentId: 'source-a', page: 4 } }),
        fact({ id: 'fact-pending-3', number: '3', text: 'Afirmación fuente 3.', sourceReference: { documentId: 'source-b', page: 1 } }),
      ],
    } as any);

    expect(text.match(/REQUIERE DEFINIR POSTURA DEL ABOGADO/g)).toHaveLength(1);
    expect(text).toContain('1. Hecho 1 — Fuente: fuente documental 1, página 2');
    expect(text).toContain('2. Hecho 2 — Fuente: fuente documental 1, página 4');
    expect(text).toContain('3. Hecho 3 — Fuente: fuente documental 2, página 1');
    expect(text).not.toContain('Afirmación fuente');
    expect(text).not.toContain('Respuesta: [REQUIERE DEFINIR POSTURA DEL ABOGADO]');
  });

  it('sustituye IDs técnicos de fuente por referencias legibles sin perder la página', () => {
    const text = buildFactResponseText({
      facts: [
        fact({
          id: 'fact-pending-source-label',
          number: '1',
          text: 'Hecho pendiente de confirmación.',
          documentId: 'phase3-01-PROFESSIONAL_20',
          sourceReference: { documentId: 'phase3-01-PROFESSIONAL_20', page: 3 },
        }),
        fact({
          id: 'fact-confirmed-source-label',
          number: '2',
          text: 'Hecho cuya postura sí fue confirmada.',
          documentId: 'internal-source-7f9a',
          sourceReference: { documentId: 'internal-source-7f9a', page: 8 },
          lawyerPosition: 'DENY',
          manualResponse: 'Se niega únicamente en los términos expresamente confirmados.',
        }),
      ],
    } as any);

    expect(text).not.toContain('phase3-01-PROFESSIONAL_20');
    expect(text).not.toContain('internal-source-7f9a');
    expect(text).toContain('Fuente: fuente documental 1, página 3.');
    expect(text).toContain('FUENTE: fuente documental 2, página 8.');
  });

  it('deduplica referencias estructurales sin crear IDs de hechos, cobertura, cuestiones o autoridades', () => {
    const factMatrix = buildFactResponseMatrix([
      fact({ id: 'fact-1', number: '1', text: 'Afirmación de la fuente.', documentId: 'source-1' }),
    ]);
    const plan = buildLegalDocumentPlan({
      documentId: 'draft-1',
      documentType: 'contestacion_demanda_civil',
      draftDepth: 'PROFESSIONAL_20',
      sourceDocumentIds: ['source-1', 'source-1'],
      sections: [{
        id: 'section-facts',
        coverageItemIds: ['coverage-fact-1', 'coverage-fact-1'],
        requiredCoverageItemIds: ['coverage-fact-1'],
        legalIssueIds: ['issue-1', 'issue-1'],
        authorityIds: ['authority-verified', 'authority-unverified'],
      }],
      factResponseMatrix: factMatrix,
      verifiedAuthorityIds: ['authority-verified', 'authority-verified'],
    });

    expect(plan.sourceDocumentIds).toEqual(['source-1']);
    expect(plan.coverageItemIds).toEqual(['coverage-fact-1']);
    expect(plan.legalIssueIds).toEqual(['issue-1']);
    expect(plan.verifiedAuthorityIds).toEqual(['authority-verified']);
    expect(plan.unresolvedAuthorityIds).toEqual(['authority-unverified']);
    expect(plan.factResponseMatrix.rows.map((row) => row.factId)).toEqual(['fact-1']);
  });
});
