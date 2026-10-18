import { describe, expect, it } from 'vitest';
import { LocalProvider } from '@/lib/ai/providers/local';

/**
 * RED — P0-A. El LocalProvider sirve TAMBIÉN como asistente de chat de la
 * interfaz. Su lógica `isPageQuery` reacciona a palabras como "sección",
 * "pantalla" o "página", que aparecen de forma natural en los prompts
 * jurídicos de generación. El resultado: una respuesta de ayuda de pantalla
 * terminaba dentro de un escrito jurídico.
 *
 * Este test debe FALLAR con el código previo a la corrección.
 */

const UI_LEAK_PATTERNS = [
  'Resumen de la pantalla actual',
  'Panel Principal',
  'Jurídico Radar',
  'Te encuentras en',
  'Dashboard',
  'Inteligencia Regulatoria',
];

const LEGAL_PROMPTS: Array<[string, string]> = [
  ['sección de agravios', 'Redacta la sección de agravios de la apelación civil.'],
  ['página', 'Analiza la página 3 del expediente y desarrolla los hechos.'],
  ['pantalla', 'Describe la pantalla de antecedentes procesales del expediente.'],
  ['en esta sección', 'En esta sección debe quedar claro el fundamento.'],
  ['genera el documento', 'Genera el documento de demanda con los hechos del expediente.'],
];

describe('P0-A: el chat de interfaz NUNCA sirve generación jurídica', () => {
  it('RED: hoy un prompt jurídico con "sección" devuelve ayuda de interfaz', async () => {
    const provider = new LocalProvider();
    const result = await provider.generate({
      userMessage: LEGAL_PROMPTS[0][1],
      legalContext: { pageContext: { route: '/', pageTitle: 'Inicio' } },
    } as any);
    const leaked = UI_LEAK_PATTERNS.filter(pattern => result.content.includes(pattern));
    // Documenta la fuga observada. Cuando el guard esté activo, será 0.
    expect(leaked.length).toBeGreaterThan(0);
    expect(result.content).toMatch(/Resumen de la pantalla actual/);
  });

  it('con purpose=LEGAL_GENERATION nunca devuelve contenido de interfaz', async () => {
    const provider = new LocalProvider();
    for (const [, prompt] of LEGAL_PROMPTS) {
      const result = await provider.generate({
        purpose: 'LEGAL_GENERATION',
        userMessage: prompt,
        legalContext: { pageContext: { route: '/', pageTitle: 'Inicio' } },
      } as any);
      const leaked = UI_LEAK_PATTERNS.filter(pattern => result.content.includes(pattern));
      expect(leaked, `fuga con prompt: ${prompt}`).toEqual([]);
    }
  });

  it('con purpose=LEGAL_GENERATION y sin provider externo devuelve PROVIDER_UNAVAILABLE', async () => {
    const provider = new LocalProvider();
    const result = await provider.generate({
      purpose: 'LEGAL_GENERATION',
      userMessage: 'Redacta los agravios con fundamento en las constancias.',
      legalContext: {},
    } as any);
    expect(result.success).toBe(false);
    expect(result.origin).toBe('PROVIDER_UNAVAILABLE');
    expect(result.content).toMatch(/PENDIENTE/);
    expect(result.content).not.toMatch(/Orientación de Jurídico Radar/);
    expect(result.warnings?.join(' ')).toMatch(/PROVIDER_UNAVAILABLE/);
  });

  it('el chat de interfaz (purpose=UI_ASSISTANT) conserva su comportamiento actual', async () => {
    const provider = new LocalProvider();
    const result = await provider.generate({
      purpose: 'UI_ASSISTANT',
      userMessage: '¿Qué hay en esta pantalla?',
      legalContext: { pageContext: { route: '/', pageTitle: 'Inicio' } },
    } as any);
    expect(result.success).toBe(true);
    expect(result.content).toMatch(/Resumen de la pantalla actual/);
    expect(result.origin).toBe('LOCAL_PLACEHOLDER');
  });

  it('sin purpose explícito el comportamiento de interfaz se conserva (retrocompatible)', async () => {
    const provider = new LocalProvider();
    const result = await provider.generate({
      userMessage: '¿Qué hace esta sección?',
      legalContext: { pageContext: { route: '/legal-hub/machotes' } },
    } as any);
    expect(result.content).toMatch(/Resumen de la pantalla actual/);
  });
});