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
