import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { runGenerationPipeline, type PipelineInput } from '@/lib/legal-engine/pipeline';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

const REAL_PDF = 'data/uploads/templates/1787377598439-0129000036717288006AST.PDF';
const TARGET_SECTION = 'sec-recurso_revision_amparo_directo-3';
const MARKER = 'TEST-DESCRIPTIVE-CONTRACT-CONSISTENCY-XYZ';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: {
    orderedBlocks: Array<{ text: string; legalIssueIds?: string[]; coverageItemIds?: string[] }>;
    trace: { blockLinks: Array<{ generationTaskId?: string; legalIssueIds: string[]; coverageItemIds: string[] }> };
  };
};

describe('E2E real PDF: LegalIssue → editor', () => {
  it('executes the real READY issue through scoped context, provider contract, semantic evaluation and assembly', async () => {
    const extraction = await extractPdfTextServer(readFileSync(REAL_PDF));
    const source = createSourceDocument({
      id: 'real-pdf-e2e-source',
      filename: REAL_PDF.split('/').pop() || REAL_PDF,
      type: 'pdf',
      pages: extraction.pages.map((page) => ({
        page: page.pageNumber,
        text: page.text,
        chars: page.text.length,
      })),
      sourceValidated: true,
    });
    const extractedAnalysis = reconstructCaseAnalysis([source], 'Preparar el recurso de revisión en amparo directo únicamente con la fuente real.', '', {
      includeReferenceInAnalysis: true,
    });
    const fact1 = extractedAnalysis.richCaseAnalysis?.facts.find((fact) => fact.id === 'fact-1');
    expect(fact1).toBeDefined();
    const analysis = {
      ...extractedAnalysis,
      richCaseAnalysis: {
        ...extractedAnalysis.richCaseAnalysis!,
        facts: extractedAnalysis.richCaseAnalysis!.facts.map((fact) => fact.id === 'fact-1'
          ? { ...fact, assertionStatus: 'ESTABLISHED_FACT' as const }
          : fact),
      },
    };

    const provider = vi.fn().mockImplementation(async (request: any) => {
      const context = request.legalContext;
      const factText = context.facts[0]?.proposition || 'el hecho expresamente vinculado en la fuente';
      const sourceEntityIds = context.facts.map((item: { id: string }) => item.id);
      const descriptive = context.draftContract === 'DESCRIPTIVE';
      return {
        success: true,
        structuredOutput: descriptive
          ? {
            factualDevelopment: [`La fuente identifica el hecho establecido: ${factText}. ${MARKER}`],
            sourceEntityIds,
            authorityMentionIds: [],
            unresolvedRequirements: [],
          }
          : {
            thesis: 'La respuesta se limita al hecho vinculado y a la postura procesal permitida.',
            factualDevelopment: [`La fuente identifica el hecho relacionado como: ${factText}. ${MARKER}`],
            evidentiaryDevelopment: ['La respuesta conserva únicamente las referencias probatorias permitidas por el contexto.'],
            legalDevelopment: ['El desarrollo jurídico queda circunscrito a la cuestión asignada y no incorpora autoridades no presentes en la fuente.'],
            application: 'La aplicación enlaza el hecho permitido con la cuestión jurídica concreta.',
            conclusion: 'La conclusión es provisional y queda limitada al alcance de la cuestión asignada.',
            sourceEntityIds,
            authorityMentionIds: context.authorities.map((item: { id: string }) => item.id),
            unresolvedRequirements: [],
          },
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
        model: 'deterministic-test-provider',
      };
    });

    const result = await runGenerationPipeline({
      userInstruction: 'Preparar el recurso de revisión en amparo directo únicamente con la fuente real.',
      sourceDocuments: [source],
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'constitucional',
      jurisdiction: 'federal',
      targetSection: TARGET_SECTION,
      traceOptions: { enabled: true },
      issueProviderInvoker: provider as PipelineInput['issueProviderInvoker'],
      workflow: {
        sourceDocuments: [source],
        analysis,
        selection: { mode: 'automatic', templateId: 'recurso_revision_amparo_directo' },
        flow: 'DOCUMENT_ANALYSIS',
        updatedAt: '2026-09-12T00:00:00.000Z',
      },
    }) as AssemblyAttachedDocument;

    const requests = provider.mock.calls.map(([request]) => request);
    const taskTrace = result.generationMetadata.auditTrace?.generationTasks || [];
    const targetRequest = requests.find((request) => request.taskType === 'ISSUE');
    const targetTrace = taskTrace.find((task) => task.sectionId === TARGET_SECTION
      && task.legalIssueIds.length === 1
      && task.legalIssueIds[0] === targetRequest?.legalContext.legalIssue.id);
    const targetSection = result.sections.find((section) => section.id === TARGET_SECTION);
    const editorText = targetSection?.content.map((block) => block.text).join('\n') || '';
    const assembly = result.documentAssemblyResult;

    expect(provider).toHaveBeenCalledTimes(1);
    expect(targetRequest).toBeDefined();
    expect(targetRequest.legalContext.legalIssue.id).toBe(targetTrace?.legalIssueIds[0]);
    expect(targetRequest.legalContext.draftContract).toBe('DESCRIPTIVE');
    expect(targetRequest.outputSchema.required).not.toContain('thesis');
    expect(targetRequest.outputSchema.required).not.toContain('application');
    expect(targetRequest.outputSchema.required).not.toContain('conclusion');
    expect(targetRequest.legalContext.coverage.map((item: { id: string }) => item.id)).toEqual(targetTrace?.coverageItemIds);
    expect(targetRequest.userMessage).toContain(targetRequest.legalContext.legalIssue.question);
    expect(targetRequest.userMessage).not.toContain('legalIssueIds: [');

    expect(taskTrace.filter((task) => task.sectionId === TARGET_SECTION && task.legalIssueIds.length === 1)).toHaveLength(10);
    expect(taskTrace.filter((task) => task.sectionId === TARGET_SECTION).every((task) => task.legalIssueIds.length <= 1)).toBe(true);
    expect(result.generationMetadata.auditTrace?.issueGenerationAttempts).toHaveLength(1);
    expect(result.generationMetadata.auditTrace?.semanticEvaluations.length).toBeGreaterThan(0);
    expect(result.generationMetadata.auditTrace?.draftBlocks.length).toBeGreaterThan(0);
    expect(editorText).toContain(MARKER);
    expect(assembly?.orderedBlocks.some((block) => block.text.includes(MARKER))).toBe(true);
    expect(assembly?.trace.blockLinks.some((link) => link.legalIssueIds.length === 1 && link.coverageItemIds.length === 1)).toBe(true);
    expect(result.generationMetadata.auditTrace?.taskExecutions.some((task) => task.responseStatus === 'ACCEPTED')).toBe(true);
  }, 120000);
});
