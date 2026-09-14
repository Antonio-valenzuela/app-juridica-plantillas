import { describe, expect, it } from 'vitest';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeRichCaseAnalysisFixture,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { buildDocumentPropositionLedger, validateDocumentConsistency } from '@/lib/legal-engine/documentConsistency';
import type { ContentBlock } from '@/lib/legal-engine/types';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';

function block(id: string, text: string, factIds: string[], overrides: Partial<ContentBlock> = {}): ContentBlock {
  return makeAcceptedBlock({
    id,
    text,
    factIds,
    legalIssueIds: ['issue-1'],
    coverageItemIds: [],
    generationTaskId: `task-${id}`,
    taskId: `task-${id}`,
    ...overrides,
  });
}

function analysisWithFact(options: { date?: string; conflict?: boolean } = {}): RichCaseAnalysis {
  const analysis = makeRichCaseAnalysisFixture();
  analysis.facts = [{
    id: 'fact-1',
    proposition: 'La relación jurídica inició en marzo de 2024.',
    participants: [],
    date: options.date ? {
      rawValue: options.date,
      normalizedValue: options.date,
      precision: 'DAY',
      provenance: [],
    } : undefined,
    assertionStatus: 'SOURCE_ASSERTION',
    provenance: [],
    relatedDocumentIds: [],
  }];
  analysis.conflicts = options.conflict ? [{
    conflictId: 'conflict-1',
    type: 'DATE',
    itemIds: ['fact-1'],
    sourceIds: [],
    description: 'Conflicto de fecha expresamente identificado.',
    requiresReview: true,
  }] : [];
  return analysis;
}

function inputWithBlocks(...blocks: ContentBlock[]): { assembly: ReturnType<typeof assembleLegalDraft>; richCaseAnalysis: RichCaseAnalysis } {
  const tasks = blocks.map((candidate, index) => makeTask({
    id: candidate.generationTaskId || `task-${candidate.id}`,
    order: index,
    sectionId: 'sec-hechos',
  }));
  const assembly = assembleLegalDraft(makeAssemblyInput({
    candidateBlocks: blocks.map((candidate) => ({ sectionId: 'sec-hechos', block: candidate })),
    generationTasks: tasks,
  }));
  return { assembly, richCaseAnalysis: analysisWithFact({ date: '3 de marzo de 2024' }) };
}

describe('cross-block document consistency', () => {
  it('blocks incompatible dates for the same fact', () => {
    const findings = validateDocumentConsistency(inputWithBlocks(
      block('blk-a', 'La relación inició el 3 de marzo de 2024.', ['fact-1']),
      block('blk-b', 'La relación inició el 5 de marzo de 2024.', ['fact-1']),
    ));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MATERIAL_FACT_CONTRADICTION', severity: 'BLOCKER' }),
    ]));
  });

  it('blocks ADMIT versus DENY for the same client proposition', () => {
    const findings = validateDocumentConsistency(inputWithBlocks(
      block('blk-a', 'POSICIÓN PROCESAL: SE ADMITE.', ['fact-1']),
      block('blk-b', 'POSICIÓN PROCESAL: SE NIEGA.', ['fact-1']),
    ));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONFLICTING_CLIENT_POSITION', severity: 'BLOCKER' }),
    ]));
  });

  it('does not merge source allegation and client denial into one scope', () => {
    const result = inputWithBlocks(
      block('blk-source', 'La parte actora afirma el hecho.', ['fact-1'], { generatedBy: 'SOURCE_DIRECT' }),
      block('blk-client', 'POSICIÓN PROCESAL: SE NIEGA.', ['fact-1']),
    );
    const findings = validateDocumentConsistency(result);
    expect(findings.some((item) => item.code === 'CONFLICTING_CLIENT_POSITION')).toBe(false);
  });

  it('rejects a concrete date absent from the authorized fact graph', () => {
    const result = inputWithBlocks(block('blk-new', 'El pago ocurrió el 9 de septiembre de 2025.', ['fact-1']));
    result.richCaseAnalysis = analysisWithFact();
    const findings = validateDocumentConsistency(result);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NEW_FACT_DURING_ASSEMBLY', severity: 'BLOCKER' }),
    ]));
  });

  it('keeps an explicit source conflict as review instead of selecting a side', () => {
    const result = inputWithBlocks(
      block('blk-a', 'La relación inició el 3 de marzo de 2024.', ['fact-1']),
      block('blk-b', 'La relación inició el 5 de marzo de 2024.', ['fact-1']),
    );
    result.richCaseAnalysis = analysisWithFact({ date: '3 de marzo de 2024', conflict: true });
    const findings = validateDocumentConsistency(result);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MATERIAL_FACT_CONTRADICTION', severity: 'REVIEW' }),
    ]));
  });

  it('does not classify prescription or absolution as a source fact', () => {
    const ledger = buildDocumentPropositionLedger(inputWithBlocks(
      block('blk-legal', 'La prescripción total conduce a la absolución.', ['issue-1']),
    ));
    expect(ledger.every((entry) => entry.kind !== 'FACT')).toBe(true);
  });
});
