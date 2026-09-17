import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { buildLegalIssueMatrix, validateLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { buildEvidenceGroups } from '@/lib/legal-engine/evidenceGrouping';
import { buildIssueContextPack } from '@/lib/legal-engine/issueScopedGeneration';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import type { SectionPlan } from '@/lib/legal-engine/pipeline';
import { describe, expect, it } from 'vitest';

describe('identidad estructural de evidencia antes de GenerationTask', () => {
  function fixture() {
    const caseAnalysis = makeFixtureFCaseAnalysis();
    const document = makeFixtureDocument();
    const coverageMatrix = buildCoverageMatrix(caseAnalysis, document, document.sections);
    const evidenceCoverage = coverageMatrix.items.filter((item) =>
      item.category === 'EVIDENCE_TREATMENT' || item.category === 'EVIDENCE_OFFER',
    );
    const sectionPlan: SectionPlan = {
      templateSectionId: 'sec-pruebas',
      title: 'PRUEBAS',
      objective: 'Tratar únicamente la evidencia identificada.',
      sourceFacts: [],
      legalIssues: [],
      historicalReferences: [],
      expectedDepth: 'MEDIUM',
      expectedParagraphs: 2,
      coverageItemIds: evidenceCoverage.map((item) => item.id),
      requiredCoverageItemIds: evidenceCoverage.map((item) => item.id),
    };
    return { caseAnalysis, document, coverageMatrix, evidenceCoverage, sectionPlan };
  }

  it('agrupa únicamente una oferta con la mención a la que apunta su FK explícita', () => {
    const { caseAnalysis, evidenceCoverage } = fixture();
    const groups = buildEvidenceGroups(caseAnalysis.richCaseAnalysis!, evidenceCoverage);
    const linkedGroup = groups.find((group) => group.evidenceOfferIds.includes('fixture-f-offer-1'));
    expect(linkedGroup).toBeDefined();
    expect(linkedGroup?.evidenceMentionIds).toEqual(['fixture-f-evidence-mention-1']);
    expect(linkedGroup?.coverageItemIds).toEqual([
      'cov-evidence-treatment-fixture-f-evidence-mention-1',
      'cov-evidence-offer-fixture-f-offer-1',
    ]);
    expect(linkedGroup?.provenance.length).toBeGreaterThan(0);
    expect(groups).toHaveLength(2);
    expect(groups.filter((group) => group.evidenceMentionIds.includes('fixture-f-evidence-mention-2'))).toHaveLength(1);
  });

  it('no fusiona menciones distintas aunque compartan tipo o procedencia', () => {
    const { caseAnalysis, evidenceCoverage } = fixture();
    const rich = caseAnalysis.richCaseAnalysis!;
    const secondDocumental = {
      ...rich.evidenceMentions[0],
      id: 'fixture-f-evidence-mention-same-type-different-id',
      type: rich.evidenceMentions[0].type,
      description: 'Otro descriptor de la misma clase probatoria.',
    };
    const extraCoverage = {
      ...evidenceCoverage.find((item) => item.category === 'EVIDENCE_TREATMENT')!,
      id: 'cov-evidence-treatment-same-type-different-id',
      description: 'Tratamiento de otra mención con el mismo tipo.',
      sourceEntityIds: [secondDocumental.id],
      evidenceMentionIds: [secondDocumental.id],
    };
    const groups = buildEvidenceGroups(
      { ...rich, evidenceMentions: [...rich.evidenceMentions, secondDocumental] },
      [evidenceCoverage[0], extraCoverage],
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.evidenceMentionIds).flat()).toEqual([
      'fixture-f-evidence-mention-1',
      'fixture-f-evidence-mention-same-type-different-id',
    ]);
    expect(groups.some((group) => group.evidenceMentionIds.length > 1)).toBe(false);
  });

  it('reduce 3 tareas a 2 sin perder coverage ni relación explícita', () => {
    const { caseAnalysis, document, coverageMatrix, evidenceCoverage, sectionPlan } = fixture();
    const matrix = buildLegalIssueMatrix({ caseAnalysis, coverageMatrix });
    const evidenceIssues = matrix.issues.filter((issue) =>
      issue.issueType === 'EVIDENCE_RELEVANCE' || issue.issueType === 'EVIDENCE_SUFFICIENCY',
    );
    const linkedMentionIssue = evidenceIssues.find((issue) => issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1') && issue.issueType === 'EVIDENCE_RELEVANCE');
    const linkedOfferIssue = evidenceIssues.find((issue) => issue.evidenceOfferIds.includes('fixture-f-offer-1'));
    expect(linkedMentionIssue?.coverageItemIds).toEqual(['cov-evidence-treatment-fixture-f-evidence-mention-1']);
    expect(linkedOfferIssue?.coverageItemIds).toEqual(['cov-evidence-offer-fixture-f-offer-1']);
    expect(linkedMentionIssue?.id).not.toBe(linkedOfferIssue?.id);
    expect(validateLegalIssueMatrix(matrix, coverageMatrix, caseAnalysis).coverageWithoutIssueIds).toEqual([]);

    const tasks = buildGenerationTasksForSection(
      sectionPlan,
      { ...document, legalIssueMatrix: matrix },
      caseAnalysis,
      coverageMatrix,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => (task.evidenceIds || []).includes('fixture-f-offer-1'))).toEqual(expect.objectContaining({
      coverageItemIds: [
        'cov-evidence-treatment-fixture-f-evidence-mention-1',
        'cov-evidence-offer-fixture-f-offer-1',
      ],
      evidenceIds: ['fixture-f-evidence-mention-1', 'fixture-f-offer-1'],
    }));
    const groupedTask = tasks.find((task) => (task.evidenceIds || []).includes('fixture-f-offer-1'))!;
    const groupedPack = buildIssueContextPack(
      groupedTask,
      { ...document, coverageMatrix },
      caseAnalysis,
      matrix,
    );
    expect(groupedPack.coverage.map((item) => item.id)).toEqual(groupedTask.coverageItemIds);
    expect(groupedPack.evidenceMentions.map((item) => item.id)).toEqual(['fixture-f-evidence-mention-1']);
    expect(groupedPack.evidenceOffers.map((item) => item.id)).toEqual(['fixture-f-offer-1']);
  });
});
