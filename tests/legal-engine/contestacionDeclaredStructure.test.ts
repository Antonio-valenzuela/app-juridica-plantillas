import { describe, expect, it } from 'vitest';
import { resolveWritingType, visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';
import { isOptInSection } from '@/lib/legal-engine/optInSections';
import { FACT_TOKENS, generateWithFixture, missingRequiredSections } from '../helpers/evidenceFixture';

const CONTESTACIONES = visibleWritingTypes()
  .filter(identity => identity.capabilities.draft && /contestaci/i.test(identity.id))
  // La estrategia post-sentencia de amparo directo tiene su propio preflight.
  .filter(identity => identity.id !== 'contestacion_revision_extraordinaria_amparo_directo')
  .map(identity => identity.id);

describe('contestaciones: toda sección obligatoria declarada existe en la salida real', () => {
  it('hay contestaciones que verificar', () => {
    expect(CONTESTACIONES.length).toBeGreaterThanOrEqual(17);
  });

  it.each(CONTESTACIONES)('%s conserva todas sus secciones requeridas y los hechos', async (id) => {
    const identity = resolveWritingType(id);
    const { titles, body } = await generateWithFixture(id);
    // Si una sección obligatoria desaparece del documento, esta aserción falla.
    expect(missingRequiredSections(identity.requiredSections, titles), `${id} perdió secciones`).toEqual([]);
    for (const token of FACT_TOKENS) expect(body, `${id} perdió ${token}`).toContain(token);
  }, 120_000);
});

describe('contestaciones especializadas conservan su identidad', () => {
  // Estos tipos declaran estructura propia: no son una contestación civil de demanda.
  it.each([
    'contestacion_nulidad_fiscal', 'contestacion_nulidad_administrativa', 'contestacion_ampliacion_fiscal',
    'contestacion_ampliacion_nulidad', 'contestacion_demanda_agraria', 'contestacion_proveedor', 'contestacion_seguridad_social',
  ])('%s no arrastra secciones de una contestación civil de demanda', async (id) => {
    const { titles } = await generateWithFixture(id);
    const joined = titles.join(' | ').toUpperCase();
    expect(joined).not.toContain('OBJECIÓN DE PRUEBAS DE LA PARTE ACTORA');
    expect(joined).not.toContain('PRUEBAS PROPIAS DE LA DEMANDADA');
    expect(joined).not.toContain('COMPARECENCIA Y PERSONALIDAD');
  }, 120_000);
});

describe('ALEGATOS en contestaciones: sección opt-in con una sola fuente de verdad', () => {
  it('la identidad no declara ALEGATOS como obligatorio en una contestación', () => {
    for (const id of CONTESTACIONES) {
      const required = resolveWritingType(id).requiredSections;
      expect(required.some(section => /alegato/i.test(section)), id).toBe(false);
    }
  });

  it('la regla solo aplica a contestaciones', () => {
    expect(isOptInSection('contestacion_demanda', undefined, 'ALEGATOS')).toBe(true);
    expect(isOptInSection('alegatos_civil', undefined, 'ALEGATOS')).toBe(false);
    expect(isOptInSection('contestacion_demanda', undefined, 'DERECHO')).toBe(false);
  });

  it('por defecto no se materializa ALEGATOS en la contestación', async () => {
    const { titles } = await generateWithFixture('contestacion_demanda');
    expect(titles.some(title => /alegato/i.test(title))).toBe(false);
  }, 120_000);

  it('cuando el usuario los pide, ALEGATOS aparece con marcador de postura del abogado', async () => {
    const { titles, body } = await generateWithFixture('contestacion_demanda', {
      userInstruction: 'Contestar la demanda e incluir alegatos con los hechos del expediente.',
    });
    expect(titles.some(title => /alegato/i.test(title))).toBe(true);
    expect(body).toContain('[REQUIERE POSTURA DEL ABOGADO]');
  }, 120_000);
});
