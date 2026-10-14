import { describe, expect, it } from 'vitest';
import { getWritingContract } from '@/lib/legal-engine/writingContract';
import { CANONICAL_DOCUMENT_TYPES } from '@/lib/catalog/legalCatalog';
import { buildCaseDossier, confirmDossier, extractAgravios, extractCity, validateDossierForContract } from '@/lib/legal-engine/caseDossier';
import { inferSourceOutputType } from '@/lib/legal-engine/sourceOutputCompatibility';
import { expedienteApelacion, soloSentenciaApelada } from '../fixtures/apelacionContrariaSintetica';

describe('contrato por tipo de escrito', () => {
  it('todo tipo del catálogo tiene contrato con firmante, secciones y reglas', () => {
    for (const entry of CANONICAL_DOCUMENT_TYPES) {
      const contract = getWritingContract(entry.id);
      expect(contract.signerRole, entry.id).toBeTruthy();
      expect(contract.fixedSections.length, entry.id).toBeGreaterThan(0);
      expect(contract.forbidden.length, entry.id).toBeGreaterThan(0);
    }
  });

  it('el rol de quien firma sale del tipo', () => {
    const types = ['demanda_ordinaria_civil', 'contestacion_demanda_civil', 'contestacion_reconvencion_civil', 'apelacion_civil', 'contestacion_agravios', 'demanda_amparo_directo', 'recurso_queja_amparo', 'revocacion_civil'];
    const roles = Object.fromEntries(types.map((type) => [type, getWritingContract(type).signerRole]));
    expect(roles).toEqual({
      demanda_ordinaria_civil: 'actor', contestacion_demanda_civil: 'demandado', contestacion_reconvencion_civil: 'actor',
      apelacion_civil: 'apelante', contestacion_agravios: 'apelado', demanda_amparo_directo: 'quejoso',
      recurso_queja_amparo: 'recurrente', revocacion_civil: 'recurrente',
    });
  });

  it('la contestación de agravios exige la apelación del contrario y estructura estricta', () => {
    const contract = getWritingContract('contestacion_agravios');
    expect(contract.requiredInputs.map((input) => input.id)).toEqual(['apelacion_contraria']);
    expect(contract.strictStructure).toBe(true);
    expect(contract.oppositeStance.length).toBeGreaterThan(0);
  });

  it('la postura contraria se detecta por rol', () => {
    const apelado = getWritingContract('contestacion_agravios');
    expect(apelado.oppositeStance.some((rule) => rule.pattern.test('Se interpone recurso de apelación contra la sentencia'))).toBe(true);
    expect(apelado.oppositeStance.some((rule) => rule.pattern.test('Se confirme la sentencia recurrida'))).toBe(false);
    const apelante = getWritingContract('apelacion_civil');
    expect(apelante.oppositeStance.some((rule) => rule.pattern.test('Se confirme la sentencia recurrida'))).toBe(true);
  });
});

