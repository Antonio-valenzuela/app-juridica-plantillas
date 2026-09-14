import { describe, expect, it } from 'vitest';
import { assessCoverageEligibility } from '@/lib/legal-engine/coverageEligibility';
import { evaluateBlockQuality } from '@/lib/legal-engine/semanticEvaluator';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { updateCoverageMatrixWithTaskResults } from '@/lib/legal-engine/generationTasks';
import type { ContentBlock } from '@/lib/legal-engine/types';
import type { CoverageMatrix, DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

describe('coverage eligibility', () => {
  it.each([
    ['[REQUIERE DEFINIR PRUEBAS]', 'AI', undefined, 'PLACEHOLDER_NOT_COVERAGE'],
    ['[DATO PENDIENTE: órgano]', 'AI', undefined, 'PLACEHOLDER_NOT_COVERAGE'],
    ['texto local', 'FALLBACK', 'LOCAL_PLACEHOLDER', 'LOCAL_FALLBACK_NOT_COVERAGE'],
    ['', 'FALLBACK', undefined, 'EMPTY_OUTPUT_NOT_COVERAGE'],
  ])('rejects %s as substantive Coverage', (text, generatedBy, fallbackStatus, reason) => {
    const result = assessCoverageEligibility(
      { text, generatedBy, fallbackStatus } as unknown as ContentBlock,
      { category: 'CLAIM' } as unknown as DocumentCoverageItem,
    );
    expect(result).toEqual({ eligible: false, reason });
  });

  it('allows non-empty deterministic content for a structural item', () => {
    const result = assessCoverageEligibility(
      { text: 'PRIMERO. Comparece la parte.', generatedBy: 'DETERMINISTIC' },
      { category: 'PROCEDURAL_REQUIREMENT', metadata: { coverageScope: 'STRUCTURAL' } },
    );
    expect(result).toEqual({ eligible: true, reason: 'VALID_STRUCTURAL_BLOCK' });
  });

  it('prevents a substantive placeholder from producing covered coverage IDs', () => {
    const evaluation = evaluateBlockQuality(
      {
        id: 'blk-placeholder',
        layer: 'GENERATED_ARGUMENT',
        text: '[DATO PENDIENTE: postura procesal]',
        generationStatus: 'generated',
      },
      {
        id: 'task-placeholder',
        sectionId: 'sec-hechos',
        sectionTitle: 'HECHOS',
        taskType: 'FACT_RESPONSE',
        complexity: 'SHORT',
        tokenBudget: 1200,
        status: 'pending',
        coverageItemIds: ['cov-fact-1'],
      },
      createEmptyDocument({ id: 'doc-placeholder' }),
    );

    expect(evaluation.coveredCoverageItemIds).toEqual([]);
    expect(evaluation.missingCoverageItemIds).toContain('cov-fact-1');
    expect(evaluation.hardFailReasons).toContain('PLACEHOLDER_NOT_COVERAGE');
  });

  it('keeps generic fallback outside covered status and preserves the reason', () => {
    const matrix: CoverageMatrix = {
      items: [{ id: 'cov-claim-1', category: 'CLAIM', description: 'Prestación sustantiva', required: true, status: 'pending', targetSectionIds: [] }],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    };
    updateCoverageMatrixWithTaskResults(matrix, [{
      id: 'task-fallback', sectionId: 'sec', sectionTitle: 'SECCIÓN', complexity: 'SHORT', tokenBudget: 800,
      status: 'fallback', fallbackUsed: true, coverageItemIds: ['cov-claim-1'], generatedBlockIds: ['blk-fallback'],
      evaluation: { hardFailReasons: ['LOCAL_FALLBACK_NOT_COVERAGE'] },
    } as unknown as GenerationTask]);
    expect(matrix.items[0].status).toBe('weak');
    expect(matrix.items[0].metadata?.coverageStatusReason).toBe('LOCAL_FALLBACK_NOT_COVERAGE');
    expect(matrix.items[0].status).not.toBe('covered');
  });
});
