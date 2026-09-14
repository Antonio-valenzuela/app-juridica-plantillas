import { describe, expect, it } from 'vitest';
import {
  normalizeMarkdownFormatting,
  normalizeTitleText,
  looksLikeHeading,
} from '../../lib/legal-engine/markdownNormalizer';

describe('markdownNormalizer — distinción redacción vs sintaxis Markdown', () => {
  it('elimina negritas Markdown conservando el contenido', () => {
    expect(normalizeMarkdownFormatting('**DEMANDA**')).toBe('DEMANDA');
    expect(normalizeMarkdownFormatting('**CONTESTACIÓN** de la demanda')).toBe('CONTESTACIÓN de la demanda');
    expect(normalizeMarkdownFormatting('**a** y **b**')).toBe('a y b');
  });

  it('elimina negrita+cursiva triple sin dejar asteriscos', () => {
    expect(normalizeMarkdownFormatting('***PRUEBAS***')).toBe('PRUEBAS');
  });

  it('elimina cursiva simple y subrayado/código', () => {
    expect(normalizeMarkdownFormatting('*énfasis*')).toBe('énfasis');
    expect(normalizeMarkdownFormatting('__sub__ y `code`')).toBe('sub y code');
  });

  it('elimina encabezados Markdown (#, ##, ###)', () => {
    expect(normalizeMarkdownFormatting('### HECHOS RELEVANTES')).toBe('HECHOS RELEVANTES');
    expect(normalizeMarkdownFormatting('## FUNDAMENTO\nTexto.')).toBe('FUNDAMENTO\nTexto.');
  });

  it('PRESERVA líneas de redacción del expediente (***** y **********)', () => {
    expect(normalizeMarkdownFormatting('*****')).toBe('*****');
    // Los asteriscos de redacción permanecen intactos (el espacio cosmético puede compactarse).
    expect(normalizeMarkdownFormatting('   **********   ')).toContain('**********');
    const multi = 'El diecisiete de ***** comparece.\n*******\nCONTESTACIÓN';
    const out = normalizeMarkdownFormatting(multi);
    expect(out).toContain('*****');
    expect(out).toContain('*******');
    expect(out).toContain('CONTESTACIÓN');
  });

  it('preserva corridas de asteriscos INLINE dentro de una frase', () => {
    expect(normalizeMarkdownFormatting('Domicilio: ***** referencias no visibles.')).toBe(
      'Domicilio: ***** referencias no visibles.'
    );
  });

  it('NO roba bordes entre dos corridas vecinas en la misma línea (bug -4)', () => {
    const line = 'El dos de ********** fui despedida mediante acto de ***********.';
    expect(normalizeMarkdownFormatting(line)).toBe(line);
    const mixed = 'salario $***** y acta ***** anexa';
    expect(normalizeMarkdownFormatting(mixed)).toBe(mixed);
  });

  it('convierte viñetas Markdown en viñeta tipográfica', () => {
    expect(normalizeMarkdownFormatting('- primer punto')).toBe('• primer punto');
    expect(normalizeMarkdownFormatting('* segundo punto')).toBe('• segundo punto');
  });

  it('elimina cercos de código ``` y su contenido literal permanece', () => {
    const out = normalizeMarkdownFormatting('```json\n{"x":1}\n```');
    expect(out).not.toContain('```');
    expect(out).toContain('{"x":1}');
  });

  it('es idempotente', () => {
    const once = normalizeMarkdownFormatting('**A**\n- b\n*****');
    expect(normalizeMarkdownFormatting(once)).toBe(once);
  });

  it('no toca marcadores controlados [DATO PENDIENTE DE EXPEDIENTE]', () => {
    expect(normalizeMarkdownFormatting('[DATO PENDIENTE DE EXPEDIENTE: Fecha]')).toBe(
      '[DATO PENDIENTE DE EXPEDIENTE: Fecha]'
    );
  });
});

describe('normalizeTitleText', () => {
  it('limpa títulos con Markdown', () => {
    expect(normalizeTitleText('**PRUEBAS**')).toBe('PRUEBAS');
    expect(normalizeTitleText('### CONTESTACIÓN')).toBe('CONTESTACIÓN');
  });
});

describe('looksLikeHeading — jerarquía jurídica', () => {
  it('detecta rúbricas en mayúsculas', () => {
    expect(looksLikeHeading('DEMANDA')).toBe(true);
    expect(looksLikeHeading('CONTESTACIÓN DE LA DEMANDA')).toBe(true);
    expect(looksLikeHeading('PRUEBAS')).toBe(true);
    expect(looksLikeHeading('RESUELVE')).toBe(true);
    expect(looksLikeHeading('PRINCIPIO JURÍDICO')).toBe(true);
  });

  it('rechaza prosa normal o fragmentos cortos', () => {
    expect(looksLikeHeading('El actor manifestó lo siguiente en audiencia')).toBe(false);
    expect(looksLikeHeading('NO')).toBe(false);
    expect(looksLikeHeading('')).toBe(false);
    expect(looksLikeHeading('En la ciudad de México, siendo las diez horas.')).toBe(false);
  });
});
