import { describe, expect, it } from 'vitest';
import type {
  ClientPositionStatus,
  LegalIssueItem,
  LegalIssueMatrix,
  LegalResearchStatus,
  LegalIssueSource,
  LegalIssueStatus,
  LegalIssueType,
} from '@/lib/legal-engine/legalIssueMatrix';
import type { CoverageCategory, CoverageEntityType, CoverageMatrix, CoverageRelationStatus } from '@/lib/legal-engine/coverageMatrix';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { buildLegalIssueMatrix, validateLegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { buildDraftingPlan } from '@/lib/legal-engine/pipeline';
import {
  buildGenerationTasksForSection,
  buildLegalResearchTaskForIssue,
  buildTaskContextPack,
  executeGenerationTask,
  type GenerationTask,
} from '@/lib/legal-engine/generationTasks';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import type { SourceProvenance } from '@/lib/legal-engine/case-extraction/types';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

const provenance: SourceProvenance[] = [];
const source: LegalIssueSource = {
  mode: 'RICH_COVERAGE',
  coverageItemId: 'cov-claim-fixture-f-claim-1',
  coverageCategory: 'CLAIM_RESPONSE' as CoverageCategory,
  sourceEntityType: 'CLAIM' as CoverageEntityType,
  sourceEntityIds: ['fixture-f-claim-1'],
};

const item: LegalIssueItem = {
  id: 'issue-fixture-f-claim-1',
  issueType: 'CLAIM_ELEMENT' as LegalIssueType,
  question: '¿La prestación cuenta con elementos explícitamente vinculados para su análisis?',
  source,
  coverageItemIds: ['cov-claim-fixture-f-claim-1'],
  claimIds: ['fixture-f-claim-1'],
  factIds: ['fixture-f-fact-1'],
  evidenceMentionIds: ['fixture-f-evidence-mention-1'],
  evidenceOfferIds: [],
  argumentIds: [],
  authorityMentionIds: [],
  conflictIds: [],
  missingDataIds: [],
  clientPositionStatus: 'NOT_REQUIRED' as ClientPositionStatus,
  required: true,
  blocking: false,
  status: 'READY_FOR_GENERATION' as LegalIssueStatus,
  researchStatus: 'NOT_REQUIRED' as LegalResearchStatus,
  provenance,
  relationStatus: 'EXPLICIT' as CoverageRelationStatus,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function buildFixtureMatrix() {
  const analysis = makeFixtureFCaseAnalysis();
  const document = { ...makeFixtureDocument(), id: 'fixture-rich-document' };
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  return { analysis, document, coverage, matrix: buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage }) };
}

describe('LegalIssueMatrix canonical types', () => {
  it('accepts the complete canonical item and matrix shape', () => {
    const matrix: LegalIssueMatrix = {
      documentId: 'fixture-rich-document',
      documentType: 'contestacion_demanda_laboral',
      sourceMode: 'RICH',
      issues: [item],
      summary: {
        total: 1,
        required: 1,
        blocked: 0,
        readyForGeneration: 1,
        needsLegalResearch: 0,
        needsClientPosition: 0,
        unresolvedConflict: 0,
        unlinked: 0,
      },
    };
    expect(matrix.issues[0].id).toBe('issue-fixture-f-claim-1');
  });
});

it('uses deterministic IDs independent of construction call', () => {
  const first = buildFixtureMatrix().matrix;
  const second = buildFixtureMatrix().matrix;
  expect(first.issues.map((issue) => issue.id)).toEqual(second.issues.map((issue) => issue.id));
});

it('does not use array index as identity', () => {
  const first = buildFixtureMatrix().matrix;
  const fixture = makeFixtureFCaseAnalysis();
  fixture.richCaseAnalysis!.claims = [...fixture.richCaseAnalysis!.claims].reverse();
  const document = { ...makeFixtureDocument(), id: 'fixture-rich-document' };
  const coverage = buildCoverageMatrix(fixture, document, document.sections);
  const second = buildLegalIssueMatrix({ caseAnalysis: fixture, coverageMatrix: coverage });
  const firstByClaim = new Map(first.issues.flatMap((issue) => issue.claimIds.map((id) => [id, issue.id] as const)));
  const secondByClaim = new Map(second.issues.flatMap((issue) => issue.claimIds.map((id) => [id, issue.id] as const)));
  expect(secondByClaim).toEqual(firstByClaim);
});

