import { describe, expect, it } from 'vitest';
import { evaluateFactsCriterion, factsPolicyFor } from '@/lib/legal-engine/factsPolicy';
import { resolveWritingType, visibleWritingTypes } from '@/lib/catalog/writingTypeIdentity';

const policyOf = (id: string) => {
  const identity = resolveWritingType(id);
  return factsPolicyFor({ id: identity.id, familyId: identity.familyId, requiredSections: identity.requiredSections }).policy;
};

const BASE = {
  factTokens: ['HECHO_SINTETICO_1', 'HECHO_SINTETICO_2'],
  expedienteToken: 'EXP-EVID-2026/001',
  partyTokens: ['ACTOR SINTETICO', 'DEMANDADO SINTETICO'],
};

describe('factsPolicy — clasificación por tipo', () => {
  it('escritos sustantivos exigen narrativa de hechos', () => {
    for (const id of ['contestacion_demanda', 'alegatos_civil', 'replica', 'duplica', 'recurso_queja_amparo', 'reconvencion_civil', 'ofrecimiento_pruebas_civil']) {
      expect(policyOf(id), id).toBe('NARRATIVE_REQUIRED');
    }
  });

  it('trámites se acreditan con contexto procesal y petición', () => {
    for (const id of ['solicitud_copias_certificadas', 'impulso_procesal', 'cambio_domicilio_procesal', 'desistimiento', 'cumplimiento_prevencion']) {
      expect(policyOf(id), id).toBe('PROCEDURAL_CONTEXT');
    }
  });

  it('contratos y convenios son instrumentos', () => {
    for (const id of ['contrato_compraventa', 'convenio_transaccional', 'contrato_mutuo']) {
      expect(policyOf(id), id).toBe('INSTRUMENT');
    }
  });

  it('las excepciones por ID siguen exigiendo narrativa', () => {
    expect(policyOf('solicitud_medida_proteccion')).toBe('NARRATIVE_REQUIRED');
    expect(policyOf('solicitud_suspension_fiscal')).toBe('NARRATIVE_REQUIRED');
  });

  it('BARRERA: ningún escrito sustantivo puede caer en una clase más laxa', () => {
    const SUBSTANTIVE = /^(contestacion|demanda|recurso|apelacion|amparo|alegatos|replica|duplica|reconvencion|excepciones|ofrecimiento_pruebas|objecion|queja|revision)/;
    // Exenciones documentadas: estrategia post-sentencia cuyo insumo factual es la cronología procesal,
    // y demanda ejecutiva mercantil, cuyo contrato exige el contexto mercantil CONFIRMADO por el abogado.
    const DOCUMENTED_EXEMPTIONS = new Map([
      ['contestacion_revision_extraordinaria_amparo_directo', 'PROCEDURAL_ANTECEDENTS'],
      ['demanda_ejecutiva_mercantil', 'COMMERCIAL_CONTEXT'],
    ]);
    const offenders = visibleWritingTypes()
      .filter(identity => identity.capabilities.draft && SUBSTANTIVE.test(identity.id))
      .filter(identity => !DOCUMENTED_EXEMPTIONS.has(identity.id))
      .filter(identity => policyOf(identity.id) !== 'NARRATIVE_REQUIRED')
      .map(identity => identity.id);
    expect(offenders).toEqual([]);
    for (const [id, policy] of DOCUMENTED_EXEMPTIONS) expect(policyOf(id), id).toBe(policy);
  });

  it('toda decisión lleva una razón auditable', () => {
    for (const identity of visibleWritingTypes()) {
      const decision = factsPolicyFor({ id: identity.id, familyId: identity.familyId, requiredSections: identity.requiredSections });
      expect(decision.reason.length, identity.id).toBeGreaterThan(20);
    }
  });
});

