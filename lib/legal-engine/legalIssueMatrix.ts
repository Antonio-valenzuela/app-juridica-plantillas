import type {
  CoverageCategory,
  CoverageEntityType,
  CoverageMatrix,
  CoverageRelationStatus,
} from './coverageMatrix';
import type { CaseAnalysis, LegalIssue } from './caseAnalysis';
import type { RichCaseAnalysis, SourceProvenance } from './case-extraction/types';

export type LegalIssueType =
  | 'CLAIM_ELEMENT'
  | 'FACT_DISPUTE'
  | 'EVIDENCE_RELEVANCE'
  | 'EVIDENCE_SUFFICIENCY'
  | 'SOURCE_ARGUMENT'
  | 'PROCEDURAL_ISSUE'
  | 'PETITION_SUPPORT'
  | 'AUTHORITY_RESEARCH'
  | 'CONFLICT_DEPENDENCY';

export type LegalIssueStatus =
  | 'READY_FOR_GENERATION'
  | 'GENERATABLE_REQUIRES_REVIEW'
  | 'BLOCKED_BY_CONFLICT'
  | 'NEEDS_CLIENT_POSITION'
  | 'NEEDS_RESEARCH'
  | 'UNLINKED'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type LegalResearchStatus = 'NOT_REQUIRED' | 'NEEDS_RESEARCH' | 'SOURCE_CITED_UNVERIFIED';
export type ClientPositionStatus = 'NOT_REQUIRED' | 'CONFIRMED' | 'UNKNOWN';

export interface LegalIssueSource {
  mode: 'RICH_COVERAGE' | 'LEGACY_FALLBACK';
  coverageItemId: string;
  coverageCategory: CoverageCategory;
  sourceEntityType?: CoverageEntityType;
  sourceEntityIds: string[];
}

export interface LegalIssueItem {
  id: string;
  issueType: LegalIssueType;
  question: string;
  source: LegalIssueSource;
  coverageItemIds: string[];
  claimIds: string[];
  factIds: string[];
  evidenceMentionIds: string[];
  evidenceOfferIds: string[];
  argumentIds: string[];
  authorityMentionIds: string[];
  challengedReasoningIds?: string[];
  conflictIds: string[];
  missingDataIds: string[];
  clientPositionStatus: ClientPositionStatus;
  required: boolean;
  blocking: boolean;
  status: LegalIssueStatus;
  researchStatus: LegalResearchStatus;
  provenance: SourceProvenance[];
  relationStatus: CoverageRelationStatus;
  statusReason?: string;
}

