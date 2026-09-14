import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryResearchCache,
  getOrVerifyResearchResult,
  makeResearchCacheKey,
} from '@/lib/legal-engine/legal-research/cache';

const keyInput = {
  normalizedQuery: 'art 14',
  regimeHash: 'r1',
  adapterId: 'FIXTURE_OFFICIAL',
  adapterVersion: '1',
  relevantDate: '2024',
  temporalPrecision: 'YEAR' as const,
};

describe('legal research cache', () => {
  it('uses query, regime, adapter, source, date, and precision in the key', () => {
    const left = makeResearchCacheKey(keyInput);
    const right = makeResearchCacheKey({ ...keyInput, regimeHash: 'r2' });

    expect(left).not.toBe(right);
  });

  it('runs verification again on a cache hit when temporal validation is required', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: true });
    const cache = createMemoryResearchCache();
    const candidateResult = { candidateId: 'candidate-1', sourceHash: 'source-1' };
    const key = makeResearchCacheKey(keyInput);

    await getOrVerifyResearchResult({
      cache,
      key,
      load: async () => candidateResult,
      verify,
      temporalRevalidationRequired: true,
    });
    await getOrVerifyResearchResult({
      cache,
      key,
      load: async () => { throw new Error('must not load'); },
      verify,
      temporalRevalidationRequired: true,
    });

    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('serves a stable hit without reloading or re-verifying when policy allows it', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: true });
    const load = vi.fn().mockResolvedValue({ candidateId: 'candidate-1' });
    const cache = createMemoryResearchCache();
    const key = makeResearchCacheKey(keyInput);

    await getOrVerifyResearchResult({ cache, key, load, verify, temporalRevalidationRequired: false });
    const result = await getOrVerifyResearchResult({
      cache,
      key,
      load: async () => { throw new Error('must not load'); },
      verify,
      temporalRevalidationRequired: false,
    });

    expect(result).toEqual({ verified: true });
    expect(load).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('retains verification metadata in memory without persistence', async () => {
    const cache = createMemoryResearchCache();
    const key = makeResearchCacheKey(keyInput);
    await getOrVerifyResearchResult({
      cache,
      key,
      load: async () => ({ candidateId: 'candidate-1' }),
      verify: async () => ({ verified: true }),
      metadata: {
        sourceHash: 'source-hash-1',
        temporalStatus: 'CURRENT_AND_APPLICABLE',
        retrievedAt: '2026-01-01T00:00:00.000Z',
      },
    });

    expect(cache.get(key)?.metadata.sourceHash).toBe('source-hash-1');
    expect(cache.size()).toBe(1);
  });
});
