import { describe, expect, it, vi } from 'vitest';
import { createDocumentNode, type ContentBlock } from '@/lib/legal-engine/types';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import { buildCoverageMatrix, type CoverageRelationStatus } from '@/lib/legal-engine/coverageMatrix';
import { isCoverageSatisfied } from '@/lib/legal-engine/coveragePolicy';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { buildLegalIssueMatrix, type LegalIssueItem, type LegalIssueMatrix, type LegalIssueStatus } from '@/lib/legal-engine/legalIssueMatrix';
import type { LegalIssueType } from '@/lib/legal-engine/legalIssueMatrix';
import { buildDraftingPlan, generateSection } from '@/lib/legal-engine/pipeline';
import { buildGenerationTasksForSection } from '@/lib/legal-engine/generationTasks';
import { makeFixtureDocument, makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';
import {
  draftBlockFromIssueResult,
  validateIssueDraftResult,
  validateIssueDraftModelOutput,
  materializeIssueDraftResult,
  getIssueDraftContractRequirements,
  type IssueDraftResult,
} from '@/lib/legal-engine/issueDraftResult';
import {
  buildIssueContextPack,
  buildIssuePrompt,
  buildTargetedIssueRetryPrompt,
  buildBlockedIssueOutcome,
  assembleIssueDraftBlocks,
  evaluateIssueDraftResult,
  executeReadyIssueTasks,
  executeIssueScopedGeneration,
  parseIssueProviderOutput,
  resolveIssueEligibility,
  selectIssueDraftContract,
} from '@/lib/legal-engine/issueScopedGeneration';

function validRawResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    legalIssueId: 'issue-ready-1',
    coverageItemIds: ['cov-1'],
    issueType: 'CLAIM_ELEMENT',
    thesis: 'La cuestión debe responderse con el material permitido.',
    factualDevelopment: ['El hecho relacionado consta como afirmación de fuente.'],
    evidentiaryDevelopment: ['La mención probatoria relacionada se conserva como mención.'],
    legalDevelopment: ['La salida se limita a la autoridad disponible.'],
    application: 'La aplicación se refiere únicamente a la cuestión asignada.',
    conclusion: 'Conclusión provisional fundada en el contexto permitido.',
    sourceEntityIds: ['claim-1', 'fact-1'],
    authorityMentionIds: ['authority-1'],
    unresolvedRequirements: [],
    generationMetadata: {
      promptVersion: 'CLAIM_ELEMENT_V1',
      contextHash: 'ctx-1',
      providerRequested: 'nvidia',
      providerActuallyUsed: 'nvidia',
      model: 'fixture-model',
      attemptCount: 1,
    },
    ...overrides,
  };
}

function validationInput(overrides: Record<string, unknown> = {}) {
  return {
    expectedLegalIssueId: 'issue-ready-1',
    issueType: 'CLAIM_ELEMENT' as const,
    allowedCoverageItemIds: ['cov-1'],
    allowedSourceEntityIds: ['claim-1', 'fact-1'],
    allowedAuthorityMentionIds: ['authority-1'],
    contextHash: 'ctx-1',
    promptVersion: 'CLAIM_ELEMENT_V1',
    ...overrides,
  };
}

function taskForIssue(): GenerationTask {
  return {
    id: 'task-issue-ready-1',
    sectionId: 'sec-argumentos',
    sectionTitle: 'ARGUMENTOS',
    taskType: 'ISSUE',
    complexity: 'DEEP',
    tokenBudget: 3600,
    status: 'pending',
    legalIssueIds: ['issue-ready-1'],
    coverageItemIds: ['cov-1'],
    factIds: ['fact-1'],
    evidenceIds: ['evidence-mention-1'],
  };
}

function passingEvaluation() {
  return { verdict: 'PASS', overallScore: 0.9 } as any;
}

function fixtureAnalysis() {
  return makeFixtureFCaseAnalysis();
}

function fixtureDocument() {
  return makeFixtureDocument();
}

function fixtureMatrix() {
  const analysis = fixtureAnalysis();
  const doc = fixtureDocument();
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  return buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
}

function matrixWithIssueStatus(status: LegalIssueStatus): LegalIssueMatrix {
  const matrix = fixtureMatrix();
  const [firstIssue, ...remainingIssues] = matrix.issues;
  const relationStatus: CoverageRelationStatus = status === 'UNLINKED' ? 'UNLINKED' : status === 'UNKNOWN' ? 'UNKNOWN' : 'EXPLICIT';
  return {
    ...matrix,
    issues: [{ ...firstIssue, id: 'issue-ready-1', status, relationStatus }, ...remainingIssues],
  };
}

function issueWithStatus(status: LegalIssueStatus) {
  return matrixWithIssueStatus(status).issues[0];
}

function fixtureIssueForType(matrix: LegalIssueMatrix, issueType: LegalIssueType) {
  const preferred = {
    CLAIM_ELEMENT: (issue: LegalIssueItem) => issue.claimIds.includes('fixture-f-claim-1'),
    FACT_DISPUTE: (issue: LegalIssueItem) => issue.factIds.includes('fixture-f-fact-2'),
    EVIDENCE_RELEVANCE: (issue: LegalIssueItem) => issue.evidenceMentionIds.includes('fixture-f-evidence-mention-1'),
    EVIDENCE_SUFFICIENCY: (issue: LegalIssueItem) => issue.evidenceOfferIds.includes('fixture-f-offer-1'),
    SOURCE_ARGUMENT: (issue: LegalIssueItem) => issue.argumentIds.includes('fixture-f-argument-1'),
    PETITION_SUPPORT: (issue: LegalIssueItem) => issue.argumentIds.includes('fixture-f-argument-1'),
    PROCEDURAL_ISSUE: () => true,
    AUTHORITY_RESEARCH: (issue: LegalIssueItem) => issue.authorityMentionIds.includes('fixture-f-authority-1'),
    CONFLICT_DEPENDENCY: () => true,
  }[issueType];
  const issue = matrix.issues.find((candidate) => candidate.issueType === issueType && preferred(candidate));
  if (!issue) throw new Error(`Fixture F has no issue of type ${issueType} with the expected relation`);
  return issue;
}

function packFor(issueType: LegalIssueType) {
  const analysis = fixtureAnalysis();
  const doc = fixtureDocument();
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
  const issue = fixtureIssueForType(matrix, issueType);
  const task: GenerationTask = {
    ...taskForIssue(),
    id: `task-${issue.id}`,
    legalIssueIds: [issue.id],
    coverageItemIds: [...issue.coverageItemIds],
    factIds: [...issue.factIds],
    evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds],
    authorityIds: [...issue.authorityMentionIds],
  };
  return buildIssueContextPack(task, { ...doc, coverageMatrix }, analysis, matrix);
}

function promptFor(issueType: LegalIssueType) {
  const basePack = packFor('CLAIM_ELEMENT');
  return buildIssuePrompt({
    ...basePack,
    legalIssue: { ...basePack.legalIssue, issueType },
  }, taskForIssue());
}

function readyExecutionContext() {
  const analysis = fixtureAnalysis();
  const doc = fixtureDocument();
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const baseMatrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
  const [firstIssue, ...remainingIssues] = baseMatrix.issues;
  const issue = {
    ...firstIssue,
    id: 'issue-ready-1',
    status: 'READY_FOR_GENERATION' as const,
    relationStatus: 'EXPLICIT' as const,
    conflictIds: [],
    clientPositionStatus: 'NOT_REQUIRED' as const,
    researchStatus: 'NOT_REQUIRED' as const,
    blocking: false,
  };
  const matrix: LegalIssueMatrix = { ...baseMatrix, issues: [issue, ...remainingIssues] };
  const executionDoc = { ...doc, coverageMatrix, legalIssueMatrix: matrix };
  const task: GenerationTask = {
    ...taskForIssue(),
    id: 'task-issue-ready-1',
    legalIssueIds: ['issue-ready-1'],
    coverageItemIds: [...issue.coverageItemIds],
    factIds: [...issue.factIds],
    evidenceIds: [...issue.evidenceMentionIds, ...issue.evidenceOfferIds],
    authorityIds: [...issue.authorityMentionIds],
  };
  return { analysis, doc: executionDoc, matrix, issue, task };
}

