import { describe, expect, it } from 'vitest';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeDocumentFixture,
  makeManualBlock,
  makeNonFinalBlock,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';

function inputWithBlocks(
  blocks: Array<{ sectionId: string; block: ReturnType<typeof makeAcceptedBlock> }>,
  tasks: ReturnType<typeof makeTask>[],
) {
  return makeAssemblyInput({ candidateBlocks: blocks, generationTasks: tasks });
}

describe('deterministic document assembly', () => {
  it('orders sections from DocumentPlan and blocks from task plan order', () => {
    const blockB = makeAcceptedBlock({ id: 'blk-b', generationTaskId: 'task-b', taskId: 'task-b' });
    const blockA = makeAcceptedBlock({ id: 'blk-a', generationTaskId: 'task-a', taskId: 'task-a' });
    const result = assembleLegalDraft(inputWithBlocks(
      [
        { sectionId: 'sec-defensas', block: blockB },
        { sectionId: 'sec-hechos', block: blockA },
      ],
      [
        makeTask({ id: 'task-b', sectionId: 'sec-defensas', order: 0 }),
        makeTask({ id: 'task-a', sectionId: 'sec-hechos', order: 0 }),
      ],
    ));
    expect(result.sections.map((section) => section.sectionId)).toEqual(['sec-hechos', 'sec-defensas']);
    expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-a', 'blk-b']);
  });

  it('is invariant under provider completion order', () => {
    const slowBlock = makeAcceptedBlock({ id: 'blk-slow', generationTaskId: 'task-slow', taskId: 'task-slow' });
    const fastBlock = makeAcceptedBlock({ id: 'blk-fast', generationTaskId: 'task-fast', taskId: 'task-fast' });
    const tasks = [
      makeTask({ id: 'task-slow', order: 1 }),
      makeTask({ id: 'task-fast', order: 0 }),
    ];
    const first = assembleLegalDraft(inputWithBlocks(
      [{ sectionId: 'sec-hechos', block: slowBlock }, { sectionId: 'sec-hechos', block: fastBlock }],
      tasks,
    ));
    const second = assembleLegalDraft(inputWithBlocks(
      [{ sectionId: 'sec-hechos', block: fastBlock }, { sectionId: 'sec-hechos', block: slowBlock }],
      tasks,
    ));
    expect(second.trace.assemblyId).toBe(first.trace.assemblyId);
    expect(second.trace.orderedBlockIds).toEqual(first.trace.orderedBlockIds);
  });

  it('keeps same-semantic fingerprints stable and changes them for material input', () => {
    const block = makeAcceptedBlock({ id: 'blk-fingerprint', generationTaskId: 'task-fingerprint', taskId: 'task-fingerprint' });
    const task = makeTask({ id: 'task-fingerprint' });
    const first = assembleLegalDraft(makeAssemblyInput({
      document: makeDocumentFixture({ createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
      candidateBlocks: [{ sectionId: 'sec-hechos', block }],
      generationTasks: [task],
    }));
    const sameSemantics = assembleLegalDraft(makeAssemblyInput({
      document: makeDocumentFixture({ createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }),
      candidateBlocks: [{ sectionId: 'sec-hechos', block }],
      generationTasks: [task],
    }));
    const materiallyDifferent = assembleLegalDraft(makeAssemblyInput({
      candidateBlocks: [{ sectionId: 'sec-hechos', block: { ...block, text: 'Contenido materialmente distinto.' } }],
      generationTasks: [task],
    }));
    expect(sameSemantics.trace.inputFingerprint).toBe(first.trace.inputFingerprint);
    expect(sameSemantics.trace.outputFingerprint).toBe(first.trace.outputFingerprint);
    expect(materiallyDifferent.trace.outputFingerprint).not.toBe(first.trace.outputFingerprint);
  });

  it('keeps equal text from different issues', () => {
    const issueA = makeAcceptedBlock({
      id: 'blk-issue-a',
      text: 'Mismo texto con alcance distinto.',
      generationTaskId: 'task-issue-a',
      taskId: 'task-issue-a',
      legalIssueIds: ['issue-a'],
      coverageItemIds: ['cov-a'],
    });
    const issueB = makeAcceptedBlock({
      id: 'blk-issue-b',
      text: 'Mismo texto con alcance distinto.',
      generationTaskId: 'task-issue-b',
      taskId: 'task-issue-b',
      legalIssueIds: ['issue-b'],
      coverageItemIds: ['cov-b'],
    });
    const result = assembleLegalDraft(inputWithBlocks(
      [{ sectionId: 'sec-hechos', block: issueA }, { sectionId: 'sec-hechos', block: issueB }],
      [
        makeTask({ id: 'task-issue-a', order: 0 }),
        makeTask({ id: 'task-issue-b', order: 1 }),
      ],
    ));
    expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-issue-a', 'blk-issue-b']);
  });

  it('excludes INVALID blocks but admits VALID_NON_FINAL blocks with REVIEW finding', () => {
    const accepted = makeAcceptedBlock({ id: 'blk-accepted', generationTaskId: 'task-accepted', taskId: 'task-accepted' });
    const invalid = makeAcceptedBlock({ id: 'blk-invalid', issueDraftValidationStatus: 'INVALID_FATAL', generationTaskId: 'task-invalid', taskId: 'task-invalid' });
    const nonFinal = makeNonFinalBlock({ id: 'blk-non-final', generationTaskId: 'task-non-final', taskId: 'task-non-final' });
    const result = assembleLegalDraft(inputWithBlocks(
      [
        { sectionId: 'sec-hechos', block: accepted },
        { sectionId: 'sec-hechos', block: invalid },
        { sectionId: 'sec-hechos', block: nonFinal },
      ],
      [
        makeTask({ id: 'task-accepted', order: 0 }),
        makeTask({ id: 'task-invalid', order: 1 }),
        makeTask({ id: 'task-non-final', order: 2 }),
      ],
    ));
    // VALID_NON_FINAL blocks are now admitted for lawyer review
    expect(result.orderedBlocks.map((block) => block.id)).toEqual(['blk-accepted', 'blk-non-final']);
    expect(result.excludedDraftBlockIds).toEqual(expect.arrayContaining(['blk-invalid']));
    expect(result.excludedDraftBlockIds).not.toContain('blk-non-final');
    // VALID_NON_FINAL admission produces a REVIEW finding
    expect(result.findings.some((f) => f.code === 'VALID_NON_FINAL_BLOCK_ADMITTED' && f.severity === 'REVIEW')).toBe(true);
  });

  it('preserves manual blocks without rewriting their text', () => {
    const input = makeAssemblyInput({
      candidateBlocks: [{ sectionId: 'sec-hechos', block: makeManualBlock({ text: 'original manual wording' }) }],
      generationTasks: [],
    });
    const result = assembleLegalDraft(input);
    expect(result.orderedBlocks[0].text).toBe('original manual wording');
    expect(input.candidateBlocks[0].block.text).toBe('original manual wording');
  });

  it('preserves provider substantive output from VALID_NON_FINAL DraftBlock into the editor document', () => {
    const providerOutput = 'TEST-SUBSTANTIVE-CONTENT-XYZ';
    const draftBlock = makeNonFinalBlock({
      id: 'blk-provider-non-final',
      text: providerOutput,
      generationTaskId: 'task-provider-non-final',
      taskId: 'task-provider-non-final',
      legalIssueIds: ['issue-provider-non-final'],
      coverageItemIds: ['cov-provider-non-final'],
    });
    const result = assembleLegalDraft(inputWithBlocks(
      [{ sectionId: 'sec-hechos', block: draftBlock }],
      [makeTask({ id: 'task-provider-non-final', order: 0 })],
    ));

    expect(draftBlock.issueDraftValidationStatus).toBe('VALID_NON_FINAL');
    expect(result.sections.find((section) => section.sectionId === 'sec-hechos')?.blocks.map((block) => block.text))
      .toContain(providerOutput);
    expect(result.document.sections.find((section) => section.id === 'sec-hechos')?.content.map((block) => block.text))
      .toContain(providerOutput);
  });

  describe('fail-closed admission invariants for VALID_NON_FINAL and fallbacks', () => {
    it('admits VALID_NON_FINAL AI block without fallback as draft for lawyer review', () => {
      const block = makeNonFinalBlock({
        id: 'blk-ai-non-final',
        text: 'Desarrollo argumentativo del quejoso pendiente de refinamiento.',
        generatedBy: 'AI',
        fallbackStatus: undefined,
        semanticEvaluation: undefined,
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block }],
        [makeTask({ id: 'task-blk-ai-non-final' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).toContain('blk-ai-non-final');
      expect(result.findings.some((f) => f.code === 'VALID_NON_FINAL_BLOCK_ADMITTED')).toBe(true);
    });

    it('admits VALID_NON_FINAL legitimate deterministic fallback as draft for lawyer review', () => {
      const fallbackBlock = makeNonFinalBlock({
        id: 'blk-legit-fallback',
        text: 'Se expone el marco procesal y legal aplicable al caso conforme a la ley.',
        generatedBy: 'DETERMINISTIC',
        fallbackStatus: 'DETERMINISTIC_FALLBACK',
        semanticEvaluation: undefined,
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block: fallbackBlock }],
        [makeTask({ id: 'task-blk-legit-fallback' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).toContain('blk-legit-fallback');
      expect(result.findings.some((f) => f.code === 'VALID_NON_FINAL_BLOCK_ADMITTED')).toBe(true);
    });

    it('excludes empty block even when marked VALID_NON_FINAL (fail-closed)', () => {
      const emptyBlock = makeNonFinalBlock({
        id: 'blk-empty-fallback',
        text: '   ',
        generatedBy: 'DETERMINISTIC',
        fallbackStatus: 'DETERMINISTIC_FALLBACK',
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block: emptyBlock }],
        [makeTask({ id: 'task-blk-empty-fallback' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).not.toContain('blk-empty-fallback');
      expect(result.excludedDraftBlockIds).toContain('blk-empty-fallback');
      expect(result.findings.some((f) => f.code === 'EMPTY_BLOCK_EXCLUDED')).toBe(true);
    });

    it('excludes block with unresolved seed markers even when marked VALID_NON_FINAL (fail-closed)', () => {
      const markerBlock = makeNonFinalBlock({
        id: 'blk-marker-fallback',
        text: 'Texto con [DATO PENDIENTE: expediente] sin resolver.',
        generatedBy: 'DETERMINISTIC',
        fallbackStatus: 'DETERMINISTIC_FALLBACK',
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block: markerBlock }],
        [makeTask({ id: 'task-blk-marker-fallback' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).not.toContain('blk-marker-fallback');
      expect(result.excludedDraftBlockIds).toContain('blk-marker-fallback');
      expect(result.findings.some((f) => f.code === 'UNRESOLVED_BLOCK_EXCLUDED')).toBe(true);
    });

    it('excludes block with semantic FAIL even when marked VALID_NON_FINAL (fail-closed)', () => {
      const failBlock = makeNonFinalBlock({
        id: 'blk-failed-eval',
        text: 'Texto reprobado en evaluación semántica forense.',
        semanticEvaluation: {
          blockId: 'blk-failed-eval',
          taskId: 'task-blk-failed-eval',
          verdict: 'FAIL',
          overallScore: 0.2,
          factualCoverage: 0.1,
          legalSupport: 0.1,
          evidenceLinkage: 0,
          issueResponsiveness: 0,
          argumentDepth: 0,
          specificity: 0,
          completeness: 0,
          repetitionPenalty: 0,
          unsupportedAssertionPenalty: 0.8,
          revisionMode: 'REWRITE',
          deficiencies: ['Reprobado'],
          coveredCoverageItemIds: [],
          missingCoverageItemIds: ['cov-fixture'],
          hardFailReasons: ['HARD_FAIL_CRITICAL'],
        },
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block: failBlock }],
        [makeTask({ id: 'task-blk-failed-eval' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).not.toContain('blk-failed-eval');
      expect(result.excludedDraftBlockIds).toContain('blk-failed-eval');
      expect(result.findings.some((f) => f.code === 'SEMANTIC_BLOCK_NOT_ACCEPTED')).toBe(true);
    });

    it('excludes unvalidated fallback block without VALID_NON_FINAL or formal acceptance', () => {
      const rawFallback = makeNonFinalBlock({
        id: 'blk-raw-fallback',
        text: 'Texto de fallback sin estatus validado.',
        issueDraftValidationStatus: undefined as any,
        fallbackStatus: 'DETERMINISTIC_FALLBACK',
        generationRequirement: 'AI_REQUIRED',
        semanticEvaluation: undefined,
      });
      const result = assembleLegalDraft(inputWithBlocks(
        [{ sectionId: 'sec-hechos', block: rawFallback }],
        [makeTask({ id: 'task-blk-raw-fallback' })],
      ));
      expect(result.orderedBlocks.map((b) => b.id)).not.toContain('blk-raw-fallback');
      expect(result.excludedDraftBlockIds).toContain('blk-raw-fallback');
      expect(result.findings.some((f) => f.code === 'FALLBACK_BLOCK_EXCLUDED')).toBe(true);
    });
  });
});