it('does not mutate rich analysis or coverage', () => {
  const { analysis, coverage } = buildFixtureMatrix();
  const analysisBefore = clone(analysis);
  const coverageBefore = clone(coverage);
  buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(analysis).toEqual(analysisBefore);
  expect(coverage).toEqual(coverageBefore);
});

it('does not infer a relation from similar text', () => {
  const { matrix } = buildFixtureMatrix();
  const evidenceIssue = matrix.issues.find((issue) => issue.issueType === 'EVIDENCE_RELEVANCE' && issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'))!;
  expect(evidenceIssue.claimIds).toEqual([]);
  expect(evidenceIssue.factIds).toEqual(['fixture-f-fact-1']);
});

it('keeps every material issue linked to an existing Coverage item', () => {
  const { coverage, matrix } = buildFixtureMatrix();
  const coverageIds = new Set(coverage.items.map((item) => item.id));
  expect(matrix.issues.every((issue) => issue.coverageItemIds.some((id) => coverageIds.has(id)))).toBe(true);
});

it('maps claim, fact, evidence, argument and authority Coverage without cross-product expansion', () => {
  const { matrix } = buildFixtureMatrix();
  expect(matrix.issues.some((issue) => issue.issueType === 'CLAIM_ELEMENT' && issue.claimIds.includes('fixture-f-claim-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'FACT_DISPUTE' && issue.factIds.includes('fixture-f-fact-2'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'EVIDENCE_RELEVANCE' && issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'SOURCE_ARGUMENT' && issue.argumentIds.includes('fixture-f-argument-1'))).toBe(true);
  expect(matrix.issues.some((issue) => issue.issueType === 'AUTHORITY_RESEARCH' && issue.authorityMentionIds.includes('fixture-f-authority-1'))).toBe(true);
  expect(matrix.issues.every((issue) => !issue.question.includes('IMPROCEDENTE'))).toBe(true);
  const serialized = JSON.stringify(matrix);
  expect(serialized).not.toContain('defense');
  expect(serialized).not.toContain('exception');
  expect(serialized).not.toContain('statute');
  expect(serialized).not.toContain('jurisprudence');
  expect(serialized).not.toContain('legalConclusion');
});

it('does not make EvidenceOffer from an EvidenceMention', () => {
  const analysis = makeFixtureFCaseAnalysis();
  analysis.richCaseAnalysis = {
    ...analysis.richCaseAnalysis!,
    evidenceOffers: [],
  };
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  const mentionIssue = matrix.issues.find((issue) => issue.issueType === 'EVIDENCE_RELEVANCE' && issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'))!;
  expect(mentionIssue.issueType).toBe('EVIDENCE_RELEVANCE');
  expect(mentionIssue.evidenceOfferIds).toEqual([]);
  expect(matrix.issues.some((issue) => issue.issueType === 'EVIDENCE_SUFFICIENCY')).toBe(false);
});

it('creates EvidenceOffer issue only for an explicit offer', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.evidenceOfferIds.includes('fixture-f-offer-1'))!;
  expect(issue.issueType).toBe('EVIDENCE_SUFFICIENCY');
  expect(issue.evidenceMentionIds).toContain('fixture-f-evidence-mention-1');
});

it('creates zero issues for formal deterministic Coverage', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  const coverage = {
    documentId: document.id,
    documentType: document.documentType,
    items: [{
      id: 'cov-formal-signature',
      category: 'FORMAL_REQUIREMENT',
      description: 'Firma',
      required: true,
      status: 'pending',
      targetSectionIds: ['sec-firma'],
      scope: 'FORMAL',
      satisfactionPolicy: 'FORMAL_DETERMINISTIC_ALLOWED',
    }],
    summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  } as CoverageMatrix;
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.issues).toEqual([]);
});

it('blocks an issue when the required client position is missing', () => {
  const { matrix } = buildFixtureMatrix();
  const factIssue = matrix.issues.find((issue) => issue.issueType === 'FACT_DISPUTE' && issue.factIds.includes('fixture-f-fact-1'))!;
  expect(factIssue.clientPositionStatus).toBe('UNKNOWN');
  expect(factIssue.status).toBe('NEEDS_CLIENT_POSITION');
  expect(factIssue.blocking).toBe(true);
});

it('does not block confirmed client position for the explicitly confirmed proposition', () => {
  const { matrix } = buildFixtureMatrix();
  const factIssue = matrix.issues.find((issue) => issue.issueType === 'FACT_DISPUTE' && issue.factIds.includes('fixture-f-fact-2'))!;
  expect(factIssue.clientPositionStatus).toBe('CONFIRMED');
  expect(factIssue.status).not.toBe('NEEDS_CLIENT_POSITION');
});

it('keeps an explicit conflict blocking without selecting a value', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.conflictIds.includes('fixture-f-conflict-1'))!;
  expect(issue.status).toBe('BLOCKED_BY_CONFLICT');
  expect(issue.blocking).toBe(true);
  expect(issue.statusReason).toMatch(/conflict|conflicto/i);
});