function descriptiveExecutionContext() {
  const baseAnalysis = fixtureAnalysis();
  const richCaseAnalysis = baseAnalysis.richCaseAnalysis!;
  const analysis = {
    ...baseAnalysis,
    richCaseAnalysis: {
      ...richCaseAnalysis,
      facts: richCaseAnalysis.facts.map((fact) => fact.id === 'fixture-f-fact-1'
        ? { ...fact, assertionStatus: 'ESTABLISHED_FACT' as const }
        : fact),
    },
  };
  const doc = { ...fixtureDocument(), id: 'fixture-f-descriptive-document' };
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
  const issue = matrix.issues.find((candidate) => candidate.issueType === 'FACT_DISPUTE' && candidate.factIds.includes('fixture-f-fact-1'));
  if (!issue) throw new Error('Fixture F has no established fact issue for descriptive generation');
  const task: GenerationTask = {
    ...taskForIssue(),
    id: 'task-established-fact-1',
    sectionId: 'sec-hechos',
    sectionTitle: 'HECHOS',
    legalIssueIds: [issue.id],
    coverageItemIds: [...issue.coverageItemIds],
    factIds: ['fixture-f-fact-1'],
    evidenceIds: [],
    authorityIds: [],
  };
  return { analysis, doc: { ...doc, coverageMatrix, legalIssueMatrix: matrix }, matrix, issue, task };
}

function issueResultForRequest(request: any, overrides: Record<string, unknown> = {}) {
  const context = request.legalContext;
  return {
    thesis: 'La cuestión debe responderse con el material permitido.',
    factualDevelopment: ['El hecho relacionado consta como afirmación de fuente.'],
    evidentiaryDevelopment: ['La mención probatoria relacionada se conserva como mención.'],
    legalDevelopment: ['La salida se limita a la autoridad disponible.'],
    application: 'La aplicación se refiere únicamente a la cuestión asignada.',
    conclusion: 'Conclusión provisional fundada en el contexto permitido.',
    sourceEntityIds: [
      ...context.claims.map((item: any) => item.id),
      ...context.facts.map((item: any) => item.id),
      ...context.evidenceMentions.map((item: any) => item.id),
      ...context.evidenceOffers.map((item: any) => item.id),
      ...context.sourceArguments.map((item: any) => item.id),
    ],
    authorityMentionIds: context.authorities.map((item: any) => item.id),
    unresolvedRequirements: [],
    ...overrides,
  };
}

function executionFixtureDocument() {
  return { ...fixtureDocument(), id: 'fixture-f-execution-document' };
}

function readyTasksForFixtureF(): GenerationTask[] {
  const analysis = fixtureAnalysis();
  const doc = executionFixtureDocument();
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
  const readyIds = new Set(matrix.issues
    .filter((issue) => issue.status === 'READY_FOR_GENERATION' && issue.relationStatus === 'EXPLICIT')
    .map((issue) => issue.id));
  const plan = buildDraftingPlan({ ...doc, coverageMatrix, legalIssueMatrix: matrix }, 5000, analysis, coverageMatrix);
  return plan.sections
    .flatMap((section) => buildGenerationTasksForSection(section, { ...doc, coverageMatrix, legalIssueMatrix: matrix }, analysis, coverageMatrix))
    .filter((task) => task.legalIssueIds?.length === 1 && readyIds.has(task.legalIssueIds[0]));
}

function canonicalReadyIssueOrder(tasks: GenerationTask[]): string[] {
  return [...tasks]
    .sort((left, right) => {
      const sectionOrder = (left.order ?? 0) - (right.order ?? 0);
      if (sectionOrder !== 0) return sectionOrder;
      const parentOrder = (left.orderInParent ?? 0) - (right.orderInParent ?? 0);
      if (parentOrder !== 0) return parentOrder;
      return (left.legalIssueIds?.[0] || '').localeCompare(right.legalIssueIds?.[0] || '');
    })
    .map((task) => task.legalIssueIds![0]);
}

function deferredProviderResponses() {
  let active = 0;
  let maximumActive = 0;
  let releaseFuture = false;
  const pending: Array<{ request: any; resolve: (response: any) => void }> = [];
  const responseFor = (request: any) => ({
    success: true,
    structuredOutput: issueResultForRequest(request),
    provider: 'nvidia',
    providerActuallyUsed: 'nvidia',
  });
  const invoke = (request: any): Promise<any> => new Promise((resolve) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    let settled = false;
    const settle = (response: any) => {
      if (settled) return;
      settled = true;
      active -= 1;
      resolve(response);
    };
    pending.push({
      request,
      resolve: settle,
    });
    if (releaseFuture) queueMicrotask(() => settle(responseFor(request)));
  });
  return {
    invoke,
    maxActive: () => maximumActive,
    resolveInReverseOrder: () => {
      releaseFuture = true;
      pending.slice().reverse().forEach(({ request, resolve }) => resolve(responseFor(request)));
    },
  };
}

