import { describe, expect, it } from 'vitest';
import { expandDocumentToPageTarget } from '@/lib/legal-engine/generationExpansion';
import { resolveGenerationExtensionContract } from '@/lib/legal-engine/generationExtension';
import { runWithGenerationDeadline } from '@/lib/legal-engine/generationDeadline';

// Documento sintético sin draftDepth ni pageTarget: usa el bucle de ampliación general.
function syntheticDocument() {
  return {
    documentType: 'contestacion_demanda_civil',
    documentTypeLabel: 'Contestación civil',
    sourceDocuments: [{ id: 'source-1' }],
    generationMetadata: { generationId: 'cancellation-test' },
    sections: [
      { id: 'section-1', title: 'Contestación de hechos', type: 'argument', order: 0, content: [{ id: 'b1', text: 'Base uno' }] },
      { id: 'section-2', title: 'Excepciones', type: 'argument', order: 1, content: [{ id: 'b2', text: 'Base dos' }] },
    ],
  } as any;
}

const measureFewPages = async () => ({ actualPages: 1, wordCount: 10, characterCount: 60, pdfBytes: 100 }) as any;

const providerResponse = (content: string) => ({
  provider: 'groq', model: 'test-model', success: true, content, latencyMs: 1,
  origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
}) as any;

function contract(overrides: Record<string, unknown> = {}) {
  return resolveGenerationExtensionContract({
    generationMode: 'extended-legal',
    targetPages: 10,
    minPages: 10,
    maxPages: 12,
    maxCallsPerDocument: 5,
    maxExpansionPasses: 4,
    ...overrides,
  } as any);
}

describe('cancelación cooperativa de la ampliación', () => {
  it('con la señal ya abortada no se realiza ninguna llamada al proveedor', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    await expandDocumentToPageTarget(syntheticDocument(), undefined, contract(), {
      measure: measureFewPages,
      signal: controller.signal,
      invokeProvider: async () => { calls += 1; return providerResponse('Texto nuevo.'); },
    });
    expect(calls).toBe(0);
  });

  it('tras la cancelación no se inicia ninguna llamada nueva', async () => {
    const controller = new AbortController();
    let calls = 0;
    await expandDocumentToPageTarget(syntheticDocument(), undefined, contract(), {
      measure: measureFewPages,
      signal: controller.signal,
      invokeProvider: async () => {
        calls += 1;
        controller.abort();
        return providerResponse('Texto nuevo.');
      },
    });
    expect(calls).toBe(1);
  });
});

describe('límite global de llamadas por documento', () => {
  it('cuenta las llamadas de la redacción inicial: con el presupuesto casi agotado solo cabe una ampliación', async () => {
    const c = contract({ maxCallsPerDocument: 3 });
    c.metrics.llmCalls = 2; // redacción inicial ya consumió dos llamadas
    let calls = 0;
    await expandDocumentToPageTarget(syntheticDocument(), undefined, c, {
      measure: measureFewPages,
      invokeProvider: async () => { calls += 1; return providerResponse('Texto nuevo.'); },
    });
    expect(calls).toBeLessThanOrEqual(1);
    expect(c.metrics.llmCalls).toBeLessThanOrEqual(3);
  });
});

describe('plazo de generación', () => {
  it('un proveedor lento que excede el plazo rechaza con GENERATION_TIMEOUT y deja de llamar', async () => {
    const controller = new AbortController();
    let calls = 0;
    const slowProvider = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 120)); // ignora la señal a propósito
      return providerResponse('Texto lento.');
    };
    const run = runWithGenerationDeadline(
      (signal) => expandDocumentToPageTarget(syntheticDocument(), undefined, contract(), {
        measure: measureFewPages,
        signal,
        invokeProvider: slowProvider,
      }),
      30,
      controller,
    );
    await expect(run).rejects.toMatchObject({ code: 'GENERATION_TIMEOUT' });
    expect(controller.signal.aborted).toBe(true);
    const callsAtTimeout = calls;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(calls).toBe(callsAtTimeout);
  });
});
