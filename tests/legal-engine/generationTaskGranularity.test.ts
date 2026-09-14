import { describe, expect, it } from 'vitest';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { CoverageMatrix, DocumentCoverageItem } from '@/lib/legal-engine/coverageMatrix';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { SectionPlan } from '@/lib/legal-engine/pipeline';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { makeFixtureFCaseAnalysis } from '../fixtures/richCoverageFixtures';

const SECTION_ID = 'sec-sentencia';

function makeCoverage(id: string, factId: string): DocumentCoverageItem {
  return {
    id,
    category: 'FACT_RESPONSE',
    description: `Respuesta sustantiva para ${factId}`,
    required: true,
    status: 'pending',
    targetSectionIds: [SECTION_ID],
    sourceEntityType: 'FACT',
    sourceEntityIds: [factId],
    factIds: [factId],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    relationStatus: 'EXPLICIT',
  };
}

function makeIssue(
  id: string,
  coverageItemIds: string[],
  factId: string,
  status: LegalIssueItem['status'],
  overrides: Partial<LegalIssueItem> = {},
): LegalIssueItem {
  return {
    id,
    issueType: 'FACT_DISPUTE',
    question: `¿Cuál es la postura respecto de ${factId}?`,
    source: {
      mode: 'RICH_COVERAGE',
      coverageItemId: coverageItemIds[0],
      coverageCategory: 'FACT_RESPONSE',
      sourceEntityType: 'FACT',
      sourceEntityIds: [factId],
    },
    coverageItemIds,
    claimIds: [],
    factIds: [factId],
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: [],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: false,
    status,
    researchStatus: 'NOT_REQUIRED',
    provenance: [],
    relationStatus: 'EXPLICIT',
    ...overrides,
  };
}

function makeFixture(options: {
  coverages: DocumentCoverageItem[];
  issues: LegalIssueItem[];
}): {
  analysis: CaseAnalysis;
  coverageMatrix: CoverageMatrix;
  legalIssueMatrix: LegalIssueMatrix;
  sectionPlan: SectionPlan;
  document: ReturnType<typeof createEmptyDocument>;
} {
  const section = createDocumentNode({
    id: SECTION_ID,
    type: 'background',
    title: 'SENTENCIA RECURRIDA',
    order: 10,
    content: [],
  });
  const document = createEmptyDocument({
    id: 'doc-task-granularity',
    title: 'Documento de prueba de granularidad',
    documentType: 'recurso_revision_amparo_directo',
    documentTypeLabel: 'Recurso de revisión en amparo directo',
    matter: 'Amparo',
    sections: [section],
  });
  const coverageMatrix: CoverageMatrix = {
    documentId: document.id,
    documentType: document.documentType,
    items: options.coverages,
    summary: {
      total: options.coverages.length,
      required: options.coverages.length,
      pending: options.coverages.length,
      generated: 0,
      covered: 0,
      unsupported: 0,
      weak: 0,
      notApplicable: 0,
    },
  };
  const legalIssueMatrix: LegalIssueMatrix = {
    documentId: document.id,
    documentType: document.documentType,
    sourceMode: 'RICH',
    issues: options.issues,
    summary: {
      total: options.issues.length,
      required: options.issues.filter((issue) => issue.required).length,
      blocked: options.issues.filter((issue) => issue.blocking).length,
      readyForGeneration: options.issues.filter((issue) => issue.status === 'READY_FOR_GENERATION').length,
      needsLegalResearch: options.issues.filter((issue) => issue.status === 'NEEDS_RESEARCH').length,
      needsClientPosition: options.issues.filter((issue) => issue.status === 'NEEDS_CLIENT_POSITION').length,
      unresolvedConflict: 0,
      unlinked: 0,
    },
  };
  const analysis = makeFixtureFCaseAnalysis();
  const sectionPlan: SectionPlan = {
    templateSectionId: SECTION_ID,
    title: section.title,
    objective: 'Responder con trazabilidad a cada cuestión de hecho.',
    sourceFacts: [],
    legalIssues: options.issues.map((issue) => issue.id),
    historicalReferences: [],
    expectedDepth: 'MEDIUM',
    expectedParagraphs: 2,
    coverageItemIds: options.coverages.map((coverage) => coverage.id),
    requiredCoverageItemIds: options.coverages.map((coverage) => coverage.id),
  };
  return { analysis, coverageMatrix, legalIssueMatrix, sectionPlan, document };
}