describe('FASE 4 IssueDraftResult boundary', () => {
  it('accepts model-owned output without deterministic identity or metadata and materializes canonical result', () => {
    const modelOutput = {
      thesis: 'La cuestión debe responderse con el material permitido.',
      factualDevelopment: ['El hecho relacionado consta como afirmación de fuente.'],
      evidentiaryDevelopment: ['La mención probatoria relacionada se conserva como mención.'],
      legalDevelopment: ['La salida se limita a la autoridad disponible.'],
      application: 'La aplicación se refiere únicamente a la cuestión asignada.',
      conclusion: 'Conclusión provisional fundada en el contexto permitido.',
      sourceEntityIds: ['claim-1', 'fact-1'],
      authorityMentionIds: ['authority-1'],
      unresolvedRequirements: [],
    };
    const modelValidation = validateIssueDraftModelOutput(modelOutput);
    expect(modelValidation.valid).toBe(true);
    const result = materializeIssueDraftResult(modelValidation.output!, taskForIssue(), {
      issueType: 'CLAIM_ELEMENT',
      promptVersion: 'CLAIM_ELEMENT_V1',
      contextHash: 'ctx-1',
      providerRequested: 'nvidia',
      providerActuallyUsed: 'nvidia',
      model: 'fixture-model',
      attemptCount: 1,
    });
    expect(result.legalIssueId).toBe('issue-ready-1');
    expect(result.coverageItemIds).toEqual(['cov-1']);
    expect(result.generationMetadata.contextHash).toBe('ctx-1');
  });

  it('rejects deterministic identity and metadata fields from model output', () => {
    const validation = validateIssueDraftModelOutput({
      thesis: 'Contenido sustantivo.',
      factualDevelopment: ['Hecho permitido.'],
      evidentiaryDevelopment: ['Evidencia permitida.'],
      legalDevelopment: ['Desarrollo permitido.'],
      application: 'Aplicación permitida.',
      conclusion: 'Conclusión permitida.',
      sourceEntityIds: [],
      authorityMentionIds: [],
      unresolvedRequirements: [],
      legalIssueId: 'issue-attacker',
      generationMetadata: {},
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('UNKNOWN_FIELD:legalIssueId');
    expect(validation.errors).toContain('UNKNOWN_FIELD:generationMetadata');
  });

  it('rejects missing model-owned substantive fields and preserves strict JSON parsing', () => {
    const missing = validateIssueDraftModelOutput({
      thesis: 'Contenido sustantivo.',
      factualDevelopment: ['Hecho permitido.'],
      evidentiaryDevelopment: ['Evidencia permitida.'],
      legalDevelopment: ['Desarrollo permitido.'],
      conclusion: 'Conclusión permitida.',
      sourceEntityIds: [],
      authorityMentionIds: [],
      unresolvedRequirements: [],
    });
    expect(missing.valid).toBe(false);
    expect(missing.errors).toContain('REQUIRED_FIELD_EMPTY:application');
    expect(() => parseIssueProviderOutput({ content: '{"thesis":' } as any)).toThrow('INVALID_JSON_OUTPUT');
  });

  it('accepts a result with all required issue components', () => {
    const validation = validateIssueDraftResult(validRawResult(), validationInput());

    expect(validation.status).toBe('VALID_ACCEPTED');
    expect(validation.result?.legalIssueId).toBe('issue-ready-1');
  });

  it('rejects an unexpected legalIssueId', () => {
    const validation = validateIssueDraftResult(
      validRawResult({ legalIssueId: 'issue-other' }),
      validationInput(),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('LEGAL_ISSUE_ID_OUT_OF_SCOPE');
  });

  it('rejects coverage IDs outside the issue', () => {
    const validation = validateIssueDraftResult(
      validRawResult({ coverageItemIds: ['cov-outside'] }),
      validationInput(),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('COVERAGE_ID_OUT_OF_SCOPE');
  });

  it('rejects source and authority IDs outside the allow-list', () => {
    const sourceValidation = validateIssueDraftResult(
      validRawResult({ sourceEntityIds: ['unrelated-fact'] }),
      validationInput(),
    );
    const authorityValidation = validateIssueDraftResult(
      validRawResult({ authorityMentionIds: ['unrelated-authority'] }),
      validationInput(),
    );

    expect(sourceValidation.errors).toContain('SOURCE_ENTITY_ID_OUT_OF_SCOPE');
    expect(authorityValidation.errors).toContain('AUTHORITY_MENTION_ID_OUT_OF_SCOPE');
  });

  it('keeps SOURCE_CITED unverified', () => {
    const validation = validateIssueDraftResult(
      validRawResult(),
      validationInput({ authorityVerificationStatuses: { 'authority-1': 'SOURCE_CITED' } }),
    );

    expect(validation.status).toBe('VALID_ACCEPTED');
    expect(validation.result?.authorityMentionIds).toEqual(['authority-1']);
    expect(JSON.stringify(validation.result)).not.toContain('VERIFIED');
  });

  it('rejects an invented evidence offer', () => {
    const validation = validateIssueDraftResult(
      validRawResult({ sourceEntityIds: ['evidence-offer-invented'] }),
      validationInput(),
    );

    expect(validation.status).toBe('INVALID_FATAL');
    expect(validation.errors).toContain('SOURCE_ENTITY_ID_OUT_OF_SCOPE');
  });

  it('allows controlled legalDevelopment absence only with REQUIRES_LEGAL_RESEARCH', () => {
    const validation = validateIssueDraftResult(
      validRawResult({
        legalDevelopment: [],
        unresolvedRequirements: ['REQUIRES_LEGAL_RESEARCH'],
      }),
      validationInput(),
    );

    expect(validation.status).toBe('VALID_NON_FINAL');
  });

  it('normalizes absent non-applicable descriptive arrays in the canonical result', () => {
    const validation = validateIssueDraftResult({
      legalIssueId: 'issue-ready-1',
      coverageItemIds: ['cov-1'],
      issueType: 'FACT_DISPUTE',
      draftContract: 'DESCRIPTIVE',
      factualDevelopment: ['Hecho respaldado por fuente.'],
      sourceEntityIds: ['fact-1'],
      authorityMentionIds: [],
      unresolvedRequirements: [],
      generationMetadata: {
        promptVersion: 'FACT_DISPUTE_V1',
        contextHash: 'ctx-1',
        providerRequested: 'fixture',
        providerActuallyUsed: 'fixture',
        attemptCount: 1,
      },
    }, validationInput({
      issueType: 'FACT_DISPUTE',
      draftContract: 'DESCRIPTIVE',
      allowedSourceEntityIds: ['fact-1'],
      promptVersion: 'FACT_DISPUTE_V1',
      fieldRequirements: getIssueDraftContractRequirements('DESCRIPTIVE'),
    }));

    expect(validation.status).toBe('VALID_ACCEPTED');
    expect(validation.result?.evidentiaryDevelopment).toEqual([]);
    expect(validation.result?.legalDevelopment).toEqual([]);
  });

  it('does not accept provider success without a valid result', () => {
    const providerSuccess = {
      success: true,
      content: JSON.stringify({ legalIssueId: 'issue-other', thesis: 'texto' }),
    };
    const validation = validateIssueDraftResult(providerSuccess, validationInput());

    expect(validation.status).not.toBe('VALID_ACCEPTED');
  });

  it('converts a validated result into a traceable block without changing its IDs', () => {
    const validation = validateIssueDraftResult(validRawResult(), validationInput());
    const block = draftBlockFromIssueResult(
      validation.result as IssueDraftResult,
      taskForIssue(),
      passingEvaluation(),
    ) as ContentBlock;

    expect(block.legalIssueIds).toEqual(['issue-ready-1']);
    expect(block.coverageItemIds).toEqual(['cov-1']);
    expect(block.generationTaskId).toBe('task-issue-ready-1');
  });
});

describe('FASE 4 issue eligibility and plan linkage', () => {
  it.each([
    ['NEEDS_CLIENT_POSITION', false],
    ['BLOCKED_BY_CONFLICT', false],
    ['NEEDS_RESEARCH', false],
    ['UNLINKED', false],
    ['UNKNOWN', false],
    ['READY_FOR_GENERATION', true],
  ] as const)('resolves %s eligibility', (status, eligible) => {
    const result = resolveIssueEligibility(
      taskForIssue(),
      matrixWithIssueStatus(status),
      { formal: false },
    );

    expect(result.eligible).toBe(eligible);
  });

  it('NEEDS_RESEARCH creates a plan-only research task without final provider eligibility', () => {
    const task = { ...taskForIssue(), taskType: 'LEGAL_RESEARCH' as const };
    const result = resolveIssueEligibility(task, matrixWithIssueStatus('NEEDS_RESEARCH'), { formal: false });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('LEGAL_RESEARCH_PLAN_ONLY');
  });

  it('formal task never becomes provider eligible', () => {
    const result = resolveIssueEligibility(taskForIssue(), matrixWithIssueStatus('READY_FOR_GENERATION'), { formal: true });

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('FORMAL_DETERMINISTIC_TASK');
  });

  it('uses a singular alias only as an explicit legacy fallback', () => {
    const task = { ...taskForIssue(), legalIssueIds: undefined, targetIssueId: 'issue-ready-1' };
    const result = resolveIssueEligibility(task, matrixWithIssueStatus('READY_FOR_GENERATION'), { formal: false });

    expect(result.eligible).toBe(true);
    expect(result.legalIssueId).toBe('issue-ready-1');
  });

  it('keeps DocumentPlan and IssuePlan linked to canonical legalIssueIds and Coverage IDs', () => {
    const analysis = fixtureAnalysis();
    const doc = fixtureDocument();
    const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const plan = buildDraftingPlan(doc, 5000, analysis, coverageMatrix);
    const section = plan.sections.find((candidate) => candidate.issuePlans?.length);

    expect(section).toBeDefined();
    const issuePlan = section!.issuePlans!.find((candidate) => candidate.legalIssueIds?.length);
    expect(issuePlan?.legalIssueIds).toBeDefined();
    expect(issuePlan?.relatedCoverageItemIds?.length).toBeGreaterThan(0);

    const tasks = buildGenerationTasksForSection(section!, doc, analysis, coverageMatrix);
    expect(tasks.some((task) => task.legalIssueIds?.length && task.coverageItemIds?.length)).toBe(true);
  });
});

describe('FASE 4 allow-listed issue context and prompt strategies', () => {
  it('selects DESCRIPTIVE from FACT_RESPONSE plus an ESTABLISHED_FACT and emits no argument fields', () => {
    const { analysis, doc, matrix, task } = descriptiveExecutionContext();
    const pack = buildIssueContextPack(task, doc, analysis, matrix);
    const prompt = buildIssuePrompt(pack, task);
    const schema = prompt.outputSchema as { required: string[]; properties: Record<string, unknown> };

    expect(pack.contentRole).toBe('FACT_RESPONSE');
    expect(selectIssueDraftContract(pack)).toBe('DESCRIPTIVE');
    expect(prompt.draftContract).toBe('DESCRIPTIVE');
    expect(schema.required).toContain('factualDevelopment');
    expect(schema.required).toContain('sourceEntityIds');
    expect(schema.required).toContain('authorityMentionIds');
    expect(schema.required).toContain('unresolvedRequirements');
    expect(schema.required).not.toContain('evidentiaryDevelopment');
    expect(schema.required).not.toContain('legalDevelopment');
    expect(schema.required).not.toContain('thesis');
    expect(schema.required).not.toContain('application');
    expect(schema.required).not.toContain('conclusion');
    expect(schema.properties).not.toHaveProperty('thesis');
    expect(prompt.systemPrompt).toContain('DESCRIPTIVE TASK CONTRACT');
    expect(prompt.systemPrompt).toContain('evidentiaryDevelopment es NOT_APPLICABLE');
    expect(prompt.systemPrompt).toContain('legalDevelopment es NOT_APPLICABLE');
    expect(prompt.fieldRequirements).toEqual(getIssueDraftContractRequirements('DESCRIPTIVE'));
  });

  it('requires descriptive evidence and legal arrays only when linked context requires them', () => {
    const { analysis, doc, matrix, task } = descriptiveExecutionContext();
    const pack = buildIssueContextPack(task, doc, analysis, matrix);
    const evidencePrompt = buildIssuePrompt({
      ...pack,
      evidenceMentions: [{ id: 'evidence-linked' }] as any,
    }, task);
    const legalPrompt = buildIssuePrompt({
      ...pack,
      sourceArguments: [{ id: 'argument-linked' }] as any,
    }, task);

    expect(evidencePrompt.outputSchema.required).toContain('evidentiaryDevelopment');
    expect(evidencePrompt.outputSchema.required).not.toContain('legalDevelopment');
    expect(legalPrompt.outputSchema.required).toContain('legalDevelopment');
    expect(legalPrompt.outputSchema.required).not.toContain('evidentiaryDevelopment');

    const minimalPayload = {
      factualDevelopment: ['Hecho respaldado.'],
      sourceEntityIds: ['fixture-f-fact-1'],
      authorityMentionIds: [],
      unresolvedRequirements: [],
    };
    expect(validateIssueDraftModelOutput(minimalPayload, 'DESCRIPTIVE', evidencePrompt.fieldRequirements).errors)
      .toContain('REQUIRED_ARRAY_INVALID:evidentiaryDevelopment');
    expect(validateIssueDraftModelOutput(minimalPayload, 'DESCRIPTIVE', legalPrompt.fieldRequirements).errors)
      .toContain('REQUIRED_ARRAY_INVALID:legalDevelopment');
  });

  it('fails closed for mixed or unknown section semantics', () => {
    const { analysis, doc, matrix, task } = descriptiveExecutionContext();
    const pack = buildIssueContextPack(task, doc, analysis, matrix);

    expect(selectIssueDraftContract({
      ...pack,
      facts: [{ ...pack.facts[0], assertionStatus: 'SOURCE_ASSERTION' }],
    })).toBeUndefined();
    expect(selectIssueDraftContract({ ...pack, contentRole: 'CUSTOM' })).toBeUndefined();
  });

  it('context pack contains only selected legalIssueIds', () => {
    const pack = packFor('CLAIM_ELEMENT');

    expect(pack.legalIssue.issueType).toBe('CLAIM_ELEMENT');
    expect(pack.legalIssue.id).toMatch(/^issue-/);
    expect(JSON.stringify(pack)).not.toContain('fixture-f-claim-2');
  });

  it('claim scope isolation excludes unrelated rich entities', () => {
    const pack = packFor('CLAIM_ELEMENT');

    expect(pack.claims.map((item) => item.id)).toEqual(['fixture-f-claim-1']);
    expect(pack.claims.map((item) => item.id)).not.toContain('fixture-f-claim-2');
  });

  it('fact scope isolation excludes unrelated rich entities', () => {
    const pack = packFor('FACT_DISPUTE');

    expect(pack.facts.map((item) => item.id)).toEqual(['fixture-f-fact-2']);
    expect(pack.facts.map((item) => item.id)).not.toContain('fixture-f-fact-4');
  });

  it('evidence scope isolation excludes unrelated mentions and offers', () => {
    const pack = packFor('EVIDENCE_RELEVANCE');

    expect(pack.evidenceMentions.map((item) => item.id)).toEqual(['fixture-f-evidence-mention-1']);
    expect(pack.evidenceOffers).toEqual([]);
  });

  it('authority scope isolation preserves only explicit authority mentions', () => {
    const pack = packFor('AUTHORITY_RESEARCH');

    expect(pack.authorities.map((item) => item.id)).toEqual(['fixture-f-authority-1']);
    expect(pack.authorities[0]?.verificationStatus).toBe('SOURCE_CITED');
  });

  it('keeps EvidenceMention separate from EvidenceOffer and scopes SourceArgument', () => {
    const evidencePack = packFor('EVIDENCE_SUFFICIENCY');
    const sourceArgumentPack = packFor('SOURCE_ARGUMENT');

    expect(evidencePack.evidenceMentions).not.toBe(evidencePack.evidenceOffers);
    expect(sourceArgumentPack.sourceArguments.map((item) => item.id)).toEqual(['fixture-f-argument-1']);
  });

  it('does not serialize the complete matrix or corpus', () => {
    const pack = packFor('CLAIM_ELEMENT');
    const serialized = JSON.stringify(pack);

    expect(serialized).not.toContain('LegalIssueMatrix');
    expect(serialized).not.toContain('fixture-f-claim-2');
    expect(serialized).not.toContain('fixture-f-fact-4');
  });

  it.each([
    ['CLAIM_ELEMENT', 'CLAIM_ELEMENT_V1'],
    ['FACT_DISPUTE', 'FACT_DISPUTE_V1'],
    ['EVIDENCE_RELEVANCE', 'EVIDENCE_RELEVANCE_V1'],
    ['EVIDENCE_SUFFICIENCY', 'EVIDENCE_SUFFICIENCY_V1'],
    ['SOURCE_ARGUMENT', 'SOURCE_ARGUMENT_V1'],
    ['PETITION_SUPPORT', 'PETITION_SUPPORT_V1'],
  ] as const)('selects %s', (issueType, promptVersion) => {
    expect(promptFor(issueType).promptVersion).toBe(promptVersion);
  });

  it('prompt forbids invented law and facts', () => {
    const prompt = promptFor('CLAIM_ELEMENT');

    expect(prompt.systemPrompt).toContain('ÚNICAMENTE');
    expect(prompt.systemPrompt).toContain('REQUIRES_LEGAL_RESEARCH');
    expect(prompt.userMessage).toContain('legalIssueId');
    expect(prompt.userMessage).not.toContain('fixture-f-claim-2');
  });

  it('prompt explicitly enforces the JSON-only IssueDraftResult boundary', () => {
    const prompt = promptFor('CLAIM_ELEMENT');

    expect(prompt.systemPrompt).toContain('exactamente un objeto JSON');
    expect(prompt.systemPrompt).toContain('sin markdown');
    expect(prompt.systemPrompt).toContain('sin cercas de código');
    expect(prompt.systemPrompt).toContain('sin texto antes ni después');
    const schema = prompt.outputSchema as { required: string[]; additionalProperties: boolean };
    expect(schema.required).not.toContain('legalIssueId');
    expect(schema.required).not.toContain('generationMetadata');
    expect(schema.additionalProperties).toBe(false);
  });

  it('sends the model output contract in the effective provider messages and marks context as input-only', () => {
    const prompt = promptFor('EVIDENCE_RELEVANCE');
    const effectiveMessages = [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userMessage },
    ];
    const text = effectiveMessages.map((message) => message.content).join('\n');

    expect(effectiveMessages).toHaveLength(2);
    expect(prompt.systemPrompt).toContain('OUTPUT CONTRACT');
    expect(text).toContain('"thesis"');
    expect(text).toContain('"factualDevelopment"');
    expect(text).toContain('"evidentiaryDevelopment"');
    expect(text).toContain('"legalDevelopment"');
    expect(text).toContain('"application"');
    expect(text).toContain('"conclusion"');
    expect(text).toContain('"sourceEntityIds"');
    expect(text).toContain('"authorityMentionIds"');
    expect(text).toContain('"unresolvedRequirements"');
    expect(prompt.userMessage).toContain('INPUT CONTEXT ONLY');
    expect(prompt.userMessage).toContain('Do not reproduce input fields as output');
    expect(prompt.userMessage).toContain('FINAL OUTPUT CONTRACT');
  });

  it('gives EVIDENCE tasks an evidence-treatment directive while retaining the strict canonical fields', () => {
    const prompt = promptFor('EVIDENCE_RELEVANCE');

    expect(prompt.systemPrompt).toContain('EVIDENCE TASK CONTRACT');
    expect(prompt.systemPrompt).toContain('thesis = pertinencia probatoria');
    expect(prompt.systemPrompt).toContain('application = relación explícita con la cuestión');
    expect(prompt.systemPrompt).toContain('conclusion = conclusión limitada al tratamiento de la evidencia');
    expect(prompt.systemPrompt).toContain('No inventes una EvidenceOffer');
    expect(prompt.systemPrompt).toContain('No conviertas SOURCE_MENTIONED en prueba ofrecida');
  });
});

describe('FASE 4 provider seam and post-provider validation', () => {
  it('accepts source-backed descriptive established-fact output without argumentative fields', async () => {
    const { analysis, doc, task, issue } = descriptiveExecutionContext();
    expect(issue.status).toBe('READY_FOR_GENERATION');
    const invokeProvider = vi.fn().mockImplementation(async () => ({
      success: true,
      structuredOutput: {
        factualDevelopment: ['La relación jurídica inició en enero de 2024.'],
        evidentiaryDevelopment: [],
        legalDevelopment: [],
        sourceEntityIds: ['fixture-f-fact-1'],
        authorityMentionIds: [],
        unresolvedRequirements: [],
      },
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(invokeProvider).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ACCEPTED');
    expect(outcome.result?.factualDevelopment).toEqual(['La relación jurídica inició en enero de 2024.']);
    expect(outcome.result?.thesis).toBe('');
    expect(outcome.result?.application).toBe('');
    expect(outcome.result?.conclusion).toBe('');
  });

  it('accepts absent non-applicable descriptive evidence and legal arrays as canonical empty arrays', async () => {
    const { analysis, doc, task } = descriptiveExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async () => ({
      success: true,
      structuredOutput: {
        factualDevelopment: ['La fuente identifica el hecho establecido.'],
        sourceEntityIds: ['fixture-f-fact-1'],
        authorityMentionIds: [],
        unresolvedRequirements: [],
      },
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('ACCEPTED');
    expect(outcome.result?.factualDevelopment).toHaveLength(1);
    expect(outcome.result?.evidentiaryDevelopment).toEqual([]);
    expect(outcome.result?.legalDevelopment).toEqual([]);
  });

  it('rejects descriptive output without source-backed factual development', async () => {
    const { analysis, doc, task } = descriptiveExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async () => ({
      success: true,
      structuredOutput: {
        sourceEntityIds: ['fixture-f-fact-1'],
        authorityMentionIds: [],
        unresolvedRequirements: [],
      },
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.validation?.errors).toContain('REQUIRED_ARRAY_INVALID:factualDevelopment');
  });

  it('keeps an allowed descriptive unresolved requirement as VALID_NON_FINAL', async () => {
    const { analysis, doc, task } = descriptiveExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async () => ({
      success: true,
      structuredOutput: {
        factualDevelopment: ['La fuente identifica el hecho establecido.'],
        sourceEntityIds: ['fixture-f-fact-1'],
        authorityMentionIds: [],
        unresolvedRequirements: ['MISSING_CLIENT_POSITION'],
      },
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('VALID_NON_FINAL');
    expect(outcome.validation?.status).toBe('VALID_NON_FINAL');
    expect(outcome.block?.issueDraftValidationStatus).toBe('VALID_NON_FINAL');
  });

  it('keeps argumentative output strict when thesis, application, or conclusion is missing', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: {
        ...issueResultForRequest(request),
        thesis: '',
        application: '',
        conclusion: '',
      },
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.validation?.errors).toEqual(expect.arrayContaining([
      'REQUIRED_FIELD_EMPTY:thesis',
      'REQUIRED_FIELD_EMPTY:application',
      'REQUIRED_FIELD_EMPTY:conclusion',
    ]));
  });

  it('blocks provider invocation when the section role cannot determine a contract', async () => {
    const { analysis, doc, task } = descriptiveExecutionContext();
    const ambiguousDoc = {
      ...doc,
      sections: doc.sections.map((section) => section.id === task.sectionId
        ? { ...section, type: 'custom' as const }
        : section),
    };
    const invokeProvider = vi.fn();

    const outcome = await executeIssueScopedGeneration(task, ambiguousDoc, analysis, { invokeProvider });

    expect(outcome.status).toBe('BLOCKED');
    expect(outcome.validation?.errors).toContain('ISSUE_DRAFT_CONTRACT_UNRESOLVED');
    expect(invokeProvider).not.toHaveBeenCalled();
  });

  it('uses injected provider without NVIDIA', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request),
      provider: 'fixture',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(invokeProvider).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe('ACCEPTED');
  });

  it('parses structuredOutput before content', () => {
    const structuredOutput = validRawResult();
    const parsed = parseIssueProviderOutput({
      structuredOutput,
      content: JSON.stringify({ legalIssueId: 'wrong-content' }),
    } as any);

    expect(parsed).toBe(structuredOutput);
  });

  it('parses strict JSON content', () => {
    const raw = validRawResult();

    expect(parseIssueProviderOutput({ content: JSON.stringify(raw) } as any)).toEqual(raw);
  });

  it('rejects a model payload that attempts to include deterministic identity', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request, { legalIssueId: 'issue-other' }),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('FAILED');
    expect(outcome.validation?.errors).toContain('UNKNOWN_FIELD:legalIssueId');
  });

  it('rejects invented authority post-provider', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request, { authorityMentionIds: ['invented-authority'] }),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).not.toBe('ACCEPTED');
    expect(outcome.validation?.errors).toContain('AUTHORITY_MENTION_ID_OUT_OF_SCOPE');
  });

  it('rejects invented material fact post-provider', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request, { sourceEntityIds: ['invented-fact'] }),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).not.toBe('ACCEPTED');
    expect(outcome.validation?.errors).toContain('SOURCE_ENTITY_ID_OUT_OF_SCOPE');
  });

  it('local fallback remains non-substantive', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockResolvedValue({
      success: false,
      content: '[REQUIERE REVISIÓN DEL ABOGADO]',
      provider: 'local',
      providerActuallyUsed: 'local',
      origin: 'LOCAL_PLACEHOLDER',
    });

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('FALLBACK');
    expect(outcome.block?.fallbackStatus).toBe('LOCAL_PLACEHOLDER');
    expect(outcome.block?.issueDraftValidationStatus).not.toBe('VALID_ACCEPTED');
  });
});

