import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeCoverageItem,
  makeNonFinalBlock,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import {
  reconcileDocumentCoverage,
  type DocumentCoverageInput,
} from '@/lib/legal-engine/documentCoverage';
import type { SectionContract } from '@/lib/legal-engine/documentAssemblyTypes';

const factsSection = createDocumentNode({
  id: 'sec-facts',
  title: 'HECHOS',
  type: 'facts',
  order: 0,
});

const factsContract: SectionContract = {
  sectionId: factsSection.id,
  sectionPath: [factsSection.id],
  title: factsSection.title,
  type: factsSection.type,
  required: true,
  contentRole: 'FACT_RESPONSE',
  allowedCoverageCategories: ['FACT_RESPONSE', 'FACT'],
  deterministicAllowed: false,
  requiresAcceptedSubstantiveBlock: true,
};

function item(overrides: Parameters<typeof makeCoverageItem>[0] = {}) {
  return makeCoverageItem({
    id: 'cov-required',
    category: 'FACT_RESPONSE',
    targetSectionIds: [factsSection.id],
    ...overrides,
  });
}

function assemblyForBlocks(blocks: Array<ReturnType<typeof makeAcceptedBlock>> = []) {
  return assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [factsSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [factsSection],
    candidateBlocks: blocks.map((block) => ({ sectionId: factsSection.id, block })),
    generationTasks: blocks.map((block, index) => makeTask({
      id: block.generationTaskId || block.taskId || `task-${index}`,
      sectionId: factsSection.id,
      order: index,
    })),
  }));
}

function coverageInput(
  blocks: Array<ReturnType<typeof makeAcceptedBlock>>,
  coverageItems = [item()],
  sectionContracts = [factsContract],
): DocumentCoverageInput {
  return {
    coverageMatrix: {
      items: coverageItems,
      summary: { total: coverageItems.length, required: coverageItems.filter((entry) => entry.required).length, pending: coverageItems.length, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    },
    assembly: assemblyForBlocks(blocks),
    sectionContracts,
  };
}

describe('document Coverage reconciliation', () => {
  it('reports required coverage missing', () => {
    const result = reconcileDocumentCoverage(coverageInput([]));
    expect(result.requiredMissingIds).toContain('cov-required');
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REQUIRED_COVERAGE_MISSING', severity: 'BLOCKER' }),
    ]));
  });

  it('keeps accepted coverage after assembly without mutating the input matrix', () => {
    const block = makeAcceptedBlock({ id: 'blk-accepted', coverageItemIds: ['cov-required'] });
    const input = coverageInput([block]);
    const before = structuredClone(input.coverageMatrix);
    const reconciliation = reconcileDocumentCoverage(input);
    expect(reconciliation.allRequiredSatisfied).toBe(true);
    expect(reconciliation.items[0]).toMatchObject({ coverageItemId: 'cov-required', finalBlockIds: ['blk-accepted'], satisfied: true });
    expect(input.coverageMatrix).toEqual(before);
  });

  it('keeps a required item missing when only fallback exists', () => {
    const fallback = makeAcceptedBlock({
      id: 'blk-fallback',
      coverageItemIds: ['cov-required'],
      generatedBy: 'FALLBACK',
      fallbackStatus: 'LOCAL_FALLBACK',
    });
    const result = reconcileDocumentCoverage(coverageInput([fallback]));
    expect(result.requiredMissingIds).toContain('cov-required');
  });

  it('excludes invalid blocks from final coverage', () => {
    const invalid = makeAcceptedBlock({ id: 'blk-invalid', coverageItemIds: ['cov-required'], issueDraftValidationStatus: 'INVALID_FATAL' });
    const result = reconcileDocumentCoverage(coverageInput([invalid]));
    expect(result.items[0].finalBlockIds).toEqual([]);
    expect(result.requiredMissingIds).toContain('cov-required');
  });

  it('does not let VALID_NON_FINAL satisfy coverage', () => {
    const nonFinal = makeNonFinalBlock({ id: 'blk-non-final', coverageItemIds: ['cov-required'] });
    const result = reconcileDocumentCoverage(coverageInput([nonFinal]));
    expect(result.requiredMissingIds).toContain('cov-required');
  });

  it('detects duplicate coverage without deleting blocks', () => {
    const first = makeAcceptedBlock({ id: 'blk-one', coverageItemIds: ['cov-required'], generationTaskId: 'task-one', taskId: 'task-one' });
    const second = makeAcceptedBlock({ id: 'blk-two', coverageItemIds: ['cov-required'], generationTaskId: 'task-two', taskId: 'task-two' });
    const result = reconcileDocumentCoverage(coverageInput([first, second]));
    expect(result.duplicatedIds).toContain('cov-required');
    expect(result.items[0].finalBlockIds).toEqual(['blk-one', 'blk-two']);
  });

  it('reports coverage incompatible with its section', () => {
    const accepted = makeAcceptedBlock({ id: 'blk-wrong-section', coverageItemIds: ['cov-required'] });
    const incompatibleItem = item({ targetSectionIds: ['sec-other'] });
    const result = reconcileDocumentCoverage(coverageInput([accepted], [incompatibleItem]));
    expect(result.items[0].satisfied).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'COVERAGE_INCOMPATIBLE_SECTION', severity: 'BLOCKER' }),
    ]));
  });
});