describe('granularidad LegalIssue → GenerationTask', () => {
  it('separa un issue READY de otro bloqueado en tareas independientes', () => {
    const readyCoverage = makeCoverage('cov-ready', 'fact-ready');
    const blockedCoverage = makeCoverage('cov-blocked', 'fact-blocked');
    const fixture = makeFixture({
      coverages: [readyCoverage, blockedCoverage],
      issues: [
        makeIssue('issue-ready', [readyCoverage.id], 'fact-ready', 'READY_FOR_GENERATION'),
        makeIssue('issue-blocked', [blockedCoverage.id], 'fact-blocked', 'NEEDS_CLIENT_POSITION', {
          blocking: true,
          clientPositionStatus: 'UNKNOWN',
        }),
      ],
    });

    const tasks = buildGenerationTasksForSection(
      fixture.sectionPlan,
      { ...fixture.document, legalIssueMatrix: fixture.legalIssueMatrix },
      fixture.analysis,
      fixture.coverageMatrix,
    );

    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.legalIssueIds)).toEqual([
      ['issue-blocked'],
      ['issue-ready'],
    ]);
    expect(tasks.map((task) => task.coverageItemIds)).toEqual([
      ['cov-blocked'],
      ['cov-ready'],
    ]);
    const repeatedTasks = buildGenerationTasksForSection(
      fixture.sectionPlan,
      { ...fixture.document, legalIssueMatrix: fixture.legalIssueMatrix },
      fixture.analysis,
      fixture.coverageMatrix,
    );
    expect(repeatedTasks.map((task) => ({ id: task.id, order: task.order, issueIds: task.legalIssueIds, coverage: task.coverageItemIds })))
      .toEqual(tasks.map((task) => ({ id: task.id, order: task.order, issueIds: task.legalIssueIds, coverage: task.coverageItemIds })));
  });

  it('mantiene juntas varias Coverage del mismo issue sin cruzarlas con otro issue', () => {
    const firstCoverage = makeCoverage('cov-ready-a', 'fact-ready');
    const secondCoverage = makeCoverage('cov-ready-b', 'fact-ready');
    const fixture = makeFixture({
      coverages: [firstCoverage, secondCoverage],
      issues: [makeIssue('issue-ready', [firstCoverage.id, secondCoverage.id], 'fact-ready', 'READY_FOR_GENERATION')],
    });

    const tasks = buildGenerationTasksForSection(
      fixture.sectionPlan,
      { ...fixture.document, legalIssueMatrix: fixture.legalIssueMatrix },
      fixture.analysis,
      fixture.coverageMatrix,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0].legalIssueIds).toEqual(['issue-ready']);
    expect(tasks[0].coverageItemIds).toEqual(['cov-ready-a', 'cov-ready-b']);
  });

  it('no permite que un issue bloqueado comparta tarea con uno READY', () => {
    const readyCoverage = makeCoverage('cov-ready', 'fact-ready');
    const blockedCoverage = makeCoverage('cov-blocked', 'fact-blocked');
    const fixture = makeFixture({
      coverages: [readyCoverage, blockedCoverage],
      issues: [
        makeIssue('issue-ready', [readyCoverage.id], 'fact-ready', 'READY_FOR_GENERATION'),
        makeIssue('issue-blocked', [blockedCoverage.id], 'fact-blocked', 'NEEDS_CLIENT_POSITION', {
          blocking: true,
          clientPositionStatus: 'UNKNOWN',
        }),
      ],
    });

    const tasks = buildGenerationTasksForSection(
      fixture.sectionPlan,
      { ...fixture.document, legalIssueMatrix: fixture.legalIssueMatrix },
      fixture.analysis,
      fixture.coverageMatrix,
    );

    expect(tasks.every((task) => (task.legalIssueIds || []).length <= 1)).toBe(true);
    expect(tasks.find((task) => task.legalIssueIds?.[0] === 'issue-ready')?.legalIssueIds).toEqual(['issue-ready']);
    expect(tasks.find((task) => task.legalIssueIds?.[0] === 'issue-blocked')?.legalIssueIds).toEqual(['issue-blocked']);
  });
});
