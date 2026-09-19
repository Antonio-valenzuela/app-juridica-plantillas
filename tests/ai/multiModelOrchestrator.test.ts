import { describe, expect, it, vi } from 'vitest';
import { runFastMode, runDeepReviewMode, getProvidersStatus } from '@/lib/ai/orchestrator';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';

describe('Arquitectura NVIDIA ONLY (Fast vs Deep Review)', () => {
  it('Modo Rápido: NVIDIA disponible → nvidia', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'Respuesta NVIDIA',
      latencyMs: 100,
    });
    const res = await runFastMode({ userMessage: 'test' });
    expect(res.provider).toBe('nvidia');
    vi.restoreAllMocks();
  });

  it('Modo Rápido: NVIDIA falla → local', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: false,
      content: '',
      latencyMs: 50,
      errorCode: 'NVIDIA_ERROR',
    });
    const res = await runFastMode({ userMessage: 'fallback' });
    expect(res.provider).toBe('local');
    vi.restoreAllMocks();
  });

  it('Modo Rápido: NVIDIA no disponible → local', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(false);
    const res = await runFastMode({ userMessage: 'no nvidia' });
    expect(res.provider).toBe('local');
    vi.restoreAllMocks();
  });

  it('Deep Review: NVIDIA → judge NVIDIA', async () => {
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
    expect(deep.providerSummary.judgeCompleted).toBe(true);
    vi.restoreAllMocks();
  });

  it('Deep Review: NVIDIA falla → local consolidator', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(false);
    const deep = await runDeepReviewMode({ userMessage: 'deep fail', mode: 'deep' });
    expect(deep.providerSummary.fallbackUsed).toBe(true);
    expect(deep.providerSummary.nvidiaCompleted).toBe(false);
    vi.restoreAllMocks();
  });

  it('getProvidersStatus incluye nvidia + local', async () => {
    const statuses = await getProvidersStatus();
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    const ids = statuses.map((s) => s.provider);
    expect(ids).toContain('nvidia');
    expect(ids).toContain('local');
  });
});