describe('FASE 4 issue semantics and directed retry', () => {
  it('evaluates specificity for the selected issue', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('CLAIM_ELEMENT'));

    expect(evaluation.specificity).toBeGreaterThan(0);
  });

  it('evaluates factual grounding', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('FACT_DISPUTE'));

    expect(evaluation.factualGrounding).toBeGreaterThan(0);
  });

  it('evaluates evidence grounding', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('EVIDENCE_RELEVANCE'));

    expect(evaluation.evidenceGrounding).toBeGreaterThan(0);
  });

  it('evaluates client-position consistency', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('CLAIM_ELEMENT'));

    expect(evaluation.positionConsistency).toBeGreaterThanOrEqual(0);
    expect(evaluation.positionConsistency).toBeLessThanOrEqual(1);
  });

  it('evaluates authority discipline', () => {
    const result = validRawResult({ authorityMentionIds: ['unavailable-authority'] });
    const evaluation = evaluateIssueDraftResult(result as any, taskForIssue(), fixtureDocument(), packFor('SOURCE_ARGUMENT'));

    expect(evaluation.authorityDiscipline).toBe(0);
    expect(evaluation.hardFailReasons).toContain('AUTHORITY_OUT_OF_SCOPE');
    expect(evaluation.verdict).toBe('FAIL');
  });

  it('evaluates application', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('CLAIM_ELEMENT'));

    expect(evaluation.application).toBeGreaterThan(0);
  });

  it('evaluates completeness', () => {
    const evaluation = evaluateIssueDraftResult(validRawResult() as any, taskForIssue(), fixtureDocument(), packFor('CLAIM_ELEMENT'));

    expect(evaluation.completeness).toBeGreaterThan(0);
  });

  it('performs one targeted retry for a repairable semantic failure', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn()
      .mockImplementationOnce(async (request: any) => ({
        success: true,
        structuredOutput: issueResultForRequest(request, { application: '' }),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      }))
      .mockImplementationOnce(async (request: any) => ({
        success: true,
        structuredOutput: issueResultForRequest(request),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(invokeProvider).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe('ACCEPTED');
  });

  it('retry preserves issue task coverage and context hash', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const requests: any[] = [];
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return {
        success: true,
        structuredOutput: issueResultForRequest(request, requests.length === 1 ? { application: '' } : {}),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      };
    });

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.legalIssueId).toBe('issue-ready-1');
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts.every((attempt) => attempt.legalIssueId === outcome.legalIssueId)).toBe(true);
    expect(outcome.attempts.every((attempt) => attempt.taskId === task.id)).toBe(true);
    expect(outcome.attempts.every((attempt) => attempt.contextHash === outcome.attempts[0].contextHash)).toBe(true);
    expect(outcome.attempts[1].coverageItemIds).toEqual(outcome.attempts[0].coverageItemIds);
    expect(requests[1].legalContext).toEqual(requests[0].legalContext);
  });

  it('retry does not receive expanded context', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const requests: any[] = [];
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => {
      requests.push(request);
      return {
        success: true,
        structuredOutput: issueResultForRequest(request, { application: '' }),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      };
    });

    await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(JSON.stringify(requests[1].legalContext)).toBe(JSON.stringify(requests[0].legalContext));
    expect(requests[1].legalContext).not.toHaveProperty('completeCaseAnalysis');
    expect(requests[1].legalContext).not.toHaveProperty('completeMatrix');
  });

  it('second failure yields FAILED/INSUFFICIENT and never performs a third attempt', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request, { application: '' }),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(invokeProvider).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe('FAILED');
    expect(outcome.failureReason).toBe('INSUFFICIENT');
  });

  it('VALID_NON_FINAL never satisfies Coverage or final readiness', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request, {
        legalDevelopment: [],
        unresolvedRequirements: ['REQUIRES_LEGAL_RESEARCH'],
      }),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    }));

    const outcome = await executeIssueScopedGeneration(task, doc, analysis, { invokeProvider });

    expect(outcome.status).toBe('VALID_NON_FINAL');
    expect(outcome.block?.issueDraftValidationStatus).toBe('VALID_NON_FINAL');
    expect(outcome.block?.generationStatus).toBe('partial');
  });

  it('builds a directed retry prompt without changing the context hash', () => {
    const prompt = buildIssuePrompt(packFor('CLAIM_ELEMENT'), taskForIssue());
    const retry = buildTargetedIssueRetryPrompt(prompt, ['APPLICATION_MISSING']);

    expect(retry.contextHash).toBe(prompt.contextHash);
    expect(retry.promptVersion).toBe(prompt.promptVersion);
    expect(retry.userMessage).toContain('APPLICATION_MISSING');
  });
});

