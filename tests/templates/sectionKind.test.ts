import { describe, expect, it } from 'vitest';
import { classifySectionKind, resolveSectionKind } from '@/lib/templates/sectionKind';

const k = (title: string, text = '', index = 1, total = 5) => classifySectionKind({ title, text, index, total });

describe('clasificación FÓRMULA / SUSTANTIVA', () => {
  it('fórmulas: proemio, comparecencia, cierre, firma', () => {
    for (const title of ['PROEMIO Y PERSONALIDAD', 'COMPARECENCIA', 'PROTESTO LO NECESARIO', 'FIRMA', 'LUGAR Y FECHA', 'DOMICILIO PARA NOTIFICACIONES']) {
      expect(k(title), title).toBe('FORMULA');
    }
  });

  it('sustantivas: hechos, prestaciones, agravios, excepciones, pruebas, derecho, petitorios', () => {
    for (const title of ['HECHOS', 'I. PRESTACIONES', 'AGRAVIOS', 'EXCEPCIONES Y DEFENSAS', 'PRUEBAS', 'FUNDAMENTOS DE DERECHO', 'PUNTOS PETITORIOS', 'COMPARECENCIA Y HECHOS']) {
      expect(k(title), title).toBe('SUSTANTIVA');
    }
  });

  it('sin título reconocible: primera/última breve = fórmula; texto largo o dudoso = sustantiva', () => {
    expect(k('ESCRITO', 'C. Juez de lo Civil. Presente.', 0)).toBe('FORMULA');
    expect(k('X', 'Protesto lo necesario. Atentamente.', 4)).toBe('FORMULA');
    expect(k('DESARROLLO', 'palabra '.repeat(200), 2)).toBe('SUSTANTIVA');
    expect(k('OTRO', 'texto corto', 2)).toBe('SUSTANTIVA');
  });

  it('el abogado puede corregir la clasificación', () => {
    expect(resolveSectionKind({ title: 'HECHOS', text: '', index: 1, total: 4 }, { hechos: 'FORMULA' })).toBe('FORMULA');
  });
});
