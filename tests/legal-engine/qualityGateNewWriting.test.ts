import { describe, expect, it } from 'vitest';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

describe('Quality Gate de escritos iniciales', () => {
  it('reconoce fechas respaldadas aunque la fuente use la forma “del mes de”', () => {
    const document = {
      flow: 'NEW_WRITING',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Escrito libre',
      sections: [
        { id: 'facts', type: 'background', title: 'HECHOS', content: [{ text: 'La actora ingresó el 3 de diciembre de 2024.' }] },
        { id: 'petition', type: 'petition', title: 'PUNTOS PETITORIOS', content: [{ text: 'PRIMERO. Tener por presentado el escrito.' }] },
      ],
      sourceDocuments: [{ pages: [{ text: 'ANTIGÜEDAD desde el día 03 del mes de DICIEMBRE del 2024.' }] }],
      caseAnalysis: { facts: [], claims: [] },
    } as unknown as UniversalLegalDocument;

    const result = runQualityGateCheck(document);

    expect(result.criticalErrors.map((error) => error.checkId)).not.toContain('UNSUPPORTED_FACTUAL_CLAIM');
  });

  it('no exige respuestas de contestación para los hechos de una demanda nueva', () => {
    const document = {
      flow: 'NEW_WRITING',
      documentType: 'demanda',
      documentTypeLabel: 'Demanda de guarda y custodia',
      sections: [
        { id: 'facts', type: 'background', title: 'HECHOS', content: [{ text: 'La promovente cuida a la niña.' }] },
        { id: 'petition', type: 'petition', title: 'PUNTOS PETITORIOS', content: [{ text: 'PRIMERO. Tener por presentada la demanda.' }] },
      ],
      caseAnalysis: {
        facts: [{ id: 'f1', number: 'PRIMERO', text: 'La promovente cuida a la niña.' }],
        claims: [],
      },
    } as unknown as UniversalLegalDocument;

    const result = runQualityGateCheck(document);

    expect(result.criticalErrors.map((error) => error.checkId)).not.toContain('facts_without_response');
  });

  it('reconoce la respuesta de un hecho por sus IDs allowlisted aunque no imprima una etiqueta fija', () => {
    const document = {
      flow: 'DOCUMENT_ANALYSIS',
      documentType: 'contestacion_demanda',
      documentTypeLabel: 'Contestación de demanda laboral',
      matter: 'LABORAL',
      sections: [{
        id: 'sec-con-hechos',
        type: 'background',
        title: 'CONTESTACIÓN DE HECHOS',
        content: [{
          id: 'block-fact-1',
          text: 'La parte actora sostiene esta afirmación y su acreditación deberá examinarse con las constancias del expediente.',
          generationRequirement: 'AI_REQUIRED',
          generatedBy: 'AI',
          generationStatus: 'generated',
          issueDraftValidationStatus: 'VALID_NON_FINAL',
          factIds: ['fact-1'],
          coverageItemIds: ['cov-fact-response-fact-1'],
        }],
      }],
      caseAnalysis: {
        facts: [{ id: 'fact-1', number: '1', text: 'Afirmación de la parte actora.', sourceFact: 'Afirmación de la parte actora.', position: 'REQUIRE_LAWYER_INPUT', lawyerPosition: 'UNDEFINED' }],
        claimResponses: [],
        claims: [],
      },
      coverageMatrix: { items: [{
        id: 'cov-fact-response-fact-1',
        category: 'FACT_RESPONSE',
        sourceEntityIds: ['fact-1'],
        required: true,
        blocking: false,
        status: 'needs_client_position',
      }] },
    } as unknown as UniversalLegalDocument;

    const result = runQualityGateCheck(document);

    expect(result.metrics.factsWithResponse).toBe(1);
    expect(result.criticalErrors.map((error) => error.checkId)).not.toContain('facts_without_response');
  });

  it('reconoce la respuesta de una prestación por el vínculo exacto de Coverage', () => {
    const document = {
      flow: 'DOCUMENT_ANALYSIS',
      documentType: 'contestacion_demanda',
      documentTypeLabel: 'Contestación de demanda laboral',
      matter: 'LABORAL',
      sections: [{
        id: 'sec-con-prestaciones',
        type: 'argument',
        title: 'CONTESTACIÓN DE PRESTACIONES',
        content: [{
          id: 'block-claim-1',
          text: 'La prestación se analiza conforme a sus elementos y a la carga probatoria, sin reconocer hechos ni cantidades no acreditados.',
          generationRequirement: 'AI_REQUIRED',
          generatedBy: 'AI',
          generationStatus: 'generated',
          issueDraftValidationStatus: 'VALID_NON_FINAL',
          coverageItemIds: ['cov-claim-response-claim-1'],
        }],
      }],
      caseAnalysis: {
        facts: [],
        claimResponses: [{ id: 'claim-1', number: '1', text: 'Pago de la prestación reclamada.', sourceClaim: 'Pago de la prestación reclamada.', position: 'REQUIRE_LAWYER_INPUT', lawyerPosition: 'UNDEFINED' }],
        claims: [],
      },
      coverageMatrix: { items: [{
        id: 'cov-claim-response-claim-1',
        category: 'CLAIM_RESPONSE',
        sourceEntityIds: ['claim-1'],
        required: true,
        blocking: false,
        status: 'weak',
      }] },
    } as unknown as UniversalLegalDocument;

    const result = runQualityGateCheck(document);

    expect(result.metrics.claimsWithResponse).toBe(1);
    expect(result.criticalErrors.map((error) => error.checkId)).not.toContain('claims_without_response');
  });
});
