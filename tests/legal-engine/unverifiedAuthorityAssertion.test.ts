import { describe, expect, it } from 'vitest';
import { markUnverifiedAuthorityReferences } from '@/lib/legal-engine/authorityReferenceAudit';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';

/**
 * Regresiones observadas en la generación real de la apelación 1152/2013
 * (audit/legal-generation-quality-recovery/real-appeal-1152-2013):
 *  - "[NO VERIFICADO: tesis X] ... establece que ..." se leía como derecho cierto.
 *  - Una afirmación de competencia se afirmaba sin verificación.
 */
describe('una autoridad no verificada no puede quedar afirmada como regla', () => {
  it('markUnverifiedAuthorityReferences neutraliza la cláusula que afirma la cita', () => {
    const text = 'La tesis 1a.4, emitida por un Tribunal Colegiado, establece que los jueces de distrito no están impedidos para resolver la causa.';
    const result = markUnverifiedAuthorityReferences({ text, blockId: 'blk-1', authorityUses: [], verifiedAuthorities: [] });
    expect(result.text).toContain('[NO VERIFICADO');
    // La proposición deja de leerse como regla verificada.
    expect(result.text).not.toMatch(/\[NO VERIFICADO[^\]]*\][^.!?]{0,200}?establece que/);
    expect(result.text).toContain('PENDIENTE DE DESARROLLO');
  });

  it('una cita no afirmada como regla sólo se marca, sin retirar el resto del enunciado', () => {
    const text = 'El antecedente procesal cita la tesis 1a.4 que se describe a continuación en la misma resolución.';
    const result = markUnverifiedAuthorityReferences({ text, blockId: 'blk-1', authorityUses: [], verifiedAuthorities: [] });
    expect(result.text).toContain('[NO VERIFICADO');
    expect(result.text).toContain('se describe a continuación en la misma resolución');
  });

  it('el marcador de referencia no verificada sigue bloqueando FINAL', () => {
    const text = 'La tesis 1a.4, emitida por un Tribunal Colegiado, establece que los jueces de distrito pueden resolver la causa.';
    const result = markUnverifiedAuthorityReferences({ text, blockId: 'blk-1', authorityUses: [], verifiedAuthorities: [] });
    expect(/\[\s*(?:PENDIENTE DE DESARROLLO|REQUIERE DESARROLLO|DATO PENDIENTE|SECCIÓN GENERADA)/i.test(result.text)).toBe(true);
  });

  it('una afirmación de competencia exige verificación aunque no cite precepto', () => {
    const doc = createEmptyDocument({
      id: 'competence', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil',
      matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
    });
    const result = evaluateGeneratedLegalAdmission({
      sectionType: 'legal_grounds',
      document: doc,
      text: 'La sentencia dictada por el órgano de origen no se encuentra dentro del ámbito de competencia de la jurisdicción que ahora conoce.',
    });
    expect(result.reasons).toContain('UNVERIFIED_LEGAL_ASSERTION');
    expect(result.text).toContain('PENDIENTE DE DESARROLLO');
  });
});

function hasCanonicalPending(value: string): boolean {
  return /\[PENDIENTE DE DESARROLLO/.test(value);
}