it('marks source-cited authority work as research without legal verification', () => {
  const { matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.issueType === 'AUTHORITY_RESEARCH')!;
  expect(issue.status).toBe('NEEDS_RESEARCH');
  expect(issue.researchStatus).not.toBe('NOT_REQUIRED');
});

it('detects orphan issues and Coverage without a required issue', () => {
  const { coverage, matrix } = buildFixtureMatrix();
  const invalid = {
    ...matrix,
    issues: [...matrix.issues, {
      ...matrix.issues[0],
      id: 'orphan-issue',
      coverageItemIds: ['coverage-does-not-exist'],
    }],
  };
  const result = validateLegalIssueMatrix(invalid, coverage, makeFixtureFCaseAnalysis());
  expect(result.ok).toBe(false);
  expect(result.orphanIssueIds).toContain('orphan-issue');
});

it('counts research while preserving matrix planning metadata', () => {
  const { matrix } = buildFixtureMatrix();
  expect(matrix.summary.needsLegalResearch).toBeGreaterThan(0);
  expect(matrix.issues.length).toBeGreaterThan(0);
});

it('attaches a conflict only through explicit item IDs and preserves standalone dependency', () => {
  const { matrix } = buildFixtureMatrix();
  const factIssue = matrix.issues.find((issue) => issue.issueType === 'FACT_DISPUTE' && issue.factIds.includes('fixture-f-fact-4'))!;
  expect(factIssue.conflictIds).toContain('fixture-f-conflict-1');
  const conflictIssue = matrix.issues.find((issue) => issue.issueType === 'CONFLICT_DEPENDENCY');
  expect(conflictIssue?.conflictIds).toContain('fixture-f-conflict-1');
});

it('keeps an explicitly unlinked material item distinct from unknown relations', () => {
  const { document, analysis } = buildFixtureMatrix();
  const coverage = {
    documentId: document.id,
    documentType: document.documentType,
    items: [{
      id: 'cov-unlinked-material',
      category: 'FACT_RESPONSE',
      description: 'Hecho sin entidad expresamente vinculada',
      required: true,
      status: 'pending',
      targetSectionIds: ['sec-hechos'],
      scope: 'SUBSTANTIVE',
      satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
      factIds: [],
    }],
    summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  } as CoverageMatrix;
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.issues[0].relationStatus).toBe('UNLINKED');
  expect(matrix.issues[0].status).toBe('UNLINKED');
});

