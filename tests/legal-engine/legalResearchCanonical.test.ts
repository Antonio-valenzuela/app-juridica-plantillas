import { describe, expect, it } from 'vitest';
import {
  canonicalizeResearchValue,
  sha256ResearchValue,
  stableResearchId,
} from '@/lib/legal-engine/legal-research/canonical';

describe('legal research canonicalization', () => {
  it('sorts object keys recursively but preserves non-ID array order', () => {
    expect(canonicalizeResearchValue({ b: 2, a: [{ z: 1, y: 2 }] }))
      .toEqual({ a: [{ y: 2, z: 1 }], b: 2 });
  });

  it('sorts arrays whose key ends in Ids', () => {
    expect(canonicalizeResearchValue({ authorityIds: ['b', 'a'] }))
      .toEqual({ authorityIds: ['a', 'b'] });
  });

  it('does not use time or randomness in stable IDs', () => {
    expect(stableResearchId('request', { issueId: 'i-1', coverageItemIds: ['c-2', 'c-1'] }))
      .toBe(stableResearchId('request', { coverageItemIds: ['c-1', 'c-2'], issueId: 'i-1' }));
  });

  it('produces the same SHA-256 for semantically identical canonical values', async () => {
    await expect(sha256ResearchValue({ a: 1, b: 2 }))
      .resolves.toBe(await sha256ResearchValue({ b: 2, a: 1 }));
  });

  it('keeps an authority hash deterministic when retrieval timestamps change', async () => {
    const semanticAuthority = {
      canonicalCitation: 'ARTICULO 14',
      sourceHash: 'source-hash-1',
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    };
    const first = await sha256ResearchValue(semanticAuthority);
    const second = await sha256ResearchValue({
      ...semanticAuthority,
      retrievedAt: '2026-01-02T00:00:00.000Z',
      checkedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(first).toBe(second);
  });
});
