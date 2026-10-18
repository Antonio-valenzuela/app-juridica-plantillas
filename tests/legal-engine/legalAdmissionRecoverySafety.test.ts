import { describe, expect, it } from 'vitest';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';

const document = () => createEmptyDocument({ id: 'admission-safety', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil', matter: 'civil', jurisdiction: 'local', flow: 'DOCUMENT_ANALYSIS' });
const evaluate = (text: string, analysis?: any, sectionType = 'argument') => evaluateGeneratedLegalAdmission({ text, analysis, sectionType, document: document(), legalIssueIds: ['issue-1'] });
const authority = {
  id: 'fixture-only', verificationStatus: 'VERIFIED',
  source: { sourceTier: 'OFFICIAL_PRIMARY', sourceUrl: 'https://official.example.test/rule', sourceHash: 'fixture-hash', locator: 'artículo 10' },
  temporalValidity: { status: 'CURRENT_AND_APPLICABLE' }, jurisdictionValidity: { status: 'APPLICABLE' },
  identity: { canonicalCitation: 'artículo 10' },
  proposition: { supportLevel: 'DIRECT', text: 'El artículo 10 dispone que debe examinarse la notificación.' }, supportsLegalIssueIds: ['issue-1'],
};

describe('recovery preserves useful prose without broadening legal support', () => {
  it('contrast with case records is reasoning, not an unverified authority', () => {
    const text = 'La resolución debe contrastarse conforme a las constancias del expediente.';
    const result = evaluate(text);
    expect(result.accepted).toBe(true);
    expect(result.text).toBe(text);
  });
  it('unverified jurisprudential assertions remain pending even without establece', () => {
    const result = evaluate('La jurisprudencia 1a/XX ha señalado que la omisión genera nulidad. Dicho criterio jurisprudencial establece que debe anularse la sentencia.');
    expect(result.text).not.toContain('ha señalado que la omisión genera nulidad');
    expect(result.text).not.toContain('establece que debe anularse');
    expect(result.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
  });
  it('a conjugated revocation request also requires authorization', () => {
    const result = evaluate('La parte apelante solicita que se revoque la resolución recurrida.');
    expect(result.reasons).toContain('UNSUPPORTED_PETITION');
    expect(result.text).not.toContain('se revoque la resolución');
  });
  it('a verified article identifier cannot authorize another proposition', () => {
    const result = evaluate('El artículo 10 dispone que debe condenarse al pago de costas.', { evidence: [], verifiedAuthorities: [authority] });
    expect(result.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
    expect(result.text).not.toContain('debe condenarse al pago de costas');
  });
  it('a confirmed description does not authorize an added witness', () => {
    const result = evaluate('Se ofrece contrato de arrendamiento firmado por ANA y testimonial de PEDRO.', { evidence: [{ description: 'contrato de arrendamiento firmado por ANA', confirmed: true }] }, 'evidence');
    expect(result.reasons).toContain('UNCONFIRMED_EVIDENCE');
    expect(result.text).not.toContain('testimonial de PEDRO');
  });
  it('token overlap cannot license a changed signer', () => {
    const result = evaluate('Se ofrece contrato de arrendamiento firmado por PEDRO.', { evidence: [{ description: 'contrato de arrendamiento firmado por ANA', confirmed: true }] }, 'evidence');
    expect(result.reasons).toContain('UNCONFIRMED_EVIDENCE');
    expect(result.text).not.toContain('firmado por PEDRO');
  });
  it('an unverified trailing clause without punctuation is actually removed', () => {
    const result = evaluate('Corresponde contrastar las constancias conforme al artículo 10 que establece la absolución');
    expect(result.text).toContain('Corresponde contrastar las constancias');
    expect(result.text).not.toContain('establece la absolución');
    expect(result.rejectedWords).toBe(8); // conforme / al / artículo / 10 / que / establece / la / absolución
  });
  it('span accounting counts the removed words, not the retained complement', () => {
    const result = evaluate('Corresponde contrastar cuidadosamente todas las constancias dentro del plazo legal.');
    expect(result.text).toContain('Corresponde contrastar cuidadosamente todas las constancias');
    expect(result.text).not.toContain('dentro del plazo legal');
    expect(result.rejectedWords).toBe(4);
  });
  it('concurrent findings cannot leave an unverified authority behind', () => {
    const result = evaluate('El recurso se plantea dentro del plazo legal conforme al artículo 10 que establece la revocación.');
    expect(result.text).not.toContain('dentro del plazo legal');
    expect(result.text).not.toContain('establece la revocación');
    expect(result.text).toContain('El recurso se plantea');
    expect(result.rejectedWords).toBe(12); // four deadline words + eight authority words
  });
  it('a marker is not enough if its remaining clause still asserts the rule', () => {
    const result = evaluate('[NO VERIFICADO: artículo 10] establece que debe absolverse a la demandada.');
    expect(result.text).not.toContain('establece que debe absolverse');
    expect(result.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
  });
  it('indentation cannot shift removal into valid words or leave unsafe text', () => {
    const result = evaluate('  Corresponde contrastar las constancias conforme al artículo 10 que establece la absolución.');
    expect(result.text).toContain('Corresponde contrastar las constancias');
    expect(result.text).not.toContain('establece la absolución');
  });
  it('newlines and whitespace survive an unchanged candidate exactly', () => {
    const text = '\n  AGRAVIOS\n\nCorresponde contrastar las constancias.\n';
    expect(evaluate(text).text).toBe(text);
  });
});