it('ignores disagreeing legacy issues when rich analysis is present', () => {
  const analysis = makeFixtureFCaseAnalysis({
    claims: ['LEGACY CLAIM THAT MUST NOT DRIVE RICH PLANNING'],
    legalIssues: [{
      id: 'legacy-invented',
      type: 'LEGALITY',
      title: 'Legacy invented issue',
      parameter: 'Legacy parameter',
      challengedAct: 'Legacy act',
      contradiction: 'Legacy contradiction',
      affectation: 'Legacy affectation',
      consequence: 'Legacy consequence',
    }],
  });
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('RICH');
  expect(matrix.issues.some((issue) => issue.id === 'legacy-invented')).toBe(false);
  expect(matrix.issues.some((issue) => issue.question.includes('LEGACY CLAIM'))).toBe(false);
});

it('uses an explicitly marked legacy adapter only when rich analysis is absent', () => {
  const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
  analysis.proceduralPosture.legalityIssues = [{
    id: 'legacy-issue-1',
    type: 'LEGALITY',
    title: 'Cuestión legacy de prueba',
    parameter: 'No debe copiarse',
    challengedAct: 'No debe copiarse',
    contradiction: 'No debe copiarse',
    affectation: 'No debe copiarse',
    consequence: 'No debe copiarse',
  }];
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('LEGACY_FALLBACK');
  expect(matrix.issues[0].source.mode).toBe('LEGACY_FALLBACK');
  expect(matrix.issues[0].statusReason).toBe('LEGACY_ISSUE_REQUIRES_REVIEW');
  expect(JSON.stringify(matrix.issues[0])).not.toContain('No debe copiarse');
});

it('keeps legacy generation behavior available for the fallback path', () => {
  const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
  const document = makeFixtureDocument();
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.sourceMode).toBe('LEGACY_FALLBACK');
});

it('does not create labor issues for a non-labor template from matter wording alone', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  document.matter = 'civil';
  document.documentType = 'contestacion_demanda_civil';
  document.documentTypeLabel = 'Contestación de demanda civil';
  const coverage = buildCoverageMatrix(analysis, document, document.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix: coverage });
  expect(matrix.issues.some((issue) => issue.question.toLocaleLowerCase().includes('laboral'))).toBe(false);
});

it('propagates Coverage and canonical issue IDs through the document plan', () => {
  const analysis = makeFixtureFCaseAnalysis();
  const document = makeFixtureDocument();
  const template = {
    tipo: document.documentType,
    etiquetas: [document.documentTypeLabel],
    materia: document.matter,
    jurisdiccion: document.jurisdiction,
    procedimiento: 'contestación',
    rolAutor: 'demandado',
    objetivoProcesal: 'contestar',
  } as never;
  const result = buildDocumentPlan({ doc: document, template, caseAnalysis: analysis });
  expect(result.coverageMatrix).toBeDefined();
  expect(result.legalIssueMatrix?.sourceMode).toBe('RICH');
  const issueIds = new Set(result.legalIssueMatrix!.issues.map((issue) => issue.id));
  const plan = buildDraftingPlan({ ...document, sections: result.sections }, 0, analysis, result.coverageMatrix, result.legalIssueMatrix);
  const issuePlans = plan.sections.flatMap((section) => section.issuePlans || []);
  expect(issuePlans.some((issuePlan) => (issuePlan.legalIssueIds || []).some((id) => issueIds.has(id)))).toBe(true);
  expect(issuePlans.every((issuePlan) => !issuePlan.legalIssueIds || issuePlan.relatedCoverageItemIds?.every((id) => result.coverageMatrix!.items.some((item) => item.id === id)))).toBe(true);
});

it('passes plural legal issue IDs from the plan to GenerationTask', () => {
  const { analysis, document, coverage, matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.status === 'READY_FOR_GENERATION')!;
  const sectionPlan = {
    templateSectionId: issue.source.coverageItemId,
    title: 'ARGUMENTOS',
    objective: issue.question,
    sourceFacts: [],
    legalIssues: [issue.question],
    historicalReferences: [],
    expectedDepth: 'DEEP' as const,
    expectedParagraphs: 2,
    coverageItemIds: issue.coverageItemIds,
    issuePlans: [{ id: `plan-${issue.id}`, legalIssueIds: [issue.id], title: issue.question, relatedCoverageItemIds: issue.coverageItemIds }],
  };
  const tasks = buildGenerationTasksForSection(sectionPlan, document, analysis, coverage);
  expect(tasks.some((task) => task.legalIssueIds?.includes(issue.id))).toBe(true);
  expect(tasks.every((task) => !task.legalIssueIds || task.legalIssueIds.every((id) => matrix.issues.some((candidate) => candidate.id === id)))).toBe(true);
});