describe('FASE 4 bounded issue executor', () => {
  it('limits concurrent provider calls to three and preserves deterministic order', async () => {
    const deferred = deferredProviderResponses();
    const tasks = readyTasksForFixtureF();
    const pending = executeReadyIssueTasks(tasks, executionFixtureDocument(), fixtureAnalysis(), {
      invokeProvider: deferred.invoke,
      maxConcurrency: 3,
    });

    expect(deferred.maxActive()).toBe(3);
    deferred.resolveInReverseOrder();
    const outcomes = await pending;

    expect(outcomes.map((item) => item.legalIssueId)).toEqual(canonicalReadyIssueOrder(tasks));
    expect(deferred.maxActive()).toBe(3);
    expect(outcomes).toHaveLength(4);
  });

  it.each([1, 2, 3, 4])('respects configured concurrency bounds one through four (%s)', async (maxConcurrency) => {
    const deferred = deferredProviderResponses();
    const tasks = readyTasksForFixtureF();
    const pending = executeReadyIssueTasks(tasks, executionFixtureDocument(), fixtureAnalysis(), {
      invokeProvider: deferred.invoke,
      maxConcurrency,
    });

    const providerTasks = tasks;
    expect(deferred.maxActive()).toBe(Math.min(maxConcurrency, providerTasks.length));
    deferred.resolveInReverseOrder();
    await pending;
  });

  it('orders outcomes by section plan and issue ID rather than completion', async () => {
    const deferred = deferredProviderResponses();
    const tasks = readyTasksForFixtureF();
    const pending = executeReadyIssueTasks([...tasks].reverse(), executionFixtureDocument(), fixtureAnalysis(), {
      invokeProvider: deferred.invoke,
      maxConcurrency: 4,
    });

    deferred.resolveInReverseOrder();
    const outcomes = await pending;

    expect(outcomes.map((item) => item.legalIssueId)).toEqual(canonicalReadyIssueOrder(tasks));
  });

  it('isolates one failed issue from passing issues', async () => {
    const tasks = readyTasksForFixtureF();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => {
      if (request.legalContext.legalIssue.id === tasks[0].legalIssueIds?.[0]) {
        throw new Error('fixture issue failure');
      }
      return {
        success: true,
        structuredOutput: issueResultForRequest(request),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      };
    });

    const outcomes = await executeReadyIssueTasks(tasks, executionFixtureDocument(), fixtureAnalysis(), {
      invokeProvider,
      maxConcurrency: 4,
    });

    expect(outcomes.filter((item) => item.status === 'FAILED')).toHaveLength(1);
    expect(outcomes.filter((item) => item.status === 'ACCEPTED')).toHaveLength(3);
  });

  it('does not call provider for a blocked issue or local fallback', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const blockedMatrix: LegalIssueMatrix = {
      ...fixtureMatrix(),
      issues: fixtureMatrix().issues.map((issue) => issue.id === task.legalIssueIds![0]
        ? { ...issue, id: task.legalIssueIds![0], status: 'BLOCKED_BY_CONFLICT', relationStatus: 'EXPLICIT', conflictIds: ['conflict-1'] }
        : issue),
    };
    const blockedDoc = { ...doc, legalIssueMatrix: blockedMatrix };
    const invokeProvider = vi.fn().mockResolvedValue({
      success: false,
      content: '[REQUIERE REVISIÓN DEL ABOGADO]',
      provider: 'local',
      providerActuallyUsed: 'local',
      origin: 'LOCAL_PLACEHOLDER',
    });

    const blocked = await executeReadyIssueTasks([task], blockedDoc, analysis, { invokeProvider });
    expect(invokeProvider).not.toHaveBeenCalled();
    expect(blocked[0].status).toBe('BLOCKED');
    expect(buildBlockedIssueOutcome(task, blockedMatrix).status).toBe('BLOCKED');
  });
});