describe('factsPolicy — criterio de aceptación', () => {
  it('NARRATIVE_REQUIRED falla si los hechos no aparecen', () => {
    expect(evaluateFactsCriterion({ ...BASE, policy: 'NARRATIVE_REQUIRED', body: 'Comparece ACTOR SINTETICO. EXP-EVID-2026/001. PRIMERO.' }))
      .toEqual(['FACTS_SILENTLY_DROPPED']);
  });

  it('NARRATIVE_REQUIRED: un marcador de pendiente NO excusa hechos que sí fueron proporcionados', () => {
    const body = '[PENDIENTE: hechos con respaldo verificable]\n[DATO PENDIENTE / GENERACIÓN PENDIENTE DE REVISIÓN]';
    expect(evaluateFactsCriterion({ ...BASE, policy: 'NARRATIVE_REQUIRED', body })).toContain('FACTS_SILENTLY_DROPPED');
  });

  it('NARRATIVE_REQUIRED pasa cuando al menos un hecho del caso consta en el cuerpo', () => {
    expect(evaluateFactsCriterion({ ...BASE, policy: 'NARRATIVE_REQUIRED', body: 'Consta HECHO_SINTETICO_2 en autos.' })).toEqual([]);
  });

  it('PROCEDURAL_CONTEXT exige expediente, parte y petición concreta', () => {
    const ok = 'EXPEDIENTE: EXP-EVID-2026/001\nACTOR SINTETICO solicita.\nPRIMERO. Se expidan copias.';
    expect(evaluateFactsCriterion({ ...BASE, policy: 'PROCEDURAL_CONTEXT', body: ok })).toEqual([]);
    expect(evaluateFactsCriterion({ ...BASE, policy: 'PROCEDURAL_CONTEXT', body: 'ACTOR SINTETICO. PRIMERO. Copias.' })).toContain('PROCEDURAL_CONTEXT_MISSING');
    expect(evaluateFactsCriterion({ ...BASE, policy: 'PROCEDURAL_CONTEXT', body: 'EXP-EVID-2026/001. Texto sin partes ni petición.' }))
      .toEqual(expect.arrayContaining(['PARTY_CONTEXT_MISSING', 'PETITION_MISSING']));
  });

  it('PROCEDURAL_CONTEXT acepta un marcador pendiente específico del expediente', () => {
    const body = '[DATO PENDIENTE DE EXPEDIENTE: Número de expediente]\nACTOR SINTETICO.\nPRIMERO. Se tenga por presentado.';
    expect(evaluateFactsCriterion({ ...BASE, policy: 'PROCEDURAL_CONTEXT', body })).toEqual([]);
  });

  it('un marcador pendiente genérico NO sustituye al expediente ni a las partes', () => {
    const body = '[DATO PENDIENTE / GENERACIÓN PENDIENTE DE REVISIÓN]\nPRIMERO. Solicita.';
    expect(evaluateFactsCriterion({ ...BASE, policy: 'PROCEDURAL_CONTEXT', body }))
      .toEqual(expect.arrayContaining(['PARTY_CONTEXT_MISSING', 'PROCEDURAL_CONTEXT_MISSING']));
  });

  it('PROCEDURAL_ANTECEDENTS exige que la cronología procesal aparezca', () => {
    const input = { ...BASE, policy: 'PROCEDURAL_ANTECEDENTS' as const, timelineTokens: ['ACTUACION_1', 'ACTUACION_2'] };
    expect(evaluateFactsCriterion({ ...input, body: 'EXP-EVID-2026/001. ACTOR SINTETICO. 2026-01-15: ACTUACION_1.' })).toEqual([]);
    expect(evaluateFactsCriterion({ ...input, body: 'EXP-EVID-2026/001. ACTOR SINTETICO. Sin cronología.' })).toEqual(['PROCEDURAL_ANTECEDENTS_DROPPED']);
  });

  it('PROCEDURAL_ANTECEDENTS no se satisface con los hechos del litigio ni con un marcador pendiente', () => {
    const input = { ...BASE, policy: 'PROCEDURAL_ANTECEDENTS' as const, timelineTokens: ['ACTUACION_1'] };
    expect(evaluateFactsCriterion({ ...input, body: 'EXP-EVID-2026/001. ACTOR SINTETICO. HECHO_SINTETICO_1. [PENDIENTE: antecedentes]' }))
      .toContain('PROCEDURAL_ANTECEDENTS_DROPPED');
  });

  it('INSTRUMENT exige identificar a las partes pero no hechos', () => {
    expect(evaluateFactsCriterion({ ...BASE, policy: 'INSTRUMENT', body: 'CLÁUSULA PRIMERA. DEMANDADO SINTETICO y ACTOR SINTETICO convienen.' })).toEqual([]);
    expect(evaluateFactsCriterion({ ...BASE, policy: 'INSTRUMENT', body: 'CLÁUSULA PRIMERA. Sin partes.' })).toEqual(['PARTY_CONTEXT_MISSING']);
  });
});
