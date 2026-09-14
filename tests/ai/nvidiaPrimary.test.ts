import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';
import { runFastMode } from '@/lib/ai/orchestrator';

describe('BLOCK B/J — NVIDIA ONLY (4 escenarios + metadata)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => { process.env = { ...originalEnv }; vi.restoreAllMocks(); });

  it('1. NVIDIA disponible → nvidia', async () => {
    process.env.NVIDIA_API_KEY = ['test', 'nvidia', 'key'].join('-');
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'respuesta nvidia',
      latencyMs: 100,
    });
    const res = await runFastMode({ userMessage: 'test nvidia primary' });
    expect(res.provider).toBe('nvidia');
  });

  it('2. NVIDIA no disponible → local', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(false);
    const res = await runFastMode({ userMessage: 'test fallback local' });
    expect(res.provider).toBe('local');
  });

  it('3. NVIDIA falla → local', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: false,
      content: '',
      latencyMs: 100,
      errorCode: 'NVIDIA_ERROR',
    });
    const res = await runFastMode({ userMessage: 'test nvidia fail' });
    expect(res.provider).toBe('local');
  });

  it('4. NVIDIA funciona → no fallback innecesario', async () => {
    let localCalled = false;
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'ok',
      latencyMs: 100,
    });
    const { LocalProvider } = await import('@/lib/ai/providers/local');
    vi.spyOn(LocalProvider.prototype, 'generate').mockImplementation(async () => {
      localCalled = true;
      return { provider: 'local', model: 'local-static', success: true, content: 'should not', latencyMs: 0 };
    });
    const res = await runFastMode({ userMessage: 'test no fallback' });
    expect(res.provider).toBe('nvidia');
    expect(localCalled).toBe(false);
  });

  it('5. metadata sin leakage', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'isAvailable').mockResolvedValue(true);
    vi.spyOn(NVIDIAProvider.prototype, 'generate').mockResolvedValue({
      provider: 'nvidia',
      model: 'meta/llama-3.2-11b-vision-instruct',
      success: true,
      content: 'contenido',
      latencyMs: 50,
    });
    const res = await runFastMode({ userMessage: 'metadata' });
    expect(res.provider).toBe('nvidia');
    expect(JSON.stringify(res)).not.toMatch(/nvapi-/i);
  });
});
