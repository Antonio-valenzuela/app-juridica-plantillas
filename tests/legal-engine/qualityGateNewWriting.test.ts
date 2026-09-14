import { describe, expect, it } from 'vitest';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

describe('Quality Gate de escritos iniciales', () => {
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
});