export interface LegalIssueMatrix {
  documentId: string;
  documentType: string;
  sourceMode: 'RICH' | 'LEGACY_FALLBACK';
  issues: LegalIssueItem[];
  summary: {
    total: number;
    required: number;
    blocked: number;
    readyForGeneration: number;
    needsLegalResearch: number;
    needsClientPosition: number;
    unresolvedConflict: number;
    unlinked: number;
    generatableRequiresReview?: number;
  };
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function stableIssueKey(input: {
  documentId: string;
  coverageItemId: string;
  issueType: LegalIssueType;
  claimIds: string[];
  factIds: string[];
  evidenceMentionIds: string[];
  evidenceOfferIds: string[];
  argumentIds: string[];
  authorityMentionIds: string[];
  challengedReasoningIds?: string[];
  conflictIds: string[];
  missingDataIds: string[];
}): string {
  return JSON.stringify([
    input.documentId,
    input.coverageItemId,
    input.issueType,
    sortedUnique(input.claimIds),
    sortedUnique(input.factIds),
    sortedUnique(input.evidenceMentionIds),
    sortedUnique(input.evidenceOfferIds),
    sortedUnique(input.argumentIds),
    sortedUnique(input.authorityMentionIds),
    sortedUnique(input.challengedReasoningIds || []),
    sortedUnique(input.conflictIds),
    sortedUnique(input.missingDataIds),
  ]);
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x01000193);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function emptySummary(): LegalIssueMatrix['summary'] {
  return {
    total: 0,
    required: 0,
    blocked: 0,
    readyForGeneration: 0,
    needsLegalResearch: 0,
    needsClientPosition: 0,
    unresolvedConflict: 0,
    unlinked: 0,
    generatableRequiresReview: 0,
  };
}

function summarizeIssues(issues: LegalIssueItem[]): LegalIssueMatrix['summary'] {
  return issues.reduce((result, issue) => {
    result.total += 1;
    if (issue.required) result.required += 1;
    if (issue.blocking) result.blocked += 1;
    if (issue.status === 'READY_FOR_GENERATION') result.readyForGeneration += 1;
    if (issue.status === 'GENERATABLE_REQUIRES_REVIEW') result.generatableRequiresReview = (result.generatableRequiresReview || 0) + 1;
    if (issue.status === 'NEEDS_RESEARCH') result.needsLegalResearch += 1;
    if (issue.status === 'NEEDS_CLIENT_POSITION') result.needsClientPosition += 1;
    if (issue.status === 'BLOCKED_BY_CONFLICT') result.unresolvedConflict += 1;
    if (issue.status === 'UNLINKED') result.unlinked += 1;
    return result;
  }, emptySummary());
}

const ISSUE_TYPE_BY_CATEGORY: Partial<Record<CoverageCategory, LegalIssueType>> = {
  CLAIM_RESPONSE: 'CLAIM_ELEMENT',
  FACT_RESPONSE: 'FACT_DISPUTE',
  EVIDENCE_TREATMENT: 'EVIDENCE_RELEVANCE',
  EVIDENCE_OFFER: 'EVIDENCE_SUFFICIENCY',
  SOURCE_ARGUMENT_RESPONSE: 'SOURCE_ARGUMENT',
  PETITION_SUPPORT: 'PETITION_SUPPORT',
  AUTHORITY_MENTION: 'AUTHORITY_RESEARCH',
  PROCEDURAL_REQUIREMENT: 'PROCEDURAL_ISSUE',
  CONFLICT_REVIEW: 'CONFLICT_DEPENDENCY',
};

function collectRichEntityProvenance(rich: RichCaseAnalysis): Map<string, SourceProvenance[]> {
  const result = new Map<string, SourceProvenance[]>();
  const add = (id: string | undefined, provenance: SourceProvenance[]) => {
    if (id) result.set(id, provenance);
  };
  rich.parties.forEach((entity) => add(entity.id, entity.provenance));
  rich.claims.forEach((entity) => add(entity.id, entity.provenance));
  rich.facts.forEach((entity) => add(entity.id, entity.provenance));
  rich.documents.forEach((entity) => add(entity.id, entity.provenance));
  rich.evidenceMentions.forEach((entity) => add(entity.id, entity.provenance));
  rich.evidenceOffers.forEach((entity) => add(entity.id, entity.provenance));
  rich.arguments.forEach((entity) => add(entity.id, entity.provenance));
  (rich.decisionReasonings || []).forEach((entity) => add(entity.id, entity.provenance));
  rich.authorities.forEach((entity) => add(entity.id, entity.provenance));
  rich.conflicts.forEach((entity) => add(entity.conflictId, []));
  rich.missingData.forEach((entity) => add(entity.id, []));
  return result;
}

function collectRichEntityIds(rich: RichCaseAnalysis): Set<string> {
  return new Set([
    ...rich.parties.map((entity) => entity.id),
    ...rich.claims.map((entity) => entity.id),
    ...rich.facts.map((entity) => entity.id),
    ...rich.documents.map((entity) => entity.id),
    ...rich.evidenceMentions.map((entity) => entity.id),
    ...rich.evidenceOffers.map((entity) => entity.id),
    ...rich.arguments.map((entity) => entity.id),
    ...(rich.decisionReasonings || []).map((entity) => entity.id),
    ...rich.authorities.map((entity) => entity.id),
    ...rich.conflicts.map((entity) => entity.conflictId),
    ...rich.missingData.flatMap((entity) => entity.id ? [entity.id] : []),
  ]);
}

function questionForCoverage(category: CoverageCategory, description: string): string {
  void description;
  switch (category) {
    case 'CLAIM_RESPONSE':
      return '¿Qué elementos de la prestación expresamente identificada deben analizarse?';
    case 'FACT_RESPONSE':
      return '¿Qué debe analizarse y responderse respecto del hecho expresamente identificado?';
    case 'EVIDENCE_TREATMENT':
      return '¿Qué pertinencia tiene la evidencia expresamente mencionada?';
    case 'EVIDENCE_OFFER':
      return '¿Qué suficiencia puede evaluarse respecto de la oferta de prueba expresamente identificada?';
    case 'SOURCE_ARGUMENT_RESPONSE':
      return '¿Qué debe analizarse y responderse respecto del argumento expresamente identificado?';
    case 'PETITION_SUPPORT':
      return '¿Qué apoyo identificado en la fuente debe analizarse para el apartado petitorio?';
    case 'AUTHORITY_MENTION':
      return '¿Qué referencia y estado de verificación requiere la autoridad mencionada?';
    case 'PROCEDURAL_REQUIREMENT':
      return '¿Qué requisito procesal expresamente identificado debe revisarse?';
    case 'CONFLICT_REVIEW':
      return '¿Qué conflicto expresamente identificado requiere revisión?';
    default:
      return '¿Qué debe analizarse respecto del elemento expresamente identificado?';
  }
}

function resolveIssueStatus(input: {
  relationStatus: CoverageRelationStatus;
  conflictIds: string[];
  clientPositionStatus: ClientPositionStatus;
  researchStatus: LegalResearchStatus;
  required: boolean;
  hasDocumentarySupport?: boolean;
}): { status: LegalIssueStatus; blocking: boolean; statusReason: string } {
  if (input.conflictIds.length > 0) return { status: 'BLOCKED_BY_CONFLICT', blocking: true, statusReason: 'BLOCKING_CONFLICT_REQUIRES_REVIEW' };
  if (input.clientPositionStatus === 'UNKNOWN') {
    if (input.relationStatus === 'EXPLICIT' && input.hasDocumentarySupport) {
      return {
        status: 'GENERATABLE_REQUIRES_REVIEW',
        blocking: false,
        statusReason: 'SOURCE_BACKED_DRAFT_CLIENT_POSITION_PENDING',
      };
    }
    return { status: 'NEEDS_CLIENT_POSITION', blocking: true, statusReason: 'MISSING_CLIENT_POSITION_REQUIRED' };
  }
  if (input.relationStatus === 'UNKNOWN') return { status: 'UNKNOWN', blocking: true, statusReason: 'EXPLICIT_RELATION_CANNOT_BE_RESOLVED' };
  if (input.relationStatus === 'UNLINKED') return { status: 'UNLINKED', blocking: input.required, statusReason: 'MATERIAL_RELATION_NOT_EXPLICIT' };
  if (input.researchStatus !== 'NOT_REQUIRED') return { status: 'NEEDS_RESEARCH', blocking: true, statusReason: 'LEGAL_RESEARCH_OR_SOURCE_VERIFICATION_REQUIRED' };
  return { status: 'READY_FOR_GENERATION', blocking: false, statusReason: 'EXPLICIT_RELATIONS_READY' };
}

function buildIssueForCoverage(
  coverageItem: CoverageMatrix['items'][number],
  documentId: string,
  knownEntityIds: Set<string>,
  provenanceById: Map<string, SourceProvenance[]>,
): LegalIssueItem | undefined {
  const issueType = ISSUE_TYPE_BY_CATEGORY[coverageItem.category];
  if (!issueType || coverageItem.metadata?.compatibilityAlias === true) return undefined;
  if (coverageItem.scope === 'FORMAL' || coverageItem.satisfactionPolicy === 'FORMAL_DETERMINISTIC_ALLOWED' || coverageItem.satisfactionPolicy === 'REFERENCE_ONLY') {
    return undefined;
  }

  const claimIds = sortedUnique(coverageItem.claimIds || []);
  const factIds = sortedUnique(coverageItem.factIds || []);
  const evidenceMentionIds = sortedUnique(coverageItem.evidenceMentionIds || []);
  const evidenceOfferIds = sortedUnique(coverageItem.evidenceOfferIds || []);
  const argumentIds = sortedUnique(coverageItem.argumentIds || []);
  const authorityMentionIds = sortedUnique(coverageItem.authorityMentionIds || []);
  const challengedReasoningIds = sortedUnique(coverageItem.relatedChallengedReasoningIds || []);
  const conflictIds = sortedUnique(coverageItem.conflictIds || []);
  const missingDataIds = sortedUnique(coverageItem.missingDataIds || []);
  const relationIds = [
    ...claimIds,
    ...factIds,
    ...evidenceMentionIds,
    ...evidenceOfferIds,
    ...argumentIds,
    ...authorityMentionIds,
    ...challengedReasoningIds,
    ...conflictIds,
    ...missingDataIds,
  ];
  const relationStatus: CoverageRelationStatus = relationIds.length === 0
    ? 'UNLINKED'
    : relationIds.every((id) => knownEntityIds.has(id))
      ? 'EXPLICIT'
      : 'UNKNOWN';
  const key = stableIssueKey({
    documentId,
    coverageItemId: coverageItem.id,
    issueType,
    claimIds,
    factIds,
    evidenceMentionIds,
    evidenceOfferIds,
    argumentIds,
    authorityMentionIds,
    challengedReasoningIds,
    conflictIds,
    missingDataIds,
  });
  const status: LegalIssueStatus = relationStatus === 'EXPLICIT' ? 'READY_FOR_GENERATION' : relationStatus;
  const provenance = sortedUnique(relationIds)
    .flatMap((id) => (provenanceById.get(id) || []).map((entry) => ({ ...entry })));

  return {
    id: `issue-${stableHash(key)}`,
    issueType,
    question: questionForCoverage(coverageItem.category, coverageItem.description),
    source: {
      mode: 'RICH_COVERAGE',
      coverageItemId: coverageItem.id,
      coverageCategory: coverageItem.category,
      sourceEntityType: coverageItem.sourceEntityType,
      sourceEntityIds: sortedUnique(coverageItem.sourceEntityIds || claimIds),
    },
    coverageItemIds: [coverageItem.id],
    claimIds,
    factIds,
    evidenceMentionIds,
    evidenceOfferIds,
    argumentIds,
    authorityMentionIds,
    challengedReasoningIds,
    conflictIds,
    missingDataIds,
    clientPositionStatus: 'NOT_REQUIRED',
    required: coverageItem.required,
    blocking: status !== 'READY_FOR_GENERATION' && coverageItem.required,
    status,
    researchStatus: 'NOT_REQUIRED',
    provenance: provenance.length > 0 ? provenance : (coverageItem.provenance || []).map((entry) => ({ ...entry })),
    relationStatus,
    statusReason: status === 'UNLINKED' ? 'MATERIAL_RELATION_NOT_EXPLICIT' : undefined,
  };
}

function enrichIssueDependencies(
  issue: LegalIssueItem,
  coverageMatrix: CoverageMatrix,
  rich: RichCaseAnalysis,
  documentId: string,
): LegalIssueItem {
  const coverageItem = coverageMatrix.items.find((item) => item.id === issue.source.coverageItemId);
  const directCoreIds = [
    ...issue.claimIds,
    ...issue.factIds,
    ...issue.evidenceMentionIds,
    ...issue.evidenceOfferIds,
    ...issue.argumentIds,
  ];
  const directConflicts = rich.conflicts.filter((conflict) =>
    conflict.itemIds.some((id) => directCoreIds.includes(id)),
  );
  const attachedConflictIds = directConflicts.map((conflict) => conflict.conflictId);
  const hasMaterialConflict = directConflicts.some((c) =>
    c.type === 'OPPOSING_ASSERTION'
    || c.type === 'IDENTITY'
    || c.type === 'ROLE'
    || issue.claimIds.some((id) => c.itemIds.includes(id)),
  );

  const missingDataIds = coverageMatrix.items
    .filter((item) => item.category === 'MISSING_CLIENT_POSITION')
    .filter((item) => {
      const missingRelations = [...(item.factIds || []), ...(item.claimIds || [])];
      return missingRelations.some((id) => directCoreIds.includes(id));
    })
    .flatMap((item) => item.missingDataIds || []);
  const conflictIds = sortedUnique([...issue.conflictIds, ...attachedConflictIds]);
  const positionIds = [...issue.claimIds, ...issue.factIds];
  const requiresClientPosition = coverageItem?.requiresClientPosition === true;
  const clientPositionStatus: ClientPositionStatus = !requiresClientPosition
    ? 'NOT_REQUIRED'
    : rich.clientPosition.status === 'CONFIRMED'
      && positionIds.some((id) => rich.clientPosition.propositionIds.includes(id))
      ? 'CONFIRMED'
      : 'UNKNOWN';
  const citedAuthorityIds = new Set(
    rich.authorities
      .filter((authority) => authority.verificationStatus === 'SOURCE_CITED')
      .map((authority) => authority.id),
  );
  const hasUnverifiedCitedAuthority = issue.authorityMentionIds.some((id) => citedAuthorityIds.has(id));
  const researchStatus: LegalResearchStatus = issue.issueType === 'AUTHORITY_RESEARCH' && issue.authorityMentionIds.length > 0
    ? 'NEEDS_RESEARCH'
    : issue.issueType === 'SOURCE_ARGUMENT' && hasUnverifiedCitedAuthority
      ? 'SOURCE_CITED_UNVERIFIED'
      : 'NOT_REQUIRED';

  const establishedFactIds = new Set(
    rich.facts.filter((f) => f.assertionStatus === 'ESTABLISHED_FACT').map((f) => f.id),
  );
  const hasEstablishedFact = issue.factIds.some((id) => establishedFactIds.has(id));
  const hasEstablishedArgument = issue.argumentIds.some((id) => {
    const arg = rich.arguments.find((a) => a.id === id);
    return arg?.supportingFactIds.some((fid) => establishedFactIds.has(fid));
  });
  const hasDocumentarySupport = hasEstablishedFact || hasEstablishedArgument;

  const resolved = resolveIssueStatus({
    relationStatus: issue.relationStatus,
    conflictIds,
    clientPositionStatus,
    researchStatus,
    required: issue.required,
    hasDocumentarySupport,
  });
  const finalKey = stableIssueKey({
    documentId,
    coverageItemId: issue.source.coverageItemId,
    issueType: issue.issueType,
    claimIds: issue.claimIds,
    factIds: issue.factIds,
    evidenceMentionIds: issue.evidenceMentionIds,
    evidenceOfferIds: issue.evidenceOfferIds,
    argumentIds: issue.argumentIds,
    authorityMentionIds: issue.authorityMentionIds,
    challengedReasoningIds: issue.challengedReasoningIds || [],
    conflictIds,
    missingDataIds: sortedUnique([...issue.missingDataIds, ...missingDataIds]),
  });
  return {
    ...issue,
    id: `issue-${stableHash(finalKey)}`,
    conflictIds,
    missingDataIds: sortedUnique([...issue.missingDataIds, ...missingDataIds]),
    clientPositionStatus,
    researchStatus,
    ...resolved,
  };
}

function buildRichLegalIssueMatrix(rich: RichCaseAnalysis, coverageMatrix: CoverageMatrix): LegalIssueMatrix {
  const documentId = coverageMatrix.documentId || 'unknown-document';
  const knownEntityIds = collectRichEntityIds(rich);
  const provenanceById = collectRichEntityProvenance(rich);
  const issues = coverageMatrix.items
    .map((item) => buildIssueForCoverage(item, documentId, knownEntityIds, provenanceById))
    .filter((issue): issue is LegalIssueItem => Boolean(issue))
    .map((issue) => enrichIssueDependencies(issue, coverageMatrix, rich, documentId))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    documentId,
    documentType: coverageMatrix.documentType || 'unknown',
    sourceMode: 'RICH',
    issues,
    summary: summarizeIssues(issues),
  };
}

