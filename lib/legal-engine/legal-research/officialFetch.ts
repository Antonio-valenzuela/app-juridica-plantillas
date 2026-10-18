/**
 * Envoltorio de `fetch` para fuentes oficiales: reintentos acotados con backoff, respeto a
 * `Retry-After`, intervalo mínimo por host y detección de controles anti-bot.
 *
 * Un desafío anti-bot (Incapsula, Radware/perfdrive, CAPTCHA) NO se reintenta ni se elude: se
 * reporta como `OFFICIAL_SOURCE_ANTIBOT_PROTECTED` para que la fuente pase a consulta manual.
 */

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OfficialRetryOptions {
  /** Reintentos adicionales tras el primer intento (por defecto 2). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Separación mínima entre peticiones al mismo host (por defecto 250 ms). */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const OFFICIAL_ANTIBOT_ERROR = 'OFFICIAL_SOURCE_ANTIBOT_PROTECTED';
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const ANTIBOT_LOCATION = /perfdrive\.com|validate\.perfdrive|_Incapsula_Resource|captcha/i;
const ANTIBOT_BODY = /_Incapsula_Resource|perfdrive\.com|botmanager|g-recaptcha|hcaptcha/i;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function hostOf(input: RequestInfo | URL): string {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw).host;
  } catch {
    return '';
  }
}

/** Milisegundos indicados por `Retry-After` (segundos o fecha HTTP), o null. */
export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

async function looksLikeAntibot(response: Response): Promise<boolean> {
  const location = response.headers.get('location');
  if (location && ANTIBOT_LOCATION.test(location)) return true;
  if (response.url && ANTIBOT_LOCATION.test(response.url)) return true;
  const cookies = response.headers.get('set-cookie') || '';
  if (/incap_ses|visid_incap/i.test(cookies) && response.status >= 300) return true;
  const type = response.headers.get('content-type') || '';
  if (!/text\/html/i.test(type) || typeof response.clone !== 'function') return false;
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 50_000) return false;
  try {
    const body = await response.clone().text();
    return body.length < 50_000 && ANTIBOT_BODY.test(body);
  } catch {
    return false;
  }
}

export function withOfficialRetry(fetcher: FetchLike, options: OfficialRetryOptions = {}): FetchLike {
  const retries = Math.max(0, Math.min(options.retries ?? 2, 5));
  const baseDelayMs = options.baseDelayMs ?? 400;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const minIntervalMs = options.minIntervalMs ?? 250;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const lastRequestAt = new Map<string, number>();

  const pace = async (host: string) => {
    if (!host || minIntervalMs <= 0) return;
    const previous = lastRequestAt.get(host);
    const wait = previous === undefined ? 0 : previous + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, now());
  };

  return async (input, init) => {
    const host = hostOf(input);
    for (let attempt = 0; ; attempt += 1) {
      await pace(host);
      let response: Response;
      try {
        response = await fetcher(input, init);
      } catch (error) {
        // Un aborto (tiempo agotado del llamador) o el último intento se propagan sin cambios.
        if (init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError') || attempt >= retries) throw error;
        await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
        continue;
      }
      if (await looksLikeAntibot(response)) throw new Error(OFFICIAL_ANTIBOT_ERROR);
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) return response;
      const hinted = parseRetryAfter(response.headers.get('retry-after'), now());
      // Si la fuente pide esperar más que el máximo, se respeta devolviendo la respuesta (no se insiste).
      if (hinted !== null && hinted > maxDelayMs) return response;
      await sleep(hinted ?? Math.min(maxDelayMs, baseDelayMs * 2 ** attempt));
    }
  };
}
