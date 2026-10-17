/**
 * Lote 2 — redacción con modelo apto y degradación explícita. Red simulada (undici): ninguna llamada real.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('undici', () => ({
  fetch: vi.fn(async () => ({
    ok: false, status: 429, headers: { get: () => null }, text: async () => 'rate limited', json: async () => ({}),
  })),
}));

import { fetch as undiciFetch } from 'undici';
import { generateGroqCompletion } from '@/lib/ai/providers/groq';
import { pageTargetRequestField } from '@/lib/legal-engine/pageTargetRequest';
import { evaluatePageTarget } from '@/lib/legal-engine/pageTarget';

const LIMITED_FALLBACK_MODEL = 'openai/gpt-oss-120b';

beforeEach(() => {
  process.env.GROQ_API_KEY = 'clave-sintetica-no-real';
  vi.mocked(undiciFetch).mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('redacción con modelo apto (proveedor Groq, red simulada)', () => {
  it('en redacción, un 429 del modelo principal NO pasa al modelo de respaldo no apto: PROVIDER_DEGRADED', async () => {
    await expect(generateGroqCompletion({ prompt: 'Texto sintético', drafting: true } as never))
      .rejects.toMatchObject({ code: 'PROVIDER_DEGRADED' });
    const models = vi.mocked(undiciFetch).mock.calls.map(([, init]) => JSON.parse(String((init as { body: string }).body)).model);
    expect(models).not.toContain(LIMITED_FALLBACK_MODEL);
    expect(vi.mocked(undiciFetch)).toHaveBeenCalledTimes(1);
  });

  it('fuera de redacción se conserva el comportamiento previo de respaldo', async () => {
    await expect(generateGroqCompletion({ prompt: 'Texto sintético' } as never)).rejects.toBeDefined();
    const models = vi.mocked(undiciFetch).mock.calls.map(([, init]) => JSON.parse(String((init as { body: string }).body)).model);
    expect(models).toContain(LIMITED_FALLBACK_MODEL);
  });
});

describe('causas de timeout y fallo de medición en la explicación de la meta', () => {
  it('TIMEOUT tiene explicación propia, no genérica', () => {
    const result = evaluatePageTarget({ preset: 'EXTENSO', pages: 40 }, 12, undefined, 'TIMEOUT');
    expect(result.outcome).toBe('BELOW_TARGET');
    expect(result.notice).toContain('tiempo máximo');
  });

  it('MEASUREMENT_FAILED tiene explicación propia', () => {
    const result = evaluatePageTarget({ preset: 'EXTENSO', pages: 40 }, 12, undefined, 'MEASUREMENT_FAILED');
    expect(result.notice).toContain('medir');
  });

  it('el campo de la solicitud sigue siendo el mismo contrato (sin regresión)', () => {
    expect(pageTargetRequestField({ preset: 'EXTENSO', pages: 40 })).toEqual({ pageTarget: { preset: 'EXTENSO', pages: 40 } });
  });
});
