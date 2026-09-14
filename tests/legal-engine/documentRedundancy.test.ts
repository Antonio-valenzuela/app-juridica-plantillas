import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import {
  findDocumentRedundancy,
  type DocumentRedundancyInput,
} from '@/lib/legal-engine/documentRedundancy';

const argumentSection = createDocumentNode({
  id: 'sec-argument',
  title: 'ARGUMENTOS',
  type: 'argument',
  order: 0,
});

function redundancyInput(options: { secondIssue?: boolean } = {}): DocumentRedundancyInput {
  const text = 'La autoridad debe responder de manera exhaustiva y congruente.';
  const first = makeAcceptedBlock({
    id: 'blk-one',
    text,
    legalIssueIds: ['issue-1'],
    coverageItemIds: ['cov-1'],
    generationTaskId: 'task-one',
    taskId: 'task-one',
  });
  const second = makeAcceptedBlock({
    id: 'blk-two',
    text,
    legalIssueIds: [options.secondIssue ? 'issue-2' : 'issue-1'],
    coverageItemIds: [options.secondIssue ? 'cov-2' : 'cov-1'],
    generationTaskId: 'task-two',
    taskId: 'task-two',
  });
  const assembly = assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [argumentSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [argumentSection],
    candidateBlocks: [
      { sectionId: argumentSection.id, block: first },
      { sectionId: argumentSection.id, block: second },
    ],
    generationTasks: [
      makeTask({ id: 'task-one', sectionId: argumentSection.id, order: 0 }),
      makeTask({ id: 'task-two', sectionId: argumentSection.id, order: 1 }),
    ],
  }));
  return {
    assembly,
    blockContexts: assembly.orderedBlocks.map((block) => ({
      block,
      sectionId: argumentSection.id,
      functionRole: 'ISSUE_ARGUMENT',
      propositionIds: block.id === 'blk-one' || !options.secondIssue ? ['prop-1'] : ['prop-2'],
    })),
  };
}

describe('document redundancy policy', () => {
  it('keeps equal text from two issues and reports different-scope repetition only', () => {
    const input = redundancyInput({ secondIssue: true });
    const result = findDocumentRedundancy(input);
    expect(result.some((finding) => finding.code === 'DUPLICATE_BLOCK_SAME_FUNCTION')).toBe(false);
    expect(result.some((finding) => finding.code === 'REPEATED_TEXT_DIFFERENT_SCOPE')).toBe(true);
  });

  it('reports equal text in the same issue/function without deleting either block', () => {
    const input = redundancyInput();
    const findings = findDocumentRedundancy(input);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_BLOCK_SAME_FUNCTION' }),
    ]));
    expect(input.assembly.orderedBlocks).toHaveLength(2);
  });
});
