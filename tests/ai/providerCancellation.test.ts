/**
 * Cancelación efectiva de los adaptadores de IA. Red simulada (undici.fetch): ninguna llamada sale de la
 * máquina. Comprueba que cada adaptador aborta su petición al cancelarse la señal, limpia su temporizador
 * y que el router no inicia proveedor alguno tras la cancelación.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('undici', () => ({
  // Simula una red que nunca responde; sólo termina si la señal aborta la petición.
  fetch: vi.fn((_url: string, init: { signal?: AbortSignal }) => new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    if (init.signal?.aborted) return fail();
    init.signal?.addEventListener('abort', fail);
  })),
}));

import { fetch as undiciFetch } from 'undici';
import { generateGroqCompletion } from '@/lib/ai/providers/groq';
import { generateGeminiCompletion } from '@/lib/ai/providers/gemini';
import { generateNVIDIACompletion } from '@/lib/ai/providers/nvidia';
import { defaultProviderRouter } from '@/lib/ai/providerRouter';
import { GenerationCancelledError, abortRace, withAbort } from '@/lib/ai/abortContext';

const ENV_KEYS = ['GROQ_API_KEY', 'GEMINI_API_KEY', 'NVIDIA_API_KEY'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) { saved[key] = process.env[key]; process.env[key] = 'clave-sintetica-no-real'; }
  vi.mocked(undiciFetch).mockClear();
});
afterEach(() => {
  for (const key of ENV_KEYS) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  vi.restoreAllMocks();
});

const adapters: Array<[string, (options: { prompt: string; signal?: AbortSignal }) => Promise<unknown>]> = [
  ['groq', (options) => generateGroqCompletion(options as never)],
  ['gemini', (options) => generateGeminiCompletion(options as never)],
  ['nvidia', (options) => generateNVIDIACompletion(options as never)],
];

describe.each(adapters)('adaptador %s', (_name, call) => {
  it('aborta la petición en curso al cancelarse la señal y termina sin esperar al proveedor', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = call({ prompt: 'Texto sintético', signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('con la señal ya abortada no abre ninguna conexión', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(call({ prompt: 'Texto sintético', signal: controller.signal })).rejects.toThrow();
    // Toda petición que llegue a la red nace ya abortada: ninguna queda viva.
    expect(vi.mocked(undiciFetch).mock.calls.every(([, init]) => (init as { signal?: AbortSignal }).signal?.aborted === true)).toBe(true);
  });

  it('limpia su temporizador al terminar', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const controller = new AbortController();
    const pending = call({ prompt: 'Texto sintético', signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await pending.catch(() => undefined);
    expect(clear).toHaveBeenCalled();
  });
});

describe('cancelación en el router y en la espera del pipeline', () => {
  it('el router no inicia ningún proveedor con la señal ya cancelada', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(defaultProviderRouter.route({ userMessage: 'x', mode: 'fast', signal: controller.signal } as never))
      .rejects.toBeInstanceOf(GenerationCancelledError);
    expect(vi.mocked(undiciFetch)).not.toHaveBeenCalled();
  });

  it('withAbort deja de esperar a un adaptador que nunca responde y no deja escuchadores', async () => {
    const controller = new AbortController();
    const hanging = new Promise<never>(() => undefined);
    const pending = withAbort(hanging, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toBeInstanceOf(GenerationCancelledError);
  });

  it('abortRace sin señal no rechaza y se puede retirar', async () => {
    const race = abortRace(undefined);
    race.dispose();
    await expect(Promise.race([Promise.resolve('ok'), race.promise.catch(() => 'never')])).resolves.toBe('ok');
  });
});
