import { describe, expect, it } from 'vitest';
import { OFFICIAL_ANTIBOT_ERROR, parseRetryAfter, withOfficialRetry } from '@/lib/legal-engine/legal-research/officialFetch';
import { createMemoryResearchCache } from '@/lib/legal-engine/legal-research/cache';
import { OFFICIAL_SOURCE_REGISTRY, manualConsultationSources } from '@/lib/legal-engine/legal-research/officialSourceRegistry';

/** Todas las respuestas son simuladas: ninguna petición sale de la máquina. */
function scripted(responses: Array<Response | Error>) {
  const calls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error('sin respuesta simulada');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetcher, calls };
}

const fakeClock = () => {
  let t = 1_000_000;
  const waits: number[] = [];
  return { now: () => t, sleep: async (ms: number) => { waits.push(ms); t += ms; }, waits };
};

describe('withOfficialRetry', () => {
  it('reintenta 503 con backoff exponencial y devuelve el éxito', async () => {
    const { fetcher, calls } = scripted([new Response('', { status: 503 }), new Response('', { status: 503 }), new Response('ok', { status: 200 })]);
    const clock = fakeClock();
    const response = await withOfficialRetry(fetcher, { ...clock, minIntervalMs: 0 })('https://fuente.invalid/x');
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
    expect(clock.waits).toEqual([400, 800]);
  });

  it('respeta Retry-After en 429', async () => {
    const { fetcher } = scripted([new Response('', { status: 429, headers: { 'retry-after': '3' } }), new Response('ok')]);
    const clock = fakeClock();
    await withOfficialRetry(fetcher, { ...clock, minIntervalMs: 0 })('https://fuente.invalid/x');
    expect(clock.waits).toEqual([3000]);
  });

  it('no insiste si la fuente pide esperar más que el máximo', async () => {
    const { fetcher, calls } = scripted([new Response('', { status: 429, headers: { 'retry-after': '600' } })]);
    const response = await withOfficialRetry(fetcher, { ...fakeClock(), minIntervalMs: 0 })('https://fuente.invalid/x');
    expect(response.status).toBe(429);
    expect(calls).toHaveLength(1);
  });

  it('no reintenta errores 4xx ni abortos del llamador', async () => {
    const notFound = scripted([new Response('', { status: 404 })]);
    expect((await withOfficialRetry(notFound.fetcher, { ...fakeClock(), minIntervalMs: 0 })('https://fuente.invalid/x')).status).toBe(404);
    expect(notFound.calls).toHaveLength(1);

    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const aborted = scripted([abort]);
    await expect(withOfficialRetry(aborted.fetcher, { ...fakeClock(), minIntervalMs: 0 })('https://fuente.invalid/x')).rejects.toThrow('aborted');
    expect(aborted.calls).toHaveLength(1);
  });

  it('detecta desafíos anti-bot y se detiene sin reintentar', async () => {
    const incapsula = scripted([new Response('<html><script src="/_Incapsula_Resource?x=1"></script></html>', { status: 200, headers: { 'content-type': 'text/html' } })]);
    await expect(withOfficialRetry(incapsula.fetcher, { ...fakeClock(), minIntervalMs: 0 })('https://fuente.invalid/x')).rejects.toThrow(OFFICIAL_ANTIBOT_ERROR);
    expect(incapsula.calls).toHaveLength(1);

    const radware = scripted([new Response('', { status: 301, headers: { location: 'https://validate.perfdrive.com/abc' } })]);
    await expect(withOfficialRetry(radware.fetcher, { ...fakeClock(), minIntervalMs: 0 })('https://fuente.invalid/x')).rejects.toThrow(OFFICIAL_ANTIBOT_ERROR);
  });

  it('separa las peticiones al mismo host', async () => {
    const { fetcher } = scripted([new Response('a'), new Response('b')]);
    const clock = fakeClock();
    const paced = withOfficialRetry(fetcher, { ...clock, minIntervalMs: 250 });
    await paced('https://fuente.invalid/a');
    await paced('https://fuente.invalid/b');
    expect(clock.waits).toEqual([250]);
  });

  it('interpreta Retry-After en segundos o fecha HTTP', () => {
    expect(parseRetryAfter('2', 0)).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(parseRetryAfter('basura', 0)).toBeNull();
  });
});

describe('caché de investigación con caducidad', () => {
  it('expira las entradas pasado el TTL', () => {
    let t = 0;
    const cache = createMemoryResearchCache({ ttlMs: 1000, now: () => t });
    cache.set('k', { candidate: null, result: 'r', metadata: {} });
    t = 999;
    expect(cache.get('k')?.result).toBe('r');
    t = 1000;
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});

describe('registro de fuentes oficiales', () => {
  it('las fuentes con anti-bot quedan como consulta manual con enlace oficial', () => {
    const manual = manualConsultationSources().map((entry) => entry.sourceId);
    expect(manual).toEqual(expect.arrayContaining(['SCJN_SJF_TESIS', 'SCJN_BUSCADOR_JURIDICO', 'TEPJF_IUS_ELECTORAL']));
    for (const entry of manualConsultationSources()) {
      expect(entry.adapterId, entry.sourceId).toBeNull();
      expect(entry.manualUrl, entry.sourceId).toMatch(/^https:\/\/[^/]*\.gob\.mx\//);
    }
  });

  it('las fuentes no oficiales nunca se marcan como oficiales', () => {
    for (const entry of OFFICIAL_SOURCE_REGISTRY.filter((item) => /no oficial/.test(item.institution))) {
      expect(entry.access, entry.sourceId).toBe('SECONDARY_UNOFFICIAL');
    }
    for (const entry of OFFICIAL_SOURCE_REGISTRY.filter((item) => item.access !== 'SECONDARY_UNOFFICIAL')) {
      expect(entry.manualUrl, entry.sourceId).toMatch(/\.gob\.mx\//);
    }
  });
});
