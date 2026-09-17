import { describe, expect, it, vi } from 'vitest';
import { createDocumentNode, type DocumentNode, type ContentBlock } from '@/lib/legal-engine/types';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import { generateSection, type SectionPlan } from '@/lib/legal-engine/pipeline';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { CoverageMatrix, DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { AIRequest } from '@/lib/ai/providers/types';

const SECTION_ID = 'sec-pruebas';

function makeFixture(): { doc: ReturnType<typeof makeFixtureDocument>; analysis: ReturnType<typeof makeFixtureFCaseAnalysis>; section: DocumentNode; sectionPlan: SectionPlan } {
  const analysis = makeFixtureFCaseAnalysis();
  const doc = makeFixtureDocument();
  const section = createDocumentNode({ id: SECTION_ID, type: 'evidence', title: 'PRUEBAS', order: 1 });
  doc.sections = [section];
  const coverageItem: DocumentCoverageItem = {
    id: 'cov-section-evidence',
    category: 'EVIDENCE_TREATMENT',
    title: 'Relación entre contrato y hecho',
    description: 'Relacionar el contrato mencionado con el hecho 1.',
    required: true,
    status: 'pending',
    targetSectionIds: [SECTION_ID],
    sourceEntityType: 'EVIDENCE_MENTION',
    sourceEntityIds: ['fixture-f-evidence-mention-1'],
    factIds: ['fixture-f-fact-1'],
    evidenceMentionIds: ['fixture-f-evidence-mention-1'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    relationStatus: 'EXPLICIT',
    provenance: analysis.richCaseAnalysis!.facts[0].provenance,
  } as DocumentCoverageItem;
  const coverageMatrix: CoverageMatrix = {
    documentId: doc.id,
    documentType: doc.documentType,
    items: [coverageItem],
    summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
  const issue: LegalIssueItem = {
    id: 'issue-section-evidence',
    issueType: 'EVIDENCE_RELEVANCE',
    question: '¿Qué demuestra el contrato mencionado?',
    source: { mode: 'RICH_COVERAGE', coverageItemId: coverageItem.id, coverageCategory: 'EVIDENCE_TREATMENT', sourceEntityType: 'EVIDENCE_MENTION', sourceEntityIds: ['fixture-f-evidence-mention-1'] },
    coverageItemIds: [coverageItem.id],
    claimIds: [],
    factIds: ['fixture-f-fact-1'],
    evidenceMentionIds: ['fixture-f-evidence-mention-1'],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: [],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: false,
    status: 'READY_FOR_GENERATION',
    researchStatus: 'NOT_REQUIRED',
    provenance: coverageItem.provenance || [],
    relationStatus: 'EXPLICIT',
  };
  const legalIssueMatrix: LegalIssueMatrix = {
    documentId: doc.id,
    documentType: doc.documentType,
    sourceMode: 'RICH',
    issues: [issue],
    summary: { total: 1, required: 1, blocked: 0, readyForGeneration: 1, needsLegalResearch: 0, needsClientPosition: 0, unresolvedConflict: 0, unlinked: 0 },
  };
  doc.coverageMatrix = coverageMatrix;
  doc.legalIssueMatrix = legalIssueMatrix;
  const sectionPlan: SectionPlan = {
    templateSectionId: SECTION_ID,
    title: section.title,
    objective: 'Relacionar el contrato con el hecho de manera continua.',
    purpose: 'Sección probatoria',
    sourceFacts: ['fixture-f-fact-1'],
    legalIssues: [issue.id],
    historicalReferences: [],
    expectedDepth: 'MEDIUM',
    expectedParagraphs: 1,
    coverageItemIds: [coverageItem.id],
    requiredCoverageItemIds: [coverageItem.id],
  };
  return { doc, analysis, section, sectionPlan };
}

describe('E2E section architecture opt-in', () => {
  it('keeps issue grounding and makes one narrative call for one supported section', async () => {
    const fixture = makeFixture();
    const provider = vi.fn().mockImplementation(async (request: AIRequest & { taskType?: string }) => {
      if (request.taskType === 'SECTION_SUPPORT') {
        const packet = request.legalContext as any;
        return {
          success: true,
          content: JSON.stringify({
            status: 'READY',
            text: 'La relación jurídica inició en enero de 2024. Contrato mencionado en la fuente. El contrato laboral mencionado se vincula con ese hecho.',
            usedCoverageItemIds: packet.sourceManifest.accepted.coverageItemIds,
            usedFactIds: packet.sourceManifest.accepted.factIds,
            usedEvidenceIds: packet.sourceManifest.accepted.evidenceIds,
            usedAuthorityIds: packet.sourceManifest.accepted.authorityIds,
            unresolvedRequirements: [],
          }),
          provider: 'nvidia', providerRequested: 'nvidia', providerActuallyUsed: 'nvidia',
          model: 'meta/llama-3.2-11b-vision-instruct', origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
        };
      }
      const context = request.legalContext as any;
      return {
        success: true,
        structuredOutput: {
          factualDevelopment: ['La relación jurídica inició en enero de 2024.'],
          evidentiaryDevelopment: ['El contrato laboral mencionado se vincula con ese hecho.'],
          legalDevelopment: [],
          sourceEntityIds: context.evidenceMentions?.map((item: { id: string }) => item.id) || [],
          authorityMentionIds: [],
          unresolvedRequirements: [],
        },
        provider: 'nvidia', providerRequested: 'nvidia', providerActuallyUsed: 'nvidia',
        model: 'meta/llama-3.2-11b-vision-instruct', origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
      };
    });

    const generated = await generateSection(
      fixture.doc,
      SECTION_ID,
      'Redacta la sección completa.',
      undefined,
      undefined,
      fixture.sectionPlan,
      fixture.analysis,
      undefined,
      provider,
      1,
      undefined,
      undefined,
      'section',
    );

    const requests = provider.mock.calls.map(([request]) => request as any);
    const narrativeRequests = requests.filter((request) => request.taskType === 'SECTION_SUPPORT');
    const sectionDraft = generated.sectionDraft;
    const blocks = generated.blocks || [];

    expect(narrativeRequests).toHaveLength(1);
    expect(requests.filter((request) => request.taskType !== 'SECTION_SUPPORT').length).toBeGreaterThan(0);
    expect(sectionDraft).toBeDefined();
    expect(['ACCEPTED', 'VALID_NON_FINAL']).toContain(sectionDraft!.status);
    expect(sectionDraft!.generationTaskIds).toEqual(expect.arrayContaining([expect.stringContaining('task-evidence-')]));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('contrato laboral');
    expect((blocks[0] as ContentBlock).generationTaskIds?.length).toBeGreaterThan(0);
  });
});
