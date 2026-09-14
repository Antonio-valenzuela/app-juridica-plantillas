import { describe, expect, it } from 'vitest';
import { deduplicateRichItems } from '@/lib/legal-engine/case-extraction/deduplication';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { CaseParty, DocumentItem, SourceProvenance } from '@/lib/legal-engine/case-extraction/types';

function provenance(sourceId: string): SourceProvenance {
  return createSourceProvenance({ sourceId, excerpt: 'contrato', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' });
}

function documentItem(title: string, sourceId: string): DocumentItem {
  return { id: `doc-${sourceId}`, title, status: 'SOURCE_MENTIONED', provenance: [provenance(sourceId)] };
}

function partyItem(name: string): CaseParty {
  return { id: `party-${name}`, name, role: 'ACTOR', aliases: [], provenance: [provenance(name)], confidence: 0.8, confirmed: false };
}

describe('deduplicateRichItems', () => {
  it('merges the same document mention while preserving both sources', () => {
    const result = deduplicateRichItems([
      documentItem('contrato', 'src-a'),
      documentItem('contrato', 'src-b'),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].provenance.map((p) => p.sourceId).sort()).toEqual(['src-a', 'src-b']);
    expect(result.mergedCount).toBe(1);
  });

  it('does not fuzzy-merge similar person names', () => {
    const result = deduplicateRichItems([partyItem('Ana López'), partyItem('Ana L. López')]);

    expect(result.items).toHaveLength(2);
    expect(result.mergeReasons).toContain('IDENTITY_SIMILARITY_REQUIRES_REVIEW');
  });
});
