import { describe, expect, it } from 'vitest';
import { reconcileSectionWordAccounting } from '@/lib/legal-engine/generationWordReconciliation';

function balancedFixture() {
  return {
    sectionId: 'sec-main',
    accountingSchemaVersion: 2,
    plannedWords: 12,
    providerGeneratedWords: 10,
    providerGeneratedChars: 60,
    validatedWords: 8,
    rejectedWords: 2,
    dedupRemovedWords: 2,
    materializedWords: 6,
    admittedWords: 6,
    assembledWords: 5,
    exportedWords: 4,
    losses: [
      { lossId: 'sec-main:1', stage: 'provider-validation', reason: 'INVALID_OUTPUT', words: 2 },
      { lossId: 'sec-main:2', stage: 'deduplication', reason: 'DUPLICATE_BLOCK', words: 2 },
      { lossId: 'sec-main:3', stage: 'assembly', reason: 'ASSEMBLY_EXCLUDED', words: 1 },
      { lossId: 'sec-main:4', stage: 'export', reason: 'EXPORT_OMITTED', words: 1 },
    ],
  };
}

describe('generation word accounting reconciliation', () => {
  it('reconciles each adjacent stage using unique loss IDs without double counting rejection plus dedup', () => {
    const result = reconcileSectionWordAccounting(balancedFixture());
    expect(result.consistent).toBe(true);
    expect(result.transitions.map((transition) => transition.residualWords)).toEqual([0, 0, 0, 0, 0]);
    expect(result.uniqueLossWords).toBe(6);
  });

  it('reports unexplained generated-to-validated and assembled-to-exported residues instead of assigning reasons', () => {
    const fixture = balancedFixture();
    fixture.providerGeneratedWords = 11;
    fixture.assembledWords = 7;
    const result = reconcileSectionWordAccounting(fixture);
    expect(result.consistent).toBe(false);
    expect(result.transitions[0]).toMatchObject({
      from: 'providerGeneratedWords', to: 'validatedWords', residualWords: 1, reasonCode: 'UNEXPLAINED_WORD_RESIDUE',
    });
    expect(result.transitions[4]).toMatchObject({
      from: 'assembledWords', to: 'exportedWords', residualWords: 2, reasonCode: 'UNEXPLAINED_WORD_RESIDUE',
    });
  });

  it('fails closed when a stage counter is absent or a loss ID is duplicated', () => {
    const fixture = balancedFixture();
    delete (fixture as Partial<typeof fixture>).admittedWords;
    fixture.losses.push({ ...fixture.losses[0]!, reason: 'SECOND_LOSS_WITH_DUPLICATE_ID' });
    const result = reconcileSectionWordAccounting(fixture);
    expect(result.consistent).toBe(false);
    expect(result.missingCounters).toContain('admittedWords');
    expect(result.errors).toContain('DUPLICATE_LOSS_ID:sec-main:1');
  });
});