function getLegacyIssues(caseAnalysis: CaseAnalysis): LegalIssue[] {
  const all = [
    ...(caseAnalysis.proceduralPosture?.constitutionalIssues || []),
    ...(caseAnalysis.proceduralPosture?.legalityIssues || []),
    ...(caseAnalysis.legalIssues || []),
  ];
  return Array.from(new Map(all.map((issue) => [issue.id, issue])).values());
}

function buildLegacyFallbackLegalIssueMatrix(caseAnalysis: CaseAnalysis, coverageMatrix: CoverageMatrix): LegalIssueMatrix {
  const issues = getLegacyIssues(caseAnalysis).map((legacyIssue): LegalIssueItem => {
    const coverageItem = coverageMatrix.items.find((item) => item.sourceId === legacyIssue.id);
    const coverageItemId = coverageItem?.id || `legacy-coverage-${legacyIssue.id}`;
    const factIds = sortedUnique(legacyIssue.relatedFactIds || []);
    const claimIds = sortedUnique(legacyIssue.relatedClaimIds || []);
    return {
      id: `legacy-issue-${legacyIssue.id}`,
      issueType: 'PROCEDURAL_ISSUE',
      question: legacyIssue.title,
      source: {
        mode: 'LEGACY_FALLBACK',
        coverageItemId,
        coverageCategory: coverageItem?.category || 'LEGAL_ISSUE',
        sourceEntityIds: [legacyIssue.id],
      },
      coverageItemIds: [coverageItemId],
      claimIds,
      factIds,
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: [],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: coverageItem?.required ?? true,
      blocking: true,
      status: 'UNLINKED',
      researchStatus: 'NOT_REQUIRED',
      provenance: (coverageItem?.provenance || []).map((entry) => ({ ...entry })),
      relationStatus: 'UNLINKED',
      statusReason: 'LEGACY_ISSUE_REQUIRES_REVIEW',
    };
  });
  return {
    documentId: coverageMatrix.documentId || 'unknown-document',
    documentType: coverageMatrix.documentType || 'unknown',
    sourceMode: 'LEGACY_FALLBACK',
    issues,
    summary: summarizeIssues(issues),
  };
}

