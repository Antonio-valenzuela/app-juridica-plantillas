/**
 * Lote 6 (ítem 4): FINAL se bloquea con UNVERIFIED_CITATION y UNSUPPORTED_OR_CONTRADICTORY (audit D.3).
 * Las clases se derivan de los marcadores del texto; no requiere persistencia. Datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { finalPropositionBlockers } from '@/lib/legal-engine/exportGuards';

const doc = (texts: string[]) => ({
  id: 'final-gate', documentType: 'contestacion_demanda_civil', status: 'draft',
  sections: [{ id: 's1', title: 'Desarrollo', type: 'argument', order: 0, content: texts.map((text, i) => ({ id: `b${i}`, text })) }],
  generationMetadata: {}, validation: { warnings: [], errors: [] },
}) as any;

describe('FINAL: proposiciones que bloquean', () => {
  it('una cita no verificada (marcador NO VERIFICADO) bloquea con clase UNVERIFIED_CITATION', () => {
    const blockers = finalPropositionBlockers(doc(['Según [NO VERIFICADO: tesis 1a.4] la carga corresponde al actor.']));
    expect(blockers.some((item) => item.startsWith('UNVERIFIED_CITATION'))).toBe(true);
  });

  it('un dato sin respaldo en la fuente (marcador DATO PENDIENTE DE EXPEDIENTE) bloquea con clase UNSUPPORTED_OR_CONTRADICTORY', () => {
    const blockers = finalPropositionBlockers(doc(['[DATO PENDIENTE DE EXPEDIENTE: FECHA_NO_EN_FUENTE:12 de junio de 2020]']));
    expect(blockers.some((item) => item.startsWith('UNSUPPORTED_OR_CONTRADICTORY'))).toBe(true);
  });

  it('un texto sin esos marcadores no bloquea por este control', () => {
    expect(finalPropositionBlockers(doc(['La contestación niega los hechos con fundamento en la fuente.']))).toEqual([]);
  });
});