describe('FASE 4 issue blocks and Coverage safety', () => {
  function outcomeFor(issueId: string, taskId: string, overrides: Record<string, unknown> = {}) {
    const task = { ...taskForIssue(), id: taskId, legalIssueIds: [issueId] };
    const result = validRawResult({ legalIssueId: issueId, ...overrides }) as unknown as IssueDraftResult;
    const block = draftBlockFromIssueResult(result, task, passingEvaluation());
    return {
      legalIssueId: issueId,
      taskId,
      status: 'ACCEPTED' as const,
      attempts: [],
      block,
    };
  }

  const substantiveCoverage = {
    id: 'cov-1',
    category: 'FACT_RESPONSE',
    description: 'Hecho vinculado',
    required: true,
    status: 'pending',
    targetSectionIds: ['sec-argumentos'],
  } as any;

  it('accepted result preserves legalIssueIds and authorityIds', () => {
    const block = draftBlockFromIssueResult(validRawResult() as unknown as IssueDraftResult, taskForIssue(), passingEvaluation());

    expect(block.legalIssueIds).toEqual(['issue-ready-1']);
    expect(block.coverageItemIds).toEqual(['cov-1']);
    expect(block.authorityIds).toEqual(['authority-1']);
    expect(block.generationTaskId).toBe('task-issue-ready-1');
  });

  it('section contains multiple separate issue blocks', () => {
    const outcomes = [outcomeFor('issue-a', 'task-issue-a'), outcomeFor('issue-b', 'task-issue-b')];
    const assembled = assembleIssueDraftBlocks(createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 }), outcomes);

    expect(assembled.blocks).toHaveLength(2);
    expect(assembled.blocks.map((block) => block.legalIssueIds?.[0])).toEqual(['issue-a', 'issue-b']);
  });

  it('assembly order ignores provider completion order', () => {
    const first = { ...outcomeFor('issue-a', 'task-issue-a'), order: 10, orderInParent: 10 };
    const second = { ...outcomeFor('issue-b', 'task-issue-b'), order: 20, orderInParent: 20 };
    const assembled = assembleIssueDraftBlocks(createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 }), [second, first]);

    expect(assembled.blocks.map((block) => block.legalIssueIds?.[0])).toEqual(['issue-a', 'issue-b']);
  });

  it('assembles normal and research-unlocked blocks deterministically with research metadata intact', () => {
    const research = {
      ...outcomeFor('issue-research-1', 'task-issue-research-1', {
        verifiedAuthorityIds: ['verified-authority-1'],
        researchHash: 'research-hash-1',
      }),
      order: 2,
    };
    const normal = { ...outcomeFor('issue-ready-1', 'task-issue-ready-1'), order: 1 };
    const section = createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 });

    const first = assembleIssueDraftBlocks(section, [research, normal]);
    const second = assembleIssueDraftBlocks(section, [normal, research]);

    expect(first.blocks.map((block) => block.legalIssueIds)).toEqual(second.blocks.map((block) => block.legalIssueIds));
    expect(first.blocks.find((block) => block.legalIssueIds?.includes('issue-research-1'))?.researchHash).toBe('research-hash-1');
  });

  it('does not deduplicate identical text across different issues', () => {
    const first = outcomeFor('issue-research-1', 'task-issue-research-1');
    const second = {
      ...outcomeFor('issue-research-2', 'task-issue-research-2'),
      block: { ...first.block, id: 'blk-task-issue-research-2', legalIssueIds: ['issue-research-2'] },
    };

    const assembled = assembleIssueDraftBlocks(
      createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 }),
      [first, second],
    );

    expect(assembled.blocks).toHaveLength(2);
  });

  it('VALID_NON_FINAL does not cover substantive Coverage', () => {
    const task = taskForIssue();
    const result = validateIssueDraftResult(validRawResult({ legalDevelopment: [], unresolvedRequirements: ['REQUIRES_LEGAL_RESEARCH'] }), validationInput());
    const block = draftBlockFromIssueResult(result.result as IssueDraftResult, task, passingEvaluation(), 'VALID_NON_FINAL');

    const decision = isCoverageSatisfied(substantiveCoverage, [block], [{ blockId: block.id, verdict: 'PASS', hardFailReasons: [] }]);
    expect(decision.satisfied).toBe(false);
  });

  it('fallback does not cover substantive Coverage', () => {
    const block = {
      id: 'blk-fallback',
      text: 'Texto local',
      generatedBy: 'FALLBACK',
      generationRequirement: 'AI_REQUIRED',
      fallbackStatus: 'LOCAL_PLACEHOLDER',
      coverageItemIds: ['cov-1'],
    } as ContentBlock;

    const decision = isCoverageSatisfied(substantiveCoverage, [block], [{ blockId: block.id, verdict: 'PASS', hardFailReasons: [] }]);
    expect(decision.satisfied).toBe(false);
  });

  it('exact duplicate same issue is not appended twice', () => {
    const first = outcomeFor('issue-a', 'task-issue-a');
    const second = { ...outcomeFor('issue-a', 'task-issue-a-retry'), block: { ...first.block } };
    const assembled = assembleIssueDraftBlocks(createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 }), [first, second]);

    expect(assembled.blocks).toHaveLength(1);
    expect(assembled.warnings).toContain('DUPLICATE_ISSUE_BLOCK:issue-a');
  });

  it('different issues remain separately traceable when text overlaps', () => {
    const first = outcomeFor('issue-a', 'task-issue-a');
    const second = { ...outcomeFor('issue-b', 'task-issue-b'), block: { ...first.block, id: 'blk-task-issue-b', legalIssueIds: ['issue-b'] } };
    const assembled = assembleIssueDraftBlocks(createDocumentNode({ id: 'sec-argumentos', type: 'argument', title: 'ARGUMENTOS', order: 1 }), [first, second]);

    expect(assembled.blocks).toHaveLength(2);
    expect(assembled.blocks.map((block) => block.legalIssueIds?.[0])).toEqual(['issue-a', 'issue-b']);
  });
});

