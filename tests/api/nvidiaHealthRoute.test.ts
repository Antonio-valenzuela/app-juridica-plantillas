import { describe, expect, it, vi } from 'vitest';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';
import { GET } from '@/app/api/health/nvidia/route';

describe('GET /api/health/nvidia', () => {
  it('devuelve 200 y ok=true cuando NVIDIA está disponible', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'healthCheck').mockResolvedValue({
      provider: 'nvidia',
      configured: true,
      available: true,
      model: 'test-model',
      lastCheckAt: '2026-09-24T00:00:00.000Z',
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, provider: 'nvidia', available: true });
    vi.restoreAllMocks();
  });

  it('devuelve 503 y ok=false cuando NVIDIA no está disponible', async () => {
    vi.spyOn(NVIDIAProvider.prototype, 'healthCheck').mockResolvedValue({
      provider: 'nvidia',
      configured: true,
      available: false,
      model: 'test-model',
      lastCheckAt: '2026-09-24T00:00:00.000Z',
      lastError: 'API caída',
    });

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, provider: 'nvidia', available: false });
    vi.restoreAllMocks();
  });
});
