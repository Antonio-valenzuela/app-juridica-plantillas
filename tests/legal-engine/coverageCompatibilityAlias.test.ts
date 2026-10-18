import { describe, expect, it } from 'vitest';
import { applySemanticEvaluationToCoverageMatrix, updateCoverageMatrixWithTaskResults } from '../../lib/legal-engine/generationTasks';
import { reconcileDocumentCoverage } from '../../lib/legal-engine/documentCoverage';

const runShapedCoverage = () => {
  const canonical = {
    id: 'cov-fact-response-fact-1',
    category: 'FACT_RESPONSE',
    description: 'Respuesta a hecho fuente',
    required: true,
    status: 'needs_client_position',
    statusReason: 'CLIENT_POSITION_UNKNOWN',
    targetSectionIds: ['sec-con-hechos'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    blocking: true,
    requiresClientPosition: true,
    factIds: ['fact-1'],
    metadata: { richSourceId: 'fact-1' },
  };
  const alias = {
    ...canonical,
    id: 'compat-fact-fact-1',
    category: 'FACT',
    status: 'pending',
    blocking: false,
    requiresClientPosition: false,
    factIds: undefined,
    relatedFactIds: ['fact-1'],
    metadata: { compatibilityAlias: true, richSourceId: 'fact-1' },
  };
  const matrix = {
    items: [canonical, alias],
    summary: {
      total: 1, required: 1, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0,
      notApplicable: 0, blocked: 0, needsClientPosition: 1, contradictory: 0, insufficient: 0,
    },
  };
  return { canonical, alias, matrix };
};

describe('rich Coverage compatibility aliases', () => {
  it('does not count legacy compat-* aliases as independent required Coverage during assembly', () => {
    const { canonical, alias, matrix } = runShapedCoverage();
    const block = {
      id: 'blk-task-fact-sec-con-hechos-fact-1',
      text: 'Respuesta que sigue pendiente de postura del cliente.',
      generatedBy: 'AI',
      generationRequirement: 'ISSUE_SCOPED',
      issueDraftValidationStatus: 'VALID_NON_FINAL',
      coverageItemIds: [canonical.id, alias.id],
      semanticEvaluation: { blockId: 'blk-task-fact-sec-con-hechos-fact-1', verdict: 'PASS', hardFailReasons: [] },
    };
    const assembly = {
      orderedBlocks: [block],
      sections: [{ sectionId: 'sec-con-hechos', blockIds: [block.id] }],
      sourceDraftBlockIds: [block.id],
    };

    const reconciliation = reconcileDocumentCoverage({ coverageMatrix: matrix as any, assembly: assembly as any });

    expect(reconciliation.items.map((item) => item.coverageItemId)).toEqual([canonical.id]);
    expect(reconciliation.requiredMissingIds).toEqual([canonical.id]);
    expect(reconciliation.findings).toBeDefined();
    expect((reconciliation.findings ?? []).filter((finding) => finding.code === 'REQUIRED_COVERAGE_MISSING')
      .flatMap((finding) => finding.coverageItemIds)).toEqual([canonical.id]);
  });

  it('keeps rich summary counts canonical while preserving the unresolved client-position gate', () => {
    const { canonical, matrix } = runShapedCoverage();

    updateCoverageMatrixWithTaskResults(matrix as any, []);
    applySemanticEvaluationToCoverageMatrix(matrix as any, []);

    expect(matrix.summary).toMatchObject({
      total: 1,
      required: 1,
      pending: 0,
      needsClientPosition: 1,
    });
    expect(canonical.status).toBe('needs_client_position');
  });
});
