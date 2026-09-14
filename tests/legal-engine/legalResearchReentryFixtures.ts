import type { AIProviderResult, AIRequest } from '@/lib/ai/providers/types';
import type { BlockQualityEvaluation } from '@/lib/legal-engine/semanticEvaluator';
import type { GenerationTask } from '@/lib/legal-engine/generationTasks';
import type { LegalIssueItem } from '@/lib/legal-engine/legalIssueMatrix';
import type {
  DerivedIssueReadiness,
  LegalRegimeResolution,
  LegalResearchBundle,
  TemporalValidityStatus,
  VerifiedAuthority,
} from '@/lib/legal-engine/legal-research/types';
import type { IssueDraftResult, IssueDraftValidationInput } from '@/lib/legal-engine/issueDraftResult';
import { buildIssueContextPack, buildVerifiedResearchContext, type IssueContextPack, type VerifiedResearchContext } from '@/lib/legal-engine/issueScopedGeneration';
import type { CaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';

const regimeFixture: LegalRegimeResolution = {
  id: 'regime-federal-research-fixture',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'YEAR',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-resolution-hash-1',
};

export function issueFixture(overrides: Partial<LegalIssueItem> = {}): LegalIssueItem {
  return {
    id: 'issue-research-1',
    issueType: 'AUTHORITY_RESEARCH',
    question: '¿Qué requisito jurídico debe acreditarse?',
    source: {
      mode: 'RICH_COVERAGE',
      coverageItemId: 'coverage-research-1',
      coverageCategory: 'AUTHORITY_MENTION',
      sourceEntityIds: ['source-authority-1'],
    },
    coverageItemIds: ['coverage-research-1'],
    claimIds: [],
    factIds: ['fact-research-1'],
    evidenceMentionIds: ['evidence-research-1'],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['source-authority-1'],
    conflictIds: [],
    missingDataIds: [],
    clientPositionStatus: 'NOT_REQUIRED',
    required: true,
    blocking: true,
    status: 'NEEDS_RESEARCH',
    researchStatus: 'NEEDS_RESEARCH',
    provenance: [],
    relationStatus: 'EXPLICIT',
    ...overrides,
  };
}

export function verifiedAuthorityFixture(
  id = 'verified-authority-1',
  legalIssueId = 'issue-research-1',
  options: {
    temporalStatus?: TemporalValidityStatus;
    jurisdictionStatus?: 'APPLICABLE' | 'WRONG_JURISDICTION' | 'REVIEW_REQUIRED' | 'UNKNOWN';
    supportsLegalIssueIds?: string[];
    limitations?: string[];
  } = {},
): VerifiedAuthority {
  return {
    id,
    identity: {
      canonicalCitation: 'ARTICULO FEDERAL FIXTURE 14',
      authorityType: 'STATUTE',
      issuingAuthority: 'Autoridad federal fixture',
      identityKey: `identity-${id}`,
    },
    source: {
      sourceUrl: 'https://fixture.official.test/federal/article-14',
      sourceDomain: 'fixture.official.test',
      sourceTier: 'OFFICIAL_PRIMARY',
      retrievedAt: '2026-01-01T00:00:00.000Z',
      locator: 'artículo 14',
      sourceHash: `source-${id}`,
      isFixture: true,
    },
    temporalValidity: {
      status: options.temporalStatus || 'CURRENT_AND_APPLICABLE',
      relevantDate: '2026-01-01',
      effectiveFrom: '2020-01-01',
      checkedAt: '2026-01-01T00:00:00.000Z',
      basis: ['fixture temporal verification'],
    },
    jurisdictionValidity: {
      status: options.jurisdictionStatus || 'APPLICABLE',
      country: 'MX',
      scope: 'FEDERAL',
      matter: 'civil',
      procedure: 'ordinario',
      bindingCharacter: 'BINDING_WHEN_APPLICABLE',
      basis: ['fixture jurisdiction verification'],
    },
    proposition: {
      text: 'El requisito debe acreditarse.',
      supportLevel: 'DIRECT',
      sourceLocator: 'artículo 14',
      limitations: options.limitations || ['No acredita por sí misma un hecho del expediente.'],
    },
    verificationStatus: 'VERIFIED',
    supportsLegalIssueIds: options.supportsLegalIssueIds || [legalIssueId],
    sourceAuthorityMentionIds: ['source-authority-1'],
    verificationHash: `verification-${id}`,
  };
}

export function bundleFixture(
  legalIssueId = 'issue-research-1',
  overrides: Partial<LegalResearchBundle> = {},
): LegalResearchBundle {
  return {
    legalIssueId,
    requestId: `request-${legalIssueId}`,
    regimeResolution: { ...regimeFixture },
    verifiedAuthorities: [verifiedAuthorityFixture('verified-authority-1', legalIssueId)],
    rejectedCandidates: [],
    unresolvedQuestions: [],
    researchStatus: 'VERIFIED_SUFFICIENT',
    researchHash: 'research-hash-1',
    ...overrides,
  };
}

export function readinessFixture(
  legalIssueId = 'issue-research-1',
  researchBundleHash = 'research-hash-1',
  overrides: Partial<DerivedIssueReadiness> = {},
): DerivedIssueReadiness {
  return {
    legalIssueId,
    canonicalStatus: 'NEEDS_RESEARCH',
    researchReadiness: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
    researchBundleHash,
    blockers: [],
    ...overrides,
  };
}

export function generationTaskFixture(legalIssueId = 'issue-research-1'): GenerationTask {
  return {
    id: `generation-task-${legalIssueId}`,
    sectionId: 'section-1',
    sectionTitle: 'Fundamento jurídico',
    taskType: 'ISSUE',
    type: 'ISSUE',
    title: 'Issue scoped fixture',
    objective: 'Resolver una issue jurídica scoped.',
    complexity: 'SHORT',
    tokenBudget: 800,
    status: 'pending',
    order: 1,
    orderInParent: 1,
    coverageItemIds: ['coverage-research-1'],
    factIds: ['fact-research-1'],
    evidenceIds: ['evidence-research-1'],
    authorityIds: ['source-authority-1'],
    claimIds: [],
    legalIssueIds: [legalIssueId],
  };
}

export function draftResultFixture(overrides: Partial<IssueDraftResult> = {}): IssueDraftResult {
  return {
    legalIssueId: 'issue-research-1',
    coverageItemIds: ['coverage-research-1'],
    issueType: 'AUTHORITY_RESEARCH',
    thesis: 'La cuestión jurídica exige revisar el requisito aplicable.',
    factualDevelopment: ['El expediente contiene el hecho identificado como fact-research-1.'],
    evidentiaryDevelopment: ['La evidencia evidence-research-1 queda vinculada a la cuestión.'],
    legalDevelopment: ['La proposición jurídica debe aplicarse sin exceder sus limitaciones.'],
    counterPosition: 'La contraparte podría sostener una lectura distinta.',
    application: 'La aplicación queda limitada a los hechos y pruebas permitidos.',
    conclusion: 'Procede continuar con la respuesta conforme al alcance acreditado.',
    sourceEntityIds: ['fact-research-1', 'evidence-research-1'],
    authorityMentionIds: ['source-authority-1'],
    unresolvedRequirements: [],
    generationMetadata: {
      promptVersion: 'ISSUE_DRAFT_V1',
      contextHash: 'context-hash-1',
      providerRequested: 'nvidia',
      providerActuallyUsed: 'fixture',
      model: 'fixture-model',
      attemptCount: 1,
    },
    ...overrides,
  };
}

export function passEvaluation(blockId: string): BlockQualityEvaluation {
  return {
    blockId,
    taskId: blockId.replace(/^blk-/, ''),
    factualCoverage: 0.9,
    legalSupport: 0.9,
    evidenceLinkage: 0.9,
    issueResponsiveness: 0.9,
    argumentDepth: 0.9,
    specificity: 0.9,
    completeness: 0.9,
    repetitionPenalty: 0,
    unsupportedAssertionPenalty: 0,
    overallScore: 0.9,
    verdict: 'PASS',
    revisionMode: 'NONE',
    deficiencies: [],
    coveredCoverageItemIds: ['coverage-research-1'],
    missingCoverageItemIds: [],
    hardFailReasons: [],
  };
}

export function providerResponseFixture(
  overrides: Partial<AIProviderResult> = {},
): AIProviderResult {
  return {
    provider: 'nvidia',
    providerRequested: 'nvidia',
    providerActuallyUsed: 'none',
    model: 'fixture-model',
    success: true,
    content: '',
    structuredOutput: draftResultFixture() as unknown as Record<string, unknown>,
    latencyMs: 1,
    finishReason: 'stop',
    isTruncated: false,
    origin: 'AI_GENERATED_LEGAL_CONTENT',
    isLegalAiContent: true,
    ...overrides,
  };
}

export function providerResponseForRequest(
  request: AIRequest,
  resultOverrides: Partial<IssueDraftResult> = {},
): AIProviderResult {
  const requestWithIssueMetadata = request as AIRequest & { contextHash?: string; promptVersion?: string };
  const result = draftResultFixture({
    generationMetadata: {
      ...draftResultFixture().generationMetadata,
      contextHash: String(requestWithIssueMetadata.contextHash || 'context-hash-1'),
      promptVersion: String(requestWithIssueMetadata.promptVersion || 'ISSUE_DRAFT_V1'),
    },
    ...resultOverrides,
  });
  const {
    legalIssueId: _legalIssueId,
    coverageItemIds: _coverageItemIds,
    issueType: _issueType,
    draftContract: _draftContract,
    generationMetadata: _generationMetadata,
    ...modelOwnedOutput
  } = result;
  return providerResponseFixture({ structuredOutput: modelOwnedOutput as unknown as Record<string, unknown> });
}

export function validationInputFixture(
  overrides: Partial<IssueDraftValidationInput> = {},
): IssueDraftValidationInput {
  return {
    expectedLegalIssueId: 'issue-research-1',
    issueType: 'AUTHORITY_RESEARCH',
    allowedCoverageItemIds: ['coverage-research-1'],
    allowedSourceEntityIds: ['fact-research-1', 'evidence-research-1'],
    allowedAuthorityMentionIds: ['source-authority-1'],
    contextHash: 'context-hash-1',
    promptVersion: 'ISSUE_DRAFT_V1',
    ...overrides,
  };
}

export function contextFixture(
  legalIssueId = 'issue-research-1',
  options: { researchHash?: string; authorityOrder?: string[] } = {},
): VerifiedResearchContext {
  const authorityIds = options.authorityOrder || ['verified-authority-1'];
  const bundle = bundleFixture(legalIssueId, {
    researchHash: options.researchHash || 'research-hash-1',
    verifiedAuthorities: authorityIds.map((id) => verifiedAuthorityFixture(id, legalIssueId)),
  });
  return buildVerifiedResearchContext(bundle, legalIssueId);
}

export function buildPackWithResearch(
  issue: LegalIssueItem,
  options: { verifiedResearch?: VerifiedResearchContext } = {},
): IssueContextPack {
  const task = generationTaskFixture(issue.id);
  const coverageItem = {
    id: issue.coverageItemIds[0],
    documentId: 'research-reentry-document',
    category: 'AUTHORITY_MENTION',
    description: 'Requisito jurídico scoped',
    status: 'pending',
    blocking: false,
    sourceEntityType: 'AUTHORITY',
    sourceEntityIds: ['source-authority-1'],
    claimIds: [],
    factIds: ['fact-research-1'],
    evidenceMentionIds: ['evidence-research-1'],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['source-authority-1'],
    conflictIds: [],
    missingDataIds: [],
    targetSectionIds: ['section-1'],
    satisfactionPolicy: 'SEMANTIC_SUBSTANTIVE',
    scope: 'SUBSTANTIVE',
    provenance: [],
  };
  const matrix = {
    documentId: 'research-reentry-document',
    documentType: 'fixture',
    sourceMode: 'RICH',
    issues: [issue],
    summary: { total: 1, required: 1, blocked: 0, ready: 0, unresolved: 1 },
  } as unknown as LegalIssueMatrix;
  const doc = {
    id: 'research-reentry-document',
    sections: [{
      id: 'section-1',
      type: 'legal_grounds',
      title: 'Fundamento jurídico',
      order: 1,
      content: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
      coverageItemIds: ['coverage-research-1'],
    }],
    coverageMatrix: {
      documentId: 'research-reentry-document',
      documentType: 'fixture',
      items: [coverageItem],
      summary: { total: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    },
  } as unknown as UniversalLegalDocument;
  const caseAnalysis = {
    richCaseAnalysis: {
      claims: [],
      facts: [{ id: 'fact-research-1', proposition: 'Hecho permitido', assertionStatus: 'CONFIRMED', provenance: [] }],
      evidenceMentions: [{ id: 'evidence-research-1', description: 'Evidencia permitida', relatedFactIds: ['fact-research-1'], status: 'AVAILABLE', provenance: [] }],
      evidenceOffers: [],
      arguments: [],
      authorities: [{ id: 'source-authority-1', citationText: 'SOURCE_CITED FIXTURE', verificationStatus: 'SOURCE_CITED', provenance: [] }],
      clientPosition: undefined,
    },
  } as unknown as CaseAnalysis;
  return buildIssueContextPack(task, doc, caseAnalysis, matrix, options);
}

export function richAnalysisFixture(): CaseAnalysis {
  return {
    richCaseAnalysis: {
      claims: [],
      facts: [{ id: 'fact-research-1', proposition: 'Hecho permitido', assertionStatus: 'CONFIRMED', provenance: [] }],
      evidenceMentions: [{ id: 'evidence-research-1', description: 'Evidencia permitida', relatedFactIds: ['fact-research-1'], status: 'AVAILABLE', provenance: [] }],
      evidenceOffers: [],
      arguments: [],
      authorities: [{ id: 'source-authority-1', citationText: 'SOURCE_CITED FIXTURE', verificationStatus: 'SOURCE_CITED', provenance: [] }],
      clientPosition: undefined,
    },
  } as unknown as CaseAnalysis;
}

export function documentFixture(legalIssueIds: string[]): UniversalLegalDocument {
  const issues = legalIssueIds.map((legalIssueId) => issueFixture({ id: legalIssueId }));
  const coverageItem = {
    id: 'coverage-research-1',
    documentId: 'research-reentry-document',
    category: 'AUTHORITY_MENTION',
    description: 'Requisito jurídico scoped',
    status: 'pending',
    blocking: false,
    sourceEntityType: 'AUTHORITY',
    sourceEntityIds: ['source-authority-1'],
    claimIds: [],
    factIds: ['fact-research-1'],
    evidenceMentionIds: ['evidence-research-1'],
    evidenceOfferIds: [],
    argumentIds: [],
    authorityMentionIds: ['source-authority-1'],
    conflictIds: [],
    missingDataIds: [],
    targetSectionIds: ['section-1'],
    satisfactionPolicy: 'SEMANTIC_SUBSTANTIVE',
    scope: 'SUBSTANTIVE',
    provenance: [],
  };
  const matrix = {
    documentId: 'research-reentry-document',
    documentType: 'fixture',
    sourceMode: 'RICH',
    issues,
    summary: { total: issues.length, required: issues.length, blocked: 0, ready: 0, unresolved: issues.length },
  } as unknown as LegalIssueMatrix;
  return {
    id: 'research-reentry-document',
    title: 'Research reentry fixture',
    documentType: 'fixture',
    documentTypeLabel: 'Fixture',
    matter: 'civil',
    jurisdiction: 'federal',
    category: 'escrito',
    legalBasis: [],
    parties: {},
    caseRefs: {},
    variables: {},
    sections: [{ id: 'section-1', type: 'legal_grounds', title: 'Fundamento jurídico', order: 1, content: [], isRepeatable: false, isEditable: true, isGenerated: false, isManuallyEdited: false, variables: [], validationErrors: [], validationWarnings: [], coverageItemIds: ['coverage-research-1'] }],
    sourceDocuments: [],
    classification: {} as unknown as UniversalLegalDocument['classification'],
    validation: {} as unknown as UniversalLegalDocument['validation'],
    generationMetadata: {} as unknown as UniversalLegalDocument['generationMetadata'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    coverageMatrix: {
      documentId: 'research-reentry-document',
      documentType: 'fixture',
      items: [coverageItem],
      summary: { total: 1, pending: 1, generated: 0, covered: 0, weak: 0, unsupported: 0, notApplicable: 0 },
    } as unknown as UniversalLegalDocument['coverageMatrix'],
    legalIssueMatrix: matrix,
  };
}
