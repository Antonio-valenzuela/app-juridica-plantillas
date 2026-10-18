import { stableResearchId } from './canonical';

export interface ResearchCacheKeyInput {
  normalizedQuery: string;
  regimeHash: string;
  adapterId: string;
  adapterVersion: string;
  sourceId?: string;
  sourceHash?: string;
  relevantDate?: string;
  temporalPrecision?: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
}

export type ResearchCacheKey = string;

export interface ResearchCacheMetadata {
  sourceHash?: string;
  temporalStatus?: string;
  retrievedAt?: string;
}

export interface ResearchCacheEntry {
  candidate: unknown;
  result: unknown;
  metadata: ResearchCacheMetadata;
}

export interface ResearchCache {
  get(key: ResearchCacheKey): ResearchCacheEntry | undefined;
  set(key: ResearchCacheKey, entry: ResearchCacheEntry): void;
  clear(): void;
  size(): number;
}

export function makeResearchCacheKey(input: ResearchCacheKeyInput): ResearchCacheKey {
  return stableResearchId('research-cache', {
    normalizedQuery: input.normalizedQuery,
    regimeHash: input.regimeHash,
    adapterId: input.adapterId,
    adapterVersion: input.adapterVersion,
    sourceId: input.sourceId,
    sourceHash: input.sourceHash,
    relevantDate: input.relevantDate,
    temporalPrecision: input.temporalPrecision,
  });
}

/** Vigencia por defecto de un resultado de investigación: las fuentes oficiales cambian (reformas, nuevas tesis). */
export const DEFAULT_RESEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function createMemoryResearchCache(options: { ttlMs?: number; now?: () => number } = {}): ResearchCache {
  const ttlMs = options.ttlMs ?? DEFAULT_RESEARCH_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<ResearchCacheKey, { entry: ResearchCacheEntry; storedAt: number }>();
  const expired = (storedAt: number) => ttlMs > 0 && now() - storedAt >= ttlMs;
  return {
    get: (key) => {
      const stored = entries.get(key);
      if (!stored) return undefined;
      if (expired(stored.storedAt)) { entries.delete(key); return undefined; }
      return stored.entry;
    },
    set: (key, entry) => { entries.set(key, { entry, storedAt: now() }); },
    clear: () => entries.clear(),
    size: () => { for (const [key, stored] of entries) if (expired(stored.storedAt)) entries.delete(key); return entries.size; },
  };
}

export interface GetOrVerifyResearchResultInput<TCandidate, TResult> {
  cache: ResearchCache;
  key: ResearchCacheKey;
  load: () => Promise<TCandidate>;
  verify: (candidate: TCandidate) => Promise<TResult>;
  temporalRevalidationRequired?: boolean;
  regimeRevalidationRequired?: boolean;
  metadata?: ResearchCacheMetadata;
}

export async function getOrVerifyResearchResult<TCandidate, TResult>(
  input: GetOrVerifyResearchResultInput<TCandidate, TResult>,
): Promise<TResult> {
  const cached = input.cache.get(input.key);
  const mustRevalidate = Boolean(input.temporalRevalidationRequired || input.regimeRevalidationRequired);
  if (cached && !mustRevalidate) return cached.result as TResult;

  const candidate = cached ? cached.candidate as TCandidate : await input.load();
  const result = await input.verify(candidate);
  input.cache.set(input.key, {
    candidate,
    result,
    metadata: input.metadata || cached?.metadata || {},
  });
  return result;
}