it('builds scoped context from only the selected issue IDs', () => {
  const { analysis, document, matrix } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.issueType === 'CLAIM_ELEMENT')!;
  const task = {
    id: 'task-issue-scoped',
    documentId: document.id,
    sectionId: 'sec-argumentos',
    sectionTitle: 'ARGUMENTOS',
    taskType: 'ISSUE',
    type: 'ISSUE',
    legalIssueIds: [issue.id],
    coverageItemIds: issue.coverageItemIds,
    claimIds: issue.claimIds,
    factIds: issue.factIds,
    evidenceIds: issue.evidenceMentionIds,
    authorityIds: issue.authorityMentionIds,
    objective: issue.question,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  } as GenerationTask;
  const context = buildTaskContextPack(task, document, analysis);
  expect(context.userMessage).toContain(issue.question);
  expect(context.userMessage).not.toContain('fixture-f-claim-2');
});

it('plans research without producing a final legal response', () => {
  const { matrix, document, analysis } = buildFixtureMatrix();
  const issue = matrix.issues.find((candidate) => candidate.status === 'NEEDS_RESEARCH')!;
  const researchTask = buildLegalResearchTaskForIssue(issue, document, 'sec-argumentos');
  expect(researchTask.taskType).toBe('LEGAL_RESEARCH');
  expect(researchTask.legalIssueIds).toEqual([issue.id]);
  expect(researchTask.status).toBe('pending');
  expect(researchTask.objective).toMatch(/sin resolverla ni afirmar aplicabilidad/i);
  return executeGenerationTask(
    researchTask,
    { ...document, legalIssueMatrix: matrix },
    analysis,
    async () => { throw new Error('provider must not be called'); },
  ).then(({ block, result }) => {
    expect(researchTask.status).toBe('completed');
    expect(block.text).toContain('LEGAL_RESEARCH_PLANNED');
    expect(result.provider).toBe('none');
    expect(result.success).toBe(true);
  });
});

it('records Coverage-to-Issue-to-Task IDs without source corpus', () => {
  const { document, coverage, matrix } = buildFixtureMatrix();
  document.legalIssueMatrix = matrix;
  const trace = createGenerationTraceContext({ generationId: 'trace-fixture-f3', doc: document, options: { enabled: true, now: () => new Date(0) } });
  const issue = matrix.issues[0];
  const task = {
    id: 'task-trace-fixture',
    sectionId: issue.source.coverageItemId,
    sectionTitle: 'ARGUMENTOS',
    taskType: 'ISSUE',
    legalIssueIds: [issue.id],
    coverageItemIds: issue.coverageItemIds,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'pending',
  } as GenerationTask;
  trace.recordTaskPlanned(task);
  trace.snapshotCoverageBefore(coverage);
  const snapshot = trace.trace.coverageMatrixBeforeGeneration!;
  expect(snapshot.items.find((item) => item.id === issue.coverageItemIds[0])?.legalIssueIds).toContain(issue.id);
  expect(trace.trace.generationTasks[0].legalIssueIds).toEqual([issue.id]);
  expect(JSON.stringify(trace.trace)).not.toContain(issue.question);
});

it('keeps NEEDS_RESEARCH structural and non-final without stopping matrix planning', () => {
  const { document, matrix } = buildFixtureMatrix();
  document.legalIssueMatrix = matrix;
  const result = runQualityGateCheck(document);
  expect(result.warnings.some((warning) => warning.checkId.includes('LEGAL_RESEARCH'))).toBe(true);
  expect(result.canMarkAsFinal).toBe(false);
  expect(result.criticalErrors.some((error) => error.checkId.includes('LEGAL_RESEARCH'))).toBe(false);
});
