import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';

function assemblyFixtureResult() {
  const section = createDocumentNode({ id: 'sec-1', title: 'ARGUMENTO', type: 'argument', order: 0 });
  const block = makeAcceptedBlock({
    id: 'blk-1',
    generationTaskId: 'task-1',
    taskId: 'task-1',
    legalIssueIds: ['issue-1'],
    coverageItemIds: ['cov-1'],
  });
  return assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [section], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [section],
    candidateBlocks: [{ sectionId: section.id, block }],
    generationTasks: [makeTask({ id: 'task-1', sectionId: section.id })],
  }));
}

describe('document assembly trace', () => {
  it('records the complete final document chain by IDs and hashes', () => {
    const result = assemblyFixtureResult();
    const context = createGenerationTraceContext({ doc: result.document, options: { enabled: true } });
    context.recordDocumentAssembly(result);
    const trace = context.close();
    expect(trace.documentAssembly?.orderedBlockIds).toEqual(['blk-1']);
    expect(trace.documentAssembly?.blockLinks[0]).toMatchObject({
      blockId: 'blk-1', generationTaskId: 'task-1',
      legalIssueIds: ['issue-1'], coverageItemIds: ['cov-1'],
    });
    expect(trace.documentAssembly?.outputFingerprint).toBe(result.trace.outputFingerprint);
  });

  it('stores assembly metadata only and omits research bundle bodies', () => {
    const result = assemblyFixtureResult();
    const context = createGenerationTraceContext({ doc: result.document, options: { enabled: true } });
    context.recordDocumentAssembly({
      ...result,
      trace: { ...result.trace, findingCodes: ['REQUIRES_REVIEW'] },
    });
    const trace = context.close();
    expect(JSON.stringify(trace.documentAssembly)).not.toContain('full research bundle body');
    expect(trace.documentAssembly?.findingCodes).toEqual(['REQUIRES_REVIEW']);
  });
});
