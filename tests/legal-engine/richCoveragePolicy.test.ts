import { describe, expect, it } from 'vitest';
import { isCoverageSatisfied } from '@/lib/legal-engine/coveragePolicy';
import { applySemanticEvaluationToCoverageMatrix, executeGenerationTask, updateCoverageMatrixWithTaskResults } from '@/lib/legal-engine/generationTasks';
import { evaluateDocumentSemantics } from '@/lib/legal-engine/semanticEvaluator';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';
import { applySectionCoverageTransition } from '@/lib/legal-engine/pipeline';
import type { ContentBlock } from '@/lib/legal-engine/types';
import type { BlockQualityEvaluation } from '@/lib/legal-engine/semanticEvaluator';
import type { CoverageMatrix, DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';

function makePassEvaluation(blockId: string) {
  return { blockId, taskId: 'task-fixture', verdict: 'PASS', overallScore: 0.95, hardFailReasons: [], deficiencies: [], coveredCoverageItemIds: ['cov-fact-response'], missingCoverageItemIds: [] } as unknown as BlockQualityEvaluation;
}

function makeBaseCoverageCase(scope: 'SUBSTANTIVE' | 'FORMAL', satisfactionPolicy: string, category: string) {
  const doc = createEmptyDocument({
    id: 'coverage-policy-doc',
    sections: [createDocumentNode({ id: 'sec-policy', title: 'POLICY', type: scope === 'FORMAL' ? 'signature' : 'facts', content: [] })],
  });
  const itemId = scope === 'FORMAL' ? 'cov-formal-signature' : 'cov-fact-response';
  const block = {
    id: `block-${itemId}`,
    text: scope === 'FORMAL' ? 'Firma de la parte' : 'Respuesta específica del hecho',
    generatedBy: scope === 'FORMAL' ? 'DETERMINISTIC' : 'AI',
    generationRequirement: scope === 'FORMAL' ? 'DETERMINISTIC' : 'AI_REQUIRED',
    coverageItemIds: [itemId],
  } as unknown as ContentBlock;
  const matrix: CoverageMatrix = {
    documentId: doc.id,
    documentType: doc.documentType,
    items: [{
      id: itemId,
      category: category as CoverageMatrix['items'][number]['category'],
      description: category,
      required: true,
      status: 'generated',
      targetSectionIds: ['sec-policy'],
      scope,
      satisfactionPolicy: satisfactionPolicy as CoverageMatrix['items'][number]['satisfactionPolicy'],
      blocking: scope === 'SUBSTANTIVE',
      generatedBlockIds: [block.id],
    }],
    summary: { total: 1, required: 1, pending: 0, generated: 1, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
  return { doc, matrix, block };
}

describe('rich Coverage satisfaction policy', () => {
  it.each([
    ['VALID_NON_FINAL', { issueDraftValidationStatus: 'VALID_NON_FINAL' }, 'SEMANTIC_SCORE_BELOW_THRESHOLD'],
    ['fallback', { generatedBy: 'FALLBACK', fallbackStatus: 'LOCAL_PLACEHOLDER' }, 'LOCAL_FALLBACK_NOT_COVERAGE'],
  ])('does not close research-dependent coverage for %s', (_label, blockOverrides, expectedReason) => {
    const item = {
      id: `cov-research-${String(_label).replace(/\s+/g, '-')}`,
      category: 'AUTHORITY_MENTION',
      description: 'Research-dependent coverage',
      required: true,
      status: 'pending',
      targetSectionIds: ['sec-policy'],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
    } as unknown as DocumentCoverageItem;
    const block = {
      id: `blk-${item.id}`,
      text: 'Contenido generado con research',
      generatedBy: 'AI',
      generationRequirement: 'AI_REQUIRED',
      coverageItemIds: [item.id],
      issueDraftValidationStatus: 'VALID_ACCEPTED',
      ...blockOverrides,
    } as unknown as ContentBlock;
    const evaluation = {
      blockId: block.id,
      verdict: 'PASS',
      hardFailReasons: [],
    } as unknown as BlockQualityEvaluation;

    const result = isCoverageSatisfied(item, [block], [evaluation]);

    expect(result.satisfied).toBe(false);
    expect(result.reason).toBe(expectedReason);
  });

  it('keeps a blocking conflict open even when a generated task receives PASS', () => {
    const matrix: CoverageMatrix = {
      items: [{
        id: 'cov-conflict-review',
        category: 'CONFLICT_REVIEW',
        description: 'Conflicto de fuente',
        required: true,
        status: 'blocked',
        targetSectionIds: ['sec-policy'],
        scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
        blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    };

    updateCoverageMatrixWithTaskResults(matrix, [{
      id: 'task-conflict-review',
      sectionId: 'sec-policy',
      sectionTitle: 'REVISIÓN',
      taskType: 'COVERAGE_ITEM',
      complexity: 'SHORT',
      tokenBudget: 800,
      status: 'completed',
      coverageItemIds: ['cov-conflict-review'],
      generatedBlockIds: ['blk-conflict-review'],
      evaluation: makePassEvaluation('blk-conflict-review'),
    } as unknown as GenerationTask], { applySemanticEvaluation: true });

    expect(matrix.items[0].status).toBe('blocked');
    expect(matrix.items[0].metadata?.coverageStatusReason).toBe('BLOCKING_CONFLICT_REQUIRES_REVIEW');
  });

  it('keeps missing client position unresolved in both task and evaluation paths', () => {
    const matrix: CoverageMatrix = {
      items: [{
        id: 'cov-missing-position',
        category: 'MISSING_CLIENT_POSITION',
        description: 'Postura no confirmada',
        required: true,
        status: 'needs_client_position',
        targetSectionIds: ['sec-policy'],
        scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
        blocking: true,
        requiresClientPosition: true,
      }],
      summary: { total: 1, required: 1, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    };
    const evaluation = {
      ...makePassEvaluation('blk-missing-position'),
      coveredCoverageItemIds: ['cov-missing-position'],
    } as unknown as BlockQualityEvaluation;

    updateCoverageMatrixWithTaskResults(matrix, [{
      id: 'task-missing-position',
      sectionId: 'sec-policy',
      sectionTitle: 'REVISIÓN',
      taskType: 'COVERAGE_ITEM',
      complexity: 'SHORT',
      tokenBudget: 800,
      status: 'completed',
      coverageItemIds: ['cov-missing-position'],
      generatedBlockIds: ['blk-missing-position'],
      evaluation,
    } as unknown as GenerationTask], { applySemanticEvaluation: true });
    applySemanticEvaluationToCoverageMatrix(matrix, [evaluation]);

    expect(matrix.items[0].status).toBe('needs_client_position');
    expect(matrix.items[0].metadata?.coverageStatusReason).toBe('MISSING_CLIENT_POSITION_REQUIRED');
  });

  it('does not promote an unlinked section block to substantive Coverage', () => {
    const item = {
      id: 'cov-unlinked-substantive',
      category: 'EVIDENCE_OFFER',
      description: 'Oferta de prueba',
      required: true,
      status: 'pending',
      targetSectionIds: ['sec-policy'],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      blocking: true,
    } as unknown as DocumentCoverageItem;
    const block = {
      id: 'blk-section-only',
      text: 'Texto generado sin enlace de Coverage',
      generatedBy: 'AI',
      generationRequirement: 'AI_REQUIRED',
      coverageItemIds: [],
    } as unknown as ContentBlock;

    expect(isCoverageSatisfied(item, [block], [{ blockId: block.id, verdict: 'PASS', hardFailReasons: [] }])).toEqual({
      satisfied: false,
      reason: 'NO_GENERATED_BLOCK',
    });
  });

  it('section-level generation only closes explicitly linked formal Coverage', () => {
    const doc = createEmptyDocument({
      id: 'section-coverage-doc',
      sections: [createDocumentNode({ id: 'sec-policy', title: 'FIRMA', type: 'signature', content: [] })],
    });
    doc.coverageMatrix = {
      items: [
        {
          id: 'cov-formal-signature', category: 'FORMAL_REQUIREMENT', description: 'Firma', required: true,
          status: 'pending', targetSectionIds: ['sec-policy'], scope: 'FORMAL',
          satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED', blocking: false,
        },
        {
          id: 'cov-evidence-offer', category: 'EVIDENCE_OFFER', description: 'Oferta', required: true,
          status: 'pending', targetSectionIds: ['sec-policy'], scope: 'SUBSTANTIVE',
          satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true,
        },
      ],
      summary: { total: 2, required: 2, pending: 2, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    };
    doc.sections[0].coverageItemIds = ['cov-formal-signature', 'cov-evidence-offer'];
    const block = {
      id: 'blk-signature', text: 'FIRMA DE LA PARTE', generatedBy: 'DETERMINISTIC',
      generationRequirement: 'DETERMINISTIC', coverageItemIds: [],
    } as unknown as ContentBlock;

    applySectionCoverageTransition(doc, doc.sections[0], block);

    expect(doc.coverageMatrix.items.find((item) => item.id === 'cov-formal-signature')?.status).toBe('pending');
    expect(doc.coverageMatrix.items.find((item) => item.id === 'cov-evidence-offer')?.status).toBe('pending');

    block.coverageItemIds = ['cov-formal-signature'];
    applySectionCoverageTransition(doc, doc.sections[0], block);
    expect(doc.coverageMatrix.items.find((item) => item.id === 'cov-formal-signature')?.status).toBe('covered');
    expect(doc.coverageMatrix.items.find((item) => item.id === 'cov-evidence-offer')?.status).toBe('pending');
  });

  it('allows a procedural petition requirement to use deterministic structure', () => {
    const doc = createEmptyDocument({
      id: 'procedural-petition-doc',
      sections: [createDocumentNode({ id: 'sec-petition', title: 'PUNTOS PETITORIOS', type: 'petition', content: [] })],
    });
    doc.sections[0].coverageItemIds = ['cov-procedural-petition'];
    doc.coverageMatrix = {
      items: [{
        id: 'cov-procedural-petition', category: 'CLAIM', description: 'Tenerme por presentado y emplazar al demandado',
        required: true, status: 'pending', targetSectionIds: ['sec-petition'],
      }],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    const block = {
      id: 'blk-procedural-petition', text: 'PRIMERO. Tenerme por presentado. SEGUNDO. Emplazar al demandado.',
      generatedBy: 'DETERMINISTIC', generationRequirement: 'AI_REQUIRED', coverageItemIds: ['cov-procedural-petition'],
    } as unknown as ContentBlock;
    applySectionCoverageTransition(doc, doc.sections[0], block);
    expect(doc.coverageMatrix.items[0].status).toBe('covered');
  });

  it('does not send conflict review tasks to a provider or invent substantive prose', async () => {
    const doc = createEmptyDocument({ id: 'review-only-doc' });
    doc.coverageMatrix = {
      items: [{
        id: 'cov-conflict-review-only', category: 'CONFLICT_REVIEW', description: 'Cantidades contradictorias',
        required: true, status: 'blocked', targetSectionIds: [], scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 0, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    const task = {
      id: 'task-conflict-review-only', sectionId: 'sec-review', sectionTitle: 'REVISIÓN', taskType: 'COVERAGE_ITEM',
      complexity: 'SHORT', tokenBudget: 800, status: 'pending', coverageItemIds: ['cov-conflict-review-only'],
    } as unknown as GenerationTask;
    let providerAttempted = false;
    const result = await executeGenerationTask(task, doc, undefined, async () => {
      providerAttempted = true;
      return 'Texto sustantivo inventado que no debe ensamblarse.';
    });

    expect(providerAttempted).toBe(false);
    expect(task.status).toBe('fallback');
    expect(result.block.text).toMatch(/REQUIERE REVISI[ÓO]N DEL ABOGADO/i);
    expect(result.block.generatedBy).toBe('FALLBACK');
    expect(result.block.coverageItemIds).toEqual(['cov-conflict-review-only']);
  });

  it('does not send pending client position tasks to a provider or invent substantive prose', async () => {
    const doc = createEmptyDocument({ id: 'pending-position-doc' });
    doc.coverageMatrix = {
      items: [{
        id: 'cov-pending-position-only', category: 'MISSING_CLIENT_POSITION', description: 'Falta postura sobre despido',
        required: true, status: 'needs_client_position', targetSectionIds: [], scope: 'SUBSTANTIVE',
        satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true,
      }],
      summary: { total: 1, required: 1, pending: 0, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    };
    const task = {
      id: 'task-pending-position-only', sectionId: 'sec-hechos', sectionTitle: 'HECHOS', taskType: 'COVERAGE_ITEM',
      complexity: 'SHORT', tokenBudget: 800, status: 'pending', coverageItemIds: ['cov-pending-position-only'],
    } as unknown as GenerationTask;
    let providerAttempted = false;
    const result = await executeGenerationTask(task, doc, undefined, async () => {
      providerAttempted = true;
      return 'Texto sustantivo inventado que no debe ensamblarse.';
    });

    expect(providerAttempted).toBe(false);
    expect(task.status).toBe('fallback');
    expect(task.error).toBe('MISSING_CLIENT_POSITION_REQUIRED');
    expect(result.block.text).toMatch(/REQUIERE REVISI[ÓO]N DEL ABOGADO/i);
    expect(result.block.generatedBy).toBe('FALLBACK');
    expect(result.block.coverageItemIds).toEqual(['cov-pending-position-only']);
  });

  it('allows an approved deterministic formal block', () => {
    const item = {
      id: 'cov-formal-signature',
      scope: 'FORMAL',
      satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED',
      required: true,
      status: 'generated',
      targetSectionIds: [],
      category: 'FORMAL_REQUIREMENT',
      description: '',
      blocking: false,
    } as unknown as DocumentCoverageItem;
    const block = {
      id: 'block-signature',
      text: 'Firma de la parte promovente',
      generatedBy: 'DETERMINISTIC',
      coverageItemIds: [item.id],
      generationRequirement: 'DETERMINISTIC',
    } as unknown as ContentBlock;
    expect(isCoverageSatisfied(item, [block], [])).toEqual({
      satisfied: true,
      reason: 'VALID_STRUCTURAL_BLOCK',
    });
  });

  it('rejects deterministic, local fallback and placeholder blocks for substantive Coverage', () => {
    const item = {
      id: 'cov-fact-response',
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      required: true,
      status: 'generated',
      targetSectionIds: [],
      category: 'FACT_RESPONSE',
      description: '',
      blocking: true,
    } as unknown as DocumentCoverageItem;
    const block = {
      id: 'block-placeholder',
      text: '[DATO PENDIENTE]',
      generatedBy: 'FALLBACK',
      fallbackStatus: 'LOCAL_PLACEHOLDER',
      coverageItemIds: [item.id],
    } as unknown as ContentBlock;
    const result = isCoverageSatisfied(item, [block], []);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/NOT_COVERAGE|PLACEHOLDER|fallback/i);
  });

  it('requires a PASS semantic evaluation for substantive AI content', () => {
    const item = {
      id: 'cov-claim-response',
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      required: true,
      status: 'generated',
      targetSectionIds: ['sec-claims'],
      category: 'CLAIM_RESPONSE',
      description: '',
      blocking: true,
    } as unknown as DocumentCoverageItem;
    const block = {
      id: 'block-ai',
      text: 'La respuesta se vincula con los hechos y la prestación identificada.',
      generatedBy: 'AI',
      coverageItemIds: [item.id],
    } as unknown as ContentBlock;
    const evaluation = {
      blockId: block.id,
      verdict: 'PASS',
      hardFailReasons: [],
    } as unknown as BlockQualityEvaluation;
    expect(isCoverageSatisfied(item, [block], [evaluation])).toEqual({
      satisfied: true,
      reason: 'VALID_SUBSTANTIVE_BLOCK',
    });
  });

  it('marks substantive Coverage covered only after a linked PASS evaluation', () => {
    const { doc, matrix, block } = makeBaseCoverageCase('SUBSTANTIVE', 'REQUIRES_SEMANTIC_RESPONSE', 'FACT_RESPONSE');
    const evaluation = makePassEvaluation(block.id);
    applySemanticEvaluationToCoverageMatrix(matrix, [evaluation]);
    const result = evaluateDocumentSemantics(doc, matrix, [evaluation]);
    expect(result.uncoveredRequiredItems).not.toContain('cov-fact-response');
    expect(matrix.items.find((item) => item.id === 'cov-fact-response')?.status).toBe('covered');
  });

  it('keeps formal deterministic Coverage valid without treating it as substantive reasoning', () => {
    const { doc, matrix } = makeBaseCoverageCase('FORMAL', 'FORMAL_DETERMINISTIC_ALLOWED', 'FORMAL_REQUIREMENT');
    matrix.items.push({ id: 'cov-substantive-fact', category: 'FACT_RESPONSE', description: 'fact', required: true, status: 'generated', targetSectionIds: [], scope: 'SUBSTANTIVE', satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE', blocking: true, requiresClientPosition: false });
    applySemanticEvaluationToCoverageMatrix(matrix, []);
    evaluateDocumentSemantics(doc, matrix, []);
    expect(matrix.items.find((item) => item.id === 'cov-formal-signature')?.status).toBe('covered');
    expect(matrix.items.find((item) => item.id === 'cov-substantive-fact')?.status).not.toBe('covered');
  });

  it('returns exact literal CoverageTraceStatusReason codes for all coverage satisfaction branches', () => {
    const substantiveItem = {
      id: 'cov-substantive',
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      required: true,
      status: 'pending',
    } as unknown as DocumentCoverageItem;

    const formalItem = {
      id: 'cov-formal',
      scope: 'FORMAL',
      satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED',
      required: true,
      status: 'pending',
    } as unknown as DocumentCoverageItem;

    // 1. NO_GENERATED_BLOCK
    expect(isCoverageSatisfied(substantiveItem, [], [])).toEqual({
      satisfied: false,
      reason: 'NO_GENERATED_BLOCK',
    });
    expect(isCoverageSatisfied({ ...substantiveItem, satisfactionPolicy: 'REFERENCE_ONLY' } as unknown as DocumentCoverageItem, [{ id: 'b1', text: 'x', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [])).toEqual({
      satisfied: false,
      reason: 'NO_GENERATED_BLOCK',
    });

    // 2. VALID_STRUCTURAL_BLOCK
    expect(isCoverageSatisfied(formalItem, [{ id: 'b-form', text: 'Rubro formal válido', generatedBy: 'DETERMINISTIC', coverageItemIds: [formalItem.id] } as unknown as ContentBlock], [])).toEqual({
      satisfied: true,
      reason: 'VALID_STRUCTURAL_BLOCK',
    });

    // 3. PLACEHOLDER_NOT_COVERAGE
    expect(isCoverageSatisfied(substantiveItem, [{ id: 'b-ph', text: '[REQUIERE REVISIÓN DEL ABOGADO: hecho]', generatedBy: 'FALLBACK', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [])).toEqual({
      satisfied: false,
      reason: 'PLACEHOLDER_NOT_COVERAGE',
    });

    // 4. LOCAL_FALLBACK_NOT_COVERAGE
    expect(isCoverageSatisfied(substantiveItem, [{ id: 'b-fb', text: 'Texto de fallback sin corchete', fallbackStatus: 'LOCAL_PLACEHOLDER', generatedBy: 'FALLBACK', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [])).toEqual({
      satisfied: false,
      reason: 'LOCAL_FALLBACK_NOT_COVERAGE',
    });

    // 5. SEMANTIC_SCORE_BELOW_THRESHOLD
    expect(isCoverageSatisfied(substantiveItem, [{ id: 'b-ai-fail', text: 'Texto redactado por IA', generatedBy: 'AI', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [{ blockId: 'b-ai-fail', verdict: 'FAIL', hardFailReasons: ['LOW_FACT_COVERAGE'] } as unknown as BlockQualityEvaluation])).toEqual({
      satisfied: false,
      reason: 'SEMANTIC_SCORE_BELOW_THRESHOLD',
    });

    // 6. EMPTY_OUTPUT_NOT_COVERAGE
    expect(isCoverageSatisfied(substantiveItem, [{ id: 'b-empty', text: '   ', generatedBy: 'AI', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [])).toEqual({
      satisfied: false,
      reason: 'EMPTY_OUTPUT_NOT_COVERAGE',
    });

    // 7. VALID_SUBSTANTIVE_BLOCK
    expect(isCoverageSatisfied(substantiveItem, [{ id: 'b-pass', text: 'Texto sustantivo completo', generatedBy: 'AI', coverageItemIds: [substantiveItem.id] } as unknown as ContentBlock], [{ blockId: 'b-pass', verdict: 'PASS', hardFailReasons: [] } as unknown as BlockQualityEvaluation])).toEqual({
      satisfied: true,
      reason: 'VALID_SUBSTANTIVE_BLOCK',
    });
  });
});
