import { describe, it, expect } from 'vitest';
import { validateGrievance, validateConstitutionalConcept, detectSyntheticPlaceholders } from '@/lib/legal-engine/legalArgumentContract';

const sources = [{ id: 'record-1', text: 'Apartado segundo: se rechaza la copia del convenio porque no se estima pertinente. Escrito de ofrecimiento: el convenio versa sobre el objeto de la reclamación.' }];
const record = [{ sourceId: 'record-1', page: 1, excerpt: 'Escrito de ofrecimiento: el convenio versa sobre el objeto de la reclamación.' }];
const grievance = {
  resolution: 'Resolución del 4 de septiembre: rechazo del convenio.',
  challengedReasoning: 'Se rechaza la copia del convenio porque no se estima pertinente.',
  error: 'La negativa no examina la relación del convenio con el objeto de la reclamación.',
  normOrQuestion: 'Cuestión a investigar oficialmente: motivación individual de la pertinencia documental.',
  caseRecord: record,
  reasoning: 'El ofrecimiento identifica el objeto de la reclamación en el convenio; la negativa no responde a ese enlace, por lo que no permite conocer por qué se excluye esa documental.',
  prejudice: 'La exclusión impide someter esa constancia a valoración, según la postura expresamente solicitada.',
  requestedEffect: 'Emitir una nueva decisión motivada sobre admisión, sin declarar ganador del juicio.',
};
describe('Source-linked legal argument contract (not authority verification)', () => {
  it('accepts the complete grievance structure without verifying a norm', () => expect(validateGrievance(grievance, sources)).toEqual([]));
  it('rejects an empty grievance', () => expect(validateGrievance({}, sources).map(f => f.code)).toContain('EMPTY_GRIEVANCE'));
  it('rejects decorative generic text', () => expect(validateGrievance({ reasoning: 'Se violan mis derechos. La resolución es ilegal.' }, sources).map(f => f.code)).toContain('GENERIC_GRIEVANCE'));
  it('requires the specific challenged reasoning', () => expect(validateGrievance({ ...grievance, challengedReasoning: '' }, sources).map(f => f.code)).toContain('MISSING_CHALLENGED_REASONING'));
  it('does not accept a fabricated challenged reasoning simply because it is nonempty', () => expect(validateGrievance({ ...grievance, challengedReasoning: 'La autoridad determinó que el convenio era falso.' }, sources).map(f => f.code)).toContain('MISSING_CHALLENGED_REASONING'));
  it('requires a real linked record', () => expect(validateGrievance({ ...grievance, caseRecord: [] }, sources).map(f => f.code)).toContain('MISSING_CASE_RECORD_LINK'));
  it('rejects invented record IDs and excerpts', () => expect(validateGrievance({ ...grievance, caseRecord: [{ ...record[0], sourceId: 'invented' }] }, sources).map(f => f.code)).toContain('MISSING_CASE_RECORD_LINK'));
  it('requires prejudice', () => expect(validateGrievance({ ...grievance, prejudice: '' }, sources).map(f => f.code)).toContain('MISSING_PREJUDICE'));
  it('requires requested effect', () => expect(validateGrievance({ ...grievance, requestedEffect: '' }, sources).map(f => f.code)).toContain('MISSING_REQUESTED_EFFECT'));
  const concept = { act: grievance.resolution, authorityReasoning: grievance.challengedReasoning, norm: 'Premisa constitucional pendiente de verificación oficial: motivación individual.', factRecord: record, contradiction: grievance.reasoning, affectation: grievance.prejudice, effect: grievance.requestedEffect };
  it('accepts a complete concept as structure only', () => expect(validateConstitutionalConcept(concept, sources)).toEqual([]));
  it('rejects general disagreement and an isolated constitutional citation', () => {
    const codes = validateConstitutionalConcept({ norm: 'Artículo 16 constitucional.', contradiction: 'Se violan mis derechos.' }, sources).map(f => f.code);
    expect(codes).toContain('INCOMPLETE_CONSTITUTIONAL_CONCEPT');
    expect(codes).toContain('MISSING_CASE_RECORD_LINK');
  });
  it.each(['delito de imputado', 'nombre del actor', 'nombre del demandado', 'autoridad responsable correspondiente', 'artículo aplicable', 'jurisprudencia aplicable', 'hechos del caso', 'prueba correspondiente'])('flags synthetic prose: %s', text => {
    expect(detectSyntheticPlaceholders(`Se afirma ${text}.`).map(f => f.code)).toContain('UNRESOLVED_SYNTHETIC_PLACEHOLDER');
  });
  it('does not mistake a clearly internal pending marker for final prose', () => {
    expect(detectSyntheticPlaceholders('[DATO PENDIENTE: nombre del actor]')).toEqual([]);
  });
});
