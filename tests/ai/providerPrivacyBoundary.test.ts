import { describe, expect, it, vi } from 'vitest';
import { ProviderRouter } from '@/lib/ai/providerRouter';
import type { AIProviderId, AIRequest, LegalAIProvider } from '@/lib/ai/providers/types';

function provider(id: AIProviderId): LegalAIProvider & { generate: ReturnType<typeof vi.fn> } {
  return {
    id,
    isAvailable: async () => true,
    generate: vi.fn(async () => ({
      provider: id,
      model: `${id}-test`,
      success: true,
      content: 'Respuesta de prueba',
      latencyMs: 0,
    })),
  };
}

describe('private case provider boundary', () => {
  it('never sends a real case to an external provider by default', async () => {
    const gemini = provider('gemini');
    const groq = provider('groq');
    const nvidia = provider('nvidia');
    const local = provider('local');
    const router = new ProviderRouter(new Map([
      ['gemini', gemini], ['groq', groq], ['nvidia', nvidia], ['local', local],
    ]), () => ['gemini', 'groq', 'nvidia', 'local']);
    const request: AIRequest = {
      userMessage: 'Expediente ficticio 123: Ana Pérez, Calle Uno 10, ana@example.test, 5512345678',
      systemPrompt: 'Analiza esta prueba privada.',
      legalContext: { sourceText: 'Contrato privado ficticio', curp: 'PEAA010101MDFABC01' },
    };

    const { result, executionLogs } = await router.route(request);

    expect(gemini.generate).not.toHaveBeenCalled();
    expect(groq.generate).not.toHaveBeenCalled();
    expect(nvidia.generate).not.toHaveBeenCalled();
    expect(result.providerActuallyUsed).toBe('local');
    expect(executionLogs.every((log) => log.provider === 'local')).toBe(true);
  });

  it('allows external providers when externalProviderOptIn is true while preserving privateCaseContext classification', async () => {
    const gemini = provider('gemini');
    const local = provider('local');
    const router = new ProviderRouter(new Map([['gemini', gemini], ['local', local]]), () => ['gemini', 'local']);
    const request: AIRequest = {
      userMessage: 'Expediente confidencial con consentimiento explícito de uso de proveedor externo',
      externalProviderOptIn: true,
      privateCaseContext: true,
    };
    const { result } = await router.route(request);

    expect(gemini.generate).toHaveBeenCalledTimes(1);
    expect(result.providerActuallyUsed).toBe('gemini');
    expect(request.privateCaseContext).toBe(true);
  });
});