describe('ficha del caso', () => {
  const source = expedienteApelacion();

  it('extrae órgano, lugar, expediente, partes, resolución, notificación y agravios numerados', () => {
    const dossier = buildCaseDossier([source]);
    expect(dossier.court).toMatch(/JUZGADO QUINTO EN MATERIA CIVIL/);
    expect(dossier.city).toBe('Zapopan, Jalisco');
    expect(dossier.expediente).toBe('5521/2024');
    expect(dossier.parties.map((party) => `${party.role}:${party.name}`)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^actor:LAURA MENDOZA FICTICIA/), expect.stringMatching(/^demandado:CONSTRUCTORA LOS OLIVOS FICTICIA/),
    ]));
    expect(dossier.resolution?.kind).toBe('SENTENCIA_DEFINITIVA');
    expect(dossier.notifications.map((item) => item.date)).toContain('25 de agosto de 2026');
    expect(dossier.agravios.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(dossier.agravios[0].text).toMatch(/recibo de liquidación/);
    expect(dossier.appellantSide).toBe('actor');
    expect(dossier.confirmed).toBe(false);
  });

  it('el lugar y los datos que no constan quedan vacíos, no inventados', () => {
    const dossier = buildCaseDossier([{ ...source, pages: [{ page: 1, text: 'Documento sin datos.', chars: 20 }], extractedText: 'Documento sin datos.' }]);
    expect(dossier.city).toBe('');
    expect(dossier.court).toBe('');
    expect(dossier.missing).toEqual(expect.arrayContaining(['órgano jurisdiccional', 'lugar', 'partes']));
  });

  it('extrae el lugar con OCR ruidoso y con minúsculas', () => {
    expect(extractCity('e ZAPOPAN, JALISCO A 12 DOCE DE AGOSTO DEL AÑO 2026')).toBe('Zapopan, Jalisco');
    expect(extractCity('Guadalajara, Jalisco, a veinte de septiembre de dos mil veinticinco.')).toBe('Guadalajara, Jalisco');
    expect(extractCity('Sin lugar alguno en este texto')).toBe('');
  });

  it('numera los agravios en las formas usuales', () => {
    const text = 'PRIMER AGRAVIO. Uno uno uno uno uno uno uno uno.\nSEGUNDO AGRAVIO.- Dos dos dos dos dos dos dos dos dos.\nAGRAVIO 3. Tres tres tres tres tres tres tres tres.\nPUNTOS PETITORIOS\nPRIMERO. x';
    expect(extractAgravios(text).map((item) => item.number)).toEqual([1, 2, 3]);
  });

  describe('confirmación y representación', () => {
    const sourceTypeOf = (item: typeof source) => String(inferSourceOutputType([item]));

    it('sin confirmar o sin elegir a quién representa, no se puede redactar', () => {
      const contract = getWritingContract('contestacion_agravios');
      const dossier = buildCaseDossier([source]);
      expect(validateDossierForContract(undefined, contract, [source]).map((p) => p.code)).toContain('DOSSIER_NOT_CONFIRMED');
      expect(validateDossierForContract(dossier, contract, [source]).map((p) => p.code)).toContain('DOSSIER_NOT_CONFIRMED');
      const confirmedWithoutChoice = { ...dossier, confirmed: true };
      expect(validateDossierForContract(confirmedWithoutChoice, contract, [source]).map((p) => p.code)).toContain('REPRESENTATION_NOT_CHOSEN');
    });

    it('la apelada es la contraparte de quien firmó el recurso; elegir al apelante como apelado se rechaza', () => {
      const contract = getWritingContract('contestacion_agravios');
      const base = buildCaseDossier([source]);
      const right = confirmDossier(base, { representedName: 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.', representedSide: 'demandado' });
      expect(validateDossierForContract(right, contract, [source])).toEqual([]);
      const wrong = confirmDossier(base, { representedName: 'LAURA MENDOZA FICTICIA', representedSide: 'actor' });
      expect(validateDossierForContract(wrong, contract, [source]).map((p) => p.code)).toEqual(['REPRESENTATION_ROLE_MISMATCH']);
    });

    it('sin la apelación del contrario el sistema la pide y no inventa agravios', () => {
      const contract = getWritingContract('contestacion_agravios');
      const only = soloSentenciaApelada();
      const dossier = confirmDossier(buildCaseDossier([only]), { representedName: 'CONSTRUCTORA LOS OLIVOS FICTICIA, S.A. DE C.V.', representedSide: 'demandado' });
      const problems = validateDossierForContract(dossier, contract, [only], { sourceTypeOf });
      expect(problems.map((p) => p.code)).toContain('REQUIRED_INPUT_MISSING');
      expect(problems.find((p) => p.code === 'REQUIRED_INPUT_MISSING')?.message).toMatch(/apelación \(escrito de agravios\)/);
      expect(dossier.agravios).toEqual([]);
    });
  });
});
