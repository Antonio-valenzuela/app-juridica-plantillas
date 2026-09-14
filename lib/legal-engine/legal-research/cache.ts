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

export function createMemoryResearchCache(): ResearchCache {
  const entries = new Map<ResearchCacheKey, ResearchCacheEntry>();
  return {
    get: (key) => entries.get(key),
    set: (key, entry) => entries.set(key, entry),
    clear: () => entries.clear(),
    size: () => entries.size,
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
