import { describe, expect, it } from 'vitest';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { createSourceDocument } from '@/lib/legal-engine/context';

function source(text: string) {
  return createSourceDocument({
    id: 'phase2-grounding',
    filename: 'demanda-alimentos.docx',
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
  });
}

describe('FASE 2 RED provenance isolation', () => {
  it('does not promote precedent facts or precedent expediente numbers to the current case', () => {
    const grounding = buildSourceGrounding(source([
      'C. JUEZ DE LO FAMILIAR EN TURNO.',
      'COMPAREZCO A INTERPONER JUICIO DE OBLIGACION ALIMENTICIA EN CONTRA DE MI PADRE.',
      'PRESTACIONES: el pago de alimentos retroactivos.',
      'HECHOS: mi padre dejó de proporcionar alimentos.',
      'TAMBIEN LO SUSTENTO EN ESTOS CRITERIOS JURISPRUDENCIALES:',
      'Registro digital: 2027373',
      'Hechos: Un hombre demandó a su padre el pago retroactivo de alimentos.',
      'Amparo directo 2/2022.',
      'Criterio jurídico: El derecho a recibir alimentos retroactivamente es imprescriptible.',
    ].join('\n')));

    expect(grounding.container.documentFamily).toBe('DEMANDA');
    expect(grounding.container.matter).toBe('FAMILIAR');
    expect(grounding.caseMetadata.expediente.value).toBeNull();
    expect(grounding.caseMetadata.status).toBe('REQUIRES_INPUT');
    expect(grounding.precedentFacts.some((span) => /Un hombre demandó a su padre/i.test(span.text))).toBe(true);
    expect(grounding.caseFacts.some((span) => /Un hombre demandó a su padre/i.test(span.text))).toBe(false);
    expect(grounding.values.some((value) => value.value === '2/2022' && value.canUseAsCaseMetadata)).toBe(false);
    expect(grounding.provenanceIntegrity.status).toBe('REVIEW_REQUIRED');
  });
});
