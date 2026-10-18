import { describe, expect, it } from 'vitest';
import { generateWithFixture, syntheticAnalysis, FACT_TOKENS } from '../helpers/evidenceFixture';

/**
 * Sin hechos ni cronología en el análisis, el relleno determinista NO puede
 * afirmar hechos "bajo protesta de decir verdad" que nadie aportó.
 */
const FABRICATED = [/rescind[ií]\w*/i, /injustificad\w*/i, /salarios\s+devengados/i];

describe('el relleno determinista no fabrica hechos', () => {
  it('materia laboral sin hechos ni cronología: marcador pendiente y ningún hecho inventado', async () => {
    const empty = { ...syntheticAnalysis(), facts: [], proceduralTimeline: [] };
    const { body } = await generateWithFixture('contestacion_seguridad_social', { analysis: empty });
    for (const pattern of FABRICATED) expect(body, `fabricó ${pattern}`).not.toMatch(pattern);
    // El sanitizador normaliza "[DATO PENDIENTE:" a "[PENDIENTE:"; ambas formas son válidas.
    expect(body).toMatch(/\[(?:DATO )?PENDIENTE[^\]]*\]/);
  }, 120_000);

  it('materia laboral con hechos: usa los hechos del análisis y no la cronología ni el relleno', async () => {
    const { body } = await generateWithFixture('contestacion_seguridad_social');
    for (const token of FACT_TOKENS) expect(body).toContain(token);
    for (const pattern of FABRICATED) expect(body).not.toMatch(pattern);
  }, 120_000);
});