export interface LegalIssueMatrixValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  orphanIssueIds: string[];
  coverageWithoutIssueIds: string[];
}

function isMaterialCoverageItem(item: CoverageMatrix['items'][number]): boolean {
  return Boolean(
    ISSUE_TYPE_BY_CATEGORY[item.category]
      && item.scope !== 'FORMAL'
      && item.satisfactionPolicy !== 'FORMAL_DETERMINISTIC_ALLOWED'
      && item.satisfactionPolicy !== 'REFERENCE_ONLY'
      && item.metadata?.compatibilityAlias !== true,
  );
}

export function validateLegalIssueMatrix(
  matrix: LegalIssueMatrix,
  coverageMatrix: CoverageMatrix,
  caseAnalysis?: CaseAnalysis,
): LegalIssueMatrixValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coverageIds = new Set(coverageMatrix.items.map((item) => item.id));
  const orphanIssueIds: string[] = [];
  const coverageWithoutIssueIds: string[] = [];
  const issuesByCoverageId = new Set(matrix.issues.flatMap((issue) => issue.coverageItemIds));

  for (const issue of matrix.issues) {
    const hasOrphanCoverage = issue.coverageItemIds.some((coverageId) => !coverageIds.has(coverageId));
    if (hasOrphanCoverage) {
      orphanIssueIds.push(issue.id);
      errors.push(`LegalIssue "${issue.id}" referencia Coverage inexistente.`);
    }
    if (issue.relationStatus === 'UNKNOWN') {
      errors.push(`LegalIssue "${issue.id}" tiene relaciones explícitas no resolubles.`);
    }
    if (issue.required && issue.relationStatus === 'UNLINKED') {
      errors.push(`LegalIssue "${issue.id}" requerida carece de relación explícita.`);
    }
    if (issue.researchStatus !== 'NOT_REQUIRED') {
      warnings.push(`LegalIssue "${issue.id}" requiere investigación o verificación de fuente.`);
    }
    for (const coverageId of issue.coverageItemIds) {
      const coverageItem = coverageMatrix.items.find((item) => item.id === coverageId);
      if (coverageItem?.scope === 'FORMAL' && issue.status !== 'NOT_APPLICABLE') {
        errors.push(`Coverage formal "${coverageId}" no debe producir una LegalIssue material.`);
      }
    }
  }

  for (const item of coverageMatrix.items) {
    if (item.required && isMaterialCoverageItem(item) && !issuesByCoverageId.has(item.id)) {
      coverageWithoutIssueIds.push(item.id);
      errors.push(`Coverage requerida "${item.id}" no tiene LegalIssue.`);
    }
  }

  if (matrix.sourceMode === 'RICH' && caseAnalysis?.richCaseAnalysis) {
    const knownEntityIds = collectRichEntityIds(caseAnalysis.richCaseAnalysis);
    for (const issue of matrix.issues) {
      const relationIds = [
        ...issue.claimIds,
        ...issue.factIds,
        ...issue.evidenceMentionIds,
        ...issue.evidenceOfferIds,
        ...issue.argumentIds,
        ...issue.authorityMentionIds,
        ...issue.conflictIds,
        ...issue.missingDataIds,
      ];
      for (const relationId of relationIds) {
        if (!knownEntityIds.has(relationId)) {
          errors.push(`LegalIssue "${issue.id}" referencia entidad rich inexistente "${relationId}".`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    orphanIssueIds,
    coverageWithoutIssueIds,
  };
}

export function buildLegalIssueMatrix(input: {
  caseAnalysis: CaseAnalysis;
  coverageMatrix: CoverageMatrix;
}): LegalIssueMatrix {
  if (input.caseAnalysis.richCaseAnalysis) {
    return buildRichLegalIssueMatrix(input.caseAnalysis.richCaseAnalysis, input.coverageMatrix);
  }
  return buildLegacyFallbackLegalIssueMatrix(input.caseAnalysis, input.coverageMatrix);
}
