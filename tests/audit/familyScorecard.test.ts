import { describe, expect, it } from 'vitest';
import { scoreFamilyDocument } from '../../scripts/audit/family-scorecard';

const definition = {
  familyId: 'CIVIL',
  kind: 'appeal' as const,
  requiredSections: ['AGRAVIOS', 'PETITORIOS'],
  forbiddenTerms: ['conceptos de violación', 'autoridad responsable'],
};
const document = {
  documentType: 'apelacion_civil',
  sections: [
    { title: 'AGRAVIOS', content: [{ text: 'Se cuestiona la valoración de la constancia identificada en la resolución recurrida. El alcance del perjuicio y su fundamento requieren revisión del abogado.' }] },
    { title: 'PETITORIOS', content: [{ text: 'Se solicita la modificación de la decisión en el extremo confirmado por la parte recurrente.' }] },
  ],
};

describe('FamilyVerificationDefinition substantive scorecard', () => {
  it('does not authorize a favorable petition through an explicit prohibition', () => {
    const result = scoreFamilyDocument({ ...definition, kind: 'promotion', requestedRelief: 'Incorporar la constancia sin solicitar resolución favorable.' }, {
      ...document, sections: [{ title: 'AGRAVIOS', content: [{ text: 'Se acompaña la constancia para agregarla al expediente correspondiente.' }] },
        { title: 'PETITORIOS', content: [{ text: 'Solicito dictar resolución favorable.' }] }],
    });
    expect(result.findings).toContain('UNREQUESTED_DEFENSIVE_PETITION');
    expect(result.substantivePass).toBe(false);
  });
  it('does not certify an appeal whose grievance has no decision and source links', () => {
    const result = scoreFamilyDocument(definition, document);
    expect(result.findings).toContain('APPEAL_REASONING_LINK_MISSING');
    expect(result.substantivePass).toBe(false);
  });
  it('detects constitutional contamination in an otherwise nonempty civil draft', () => {
    const result = scoreFamilyDocument(definition, {
      ...document, sections: [...document.sections, { title: 'CONCEPTOS DE VIOLACIÓN', content: [{ text: 'Autoridad responsable.' }] }],
    });
    expect(result.findings).toContain('CROSS_MATTER_CONTAMINATION');
  });
  it('does not count a required pending marker as substantive coverage', () => {
    const result = scoreFamilyDocument(definition, { ...document, sections: [
      document.sections[0], { title: 'PETITORIOS', content: [{ text: '[DATO PENDIENTE / GENERACIÓN PENDIENTE DE REVISIÓN]' }] },
    ] });
    expect(result.findings).toContain('REQUIRED_SECTION_PENDING:PETITORIOS');
  });
  it('detects repeated paragraphs and an unrequested generic favorable resolution', () => {
    const result = scoreFamilyDocument({ ...definition, kind: 'promotion', requestedRelief: 'Incorporar la constancia documental aportada.' }, {
      ...document, sections: [document.sections[0], { title: 'PETITORIOS', content: [
        { text: 'Dictar resolución favorable al medio de defensa.' }, { text: 'Dictar resolución favorable al medio de defensa.' },
      ] }],
    });
    expect(result.findings).toContain('EXACT_DUPLICATE_PARAGRAPH');
    expect(result.findings).toContain('UNREQUESTED_DEFENSIVE_PETITION');
  });
});
