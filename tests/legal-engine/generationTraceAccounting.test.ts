import { describe, expect, it } from 'vitest';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { buildDraftingPlan, generateSection } from '@/lib/legal-engine/pipeline';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import {
  buildFixtureDocument,
  buildFixtureRichCaseAnalysis,
} from '@/tests/fixtures/recursoRevisionAmparoDirectoFixture';

describe('generation trace task accounting', () => {
  it('accounts planned, generated, rejected, admitted, assembled and exported words by section without storing prose', () => {
    const document = buildFixtureDocument();
    const traceContext = createGenerationTraceContext({
      generationId: 'trace-word-accounting',
      doc: document,
      options: { enabled: true },
    });

    traceContext.recordTaskPlanned({
      id: 'word-task',
      sectionId: 'sec-one',
      sectionTitle: 'HECHOS',
      tokenBudget: 1800,
      targetWords: 120,
      complexity: 'MEDIUM',
      status: 'pending',
    } as any);
    traceContext.recordIssueGenerationAttempt({
      legalIssueId: 'issue-one',
      taskId: 'word-task',
      attempt: 1,
      coverageItemIds: [],
      promptVersion: 'test-v1',
      contextHash: 'context-hash',
      providerRequested: 'nvidia',
      providerActuallyUsed: 'nvidia',
      outcome: 'VALIDATION_FAILED',
      providerGeneratedWords: 5,
      providerGeneratedChars: 31,
      validatedWords: 0,
      rejectedWords: 5,
      lossReason: 'UNKNOWN_SOURCE_ENTITY_ID',
      usage: { promptTokens: null, completionTokens: null, totalTokens: null },
      startedAt: new Date(0).toISOString(),
    });

    const kept = {
      id: 'blk-kept',
      text: 'contenido admitido para ensamblado',
      generationTaskId: 'word-task',
      generatedBy: 'AI',
      provider: 'nvidia',
    } as any;
    const dropped = {
      id: 'blk-dropped',
      text: 'contenido duplicado descartado',
      generationTaskId: 'word-task',
      generatedBy: 'AI',
      provider: 'nvidia',
    } as any;
    traceContext.recordDraftBlock(kept);
    traceContext.recordDraftBlock(dropped);
    traceContext.recordDocumentAssembly({
      sections: [{ sectionId: 'sec-one', blocks: [kept] }],
      excludedDraftBlockIds: ['blk-dropped'],
      findings: [{ code: 'DUPLICATE_BLOCK', blockIds: ['blk-dropped'], reason: 'duplicate text' }],
      trace: {
        assemblyId: 'assembly-word-test',
        inputFingerprint: 'input',
        outputFingerprint: 'output',
        orderedSectionIds: ['sec-one'],
        orderedBlockIds: ['blk-kept'],
        sourceDraftBlockIds: ['blk-kept', 'blk-dropped'],
        excludedDraftBlockIds: ['blk-dropped'],
        findingCodes: ['DUPLICATE_BLOCK'],
        blockLinks: [],
      },
    } as any);
    traceContext.recordExportManifest({
      schemaVersion: 'fase7-v1',
      format: 'docx',
      documentFingerprint: 'doc',
      materializationFingerprint: 'materialized',
      exportFingerprint: 'export',
      pageProfileId: 'letter',
      sectionCount: 1,
      paragraphCount: 1,
      omittedParagraphCount: 0,
      renderedBlockIds: ['blk-kept'],
      omittedBlockIds: [],
      sectionWordCounts: [{ sectionId: 'sec-one', wordCount: 4 }],
      totalTextWordCount: 4,
      traceStatus: 'NOT_AVAILABLE',
    } as any);

    expect(traceContext.trace.wordAccounting).toEqual([{
      sectionId: 'sec-one',
      plannedWords: 120,
      providerGeneratedWords: 5,
      providerGeneratedChars: 31,
      validatedWords: 0,
      rejectedWords: 8,
      dedupRemovedWords: 3,
      materializedWords: 7,
      admittedWords: 7,
      assembledWords: 4,
      exportedWords: 4,
      losses: [
        { stage: 'provider-validation', reason: 'UNKNOWN_SOURCE_ENTITY_ID', words: 5, taskId: 'word-task' },
        { stage: 'deduplication', reason: 'DUPLICATE_BLOCK', words: 3, taskId: 'word-task' },
      ],
    }]);
    expect(JSON.stringify(traceContext.trace.wordAccounting)).not.toContain('contenido admitido');
    expect(JSON.stringify(traceContext.trace.wordAccounting)).not.toContain('contenido duplicado');
  });

  it('records blocked planned tasks even when no task reaches issue execution', async () => {
    const caseAnalysis = { richCaseAnalysis: buildFixtureRichCaseAnalysis() } as any;
    const document = buildFixtureDocument();
    const template = getDocumentTemplate('recurso_revision_amparo_directo');
    document.documentType = template.tipo;
    document.documentTypeLabel = 'Recurso de Revisión en Amparo Directo';
    const plan = buildDocumentPlan({ doc: document, template, caseAnalysis });
    document.sections = plan.sections;
    document.coverageMatrix = plan.coverageMatrix;
    document.legalIssueMatrix = plan.legalIssueMatrix;
    const draftingPlan = buildDraftingPlan(
      document,
      0,
      caseAnalysis,
      plan.coverageMatrix,
      plan.legalIssueMatrix,
    );
    const traceContext = createGenerationTraceContext({
      generationId: 'trace-blocked-task-accounting',
      doc: document,
      providerRequested: 'NVIDIA',
      options: { enabled: true },
    });
    const sectionPlan = draftingPlan.sections.find((section) => section.issuePlans?.length);
    expect(sectionPlan).toBeDefined();

    const generated = await generateSection(
      document,
      sectionPlan!.templateSectionId,
      'Interponer el recurso.',
      undefined,
      undefined,
      sectionPlan,
      caseAnalysis,
      traceContext,
      async () => ({
        success: false,
        content: '',
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
        model: 'test',
        fallback: false,
        latencyMs: 0,
      }),
    );

    expect(generated.generationTasks?.length).toBeGreaterThan(0);
    expect(generated.taskAccounting?.blockedTasks).toBe(generated.taskAccounting?.plannedTasks);
    expect(traceContext.trace.generationTasks.length).toBe(generated.generationTasks?.length);
    expect(traceContext.trace.taskExecutions).toHaveLength(0);
  }, 30000);
});