describe('FASE 4 issue-attempt GenerationTrace', () => {
  function tracedProvider(overrides: Record<string, unknown> = {}) {
    return vi.fn().mockImplementation(async (request: any) => ({
      success: true,
      structuredOutput: issueResultForRequest(request),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
      ...overrides,
    }));
  }

  it('trace records issue task provider validation evaluation and accepted block', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const outcome = await executeIssueScopedGeneration(task, doc, analysis, {
      trace,
      invokeProvider: tracedProvider(),
    });
    const closed = trace.close();

    expect(outcome.status).toBe('ACCEPTED');
    expect(closed.issueGenerationAttempts).toHaveLength(1);
    expect(closed.issueGenerationAttempts[0].outcome).toBe('ACCEPTED');
    expect(closed.taskExecutions.some((entry) => entry.taskId === task.id)).toBe(true);
    expect(closed.semanticEvaluations).toHaveLength(1);
    expect(closed.draftBlocks.map((block) => block.generationTaskId)).toContain(task.id);
  });

  it('trace records attempt one and directed retry', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    const invokeProvider = vi.fn()
      .mockImplementationOnce(async (request: any) => ({
        success: true,
        structuredOutput: issueResultForRequest(request, { application: '' }),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      }))
      .mockImplementationOnce(async (request: any) => ({
        success: true,
        structuredOutput: issueResultForRequest(request),
        provider: 'nvidia',
        providerActuallyUsed: 'nvidia',
      }));

    await executeIssueScopedGeneration(task, doc, analysis, { trace, invokeProvider });
    const closed = trace.close();

    expect(closed.issueGenerationAttempts.map((entry) => entry.attempt)).toEqual([1, 2]);
    expect(closed.issueGenerationAttempts.every((entry) => entry.legalIssueId === task.legalIssueIds![0])).toBe(true);
  });

  it('trace records contextHash and promptVersion without the complete prompt', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    await executeIssueScopedGeneration(task, doc, analysis, { trace, invokeProvider: tracedProvider() });
    const closed = trace.close();

    expect(closed.issueGenerationAttempts[0].contextHash).toBeTruthy();
    expect(closed.issueGenerationAttempts[0].promptVersion).toBeTruthy();
    expect(JSON.stringify(closed)).not.toContain('Genera únicamente un IssueDraftResult');
  });

  it('trace records real token usage when supplied', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    await executeIssueScopedGeneration(task, doc, analysis, {
      trace,
      invokeProvider: tracedProvider({ usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 } }),
    });
    const closed = trace.close();

    expect(closed.issueGenerationAttempts[0].usage).toMatchObject({ promptTokens: 11, completionTokens: 22, totalTokens: 33, estimated: false });
  });

  it('trace leaves token usage null when absent', async () => {
    const { analysis, doc, task } = readyExecutionContext();
    const trace = createGenerationTraceContext({ doc, options: { enabled: true } });
    await executeIssueScopedGeneration(task, doc, analysis, { trace, invokeProvider: tracedProvider() });
    const closed = trace.close();

    expect(closed.issueGenerationAttempts[0].usage).toMatchObject({ promptTokens: null, completionTokens: null, totalTokens: null });
  });
});

