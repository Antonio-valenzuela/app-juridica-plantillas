/**
 * Lote 1 — citas, jurisprudencia y marcadores no destructivos (P0-1, P1-2).
 * Regresión offline: solo texto sintético, sin proveedores ni fuentes reales.
 */
import { describe, expect, it } from 'vitest';
import { markUnverifiedAuthorityReferences } from '@/lib/legal-engine/authorityReferenceAudit';
import { extractMaterialLegalCitations } from '@/lib/legal-engine/materialLegalCitations';
import { evaluateGeneratedLegalAdmission } from '@/lib/legal-engine/generatedLegalAdmission';
import { createEmptyDocument } from '@/lib/legal-engine/types';

const mark = (text: string) => markUnverifiedAuthorityReferences({ text, blockId: 'blk-1', authorityUses: [], verifiedAuthorities: [] });
const doc = () => createEmptyDocument({
  id: 'citas-sinteticas', documentType: 'apelacion_civil', documentTypeLabel: 'Apelación civil',
  matter: 'civil', jurisdiction: 'local civil', flow: 'DOCUMENT_ANALYSIS',
});

describe('detección de precedentes y registros', () => {
  it.each([
    ['La jurisprudencia 2a./J. 23/2010 dispone que la carga corresponde al actor.', '2a./J. 23/2010'],
    ['Conforme a la tesis 1a./J. 18/2005, el juzgador debe fundar su decisión.', '1a./J. 18/2005'],
    ['P./J. 12/2010 señala que la competencia es de orden público.', 'P./J. 12/2010'],
    ['Como sostiene la tesis aislada I.3o.C.123 C, la prescripción es irrenunciable.', 'I.3o.C.123 C'],
    ['El criterio consta en el registro digital 2012345 de la Suprema Corte.', '2012345'],
    ['La contradicción de tesis 45/2019 resolvió el punto controvertido.', '45/2019'],
  ])('detecta la cita en: %s', (text, fragment) => {
    const citations = extractMaterialLegalCitations(text);
    expect(citations.some((citation) => citation.text.includes(fragment))).toBe(true);
  });

  it.each([
    ['La jurisprudencia 2a./J. 23/2010 dispone que la carga corresponde al actor.', '2a./J. 23/2010'],
    ['P./J. 12/2010 señala que la competencia es de orden público.', 'P./J. 12/2010'],
  ])('neutraliza la cita sin verificar: %s', (text, fragment) => {
    expect(mark(text).text).toContain(`[NO VERIFICADO: ${fragment}`);
  });
});

describe('falsos positivos: frases que no son citas', () => {
  it.each([
    'De acuerdo con lo expuesto, el recurso debe prosperar.',
    'Del acuerdo al que se alude no se desprende obligación alguna.',
  ])('no marca ni detecta nada en: %s', (text) => {
    expect(extractMaterialLegalCitations(text)).toEqual([]);
    expect(mark(text).text).toBe(text);
  });
});

describe('gramática tras marcar', () => {
  it('porque el artículo 47 de la LFT establece que… conserva la oración legible', () => {
    const text = 'La parte actora se libera porque el artículo 47 de la LFT establece que el patrón responde del daño.';
    const result = mark(text).text;
    expect(result).toContain('porque el [NO VERIFICADO: artículo 47 de la LFT]');
    expect(result).not.toMatch(/\s{2,}|\[NO VERIFICADO:\s*\]/);
  });

  it('De acuerdo con el artículo 14 constitucional… no rompe la oración', () => {
    const text = 'De acuerdo con el artículo 14 constitucional, la audiencia es obligatoria.';
    const result = mark(text).text;
    expect(result.startsWith('De acuerdo con el ')).toBe(true);
    expect(result).not.toMatch(/\[NO VERIFICADO:\s*\]/);
  });

  it('El artículo 1949 del Código Civil Federal prevé la rescisión: la cita completa queda marcada', () => {
    const text = 'El artículo 1949 del Código Civil Federal prevé la rescisión del contrato.';
    expect(mark(text).text).toContain('[NO VERIFICADO: artículo 1949 del Código Civil Federal]');
  });
});

describe('causas de admisión nuevas', () => {
  it('una afirmación de jurisprudencia sin cita verificada tiene causa UNVERIFIED_PRECEDENT_ASSERTION', () => {
    const result = evaluateGeneratedLegalAdmission({
      sectionType: 'legal_grounds', document: doc(),
      text: 'La Suprema Corte ha resuelto reiteradamente que la carga de la prueba corresponde al actor.',
    });
    expect(result.reasons).toContain('UNVERIFIED_PRECEDENT_ASSERTION');
    expect(result.accepted).toBe(false);
  });

  it('un plazo sin fuente tiene causa UNVERIFIED_DEADLINE', () => {
    const result = evaluateGeneratedLegalAdmission({
      sectionType: 'legal_grounds', document: doc(),
      text: 'El plazo para promover el amparo directo es de quince días hábiles contados desde la notificación.',
    });
    expect(result.reasons).toContain('UNVERIFIED_DEADLINE');
  });

  it('el razonamiento sin afirmación de derecho no recibe ninguna de las causas nuevas', () => {
    const result = evaluateGeneratedLegalAdmission({
      sectionType: 'legal_grounds', document: doc(),
      text: 'De acuerdo con lo expuesto, la sentencia no atiende la excepción planteada en la contestación.',
    });
    expect(result.reasons).not.toContain('UNVERIFIED_PRECEDENT_ASSERTION');
    expect(result.reasons).not.toContain('UNVERIFIED_DEADLINE');
  });
});
