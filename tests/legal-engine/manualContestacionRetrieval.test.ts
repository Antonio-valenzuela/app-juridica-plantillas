import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ManualIndex } from '@/lib/operational-manual/core';

/**
 * El manual operativo (pág. 154, «23. PROCEDIMIENTO PARA CONTESTACIONES», y pág. 23, «Ejemplo B —
 * Contestación de demanda») define la matriz de respuesta. Cada sección de una contestación debe
 * recibir esa metodología al redactarse, no solo las reglas genéricas.
 */
const manual = JSON.parse(readFileSync(path.join(process.cwd(), 'data/documents/operational-manual/v1.0/index.json'), 'utf8')) as ManualIndex;
vi.mock('@/lib/operational-manual/store', () => ({ loadActiveManual: async () => manual }));

const { buildBlockManualMethodology } = await import('@/lib/legal-engine/pipeline');

const doc = (documentType: string, matter: string) => ({ documentType, matter }) as never;

const SECTIONS: Array<[string, string]> = [
  ['CONTESTACIÓN DE HECHOS', 'background'],
  ['CONTESTACIÓN DE PRESTACIONES', 'argument'],
  ['EXCEPCIONES Y DEFENSAS', 'argument'],
  ['PRUEBAS', 'evidence'],
  ['ARGUMENTOS', 'argument'],
];

describe('metodología del manual en contestaciones', () => {
  for (const [title, type] of SECTIONS) {
    it(`«${title}» recupera el procedimiento de contestaciones del manual`, async () => {
      const result = await buildBlockManualMethodology(doc('contestacion_demanda_civil', 'civil'), title, type);
      expect(result.selectedPages, result.selectedPages.join(',')).toContain(154);
    });
  }

  it('una apelación no recibe el procedimiento de contestaciones', async () => {
    const result = await buildBlockManualMethodology(doc('apelacion_civil', 'civil'), 'AGRAVIOS', 'argument');
    expect(result.selectedPages).not.toContain(154);
  });
});