async function runIssueScopedFixtureGeneration(options: { invokeProvider: (request: any) => Promise<any> }) {
  const analysis = fixtureAnalysis();
  const doc = executionFixtureDocument();
  const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
  const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });
  doc.coverageMatrix = coverageMatrix;
  doc.legalIssueMatrix = matrix;
  const plan = buildDraftingPlan(doc, 5000, analysis, coverageMatrix, matrix);

  for (const section of doc.sections) {
    const sectionPlan = plan.sections.find((candidate) => candidate.templateSectionId === section.id);
    await generateSection(doc, section.id, undefined, undefined, undefined, sectionPlan, analysis, undefined, options.invokeProvider as any, 3);
  }

  const finalMatrix = doc.legalIssueMatrix!;
  return {
    doc,
    matrix: finalMatrix,
    readyIssueIds: finalMatrix.issues.filter((issue) => issue.status === 'READY_FOR_GENERATION').map((issue) => issue.id),
    blockedIssueIds: finalMatrix.issues.filter((issue) => issue.status === 'BLOCKED_BY_CONFLICT' || issue.status === 'NEEDS_CLIENT_POSITION').map((issue) => issue.id),
    researchIssueIds: finalMatrix.issues.filter((issue) => issue.status === 'NEEDS_RESEARCH').map((issue) => issue.id),
  };
}

describe('FASE 4 rich pipeline integration', () => {
  function providerResponse(request: any) {
    return {
      success: true,
      structuredOutput: issueResultForRequest(request),
      provider: 'nvidia',
      providerActuallyUsed: 'nvidia',
    };
  }

  it('Fixture F calls final-generation provider only for four READY issues', async () => {
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    const result = await runIssueScopedFixtureGeneration({ invokeProvider });
    const calls = invokeProvider.mock.calls.map(([request]) => request.legalContext?.legalIssue?.id);

    expect(result.matrix.summary.total).toBe(13);
    expect(result.matrix.summary.readyForGeneration).toBe(4);
    expect(calls).toHaveLength(4);
    expect(new Set(calls)).toEqual(new Set(result.readyIssueIds));
    expect(result.blockedIssueIds.every((id) => !calls.includes(id))).toBe(true);
    expect(result.researchIssueIds.every((id) => !calls.includes(id))).toBe(true);
  });

  it('Fixture F produces zero calls for client-position blockers', async () => {
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    const result = await runIssueScopedFixtureGeneration({ invokeProvider });
    const calls = invokeProvider.mock.calls.map(([request]) => request.legalContext?.legalIssue?.id);

    const clientBlocked = result.matrix.issues.filter((issue) => issue.status === 'NEEDS_CLIENT_POSITION').map((issue) => issue.id);
    expect(clientBlocked.every((id) => !calls.includes(id))).toBe(true);
  });

  it('Fixture F produces zero calls for conflicts', async () => {
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    const result = await runIssueScopedFixtureGeneration({ invokeProvider });
    const calls = invokeProvider.mock.calls.map(([request]) => request.legalContext?.legalIssue?.id);

    const conflicts = result.matrix.issues.filter((issue) => issue.status === 'BLOCKED_BY_CONFLICT').map((issue) => issue.id);
    expect(conflicts.every((id) => !calls.includes(id))).toBe(true);
  });

  it('Fixture F produces zero final-generation calls for research', async () => {
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    const result = await runIssueScopedFixtureGeneration({ invokeProvider });
    const calls = invokeProvider.mock.calls.map(([request]) => request.legalContext?.legalIssue?.id);

    expect(result.researchIssueIds.every((id) => !calls.includes(id))).toBe(true);
  });

  it('legacy analysis remains available', () => {
    const analysis = makeFixtureFCaseAnalysis({ richCaseAnalysis: undefined });
    const doc = executionFixtureDocument();
    const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);
    const matrix = buildLegalIssueMatrix({ caseAnalysis: analysis, coverageMatrix });

    expect(analysis.richCaseAnalysis).toBeUndefined();
    expect(matrix.sourceMode).toBe('LEGACY_FALLBACK');
  });

  it('non-labor document remains available', () => {
    const analysis = fixtureAnalysis();
    const doc = { ...executionFixtureDocument(), matter: 'civil', documentType: 'demanda_civil' };
    const coverageMatrix = buildCoverageMatrix(analysis, doc, doc.sections);

    expect(doc.matter).toBe('civil');
    expect(coverageMatrix.items.length).toBeGreaterThan(0);
  });

  it('formal section uses zero provider calls', async () => {
    const { analysis, doc } = readyExecutionContext();
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    const result = await generateSection(doc, 'sec-firma', undefined, undefined, undefined, undefined, analysis, undefined, invokeProvider as any, 3);

    expect(result).toBeDefined();
    expect(invokeProvider).not.toHaveBeenCalled();
  });

  it('no monolithic document prompt is emitted', async () => {
    const invokeProvider = vi.fn().mockImplementation(async (request: any) => providerResponse(request));
    await runIssueScopedFixtureGeneration({ invokeProvider });

    expect(invokeProvider.mock.calls.every(([request]) => request.legalContext?.legalIssue)).toBe(true);
    expect(invokeProvider.mock.calls.every(([request]) => !request.legalContext?.completeCaseAnalysis)).toBe(true);
    expect(invokeProvider.mock.calls.every(([request]) => !request.legalContext?.completeMatrix)).toBe(true);
  });
});
