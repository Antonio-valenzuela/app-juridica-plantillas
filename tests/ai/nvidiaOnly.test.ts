import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runLegalAI, runFastMode, runDeepReviewMode, getProvidersStatus } from '@/lib/ai/orchestrator';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';
import { LocalProvider } from '@/lib/ai/providers/local';

describe('J9 NVIDIA ONLY — sin Gemini/Groq/OpenRouter', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AI_PROVIDER_CHAIN = 'nvidia,local';
    process.env.NVIDIA_PRIMARY_PROVIDER = 'true';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('1. NVIDIA disponible → provider=nvidia', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'respuesta nvidia',
      latencyMs: 100,
    });
    const res = await runLegalAI({ userMessage: 'test' });
    expect(res.provider).toBe('nvidia');
    expect(res.success).toBe(true);
    vi.restoreAllMocks();
  });

  it('2. NVIDIA falla → local fallback', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: false,
      content: '',
      latencyMs: 100,
      errorCode: 'NVIDIA_ERROR',
    });
    const res = await runFastMode({ userMessage: 'test fallback' });
    expect(res.provider).toBe('local');
    expect(res.success).toBe(true);
    vi.restoreAllMocks();
  });

  it('3. NVIDIA timeout → local fallback', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockImplementation(async () => {
      throw new Error('timeout');
    });
    const res = await runFastMode({ userMessage: 'timeout test' });
    expect(res.provider).toBe('local');
    vi.restoreAllMocks();
  });

  it('4. NVIDIA metadata correcta y sin leakage', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'contenido',
      latencyMs: 50,
    });
    const res = await runLegalAI({ userMessage: 'metadata' });
    expect(res.provider).toBe('nvidia');
    expect(res.model).toBe('meta/llama-3.2-11b-vision-instruct');
    expect(JSON.stringify(res)).not.toMatch(/nvapi-/i);
    vi.restoreAllMocks();
  });

  it('5. Deep Review usa NVIDIA (single provider)', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: JSON.stringify({
        summary: 'Resumen NVIDIA',
        overallRisk: 'low',
        issues: [],
        missingFields: [],
        contradictions: [],
        unsupportedClaims: [],
        recommendedActions: [],
        sourcesUsed: [],
      }),
      latencyMs: 100,
    });
    const deep = await runDeepReviewMode({ userMessage: 'deep', mode: 'deep' });
    expect(deep.providerSummary.nvidiaCompleted).toBe(true);
    expect(deep.providerSummary.fallbackUsed).toBe(false);
    vi.restoreAllMocks();
  });

  it('6. Router delega a runLegalAI (no selección duplicada)', async () => {
    // Verifica que router's getProviderChain ahora solo retorna nvidia,local
    const { getProviderChain } = await import('@/lib/ai/providerChain');
    expect(getProviderChain()).toEqual(['nvidia', 'local']);
  });

  it('7. No existen imports secundarios desde UI/legal-engine', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('app/machotes/page.tsx', 'utf-8');
    expect(content).not.toMatch(/GeminiProvider|GroqProvider|OpenRouterProvider/);
    const orch = fs.readFileSync('lib/ai/orchestrator.ts', 'utf-8');
    expect(orch).not.toMatch(/GeminiProvider|GroqProvider|OpenRouterProvider/);
    expect(orch).toMatch(/NVIDIAProvider/);
  });

  it('8. getProvidersStatus solo nvidia + local', async () => {
    const statuses = await getProvidersStatus();
    expect(statuses.length).toBe(2);
    const ids = statuses.map((s) => s.provider);
    expect(ids).toContain('nvidia');
    expect(ids).toContain('local');
    expect(ids).not.toContain('gemini');
    expect(ids).not.toContain('groq');
  });
});
