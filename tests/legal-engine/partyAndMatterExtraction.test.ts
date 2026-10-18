/**
 * Fase 2 · Parte 2 — partes, autoridades y materia sobre documentos sintéticos con
 * defectos de OCR. Invariantes: el juez/secretario/autorizado nunca es parte, los
 * fragmentos deícticos («ESTE H.») nunca son parte, una palabra suelta no decide la
 * materia y ficha, análisis y compatibilidad coinciden.
 */
import { describe, expect, it } from 'vitest';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { detectCaseFicha } from '@/lib/legal-engine/caseFichaDetection';
import { classifyMatter } from '@/lib/legal-engine/matterClassification';
import { inferSourceMatterForDocuments } from '@/lib/legal-engine/sourceOutputCompatibility';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { extractAddressedCourt } from '@/lib/legal-engine/partyExtraction';
import { sourceFromText } from '../helpers/syntheticCaseDocuments';
import {
  AUTO_FAMILIAR_OCR,
  CONTESTACION_CIVIL_OCR,
  DEMANDA_CIVIL_OCR,
  DEMANDA_LABORAL_OCR,
  OCR_FIXTURES,
} from '../fixtures/documentosOcrSinteticos';

const fold = (value: string | undefined) =>
  (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');

describe.each(OCR_FIXTURES)('$id', (fixture) => {
  const source = sourceFromText(fixture.text, fixture.id);
  const analysis = reconstructCaseAnalysis([source]);
  const ficha = detectCaseFicha([fixture.text]);

  it('extrae actor y demandado esperados (o los deja pendientes), sin roles de funcionarios', () => {
    if (fixture.expected.actor) expect(fold(analysis.parties.actor)).toContain(fold(fixture.expected.actor));
    if (fixture.expected.demandado) expect(fold(analysis.parties.demandado)).toContain(fold(fixture.expected.demandado));
    const assigned = [analysis.parties.actor, analysis.parties.demandado, analysis.parties.terceroInteresado, ficha.actor, ficha.demandado]
      .filter(Boolean).map(fold);
    for (const forbidden of fixture.expected.notParties) {
      expect(assigned.some((value) => value.includes(fold(forbidden))), `${forbidden} no puede ser parte`).toBe(false);
    }
  });

  it('el órgano destinatario es el órgano completo y no se confunde con autoridad responsable', () => {
    if (fixture.expected.court) expect(analysis.parties.organoDestinatario || ficha.autoridad).toMatch(fixture.expected.court);
    if (analysis.parties.autoridadResponsable) {
      expect(fold(analysis.parties.autoridadResponsable)).not.toContain(fold(analysis.parties.organoDestinatario || '#'));
    }
    expect(analysis.authorities.every((authority) => !/\bJUICIO\b.*\bLABORAL C\b/i.test(authority))).toBe(true);
  });

  it('la materia es la misma en ficha, clasificador, compatibilidad y grounding', () => {
    const expected = fixture.expected.matter;
    expect(classifyMatter(fixture.text).matter).toBe(expected);
    expect(inferSourceMatterForDocuments([source])).toBe(expected);
    expect(buildSourceGrounding(source).container.matter).toBe(expected);
    expect(fold(ficha.materia)).toContain(fold(expected));
  });

  it('conserva procedencia (foja y fragmento) y confianza interna de cada parte asignada', () => {
    for (const role of ['actor', 'demandado'] as const) {
      const value = analysis.parties[role];
      if (!value) continue;
      const evidence = analysis.partyEvidence?.[role];
      expect(evidence, `${role} sin evidencia`).toBeTruthy();
      expect(evidence!.signals.length).toBeGreaterThan(0);
      expect(evidence!.confidence).toBeGreaterThanOrEqual(0.5);
      expect(evidence!.page).toBe(1);
      expect(evidence!.excerpt?.length).toBeGreaterThan(0);
    }
  });
});

describe('invariantes puntuales', () => {
  it('«trabajador» suelto en una demanda civil no la vuelve laboral', () => {
    expect(classifyMatter(DEMANDA_CIVIL_OCR.text).matter).toBe('CIVIL');
    expect(detectCaseFicha([DEMANDA_CIVIL_OCR.text]).materia).not.toMatch(/laboral/i);
  });

  it('el órgano se reconstruye aunque el OCR lo parta en cualquier palabra', () => {
    expect(extractAddressedCourt(DEMANDA_CIVIL_OCR.text)).toBe('JUEZ CUARTO DE LO CIVIL DEL PRIMER PARTIDO JUDICIAL EN EL ESTADO DE JALISCO');
  });

  it('en el auto familiar el juez, la secretaria y el autorizado nunca son parte', () => {
    const analysis = reconstructCaseAnalysis([sourceFromText(AUTO_FAMILIAR_OCR.text, 'auto')]);
    const parties = JSON.stringify(analysis.parties).toUpperCase();
    for (const staff of ['PATRICIA VEGA', 'NORMA ELIZONDO', 'TOMÁS ARELLANO']) expect(parties).not.toContain(staff);
  });

  it('en la contestación, quien comparece (apoderado) no es la actora y las partes salen del proemio', () => {
    const analysis = reconstructCaseAnalysis([sourceFromText(CONTESTACION_CIVIL_OCR.text, 'contestacion')]);
    expect(fold(analysis.parties.actor)).toBe('CONSTRUCTORA LOMA ALTA');
    expect(fold(analysis.parties.demandado)).toBe('DISTRIBUIDORA PINARES DEL SUR');
    expect(analysis.partyEvidence?.demandado?.signals).toContain('contestacion_proemio');
  });

  it('sin señales suficientes el dato queda pendiente en lugar de inventarse', () => {
    const analysis = reconstructCaseAnalysis([sourceFromText('C. JUEZ SEXTO DE LO CIVIL\nP R E S E N T E.\nSe promueve contestación a la demanda por quien suscribe.\n', 'pobre')]);
    expect(analysis.parties.actor).toBeUndefined();
    expect(analysis.parties.demandado).toBeUndefined();
  });

  it('una demanda laboral genuina sí se clasifica laboral (el vocabulario cuenta si es de varias señales)', () => {
    expect(classifyMatter(DEMANDA_LABORAL_OCR.text).matter).toBe('LABORAL');
  });
});
