import { describe, expect, it } from 'vitest';
import {
  allocateSectionWordTargets,
  buildContinuationPrompt,
  calculateExtensionTokenBudget,
  hasDuplicateContent,
  resolveGenerationExtensionContract,
} from '../../lib/legal-engine/generationExtension';

describe('generation extension contract', () => {
  it('keeps standard mode bounded and resolves extended mode to the requested 40-page window', () => {
    const standard = resolveGenerationExtensionContract();
    const extended = resolveGenerationExtensionContract({ generationMode: 'extended-legal' });

    expect(standard.generationMode).toBe('standard');
    expect(standard.maxContinuationsPerSection).toBe(2);
    expect(extended).toMatchObject({
      generationMode: 'extended-legal',
      targetPages: 40,
      minPages: 36,
      maxPages: 44,
      maxContinuationsPerSection: expect.any(Number),
    });
    expect(extended.maxContinuationsPerSection).toBeGreaterThan(2);
  });

  it('distributes more words to substantive sections and produces a safe token budget', () => {
    const targets = allocateSectionWordTargets([
      { id: 'comparecencia', title: 'Comparecencia', type: 'appearance' },
      { id: 'hechos', title: 'Contestación a los hechos', type: 'facts' },
      { id: 'agravios', title: 'Excepciones y defensas', type: 'argument' },
      { id: 'petitorios', title: 'Puntos petitorios', type: 'petition' },
    ], 16000);

    expect(targets.agravios).toBeGreaterThan(targets.comparecencia);
    expect(targets.hechos).toBeGreaterThan(targets.comparecencia);
    expect(targets.petitorios).toBeLessThan(targets.agravios);
    expect(calculateExtensionTokenBudget(targets.agravios, 2, 3600)).toBeGreaterThanOrEqual(1800);
    expect(calculateExtensionTokenBudget(targets.agravios, 2, 3600)).toBeLessThanOrEqual(7000);
  });

  it('detects duplicated continuation text but accepts a novel substantive continuation', () => {
    const previous = 'La autoridad debía motivar el acto reclamado con razones verificables y congruentes.';
    expect(hasDuplicateContent(previous, previous)).toBe(true);
    expect(hasDuplicateContent(previous, 'Además, la resolución omitió confrontar la prueba documental con la norma aplicable, por lo que la motivación resulta insuficiente.')).toBe(false);
  });

  it('carries the outline, covered points, pending points and source ids into continuation prompts', () => {
    const prompt = buildContinuationPrompt({
      sectionTitle: 'Excepciones y defensas',
      previousText: 'Texto previo de la sección.',
      outline: ['competencia', 'carga de la prueba', 'conclusión'],
      coveredPoints: ['competencia'],
      pendingPoints: ['carga de la prueba', 'conclusión'],
      factIds: ['fact-1'],
      sourceIds: ['source-1'],
    });

    expect(prompt).toContain('carga de la prueba');
    expect(prompt).toContain('fact-1');
    expect(prompt).toContain('source-1');
    expect(prompt).toContain('NO REPITAS');
  });
});
