import { describe, expect, it } from 'vitest';
import { createDocumentNode, type ContentBlock, type UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { DocumentCoverageItem, CoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import type { LegalIssueItem, LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { IssueDraftResult, IssueGenerationOutcome } from '@/lib/legal-engine/issueDraftResult';
import type { LegalResearchBundle, DerivedIssueReadiness } from '@/lib/legal-engine/legal-research/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import type { SectionPlan } from '@/lib/legal-engine/pipeline';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import { projectSectionPlanFromTasks } from '@/lib/legal-engine/sectionPlanning';
import { assembleSectionContextPacket } from '@/lib/legal-engine/sectionContextAssembly';

const section = createDocumentNode({
  id: 'sec-pruebas',
  type: 'evidence',
  title: 'PRUEBAS',
  order: 1,
});

const provenance = makeFixtureFCaseAnalysis().richCaseAnalysis!.facts[0].provenance;

function coverage(id: string, factId: string): DocumentCoverageItem {
  return {
    id,
    category: 'EVIDENCE_TREATMENT',
    description: `Tratamiento de ${factId}`,
    title: id,
    required: true,
    status: 'pending',
    targetSectionIds: [section.id],
    sourceEntityType: 'EVIDENCE_MENTION',
    sourceEntityIds: ['fixture-f-evidence-mention-1'],
    factIds: [factId],
    evidenceMentionIds: ['fixture-f-evidence-mention-1'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    relationStatus: 'EXPLICIT',
    provenance,
  } as DocumentCoverageItem;
}

function issue(id: string, coverageItemId: string, factId: string, status: LegalIssueItem['status'] = 'READY_FOR_GENERATION'): LegalIssueItem {
  return {
    id,
    issueType: 'EVIDENCE_RELEVANCE',
    question: `¿Qué demuestra ${factId}?`,
    source: {
      mode: 'RICH_COVERAGE',
      coverageItemId,
      coverageCategory: 'EVIDENCE_TREATMENT',
      sourceEntityType: 'EVIDENCE_MENTION',
      sourceEntityIds: ['fixture-f-evidence-mention-1'],
    },
    coverageItemIds: [coverageItemId],
    claimIds: [],
    factIds: [factId],
    evidenceMentionIds: ['fixture-f-evidence-mention-1'],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['fixture-f-authority-1'],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: status !== 'READY_FOR_GENERATION',
    status,
    researchStatus: 'NOT_REQUIRED',
    provenance,
    relationStatus: 'EXPLICIT',
  };
}

function task(id: string, issueId: string, coverageItemId: string, factId: string): GenerationTask {
  return {
    id,
    sectionId: section.id,
    sectionTitle: section.title,
    taskType: 'ISSUE',
    objective: `Ground ${issueId}`,
    complexity: 'MEDIUM',
    tokenBudget: 1200,
    status: 'completed',
    order: Number(id.replace(/\D/g, '')) || 0,
    coverageItemIds: [coverageItemId],
    factIds: [factId],
    evidenceIds: ['fixture-f-evidence-mention-1'],
    authorityIds: ['fixture-f-authority-1'],
    legalIssueIds: [issueId],
  };
}

function outcome(taskValue: GenerationTask, status: IssueGenerationOutcome['status'] = 'ACCEPTED'): IssueGenerationOutcome {
  const issueId = taskValue.legalIssueIds![0];
  const result: IssueDraftResult = {
    legalIssueId: issueId,
    coverageItemIds: [...(taskValue.coverageItemIds || [])],
    issueType: 'EVIDENCE_RELEVANCE',
    thesis: 'El contrato se relaciona con el hecho identificado.',
    factualDevelopment: ['La relación jurídica inició en enero de 2024.'],
    evidentiaryDevelopment: ['El contrato mencionado se vincula con ese hecho.'],
    legalDevelopment: ['La valoración debe limitarse a la constancia disponible.'],
    application: 'La constancia permite explicar la relación entre el documento y el hecho.',
    conclusion: 'La prueba queda vinculada al hecho sin ampliar su alcance.',
    sourceEntityIds: ['fixture-f-evidence-mention-1'],
    authorityMentionIds: ['fixture-f-authority-1'],
    verifiedAuthorityIds: [],
    unresolvedRequirements: [],
    generationMetadata: {
      promptVersion: 'ISSUE_DRAFT_V1',
      contextHash: `ctx-${taskValue.id}`,
      providerRequested: 'nvidia',
      providerActuallyUsed: 'nvidia',
      model: 'test-model',
      attemptCount: 1,
    },
  };
  return {
    legalIssueId: issueId,
    taskId: taskValue.id,
    status,
    attempts: [],
    result: status === 'BLOCKED' ? undefined : result,
    validation: status === 'BLOCKED' ? undefined : { status: 'VALID_ACCEPTED', errors: [], warnings: [] },
  };
}

function fixture(overrides: Partial<CaseAnalysis> = {}): {
  doc: UniversalLegalDocument;
  analysis: CaseAnalysis;
  sectionPlan: SectionPlan;
  tasks: GenerationTask[];
  outcomes: IssueGenerationOutcome[];
} {
  const analysis = makeFixtureFCaseAnalysis(overrides);
  const doc = makeFixtureDocument();
  doc.sections = [section];
  const coverageItems = [coverage('cov-pruebas-1', 'fixture-f-fact-1'), coverage('cov-pruebas-2', 'fixture-f-fact-2')];
  const coverageMatrix: CoverageMatrix = {
    documentId: doc.id,
    documentType: doc.documentType,
    items: coverageItems,
    summary: { total: coverageItems.length, required: coverageItems.length, pending: coverageItems.length, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
  const issues = [issue('issue-pruebas-1', coverageItems[0].id, 'fixture-f-fact-1'), issue('issue-pruebas-2', coverageItems[1].id, 'fixture-f-fact-2')];
  const legalIssueMatrix: LegalIssueMatrix = {
    documentId: doc.id,
    documentType: doc.documentType,
    sourceMode: 'RICH',
    issues,
    summary: { total: issues.length, required: issues.length, blocked: 0, readyForGeneration: issues.length, needsLegalResearch: 0, needsClientPosition: 0, unresolvedConflict: 0, unlinked: 0 },
  };
  doc.coverageMatrix = coverageMatrix;
  doc.legalIssueMatrix = legalIssueMatrix;
  const tasks = [task('task-1', issues[0].id, coverageItems[0].id, 'fixture-f-fact-1'), task('task-2', issues[1].id, coverageItems[1].id, 'fixture-f-fact-2')];
  const sectionPlan: SectionPlan = {
    templateSectionId: section.id,
    title: section.title,
    objective: 'Relacionar los medios probatorios con los hechos soportados.',
    purpose: 'Sección probatoria',
    sourceFacts: ['fixture-f-fact-1', 'fixture-f-fact-2'],
    legalIssues: issues.map((item) => item.id),
    historicalReferences: [],
    expectedDepth: 'MEDIUM',
    expectedParagraphs: 2,
    coverageItemIds: coverageItems.map((item) => item.id),
    requiredCoverageItemIds: coverageItems.map((item) => item.id),
  };
  return { doc, analysis, sectionPlan, tasks, outcomes: tasks.map((item) => outcome(item)) };
}

describe('SectionPlan and SectionContextPacket', () => {
  it('projects several GenerationTasks into one canonical SectionPlan without losing IDs or provenance', () => {
    const value = fixture();
    const projected = projectSectionPlanFromTasks({
      section,
      sectionPlan: value.sectionPlan,
      tasks: value.tasks,
      provenance,
    });

    expect(projected.generationTaskIds).toEqual(['task-1', 'task-2']);
    expect(projected.coverageItemIds).toEqual(['cov-pruebas-1', 'cov-pruebas-2']);
    expect(projected.factIds).toEqual(['fixture-f-fact-1', 'fixture-f-fact-2']);
    expect(projected.evidenceIds).toEqual(['fixture-f-evidence-mention-1']);
    expect(projected.authorityIds).toEqual(['fixture-f-authority-1']);
    expect(projected.provenance).toEqual(provenance);
  });

  it('builds deterministic context and excludes blocked issue output and unverified authority', () => {
    const value = fixture();
    const blockedTask = task('task-blocked', 'issue-blocked', 'cov-blocked', 'fixture-f-fact-4');
    const blocked = outcome({ ...blockedTask, legalIssueIds: ['issue-blocked'] }, 'BLOCKED');
    const first = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: [...value.tasks, blockedTask],
      issueOutcomes: [...value.outcomes, blocked],
    });
    const second = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: [blockedTask, ...value.tasks].reverse(),
      issueOutcomes: [blocked, ...value.outcomes].reverse(),
    });

    expect(first.status).toBe('BLOCKED');
    expect(first.blockers).toContain('ISSUE_NOT_RESOLVED');
    expect(first.previousSectionSummaries).toEqual([]);
    expect(first.groundedIssueOutputs).toHaveLength(2);
    expect(first.groundedIssueOutputs.map((item) => item.taskId)).toEqual(['task-1', 'task-2']);
    expect(first.verifiedAuthorities).toEqual([]);
    expect(first.sourceManifest.excluded.some((item) => item.id === 'task-blocked')).toBe(true);
    expect(first.contextHash).toBe(second.contextHash);
    expect(first).toMatchObject({
      facts: expect.arrayContaining([expect.objectContaining({ id: 'fixture-f-fact-1' })]),
      evidence: expect.arrayContaining([expect.objectContaining({ id: 'fixture-f-evidence-mention-1' })]),
    });
  });

  it('reports missing client position and deterministic overflow without leaking excluded material', () => {
    const value = fixture({ richCaseAnalysis: { ...makeFixtureFCaseAnalysis().richCaseAnalysis!, clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] } } });
    value.doc.legalIssueMatrix!.issues[0].status = 'NEEDS_CLIENT_POSITION';
    const packet = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: value.tasks,
      issueOutcomes: value.outcomes,
      limits: { maxContextCharacters: 100 },
    });

    expect(packet.status).toBe('BLOCKED');
    expect(packet.diagnostics).toContain('CONTEXT_OVERFLOW');
    expect(packet.blockers).toContain('CLIENT_POSITION_MISSING');
    expect(packet.sourceManifest.excluded.every((item) => item.reason)).toBe(true);
  });

  it('blocks issue-scoped output when the canonical issue still needs research', () => {
    const value = fixture();
    value.doc.legalIssueMatrix!.issues[0].status = 'NEEDS_RESEARCH';
    value.doc.legalIssueMatrix!.issues[0].researchStatus = 'NEEDS_RESEARCH';
    const packet = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: value.tasks,
      issueOutcomes: value.outcomes,
    });

    expect(packet.status).toBe('BLOCKED');
    expect(packet.groundedIssueOutputs.map((item) => item.legalIssueId)).not.toContain('issue-pruebas-1');
    expect(packet.blockers).toContain('RESEARCH_NOT_SUFFICIENT');
    expect(packet.sourceManifest.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'task-1', reason: 'RESEARCH_NOT_SUFFICIENT' }),
    ]));
  });

  it('blocks verified research whose authority is outside the canonical issue scope', () => {
    const value = fixture();
    const researchIssue = value.doc.legalIssueMatrix!.issues[0];
    researchIssue.status = 'READY_FOR_GENERATION';
    researchIssue.researchStatus = 'NEEDS_RESEARCH';
    const bundle = {
      legalIssueId: 'different-issue',
      requestId: 'research-request-1',
      researchStatus: 'VERIFIED_SUFFICIENT',
      researchHash: 'research-hash-1',
      regimeResolution: { status: 'RESOLVED', unresolvedFields: [] },
      verifiedAuthorities: [{
        id: 'authority-wrong-issue',
        verificationStatus: 'VERIFIED',
        supportsLegalIssueIds: ['different-issue'],
        source: { sourceTier: 'OFFICIAL_PRIMARY', sourceUrl: 'https://example.test/authority', sourceDomain: 'example.test', sourceHash: 'source-hash' },
        identity: { canonicalCitation: 'Autoridad fuera de issue', authorityType: 'STATUTE', issuingAuthority: 'Autoridad', identityKey: 'wrong' },
        temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-09-16T00:00:00.000Z', basis: [] },
        jurisdictionValidity: { status: 'APPLICABLE', basis: [] },
        proposition: { text: 'Proposición fuera de scope', supportLevel: 'DIRECT', limitations: [] },
      }],
    } as unknown as LegalResearchBundle;
    const readiness = {
      legalIssueId: researchIssue.id,
      canonicalStatus: researchIssue.status,
      researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      researchBundleHash: bundle.researchHash,
      blockers: [],
    } as DerivedIssueReadiness;
    const packet = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: value.tasks,
      issueOutcomes: value.outcomes,
      researchBundlesByIssueId: new Map([[researchIssue.id, bundle]]),
      derivedReadinessByIssueId: new Map([[researchIssue.id, readiness]]),
    });

    expect(packet.status).toBe('BLOCKED');
    expect(packet.blockers).toContain('RESEARCH_AUTHORITY_OUT_OF_SCOPE');
    expect(packet.research).toEqual([]);
    expect(packet.verifiedAuthorities).toEqual([]);
  });

  it('emits research provenance only for scoped authorities accepted into the packet', () => {
    const value = fixture();
    const researchIssue = value.doc.legalIssueMatrix!.issues[0];
    researchIssue.researchStatus = 'NEEDS_RESEARCH';
    const authority = (id: string, supports: string[]) => ({
      id,
      verificationStatus: 'VERIFIED',
      supportsLegalIssueIds: supports,
      source: { sourceTier: 'OFFICIAL_PRIMARY', sourceUrl: `https://example.test/${id}`, sourceDomain: 'example.test', sourceHash: `hash-${id}` },
      identity: { canonicalCitation: `Autoridad ${id}`, authorityType: 'STATUTE', issuingAuthority: 'Autoridad', identityKey: id },
      temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-09-16T00:00:00.000Z', basis: [] },
      jurisdictionValidity: { status: 'APPLICABLE', basis: [] },
      proposition: { text: `Proposición ${id}`, supportLevel: 'DIRECT', limitations: [] },
    });
    const bundle = {
      legalIssueId: researchIssue.id,
      requestId: 'research-request-2',
      researchStatus: 'VERIFIED_SUFFICIENT',
      researchHash: 'research-hash-2',
      regimeResolution: { status: 'RESOLVED', unresolvedFields: [] },
      verifiedAuthorities: [authority('authority-in-scope', [researchIssue.id]), authority('authority-out-of-scope', ['different-issue'])],
    } as unknown as LegalResearchBundle;
    const readiness = {
      legalIssueId: researchIssue.id,
      canonicalStatus: researchIssue.status,
      researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      researchBundleHash: bundle.researchHash,
      blockers: [],
    } as DerivedIssueReadiness;
    const packet = assembleSectionContextPacket({
      doc: value.doc,
      caseAnalysis: value.analysis,
      section,
      sectionPlan: value.sectionPlan,
      tasks: value.tasks,
      issueOutcomes: value.outcomes,
      researchBundlesByIssueId: new Map([[researchIssue.id, bundle]]),
      derivedReadinessByIssueId: new Map([[researchIssue.id, readiness]]),
    });

    expect(packet.status).toBe('READY');
    expect(packet.sourceManifest.researchSources?.map((item) => item.authorityId)).toEqual(['authority-in-scope']);
  });
});
