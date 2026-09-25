import { describe, expect, it } from 'vitest';
import {
  allocateSectionWordTargets,
  buildContinuationPrompt,
  calculateExtensionTokenBudget,
  hasDuplicateContent,
  resolveGenerationExtensionContract,
} from '../../lib/legal-engine/generationExtension';
import { expandDocumentToPageTarget } from '../../lib/legal-engine/generationExpansion';

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

  it('continues with the next section after a local fallback instead of aborting the whole extension', async () => {
    const document = {
      documentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
      sourceDocuments: [],
      generationMetadata: { generationId: 'extension-regression' },
      sections: [
        { id: 'agravios', title: 'Agravios', type: 'argument', content: [{ id: 'a1', text: 'Base de agravios' }] },
        { id: 'hechos', title: 'Hechos', type: 'facts', content: [{ id: 'h1', text: 'Base de hechos' }] },
      ],
    } as any;
    const contract = resolveGenerationExtensionContract({
      generationMode: 'extended-legal',
      targetPages: 2,
      minPages: 2,
      maxPages: 3,
      maxCallsPerDocument: 2,
      maxExpansionPasses: 1,
    });
    let calls = 0;
    const result = await expandDocumentToPageTarget(document, undefined, contract, {
      measure: async (value) => ({
        actualPages: value.sections.some((section: any) => section.content.length > 1) ? 2 : 1,
        wordCount: 100,
        characterCount: 600,
        pdfBytes: 1000,
      }),
      invokeProvider: async () => {
        calls += 1;
        return calls === 1
          ? {
              provider: 'local', model: 'local', success: true, content: 'fallback',
              latencyMs: 1, origin: 'LOCAL_PLACEHOLDER', isLegalAiContent: false,
            }
          : {
              provider: 'groq', model: 'test-model', success: true, content: 'Desarrollo nuevo y fundado.',
              latencyMs: 1, origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
            };
      },
    });

    expect(calls).toBe(2);
    expect(document.sections[1].content).toHaveLength(2);
    expect(result.metrics.actualPages).toBe(2);
    expect(contract.extensionTargetUnmet).toBe(false);
    expect(result.warnings).toContain('EXTENSION_PROVIDER_UNAVAILABLE:agravios:LOCAL_FALLBACK');
  });
});
