import type { ContentBlock, DocumentNode, UniversalLegalDocument } from './types';
import type { GenerationTask } from './generationTasks';
import type { CaseAnalysis } from './caseAnalysis';
import { buildCoverageMatrix, type CoverageMatrix, type DocumentCoverageItem } from './coverageMatrix';
import { buildLegalIssueMatrix, type LegalIssueItem, type LegalIssueMatrix, type LegalIssueStatus, type LegalIssueType } from './legalIssueMatrix';
import type { DerivedIssueReadiness, LegalResearchBundle, VerifiedAuthority } from './legal-research/types';
import type {
  ArgumentItem,
  ClaimItem,
  EvidenceMention,
  EvidenceOffer,
  FactItem,
  SourceAuthorityMention,
  SourceProvenance,
} from './case-extraction/types';
import { runFastMode } from '@/lib/ai/orchestrator';
import type { AIProviderResult, AIRequest } from '@/lib/ai/providers/types';
import {
  draftBlockFromIssueResult,
  hashIssueDraftResult,
  materializeIssueDraftResult,
  validateIssueDraftModelOutput,
  type IssueDraftValidation,
  type IssueDraftValidationStatus,
  type IssueDraftResult,
  type IssueDraftContract,
  getIssueDraftContractRequirements,
  type IssueDraftContractRequirements,
  type IssueGenerationAttempt,
  type IssueGenerationOutcome,
  type IssueTokenUsage,
  validateIssueDraftResult,
} from './issueDraftResult';
import { evaluateIssueDraftResult, toBlockQualityEvaluation } from './semanticEvaluator';
import { stableResearchId } from './legal-research/canonical';
import type { IssueResearchGenerationTrace } from './generationTrace';
import { getSectionContentRole } from './documentSectionContracts';
import type { SectionContract } from './documentAssemblyTypes';
export { evaluateIssueDraftResult } from './semanticEvaluator';

export interface IssueEligibility {
  eligible: boolean;
  legalIssueId?: string;
  status: LegalIssueStatus | 'MISSING_ISSUE';
  reason: string;
}

export interface EffectiveIssueGenerationEligibility extends IssueEligibility {
  canonicalStatus: LegalIssueStatus;
  effectiveStatus:
    | 'READY_FOR_GENERATION'
    | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'
    | 'GENERATABLE_REQUIRES_REVIEW'
    | 'BLOCKED';
  requestId?: string;
  researchHash?: string;
  verifiedAuthorityIds: string[];
  verifiedResearch?: VerifiedResearchContext;
}

export interface IssueResearchExecutionInputs {
  researchBundlesByIssueId?: ReadonlyMap<string, LegalResearchBundle>;
  derivedReadinessByIssueId?: ReadonlyMap<string, DerivedIssueReadiness>;
}

const FORMAL_SECTION_TYPES = new Set(['header', 'identity', 'closing', 'signature']);

function taskTypeOf(task: GenerationTask): string | undefined {
  return task.taskType || task.type;
}

export function isFormalIssueTask(task: GenerationTask, section: DocumentNode): boolean {
  return FORMAL_SECTION_TYPES.has(section.type) || taskTypeOf(task) === 'PROCEDURAL_GROUNDS' && section.type === 'header';
}

function blockedEffectiveEligibility(
  issue: LegalIssueItem | undefined,
  reason: string,
): EffectiveIssueGenerationEligibility {
  return {
    eligible: false,
    legalIssueId: issue?.id,
    status: issue?.status || 'MISSING_ISSUE',
    canonicalStatus: issue?.status || 'UNKNOWN',
    effectiveStatus: 'BLOCKED',
    reason,
    verifiedAuthorityIds: [],
  };
}

function canonicalBlockerReason(issue: LegalIssueItem): string | undefined {
  if (issue.status === 'GENERATABLE_REQUIRES_REVIEW') return undefined;
  if (issue.status === 'BLOCKED_BY_CONFLICT' || (issue.conflictIds.length > 0 && issue.status !== 'READY_FOR_GENERATION')) return 'BLOCKED_BY_CONFLICT';
  if (issue.status === 'NEEDS_CLIENT_POSITION' || (issue.clientPositionStatus === 'UNKNOWN' && issue.status !== 'READY_FOR_GENERATION')) return 'BLOCKED_BY_CLIENT_POSITION';
  if (issue.relationStatus === 'UNLINKED' || issue.status === 'UNLINKED') return 'UNLINKED_COVERAGE_REQUIRES_REVIEW';
  if (issue.status === 'UNKNOWN') return 'UNKNOWN_ISSUE_STATUS_REQUIRES_REVIEW';
  return undefined;
}

function resolveResearchEligibility(input: {
  issue: LegalIssueItem;
  derivedReadiness?: DerivedIssueReadiness;
  researchBundle?: LegalResearchBundle;
  formal: boolean;
  taskType?: string;
}): EffectiveIssueGenerationEligibility {
  const { issue, derivedReadiness, researchBundle, formal, taskType } = input;
  if (!derivedReadiness || !researchBundle) return blockedEffectiveEligibility(issue, 'RESEARCH_BUNDLE_MISSING');
  if (derivedReadiness.legalIssueId !== issue.id) return blockedEffectiveEligibility(issue, 'RESEARCH_ISSUE_MISMATCH');
  if (researchBundle.legalIssueId !== issue.id) return blockedEffectiveEligibility(issue, 'RESEARCH_ISSUE_MISMATCH');
  if (derivedReadiness.researchReadiness !== 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH') {
    return blockedEffectiveEligibility(issue, 'RESEARCH_NOT_SUFFICIENT');
  }
  if (researchBundle.researchStatus !== 'VERIFIED_SUFFICIENT') {
    return blockedEffectiveEligibility(issue, 'RESEARCH_NOT_SUFFICIENT');
  }
  if (!researchBundle.researchHash
    || researchBundle.researchHash !== derivedReadiness.researchBundleHash) {
    return blockedEffectiveEligibility(issue, 'RESEARCH_HASH_MISMATCH');
  }
  if (!researchBundle.requestId) return blockedEffectiveEligibility(issue, 'RESEARCH_REQUEST_INVALID');
  if (researchBundle.regimeResolution.status !== 'RESOLVED'
    || researchBundle.regimeResolution.unresolvedFields.length > 0) {
    return blockedEffectiveEligibility(issue, 'RESEARCH_REGIME_INVALID');
  }
  if (researchBundle.unresolvedQuestions.length > 0 || derivedReadiness.blockers.length > 0) {
    return blockedEffectiveEligibility(issue, 'RESEARCH_BLOCKER_PRESENT');
  }
  const verifiedResearch = buildVerifiedResearchContext(researchBundle, issue.id);
  if (verifiedResearch.authorities.length === 0) {
    return blockedEffectiveEligibility(issue, 'VERIFIED_AUTHORITY_SCOPE_EMPTY');
  }
  if (formal) return blockedEffectiveEligibility(issue, 'FORMAL_DETERMINISTIC_TASK');
  if (taskType === 'LEGAL_RESEARCH') return blockedEffectiveEligibility(issue, 'LEGAL_RESEARCH_PLAN_ONLY');
  return {
    eligible: true,
    legalIssueId: issue.id,
    status: issue.status,
    canonicalStatus: issue.status,
    effectiveStatus: 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
    reason: 'READY_WITH_VERIFIED_RESEARCH',
    requestId: researchBundle.requestId,
    researchHash: researchBundle.researchHash,
    verifiedAuthorityIds: verifiedResearch.authorities.map((authority) => authority.id),
    verifiedResearch,
  };
}

export type IssueGenerationClass = 'SOURCE_GROUNDED' | 'RESEARCH_DEPENDENT';

export function classifyIssueGeneration(input: {
  issue?: LegalIssueItem;
  taskType?: string;
}): IssueGenerationClass {
  const { issue, taskType } = input;
  if (taskType === 'LEGAL_RESEARCH') return 'RESEARCH_DEPENDENT';
  if (
    taskType === 'FACT_RESPONSE' ||
    taskType === 'CLAIM' ||
    taskType === 'EVIDENCE' ||
    taskType === 'SECTION_SUPPORT' ||
    taskType === 'COVERAGE_ITEM'
  ) {
    return 'SOURCE_GROUNDED';
  }
  if (!issue) return 'RESEARCH_DEPENDENT';
  if (issue.issueType === 'AUTHORITY_RESEARCH') return 'RESEARCH_DEPENDENT';
  if (issue.status === 'NEEDS_RESEARCH' || issue.researchStatus === 'NEEDS_RESEARCH') {
    return 'RESEARCH_DEPENDENT';
  }
  if (
    issue.issueType === 'FACT_DISPUTE' ||
    issue.issueType === 'CLAIM_ELEMENT' ||
    issue.issueType === 'EVIDENCE_RELEVANCE' ||
    issue.issueType === 'EVIDENCE_SUFFICIENCY' ||
    issue.issueType === 'PETITION_SUPPORT' ||
    issue.issueType === 'PROCEDURAL_ISSUE' ||
    issue.issueType === 'SOURCE_ARGUMENT'
  ) {
    return 'SOURCE_GROUNDED';
  }
  if (issue.researchStatus === 'NOT_REQUIRED') {
    return 'SOURCE_GROUNDED';
  }
  return 'RESEARCH_DEPENDENT';
}

export function resolveEffectiveIssueGenerationEligibility(input: {
  issue?: LegalIssueItem;
  derivedReadiness?: DerivedIssueReadiness;
  researchBundle?: LegalResearchBundle;
  formal: boolean;
  taskType?: string;
}): EffectiveIssueGenerationEligibility {
  const { issue, derivedReadiness, researchBundle, formal, taskType } = input;
  if (formal) return blockedEffectiveEligibility(issue, 'FORMAL_DETERMINISTIC_TASK');
  if (taskType === 'LEGAL_RESEARCH') return blockedEffectiveEligibility(issue, 'LEGAL_RESEARCH_PLAN_ONLY');

  const generationClass = classifyIssueGeneration({ issue, taskType });
  if (generationClass === 'SOURCE_GROUNDED') {
    if (issue) {
      if (issue.status === 'BLOCKED_BY_CONFLICT' || (issue.conflictIds && issue.conflictIds.length > 0 && issue.status !== 'READY_FOR_GENERATION')) {
        return blockedEffectiveEligibility(issue, 'BLOCKED_BY_CONFLICT');
      }
      if (issue.relationStatus === 'UNLINKED' || issue.status === 'UNLINKED') {
        return blockedEffectiveEligibility(issue, 'UNLINKED_COVERAGE_REQUIRES_REVIEW');
      }
      if (issue.status === 'UNKNOWN') {
        return blockedEffectiveEligibility(issue, 'UNKNOWN_ISSUE_STATUS_REQUIRES_REVIEW');
      }
    }
    if (researchBundle && derivedReadiness?.researchReadiness === 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH') {
      return resolveResearchEligibility({ issue: issue!, derivedReadiness, researchBundle, formal, taskType });
    }
    const effectiveStatus = issue?.status === 'NEEDS_CLIENT_POSITION' ? 'GENERATABLE_REQUIRES_REVIEW' : 'READY_FOR_GENERATION';
    const reason = 'READY_SOURCE_GROUNDED';
    return {
      eligible: true,
      legalIssueId: issue?.id as any,
      status: issue?.status ?? 'READY_FOR_GENERATION',
      canonicalStatus: issue?.status ?? 'READY_FOR_GENERATION',
      effectiveStatus,
      reason,
      verifiedAuthorityIds: [],
    };
  }

  if (!issue) return blockedEffectiveEligibility(undefined, 'ISSUE_NOT_RESOLVED');
  const blocker = canonicalBlockerReason(issue);
  if (blocker) return blockedEffectiveEligibility(issue, blocker);
  if (issue.relationStatus !== 'EXPLICIT') return blockedEffectiveEligibility(issue, 'RELATION_NOT_EXPLICIT');

  if (issue.status === 'READY_FOR_GENERATION') {
    return {
      eligible: true,
      legalIssueId: issue.id,
      status: issue.status,
      canonicalStatus: issue.status,
      effectiveStatus: 'READY_FOR_GENERATION',
      reason: 'READY_CANONICAL',
      verifiedAuthorityIds: [],
    };
  }
  if (issue.status === 'GENERATABLE_REQUIRES_REVIEW') {
    return {
      eligible: true,
      legalIssueId: issue.id,
      status: issue.status,
      canonicalStatus: issue.status,
      effectiveStatus: 'GENERATABLE_REQUIRES_REVIEW',
      reason: 'SOURCE_BACKED_DRAFT_REQUIRES_REVIEW',
      verifiedAuthorityIds: [],
    };
  }
  if (issue.status !== 'NEEDS_RESEARCH') return blockedEffectiveEligibility(issue, `ISSUE_STATUS_${issue.status}`);
  return resolveResearchEligibility({ issue, derivedReadiness, researchBundle, formal, taskType });
}

function issueIdsOf(task: GenerationTask): string[] {
  if (task.legalIssueIds && task.legalIssueIds.length > 0) return [...task.legalIssueIds];
  if (task.issueId) return [task.issueId];
  if (task.targetIssueId) return [task.targetIssueId];
  return [];
}

export function isFinalGenerationEligible(
  issue: LegalIssueItem | undefined,
  task: GenerationTask,
  options: { formal?: boolean } = {},
): boolean {
  return Boolean(
    issue
    && issue.relationStatus === 'EXPLICIT'
    && issue.status === 'READY_FOR_GENERATION'
    && !options.formal
    && taskTypeOf(task) !== 'LEGAL_RESEARCH',
  );
}

export function resolveIssueEligibility(
  task: GenerationTask,
  matrix: LegalIssueMatrix | undefined,
  options: { formal: boolean },
): IssueEligibility {
  const issueIds = issueIdsOf(task);
  if (issueIds.length !== 1) return { eligible: false, status: 'MISSING_ISSUE', reason: 'ISSUE_SCOPE_NOT_SINGLE' };

  const issue = matrix?.issues.find((candidate) => candidate.id === issueIds[0]);
  if (!issue) return { eligible: false, status: 'MISSING_ISSUE', reason: 'ISSUE_NOT_RESOLVED' };
  if (issue.relationStatus !== 'EXPLICIT') {
    return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: `RELATION_${issue.relationStatus}` };
  }
  if (options.formal) return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: 'FORMAL_DETERMINISTIC_TASK' };
  if (taskTypeOf(task) === 'LEGAL_RESEARCH') return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: 'LEGAL_RESEARCH_PLAN_ONLY' };
  if (issue.status === 'READY_FOR_GENERATION' || issue.status === 'GENERATABLE_REQUIRES_REVIEW') {
    return { eligible: true, legalIssueId: issue.id, status: issue.status, reason: issue.status };
  }
  return { eligible: false, legalIssueId: issue.id, status: issue.status, reason: `ISSUE_STATUS_${issue.status}` };
}

export class IssueContextScopeError extends Error {
  constructor(public readonly code: string, public readonly entityId?: string) {
    super(entityId ? `${code}:${entityId}` : code);
  }
}

export interface IssueContextPack {
  legalIssue: Pick<LegalIssueItem, 'id' | 'issueType' | 'question' | 'status' | 'relationStatus' | 'required'>;
  contentRole: SectionContract['contentRole'];
  draftContract?: IssueDraftContract;
  coverage: DocumentCoverageItem[];
  claims: Array<{ id: string; text: string; status?: string }>;
  facts: Array<{ id: string; proposition: string; assertionStatus?: string }>;
  evidenceMentions: Array<Pick<EvidenceMention, 'id' | 'description' | 'relatedFactIds' | 'status'>>;
  evidenceOffers: Array<Pick<EvidenceOffer, 'id' | 'evidenceMentionId' | 'status'>>;
  sourceArguments: Array<Pick<ArgumentItem, 'id' | 'proposition' | 'supportingFactIds' | 'citedAuthorityIds'>>;
  authorities: Array<Pick<SourceAuthorityMention, 'id' | 'citationText' | 'verificationStatus'>>;
  clientPosition?: { status: string; propositionIds: string[] };
  provenance: SourceProvenance[];
  contextHash: string;
  verifiedResearch?: VerifiedResearchContext;
}

export function selectIssueDraftContract(
  pack: Pick<IssueContextPack, 'contentRole' | 'legalIssue' | 'facts' | 'clientPosition'>,
  task?: Pick<GenerationTask, 'taskType' | 'type'>,
): IssueDraftContract | undefined {
  const taskType = task?.taskType || task?.type;
  if (pack.contentRole === 'EVIDENCE'
    && (pack.legalIssue.issueType === 'EVIDENCE_RELEVANCE' || pack.legalIssue.issueType === 'EVIDENCE_SUFFICIENCY')) {
    return 'DESCRIPTIVE';
  }

  if (taskType === 'FACT_RESPONSE' || taskType === 'CLAIM') {
    return 'DESCRIPTIVE';
  }

  if (taskType === 'ISSUE') {
    if (pack.contentRole === 'ISSUE_ARGUMENT' || pack.contentRole === 'PETITION') return 'ARGUMENTATIVE';
    if (pack.contentRole === 'FACT_RESPONSE') return 'DESCRIPTIVE';
    return undefined;
  }

  if (taskType === 'SECTION_SUPPORT') {
    if (pack.legalIssue.issueType === 'FACT_DISPUTE' || pack.legalIssue.issueType === 'CLAIM_ELEMENT') return 'DESCRIPTIVE';
    if (pack.contentRole === 'FACT_RESPONSE') return 'DESCRIPTIVE';
    if (pack.contentRole === 'ISSUE_ARGUMENT' || pack.contentRole === 'PETITION') return 'ARGUMENTATIVE';
    return undefined;
  }

  if (pack.contentRole === 'FACT_RESPONSE' && pack.legalIssue.issueType === 'FACT_DISPUTE') {
    if (pack.facts.length > 0 && pack.facts.every((fact) => fact.assertionStatus === 'ESTABLISHED_FACT')) {
      return 'DESCRIPTIVE';
    }
    const hasLinkedConfirmedPosition = pack.clientPosition?.status === 'CONFIRMED'
      && pack.clientPosition.propositionIds.some((id) => pack.facts.some((fact) => fact.id === id));
    return hasLinkedConfirmedPosition ? 'ARGUMENTATIVE' : undefined;
  }

  if (pack.contentRole === 'ISSUE_ARGUMENT' || pack.contentRole === 'EVIDENCE' || pack.contentRole === 'PETITION') {
    return 'ARGUMENTATIVE';
  }

  return undefined;
}

export interface VerifiedResearchContext {
  legalIssueId: string;
  requestId: string;
  researchHash: string;
  authorities: ScopedVerifiedAuthority[];
}

export type ScopedVerifiedAuthority = Pick<
  VerifiedAuthority,
  'id' | 'identity' | 'temporalValidity' | 'jurisdictionValidity' | 'proposition'
> & {
  source: Pick<VerifiedAuthority['source'], 'sourceUrl' | 'sourceDomain' | 'sourceTier' | 'locator' | 'sourceHash'>;
};

export function buildVerifiedResearchContext(
  bundle: LegalResearchBundle,
  legalIssueId: string,
): VerifiedResearchContext {
  const bundleMatches = bundle.legalIssueId === legalIssueId
    && bundle.researchStatus === 'VERIFIED_SUFFICIENT'
    && bundle.regimeResolution.status === 'RESOLVED'
    && bundle.regimeResolution.unresolvedFields.length === 0;
  const temporalAllowed = new Set(['CURRENT_AND_APPLICABLE', 'HISTORICALLY_APPLICABLE']);
  const authorities: ScopedVerifiedAuthority[] = bundleMatches
    ? bundle.verifiedAuthorities
        .filter((authority) => authority.verificationStatus === 'VERIFIED')
        .filter((authority) => authority.source.sourceTier === 'OFFICIAL_PRIMARY')
        .filter((authority) => authority.supportsLegalIssueIds.includes(legalIssueId))
        .filter((authority) => temporalAllowed.has(authority.temporalValidity.status))
        .filter((authority) => authority.jurisdictionValidity.status === 'APPLICABLE')
        .map((authority) => ({
          id: authority.id,
          identity: { ...authority.identity },
          source: {
            sourceUrl: authority.source.sourceUrl,
            sourceDomain: authority.source.sourceDomain,
            sourceTier: authority.source.sourceTier,
            locator: authority.source.locator,
            sourceHash: authority.source.sourceHash,
          },
          temporalValidity: { ...authority.temporalValidity, basis: [...authority.temporalValidity.basis] },
          jurisdictionValidity: { ...authority.jurisdictionValidity, basis: [...authority.jurisdictionValidity.basis] },
          proposition: { ...authority.proposition, limitations: [...authority.proposition.limitations] },
        }))
    : [];
  return {
    legalIssueId,
    requestId: bundleMatches ? bundle.requestId : '',
    researchHash: bundleMatches ? bundle.researchHash : '',
    authorities,
  };
}

export interface IssuePrompt {
  draftContract: IssueDraftContract;
  fieldRequirements: IssueDraftContractRequirements;
  promptVersion: string;
  contextHash: string;
  systemPrompt: string;
  userMessage: string;
  outputSchema: Record<string, unknown>;
}

const ISSUE_PROMPT_VERSIONS: Record<LegalIssueType, string> = {
  CLAIM_ELEMENT: 'CLAIM_ELEMENT_V1',
  FACT_DISPUTE: 'FACT_DISPUTE_V1',
  EVIDENCE_RELEVANCE: 'EVIDENCE_RELEVANCE_V1',
  EVIDENCE_SUFFICIENCY: 'EVIDENCE_SUFFICIENCY_V1',
  SOURCE_ARGUMENT: 'SOURCE_ARGUMENT_V1',
  PROCEDURAL_ISSUE: 'ISSUE_DRAFT_V1',
  PETITION_SUPPORT: 'PETITION_SUPPORT_V1',
  AUTHORITY_RESEARCH: 'ISSUE_DRAFT_V1',
  CONFLICT_DEPENDENCY: 'ISSUE_DRAFT_V1',
};

const ISSUE_CONTEXT_SERIALIZATION_VERSION = 'ISSUE_CONTEXT_V2';
const CONTEXT_TRANSIENT_KEYS = new Set(['createdAt', 'retrievedAt', 'checkedAt', 'generatedAt']);

function stableContextValue(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const canonical = value.map((item) => stableContextValue(item));
    if (key && /(?:Ids|IDs)$/.test(key) && canonical.every((item) => typeof item === 'string')) {
      return [...(canonical as string[])].sort();
    }
    if (key === 'authorities' && canonical.every((item) => typeof item === 'object' && item !== null && 'id' in item)) {
      return [...canonical].sort((left, right) => String((left as { id: string }).id).localeCompare(String((right as { id: string }).id)));
    }
    return canonical;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      if (CONTEXT_TRANSIENT_KEYS.has(key)) return result;
      result[key] = stableContextValue((value as Record<string, unknown>)[key], key);
      return result;
    }, {});
  }
  return value;
}

function contextHash(value: unknown): string {
  return stableResearchId('issue-context', JSON.stringify({
    serializationVersion: ISSUE_CONTEXT_SERIALIZATION_VERSION,
    issueContext: stableContextValue(value),
  }));
}

function uniqueProvenance(entries: SourceProvenance[]): SourceProvenance[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = JSON.stringify([
      entry.sourceId,
      entry.page,
      entry.paragraphIndex,
      entry.elementIndex,
      entry.excerptHash,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requireEntity<T extends { id: string }>(map: Map<string, T>, id: string, kind: string): T {
  const entity = map.get(id);
  if (!entity) throw new IssueContextScopeError(`MISSING_${kind}`, id);
  return entity;
}

function projectCoverage(
  coverageMatrix: CoverageMatrix,
  issue: LegalIssueItem,
  task: GenerationTask,
  rich: NonNullable<CaseAnalysis['richCaseAnalysis']>,
): DocumentCoverageItem[] {
  const requestedIds = task.coverageItemIds && task.coverageItemIds.length > 0
    ? task.coverageItemIds
    : issue.coverageItemIds;
  const offers = new Map(rich.evidenceOffers.map((offer) => [offer.id, offer]));
  const allowedEvidenceOffer = (item: DocumentCoverageItem) => {
    if (item.category !== 'EVIDENCE_OFFER') return false;
    const mentionIds = [...new Set(item.evidenceMentionIds || [])];
    if (mentionIds.length !== 1 || !issue.evidenceMentionIds.includes(mentionIds[0])) return false;
    const offerIds = [...new Set(item.evidenceOfferIds || [])];
    return offerIds.length > 0 && offerIds.every((id) => offers.get(id)?.evidenceMentionId === mentionIds[0]);
  };
  const outOfScopeId = requestedIds.find((id) => {
    if (issue.coverageItemIds.includes(id)) return false;
    const item = coverageMatrix.items.find((candidate) => candidate.id === id);
    return !item || !allowedEvidenceOffer(item);
  });
  if (outOfScopeId) throw new IssueContextScopeError('COVERAGE_OUT_OF_SCOPE', outOfScopeId);
  return requestedIds.map((id) => {
    const item = coverageMatrix.items.find((candidate) => candidate.id === id);
    if (!item) throw new IssueContextScopeError('MISSING_COVERAGE', id);
    return { ...item };
  });
}

export function buildIssueContextPack(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis,
  matrix: LegalIssueMatrix,
  options: { verifiedResearch?: VerifiedResearchContext } = {},
): IssueContextPack {
  const rich = caseAnalysis.richCaseAnalysis;
  if (!rich) throw new IssueContextScopeError('RICH_ANALYSIS_REQUIRED');
  const issueIds = issueIdsOf(task);
  if (issueIds.length !== 1) throw new IssueContextScopeError('ISSUE_SCOPE_NOT_SINGLE');
  const issue = matrix.issues.find((candidate) => candidate.id === issueIds[0]);
  if (!issue) throw new IssueContextScopeError('ISSUE_NOT_RESOLVED', issueIds[0]);
  if (issue.relationStatus !== 'EXPLICIT') throw new IssueContextScopeError(`RELATION_${issue.relationStatus}`, issue.id);

  const claims = new Map<string, ClaimItem>(rich.claims.map((item) => [item.id, item]));
  const facts = new Map<string, FactItem>(rich.facts.map((item) => [item.id, item]));
  const evidenceMentions = new Map<string, EvidenceMention>(rich.evidenceMentions.map((item) => [item.id, item]));
  const evidenceOffers = new Map<string, EvidenceOffer>(rich.evidenceOffers.map((item) => [item.id, item]));
  const argumentsById = new Map<string, ArgumentItem>(rich.arguments.map((item) => [item.id, item]));
  const authorities = new Map<string, SourceAuthorityMention>(rich.authorities.map((item) => [item.id, item]));
  const coverageMatrix = doc.coverageMatrix;
  if (!coverageMatrix) throw new IssueContextScopeError('COVERAGE_MATRIX_REQUIRED');

  const selectedClaims = issue.claimIds.map((id) => requireEntity(claims, id, 'CLAIM'));
  const selectedFacts = issue.factIds.map((id) => requireEntity(facts, id, 'FACT'));
  const selectedMentions = issue.evidenceMentionIds.map((id) => requireEntity(evidenceMentions, id, 'EVIDENCE_MENTION'));
  const taskLinkedOfferIds = (task.evidenceIds || [])
    .filter((id) => evidenceOffers.has(id))
    .filter((id) => issue.evidenceMentionIds.includes(evidenceOffers.get(id)!.evidenceMentionId));
  const selectedOffers = [...new Set([...issue.evidenceOfferIds, ...taskLinkedOfferIds])]
    .map((id) => requireEntity(evidenceOffers, id, 'EVIDENCE_OFFER'));
  const selectedArguments = issue.argumentIds.map((id) => requireEntity(argumentsById, id, 'SOURCE_ARGUMENT'));
  const selectedAuthorities = issue.authorityMentionIds.map((id) => requireEntity(authorities, id, 'AUTHORITY'));
  const selectedCoverage = projectCoverage(coverageMatrix, issue, task, rich);
  const section = doc.sections.find((candidate) => candidate.id === task.sectionId);
  if (!section) throw new IssueContextScopeError('SECTION_NOT_RESOLVED', task.sectionId);
  const contentRole = getSectionContentRole(section, coverageMatrix);
  if (options.verifiedResearch && options.verifiedResearch.legalIssueId !== issue.id) {
    throw new IssueContextScopeError('RESEARCH_CONTEXT_OUT_OF_SCOPE', options.verifiedResearch.legalIssueId);
  }
  const verifiedResearch = options.verifiedResearch
    ? {
        legalIssueId: options.verifiedResearch.legalIssueId,
        requestId: options.verifiedResearch.requestId,
        researchHash: options.verifiedResearch.researchHash,
        authorities: options.verifiedResearch.authorities.map((authority) => ({
          ...authority,
          identity: { ...authority.identity },
          source: { ...authority.source },
          temporalValidity: { ...authority.temporalValidity, basis: [...authority.temporalValidity.basis] },
          jurisdictionValidity: { ...authority.jurisdictionValidity, basis: [...authority.jurisdictionValidity.basis] },
          proposition: { ...authority.proposition, limitations: [...authority.proposition.limitations] },
        })),
      }
    : undefined;

  const linkedProvenance = [
    ...issue.provenance,
    ...selectedClaims.flatMap((item) => item.provenance),
    ...selectedFacts.flatMap((item) => item.provenance),
    ...selectedMentions.flatMap((item) => item.provenance),
    ...selectedOffers.flatMap((item) => item.provenance),
    ...selectedArguments.flatMap((item) => item.provenance),
    ...selectedAuthorities.flatMap((item) => item.provenance),
    ...selectedCoverage.flatMap((item) => item.provenance || []),
  ];
  const packWithoutHash = {
    legalIssue: {
      id: issue.id,
      issueType: issue.issueType,
      question: issue.question,
      status: issue.status,
      relationStatus: issue.relationStatus,
      required: issue.required,
    },
    contentRole,
    coverage: selectedCoverage,
    claims: selectedClaims.map((item) => ({ id: item.id, text: item.requestedRelief, status: item.status })),
    facts: selectedFacts.map((item) => ({ id: item.id, proposition: item.proposition, assertionStatus: item.assertionStatus })),
    evidenceMentions: selectedMentions.map(({ id, description, relatedFactIds, status }) => ({ id, description, relatedFactIds: [...relatedFactIds], status })),
    evidenceOffers: selectedOffers.map(({ id, evidenceMentionId, status }) => ({ id, evidenceMentionId, status })),
    sourceArguments: selectedArguments.map(({ id, proposition, supportingFactIds, citedAuthorityIds }) => ({ id, proposition, supportingFactIds: [...supportingFactIds], citedAuthorityIds: [...citedAuthorityIds] })),
    authorities: selectedAuthorities.map(({ id, citationText, verificationStatus }) => ({ id, citationText, verificationStatus })),
    verifiedResearch,
    clientPosition: rich.clientPosition
      ? { status: rich.clientPosition.status, propositionIds: [...rich.clientPosition.propositionIds].filter((id) => issue.factIds.includes(id) || issue.claimIds.includes(id)) }
      : undefined,
    provenance: uniqueProvenance(linkedProvenance),
  };
  return { ...packWithoutHash, contextHash: contextHash(packWithoutHash) };
}

export function buildIssuePrompt(pack: IssueContextPack, task: GenerationTask): IssuePrompt {
  const draftContract = selectIssueDraftContract(pack, task);
  if (!draftContract) throw new IssueContextScopeError('ISSUE_DRAFT_CONTRACT_UNRESOLVED', pack.legalIssue.id);
  const fieldRequirements = getIssueDraftContractRequirements(draftContract, {
    hasLinkedEvidence: pack.evidenceMentions.length > 0 || pack.evidenceOffers.length > 0,
    hasLinkedLegalSupport: pack.authorities.length > 0
      || pack.sourceArguments.length > 0
      || (pack.verifiedResearch?.authorities.length || 0) > 0,
    hasLinkedAuthorities: pack.authorities.length > 0
      || (pack.verifiedResearch?.authorities.length || 0) > 0,
  });
  const promptVersion = ISSUE_PROMPT_VERSIONS[pack.legalIssue.issueType];
  const outputContract = draftContract === 'DESCRIPTIVE'
    ? [
      'DESCRIPTIVE TASK CONTRACT: la tarea describe material source-backed, no construye un argumento jurídico.',
      'OUTPUT CONTRACT: devuelve únicamente un objeto JSON con estas propiedades model-owned:',
      '{',
      '  "factualDevelopment": ["string"],',
      '  "evidentiaryDevelopment": ["string"],',
      '  "legalDevelopment": ["string"],',
      '  "sourceEntityIds": ["string"],',
      '  "authorityMentionIds": ["string"],',
      '  "verifiedAuthorityIds": ["string (optional)"],',
      '  "researchHash": "string (optional)",',
      '  "unresolvedRequirements": ["REQUIRES_LEGAL_RESEARCH|MISSING_CLIENT_POSITION|MISSING_EVIDENCE_LINK|UNSUPPORTED_REQUIRED_ELEMENT"]',
      '}',
      'factualDevelopment es obligatorio, no vacío y debe estar respaldado por sourceEntityIds allowlisted.',
      fieldRequirements.evidentiaryDevelopment.required
        ? 'evidentiaryDevelopment es obligatorio y no vacío porque el contexto contiene evidencia vinculada.'
        : 'evidentiaryDevelopment es NOT_APPLICABLE en este contexto; puede omitirse y el sistema lo normaliza a [].',
      fieldRequirements.legalDevelopment.required
        ? 'legalDevelopment es obligatorio y no vacío porque el contexto contiene apoyo jurídico vinculado.'
        : 'legalDevelopment es NOT_APPLICABLE en este contexto; puede omitirse y el sistema lo normaliza a [].',
      fieldRequirements.authorityMentionIds.required
        ? 'authorityMentionIds y unresolvedRequirements deben existir como arrays; pueden ser [].'
        : 'authorityMentionIds es NOT_APPLICABLE porque no hay autoridades enlazadas; puede omitirse y el sistema lo normaliza a []. unresolvedRequirements debe existir como array; puede ser [].',
      'No devuelvas thesis, counterPosition, application ni conclusion en una tarea DESCRIPTIVE.',
      'No devuelvas legalIssueId, coverageItemIds, issueType ni generationMetadata; el sistema los materializa.',
    ].join('\n')
    : [
      'OUTPUT CONTRACT: devuelve únicamente un objeto JSON con estas propiedades model-owned:',
      '{',
      '  "thesis": "string",',
      '  "factualDevelopment": ["string"],',
      '  "evidentiaryDevelopment": ["string"],',
      '  "legalDevelopment": ["string"],',
      '  "counterPosition": "string (optional)",',
      '  "application": "string",',
      '  "conclusion": "string",',
      '  "sourceEntityIds": ["string"],',
      '  "authorityMentionIds": ["string"],',
      '  "verifiedAuthorityIds": ["string (optional)"],',
      '  "researchHash": "string (optional)",',
      '  "unresolvedRequirements": ["REQUIRES_LEGAL_RESEARCH|MISSING_CLIENT_POSITION|MISSING_EVIDENCE_LINK|UNSUPPORTED_REQUIRED_ELEMENT"]',
      '}',
      'No devuelvas legalIssueId, coverageItemIds, issueType ni generationMetadata; el sistema los materializa.',
    ].join('\n');
  const evidenceDirective = pack.legalIssue.issueType === 'EVIDENCE_RELEVANCE'
    ? [
      'EVIDENCE TASK CONTRACT: esta task trata una EvidenceMention y usa el contrato DESCRIPTIVE; no redacta un agravio completo.',
      'factualDevelopment = descripción concreta de la EvidenceMention y de los hechos vinculados, únicamente según el contexto.',
      'evidentiaryDevelopment = pertinencia, propósito y límites de la evidencia expresamente vinculada, sin afirmar más de lo que la fuente dice.',
      'No devuelvas thesis, application ni conclusion para esta task.',
      'No inventes una EvidenceOffer. No conviertas SOURCE_MENTIONED en prueba ofrecida.',
      'No incluyas confianza, método de extracción, OCR, IDs, hashes, estados internos ni nombres de campos del sistema en el texto.',
    ].join('\n')
    : pack.legalIssue.issueType === 'EVIDENCE_SUFFICIENCY'
      ? [
        'EVIDENCE TASK CONTRACT: esta task trata únicamente la suficiencia de una EvidenceOffer explícita y usa el contrato DESCRIPTIVE.',
        'factualDevelopment = contenido concreto de la oferta vinculada y hechos relacionados, únicamente según el contexto.',
        'evidentiaryDevelopment = suficiencia observada y sus límites, sin crear una oferta adicional.',
        'No devuelvas thesis, application ni conclusion para esta task.',
        'No inventes una EvidenceOffer adicional ni conviertas una EvidenceMention en oferta.',
        'No incluyas confianza, método de extracción, OCR, IDs, hashes, estados internos ni nombres de campos del sistema en el texto.',
      ].join('\n')
      : '';
  const strategy = {
    CLAIM_ELEMENT: 'Analiza los elementos de la pretensión expresamente vinculada.',
    FACT_DISPUTE: 'Distingue la afirmación fáctica y su estado de soporte sin resolver lo no confirmado.',
    EVIDENCE_RELEVANCE: 'Explica la pertinencia de la EvidenceMention expresamente vinculada.',
    EVIDENCE_SUFFICIENCY: 'Distingue suficiencia de la oferta existente sin crear una EvidenceOffer.',
    SOURCE_ARGUMENT: 'Desarrolla el SourceArgument expresamente vinculado y conserva su estado de autoridad.',
    PROCEDURAL_ISSUE: 'Responde la cuestión procesal con los elementos permitidos.',
    PETITION_SUPPORT: 'Conecta el apoyo expresamente identificado con el apartado petitorio.',
    AUTHORITY_RESEARCH: 'Identifica el requisito de investigación sin afirmar una regla no verificada.',
    CONFLICT_DEPENDENCY: 'Describe la dependencia conflictiva sin resolverla ni inventar una postura.',
  }[pack.legalIssue.issueType];
  const systemPrompt = [
    'Genera únicamente un IssueDraftResult estructurado para una sola LegalIssue.',
    'Devuelve exactamente un objeto JSON y la respuesta completa debe ser JSON válido.',
    'La respuesta debe ser sin markdown, sin cercas de código y sin ```json; sin texto antes ni después del objeto, sin explicaciones ni comentarios.',
    'Devuelve únicamente el payload de contenido definido en outputSchema; la identidad de la issue, coverage y metadata de generación serán añadidas por el sistema.',
    'Usa exactamente las propiedades definidas en outputSchema, incluye todas las propiedades requeridas y usa arrays JSON reales donde el schema los exige.',
    outputContract,
    evidenceDirective,
    'Escapa correctamente las cadenas para producir JSON válido.',
    'Usa ÚNICAMENTE el contexto allowlisted recibido.',
    'No inventes derecho, hechos materiales, autoridades, evidencia, EvidenceOffer ni postura de cliente.',
    'Conserva SOURCE_CITED como no verificado y usa REQUIRES_LEGAL_RESEARCH cuando corresponda.',
    'Si falta información, declara el requisito pendiente en lugar de completarlo.',
    ...(pack.verifiedResearch ? [
      'VERIFIED AUTHORITIES AVAILABLE: usa únicamente las authorities verificadas incluidas en verifiedResearch.',
      'Usa cada proposición verificada solamente con facts/evidence allowlisted para formular la aplicación jurídica.',
      'Conserva supportLevel, temporalidad, jurisdicción y limitations; no afirmes obligatoriedad no respaldada por bindingCharacter.',
      'No inventes una autoridad ni conviertas una proposición jurídica en un hecho del expediente.',
    ] : []),
    strategy,
  ].join('\n');
  const userMessage = [
    'INPUT CONTEXT ONLY:',
    JSON.stringify({
      legalIssueId: pack.legalIssue.id,
      issueType: pack.legalIssue.issueType,
      contentRole: pack.contentRole,
      draftContract,
      question: pack.legalIssue.question,
      contextHash: pack.contextHash,
      taskType: task.taskType || task.type,
      issueContext: pack,
    }),
    'Do not reproduce input fields as output. In particular, question and evidence metadata are context only.',
    'FINAL OUTPUT CONTRACT:',
    outputContract,
    'Return exactly one JSON object now.',
  ].join('\n');
  return {
    draftContract,
    fieldRequirements,
    promptVersion,
    contextHash: pack.contextHash,
    systemPrompt,
    userMessage,
    outputSchema: {
      type: 'object',
      required: draftContract === 'DESCRIPTIVE'
        ? ['factualDevelopment', 'evidentiaryDevelopment', 'legalDevelopment', 'sourceEntityIds', 'authorityMentionIds', 'unresolvedRequirements']
          .filter((field) => fieldRequirements[field as keyof IssueDraftContractRequirements].required)
        : ['thesis', 'factualDevelopment', 'evidentiaryDevelopment', 'legalDevelopment', 'application', 'conclusion', 'sourceEntityIds', 'authorityMentionIds', 'unresolvedRequirements'],
      properties: {
        factualDevelopment: { type: 'array', items: { type: 'string' } },
        evidentiaryDevelopment: { type: 'array', items: { type: 'string' } },
        legalDevelopment: { type: 'array', items: { type: 'string' } },
        sourceEntityIds: { type: 'array', items: { type: 'string' } },
        authorityMentionIds: { type: 'array', items: { type: 'string' } },
        verifiedAuthorityIds: { type: 'array', items: { type: 'string' } },
        researchHash: { type: 'string' },
        unresolvedRequirements: { type: 'array', items: { type: 'string' } },
        ...(draftContract === 'ARGUMENTATIVE' ? {
          thesis: { type: 'string' },
          counterPosition: { type: 'string' },
          application: { type: 'string' },
          conclusion: { type: 'string' },
        } : {}),
      },
      additionalProperties: false,
    },
  };
}

export function buildTargetedIssueRetryPrompt(
  prompt: IssuePrompt,
  deficiencies: string[],
): IssuePrompt {
  const repairList = deficiencies.length > 0
    ? deficiencies.map((deficiency, index) => `${index + 1}. ${deficiency}`).join('\n')
    : '1. Corrige la deficiencia estructural o semántica detectada.';
  return {
    ...prompt,
    systemPrompt: `${prompt.systemPrompt}\nREPARACIÓN DIRIGIDA: corrige exclusivamente las siguientes deficiencias, sin ampliar el contexto:\n${repairList}`,
    userMessage: `${prompt.userMessage}\n\nREPARACIÓN DIRIGIDA:\n${repairList}`,
  };
}

export type IssueProviderInvoker = (request: AIRequest) => Promise<AIProviderResult>;

export interface IssueExecutorOptions extends IssueResearchExecutionInputs {
  invokeProvider?: IssueProviderInvoker;
  maxConcurrency?: number;
  trace?: import('./generationTrace').GenerationTraceContext;
}

function researchTraceFor(
  eligibility: EffectiveIssueGenerationEligibility,
  options: IssueExecutorOptions,
  result?: IssueDraftResult,
  block?: ContentBlock,
): IssueResearchGenerationTrace | undefined {
  const legalIssueId = eligibility.legalIssueId;
  const readiness = legalIssueId ? options.derivedReadinessByIssueId?.get(legalIssueId) : undefined;
  const bundle = legalIssueId ? options.researchBundlesByIssueId?.get(legalIssueId) : undefined;
  const verifiedAuthorityIds = result?.verifiedAuthorityIds
    || block?.verifiedAuthorityIds
    || eligibility.verifiedAuthorityIds;
  const hasResearchContext = eligibility.canonicalStatus === 'NEEDS_RESEARCH'
    || Boolean(readiness || bundle || eligibility.verifiedResearch || verifiedAuthorityIds.length);
  if (!hasResearchContext) return undefined;
  return {
    requestId: bundle?.requestId || eligibility.requestId,
    researchHash: result?.researchHash || block?.researchHash || eligibility.researchHash || bundle?.researchHash,
    verifiedAuthorityIds: [...verifiedAuthorityIds],
    researchReadiness: readiness?.researchReadiness,
    effectiveEligibilityReason: eligibility.reason,
  };
}

function issueIdOf(task: GenerationTask): string {
  return task.legalIssueIds?.[0] || task.issueId || task.targetIssueId || '';
}

function compareIssueTasks(left: GenerationTask, right: GenerationTask): number {
  const sectionOrder = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
  if (sectionOrder !== 0) return sectionOrder;
  const parentOrder = (left.orderInParent ?? Number.MAX_SAFE_INTEGER) - (right.orderInParent ?? Number.MAX_SAFE_INTEGER);
  if (parentOrder !== 0) return parentOrder;
  const issueId = issueIdOf(left).localeCompare(issueIdOf(right));
  return issueId !== 0 ? issueId : left.id.localeCompare(right.id);
}

function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(4, Math.max(1, Math.floor(value)));
}

export function buildBlockedIssueOutcome(
  task: GenerationTask,
  matrix: LegalIssueMatrix | undefined,
  options: IssueResearchExecutionInputs & { formal?: boolean } = {},
): IssueGenerationOutcome {
  const issueIds = issueIdsOf(task);
  if (issueIds.length !== 1) return localIssueOutcome(task, 'ISSUE_SCOPE_NOT_SINGLE', 'BLOCKED');
  const issue = matrix?.issues.find((candidate) => candidate.id === issueIds[0]);
  const eligibility = resolveEffectiveIssueGenerationEligibility({
    issue,
    derivedReadiness: issue ? options.derivedReadinessByIssueId?.get(issue.id) : undefined,
    researchBundle: issue ? options.researchBundlesByIssueId?.get(issue.id) : undefined,
    formal: Boolean(options.formal),
    taskType: taskTypeOf(task),
  });
  return localIssueOutcome(task, eligibility.reason, 'BLOCKED');
}

function failedIssueOutcome(task: GenerationTask, error: unknown): IssueGenerationOutcome {
  return {
    legalIssueId: issueIdOf(task),
    taskId: task.id,
    status: 'FAILED',
    failureReason: 'UNKNOWN',
    attempts: [],
    validation: {
      status: 'INVALID_RETRYABLE',
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    },
  };
}

function normalizeBlockText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function evidenceConsolidationMetadataKey(block: import('./types').ContentBlock): string {
  // Exact-text consolidation is safe only when all non-link provenance and
  // evaluation metadata are equivalent. Otherwise preserve both blocks so a
  // duplicate-looking sentence cannot erase a distinct review/evidence trail.
  const evaluation = block.semanticEvaluation;
  const metadata = {
    trust: block.trust,
    trustLevel: block.trustLevel,
    style: block.style,
    sources: block.sources,
    sourceRef: block.sourceRef,
    provenance: block.provenance,
    isManuallyEdited: block.isManuallyEdited,
    variables: block.variables,
    createdAt: block.createdAt,
    generationRequirement: block.generationRequirement,
    generationStatus: block.generationStatus,
    // Evaluation identity (block/task/section and linked Coverage IDs) is
    // intentionally excluded: those links are unioned below and retained in
    // semanticEvaluations. Quality verdicts, scores, deficiencies and hard
    // fails remain part of the key, so materially different evaluations do
    // not merge.
    semanticEvaluation: evaluation
      ? {
          factualCoverage: evaluation.factualCoverage,
          legalSupport: evaluation.legalSupport,
          evidenceLinkage: evaluation.evidenceLinkage,
          issueResponsiveness: evaluation.issueResponsiveness,
          argumentDepth: evaluation.argumentDepth,
          specificity: evaluation.specificity,
          completeness: evaluation.completeness,
          repetitionPenalty: evaluation.repetitionPenalty,
          unsupportedAssertionPenalty: evaluation.unsupportedAssertionPenalty,
          overallScore: evaluation.overallScore,
          verdict: evaluation.verdict,
          revisionMode: evaluation.revisionMode,
          deficiencies: evaluation.deficiencies,
          hardFailReasons: evaluation.hardFailReasons,
          caseDensityMetrics: evaluation.caseDensityMetrics
            ? {
                entityMentions: evaluation.caseDensityMetrics.entityMentions,
                genericPhrasesCount: evaluation.caseDensityMetrics.genericPhrasesCount,
              }
            : undefined,
        }
      : undefined,
    issueDraftValidationStatus: block.issueDraftValidationStatus,
    authorityIds: block.authorityIds,
    verifiedAuthorityIds: block.verifiedAuthorityIds,
    researchHash: block.researchHash,
    revisionOfBlockId: block.revisionOfBlockId,
    revisionNumber: block.revisionNumber,
    generatedBy: block.generatedBy,
    provider: block.provider,
    model: block.model,
    generationId: block.generationId,
    strategicCandidateId: block.strategicCandidateId,
    decisionReasoningId: block.decisionReasoningId,
    strategicArgumentPlanId: block.strategicArgumentPlanId,
    fallbackStatus: block.fallbackStatus,
    fallbackReason: block.fallbackReason,
    semanticScore: block.semanticScore,
    genericityClass: block.genericityClass,
  };
  return JSON.stringify(metadata);
}

export function assembleIssueDraftBlocks(
  section: DocumentNode,
  outcomes: IssueGenerationOutcome[],
): { blocks: import('./types').ContentBlock[]; warnings: string[] } {
  void section;
  const ordered = outcomes
    .filter((item) => item.block && (item.status === 'ACCEPTED' || item.status === 'VALID_NON_FINAL' || item.status === 'FALLBACK'))
    .sort((left, right) => {
      const order = (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER);
      if (order !== 0) return order;
      const parentOrder = (left.orderInParent ?? Number.MAX_SAFE_INTEGER) - (right.orderInParent ?? Number.MAX_SAFE_INTEGER);
      if (parentOrder !== 0) return parentOrder;
      const issue = left.legalIssueId.localeCompare(right.legalIssueId);
      return issue !== 0 ? issue : left.taskId.localeCompare(right.taskId);
    });
  const seenByIssueAndText = new Set<string>();
  const evidenceByState = new Map<string, import('./types').ContentBlock[]>();
  const blocks: import('./types').ContentBlock[] = [];
  const warnings: string[] = [];
  for (const outcome of ordered) {
    const block = outcome.block!;
    const normalizedText = normalizeBlockText(block.text);
    if (block.generationTaskType === 'EVIDENCE') {
      // Never let an accepted block absorb a review-required or fallback
      // block. The consolidation key includes every finality/status marker
      // consumed by readiness and export gates.
      const evidenceStateKey = [
        block.issueDraftValidationStatus || 'UNKNOWN_VALIDATION',
        block.generationStatus || 'UNKNOWN_GENERATION',
        block.generatedBy || 'UNKNOWN_ORIGIN',
        block.fallbackStatus || '',
      ].join('|');
      const stateSiblings = evidenceByState.get(evidenceStateKey) || [];
      const blockMetadataKey = evidenceConsolidationMetadataKey(block);
      const existingEvidence = stateSiblings.find((candidate) => (
        normalizeBlockText(candidate.text) === normalizedText
        && evidenceConsolidationMetadataKey(candidate) === blockMetadataKey
      ));
      if (existingEvidence) {
        existingEvidence.legalIssueIds = [...new Set([...(existingEvidence.legalIssueIds || []), ...(block.legalIssueIds || [outcome.legalIssueId])])];
        existingEvidence.coverageItemIds = [...new Set([...(existingEvidence.coverageItemIds || []), ...(block.coverageItemIds || [])])];
        existingEvidence.factIds = [...new Set([...(existingEvidence.factIds || []), ...(block.factIds || [])])];
        existingEvidence.evidenceIds = [...new Set([...(existingEvidence.evidenceIds || []), ...(block.evidenceIds || [])])];
        existingEvidence.generationTaskIds = [...new Set([...(existingEvidence.generationTaskIds || [existingEvidence.generationTaskId].filter(Boolean) as string[]), ...(block.generationTaskIds || [block.generationTaskId].filter(Boolean) as string[])])];
        const evaluations = [
          ...(existingEvidence.semanticEvaluations || (existingEvidence.semanticEvaluation ? [existingEvidence.semanticEvaluation] : [])),
          ...(block.semanticEvaluations || (block.semanticEvaluation ? [block.semanticEvaluation] : [])),
        ];
        existingEvidence.semanticEvaluations = evaluations.filter((candidate, index, all) => (
          all.findIndex((item) => JSON.stringify(item) === JSON.stringify(candidate)) === index
        ));
        existingEvidence.issueDraftResultHashes = [...new Set([
          ...(existingEvidence.issueDraftResultHashes || [existingEvidence.issueDraftResultHash].filter(Boolean) as string[]),
          ...(block.issueDraftResultHashes || [block.issueDraftResultHash].filter(Boolean) as string[]),
        ])];
        warnings.push(`EVIDENCE_DUPLICATE_CONSOLIDATED:${outcome.legalIssueId}`);
        continue;
      }
      stateSiblings.push(block);
      evidenceByState.set(evidenceStateKey, stateSiblings);
    }
    const key = `${(block.legalIssueIds || [outcome.legalIssueId]).join(',')}|${normalizedText}`;
    if (seenByIssueAndText.has(key)) {
      warnings.push(`DUPLICATE_ISSUE_BLOCK:${outcome.legalIssueId}`);
      continue;
    }
    seenByIssueAndText.add(key);
    blocks.push(block);
  }
  return { blocks, warnings };
}

export class IssueOutputError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
  }
}

export function parseIssueProviderOutput(response: AIProviderResult): unknown {
  if (response.structuredOutput) return response.structuredOutput;
  const text = String(response.content || '').trim();
  if (!text) throw new IssueOutputError('EMPTY_PROVIDER_OUTPUT', false);
  try {
    return JSON.parse(text);
  } catch {
    throw new IssueOutputError('INVALID_JSON_OUTPUT', true);
  }
}

function issueMatrixFor(doc: UniversalLegalDocument, caseAnalysis: CaseAnalysis): LegalIssueMatrix | undefined {
  if (doc.legalIssueMatrix) return doc.legalIssueMatrix;
  const coverageMatrix = doc.coverageMatrix || (() => {
    const built = requireCoverageMatrix(caseAnalysis, doc);
    return built;
  })();
  return coverageMatrix ? buildLegalIssueMatrix({ caseAnalysis, coverageMatrix }) : undefined;
}

function requireCoverageMatrix(caseAnalysis: CaseAnalysis, doc: UniversalLegalDocument): CoverageMatrix {
  return buildCoverageMatrix(caseAnalysis, doc, doc.sections);
}

function providerActuallyUsed(response: AIProviderResult): string {
  return String(response.providerActuallyUsed || response.provider || 'none');
}

function issueAttempt(
  task: GenerationTask,
  prompt: IssuePrompt,
  attempt: number,
  response?: AIProviderResult,
  status = 'PENDING',
): IssueGenerationAttempt {
  const usage: IssueTokenUsage | undefined = response?.usage
    ? {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
        estimated: false,
      }
    : undefined;
  return {
    attempt,
    legalIssueId: task.legalIssueIds?.[0] || task.issueId || task.targetIssueId || '',
    taskId: task.id,
    coverageItemIds: [...(task.coverageItemIds || [])],
    contextHash: prompt.contextHash,
    promptVersion: prompt.promptVersion,
    status,
    providerRequested: String(response?.providerRequested || 'nvidia'),
    providerActuallyUsed: response ? providerActuallyUsed(response) : 'none',
    model: response?.model || null,
    usage,
  };
}

function localIssueOutcome(task: GenerationTask, reason: string, status: 'BLOCKED' | 'FALLBACK'): IssueGenerationOutcome {
  const legalIssueId = task.legalIssueIds?.[0] || task.issueId || task.targetIssueId || '';
  return {
    legalIssueId,
    taskId: task.id,
    status,
    failureReason: status === 'BLOCKED' ? 'ELIGIBILITY_BLOCKED' : status === 'FALLBACK' ? 'PROVIDER' : 'UNKNOWN',
    attempts: [],
    validation: { status: 'INVALID_FATAL', errors: [reason], warnings: [] },
  };
}

function fallbackIssueOutcome(
  task: GenerationTask,
  response: AIProviderResult,
  prompt: IssuePrompt,
): IssueGenerationOutcome {
  const legalIssueId = task.legalIssueIds?.[0] || task.issueId || task.targetIssueId || '';
  const text = String(response.content || '[REQUIERE REVISIÓN DEL ABOGADO]').trim();
  const block = {
    id: `blk-${task.id}`,
    layer: 'SOURCE_FACT' as const,
    text,
    trustLevel: 'UNVERIFIED' as const,
    provenance: 'INFERRED' as const,
    generationStatus: 'partial' as const,
    generationRequirement: 'AI_REQUIRED' as const,
    generatedBy: 'FALLBACK' as const,
    provider: providerActuallyUsed(response),
    model: response.model || null,
    generationTaskId: task.id,
    legalIssueIds: [legalIssueId],
    coverageItemIds: [...(task.coverageItemIds || [])],
    factIds: [...(task.factIds || [])],
    evidenceIds: [...(task.evidenceIds || [])],
    generationTaskType: task.taskType || task.type,
    generationTaskIds: [task.id],
    issueDraftValidationStatus: 'INVALID_FATAL' as const,
    fallbackStatus: 'LOCAL_PLACEHOLDER',
    fallbackReason: response.fallbackReason || 'LOCAL_PROVIDER_OUTPUT',
  };
  return {
    legalIssueId,
    taskId: task.id,
    status: 'FALLBACK',
    failureReason: 'PROVIDER',
    attempts: [issueAttempt(task, prompt, 1, response, 'FALLBACK')],
    block,
  };
}

function sourceEntityAllowList(pack: IssueContextPack): string[] {
  return [
    ...pack.claims.map((item) => item.id),
    ...pack.facts.map((item) => item.id),
    ...pack.evidenceMentions.map((item) => item.id),
    ...pack.evidenceOffers.map((item) => item.id),
    ...pack.sourceArguments.map((item) => item.id),
  ];
}

export async function executeReadyIssueTasks(
  tasks: GenerationTask[],
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis,
  options: IssueExecutorOptions = {},
): Promise<IssueGenerationOutcome[]> {
  const ordered = [...tasks].sort(compareIssueTasks);
  const results: IssueGenerationOutcome[] = [];
  let cursor = 0;
  const limit = clampConcurrency(options.maxConcurrency ?? 3);
  const worker = async () => {
    while (cursor < ordered.length) {
      const task = ordered[cursor++];
      try {
        const outcome = await executeIssueScopedGeneration(task, doc, caseAnalysis, options);
        results.push({ ...outcome, order: task.order, orderInParent: task.orderInParent });
      } catch (error) {
        results.push({ ...failedIssueOutcome(task, error), order: task.order, orderInParent: task.orderInParent });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, ordered.length) }, () => worker()));
  const taskOrder = new Map(ordered.map((task, index) => [task.id, index]));
  return results.sort((left, right) => {
    const leftOrder = taskOrder.get(left.taskId) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = taskOrder.get(right.taskId) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.legalIssueId.localeCompare(right.legalIssueId);
  });
}

export async function executeIssueScopedGeneration(
  task: GenerationTask,
  doc: UniversalLegalDocument,
  caseAnalysis: CaseAnalysis,
  options: IssueExecutorOptions = {},
): Promise<IssueGenerationOutcome> {
  options.trace?.recordTaskPlanned(task);
  const matrix = issueMatrixFor(doc, caseAnalysis);
  const section = doc.sections.find((candidate) => candidate.id === task.sectionId);
  const issue = matrix?.issues.find((candidate) => candidate.id === issueIdOf(task));
  const eligibility = resolveEffectiveIssueGenerationEligibility({
    issue,
    derivedReadiness: issue ? options.derivedReadinessByIssueId?.get(issue.id) : undefined,
    researchBundle: issue ? options.researchBundlesByIssueId?.get(issue.id) : undefined,
    formal: section ? isFormalIssueTask(task, section) : false,
    taskType: taskTypeOf(task),
  });
  const traceOutcome = (outcome: IssueGenerationOutcome): IssueGenerationOutcome => {
    if (!options.trace) return outcome;
    const lastAttempt = outcome.attempts[outcome.attempts.length - 1];
    if (outcome.evaluation) options.trace.recordSemanticEvaluation(outcome.evaluation as any);
    const research = researchTraceFor(eligibility, options, outcome.result, outcome.block);
    if (outcome.block) options.trace.recordDraftBlock(outcome.block, research);
    options.trace.recordTaskExecution({
      taskId: task.id,
      taskType: task.taskType || task.type,
      sectionId: task.sectionId,
      coverageItemIds: [...(task.coverageItemIds || [])],
      legalIssueIds: [outcome.legalIssueId].filter(Boolean),
      evidenceIds: [...(task.evidenceIds || [])],
      factIds: [...(task.factIds || [])],
      claimIds: [...(task.claimIds || [])],
      providerRequested: lastAttempt?.providerRequested,
      providerActuallyUsed: lastAttempt?.providerActuallyUsed as any,
      model: lastAttempt?.model || null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      tokenBudget: task.tokenBudget,
      continuationCount: 0,
      responseStatus: outcome.status,
      rawOutputHash: outcome.block?.issueDraftResultHash,
      evaluation: outcome.evaluation as any,
      research,
      retryCount: Math.max(0, outcome.attempts.length - 1),
      fallbackUsed: outcome.status === 'FALLBACK',
      fallbackReason: outcome.block?.fallbackReason,
      finalBlockId: outcome.block?.id,
      error: outcome.validation?.errors.join('; '),
    });
    return outcome;
  };
  if (!eligibility.eligible) return traceOutcome(localIssueOutcome(task, eligibility.reason, 'BLOCKED'));

  const coverageMatrix = doc.coverageMatrix || requireCoverageMatrix(caseAnalysis, doc);
  const pack = buildIssueContextPack(task, { ...doc, coverageMatrix }, caseAnalysis, matrix!, {
    verifiedResearch: eligibility.verifiedResearch,
  });
  const draftContract = selectIssueDraftContract(pack, task);
  if (!draftContract) return traceOutcome(localIssueOutcome(task, 'ISSUE_DRAFT_CONTRACT_UNRESOLVED', 'BLOCKED'));
  const prompt = buildIssuePrompt(pack, task);
  const requestPack: IssueContextPack = { ...pack, draftContract };
  const invokeProvider = options.invokeProvider || runFastMode;
  const MAX_SEMANTIC_RETRIES_PER_ISSUE = 1;

  const runAttempt = async (
    attemptNumber: number,
    activePrompt: IssuePrompt,
    previousAttempts: IssueGenerationAttempt[],
  ): Promise<IssueGenerationOutcome> => {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const recordAttemptTrace = (
      response: AIProviderResult | undefined,
      outcome: 'PROVIDER_SUCCESS' | 'VALIDATION_FAILED' | 'SEMANTIC_FAILED' | 'ACCEPTED' | 'FALLBACK' | 'BLOCKED',
      validation?: IssueDraftValidation,
      result?: import('./issueDraftResult').IssueDraftResult,
      evaluation?: unknown,
    ): void => {
      options.trace?.recordIssueGenerationAttempt({
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        attempt: attemptNumber,
        coverageItemIds: [...(task.coverageItemIds || [])],
        promptVersion: activePrompt.promptVersion,
        contextHash: pack.contextHash,
        providerRequested: String(response?.providerRequested || 'nvidia'),
        providerActuallyUsed: response ? providerActuallyUsed(response) : 'none',
        model: response?.model || null,
        outcome,
        validationStatus: validation?.status,
        resultHash: result ? hashIssueDraftResult(result) : undefined,
        evaluation,
        usage: response?.usage
          ? {
              promptTokens: response.usage.promptTokens ?? null,
              completionTokens: response.usage.completionTokens ?? null,
              totalTokens: response.usage.totalTokens ?? null,
              estimated: false,
            }
          : { promptTokens: null, completionTokens: null, totalTokens: null },
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedMs),
        research: researchTraceFor(eligibility, options, result),
      });
    };
    const request = {
      systemPrompt: activePrompt.systemPrompt,
      userMessage: activePrompt.userMessage,
      legalContext: requestPack,
      contextHash: pack.contextHash,
      promptVersion: activePrompt.promptVersion,
      attempt: attemptNumber,
      taskType: task.taskType || task.type,
      mode: 'fast' as const,
      maxTokens: task.tokenBudget,
      outputSchema: activePrompt.outputSchema,
      requestId: `issue:${task.id}:attempt:${attemptNumber}`,
    } as AIRequest & { attempt: number; contextHash: string; promptVersion: string };

    let response: AIProviderResult;
    try {
      response = await invokeProvider(request);
    } catch (error) {
      recordAttemptTrace(undefined, 'VALIDATION_FAILED');
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: 'PROVIDER',
        attempts: [...previousAttempts, issueAttempt(task, activePrompt, attemptNumber, undefined, 'PROVIDER_ERROR')],
        validation: { status: 'INVALID_RETRYABLE', errors: [String(error)], warnings: [] },
      };
    }

    const currentAttempt = issueAttempt(task, activePrompt, attemptNumber, response, 'PROVIDER_COMPLETED');
    const attempts = [...previousAttempts, currentAttempt];
    const isFallback = response.origin === 'LOCAL_PLACEHOLDER'
      || response.providerActuallyUsed === 'local'
      || response.isLegalAiContent === false
      || !response.success;
    if (isFallback) {
      recordAttemptTrace(response, 'FALLBACK');
      const fallback = fallbackIssueOutcome(task, response, activePrompt);
      return { ...fallback, attempts };
    }

    let parsed: unknown;
    try {
      parsed = parseIssueProviderOutput(response);
    } catch (error) {
      const issueError = error instanceof IssueOutputError ? error : new IssueOutputError('OUTPUT_PARSE_FAILED', true);
      recordAttemptTrace(response, 'VALIDATION_FAILED');
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: attemptNumber > 1 ? 'INSUFFICIENT' : 'VALIDATION',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'VALIDATION_FAILED' } : item),
        validation: { status: issueError.retryable ? 'INVALID_RETRYABLE' : 'INVALID_FATAL', errors: [issueError.code], warnings: [] },
      };
    }

    const modelValidation = validateIssueDraftModelOutput(parsed, draftContract, activePrompt.fieldRequirements);
    if (!modelValidation.valid || !modelValidation.output) {
      console.log('[issueScopedGeneration:modelValidation_error]', task.id, modelValidation.errors);
      const validation: IssueDraftValidation = {
        status: 'INVALID_FATAL',
        errors: modelValidation.errors,
        warnings: [],
      };
      const onlyRepairableApplicationError = modelValidation.errors.length === 1
        && modelValidation.errors[0] === 'REQUIRED_FIELD_EMPTY:application';
      if (onlyRepairableApplicationError && attemptNumber <= MAX_SEMANTIC_RETRIES_PER_ISSUE) {
        recordAttemptTrace(response, 'VALIDATION_FAILED', validation);
        const retryPrompt = buildTargetedIssueRetryPrompt(activePrompt, ['APPLICATION_MISSING']);
        return runAttempt(2, retryPrompt, attempts.map((item) => ({ ...item, status: 'VALIDATION_WEAK' })));
      }
      recordAttemptTrace(response, 'VALIDATION_FAILED', validation);
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: attemptNumber > 1 ? 'INSUFFICIENT' : 'VALIDATION',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'VALIDATION_FAILED' } : item),
        validation,
      };
    }

    const canonicalResult = materializeIssueDraftResult(
      modelValidation.output,
      task,
      {
        issueType: pack.legalIssue.issueType,
        draftContract,
        fieldRequirements: activePrompt.fieldRequirements,
        promptVersion: activePrompt.promptVersion,
        contextHash: pack.contextHash,
        providerRequested: String(response.providerRequested || 'nvidia'),
        providerActuallyUsed: providerActuallyUsed(response),
        model: response.model || null,
        attemptCount: attemptNumber,
        usage: response.usage
          ? {
              promptTokens: response.usage.promptTokens ?? null,
              completionTokens: response.usage.completionTokens ?? null,
              totalTokens: response.usage.totalTokens ?? null,
              estimated: false,
            }
          : undefined,
      },
    );
    const validation: IssueDraftValidation = validateIssueDraftResult(canonicalResult, {
      expectedLegalIssueId: eligibility.legalIssueId!,
      issueType: pack.legalIssue.issueType,
      draftContract,
      allowedCoverageItemIds: pack.coverage.map((item) => item.id),
      allowedSourceEntityIds: sourceEntityAllowList(pack),
      allowedAuthorityMentionIds: pack.authorities.map((item) => item.id),
      allowedAuthorityCitations: pack.authorities.map((item) => ({ id: item.id, citationText: item.citationText })),
      allowedVerifiedAuthorityIds: pack.verifiedResearch?.authorities.map((item) => item.id),
      allowedVerifiedAuthorityCitations: pack.verifiedResearch?.authorities.map((item) => ({
        id: item.id,
        citationText: item.identity.canonicalCitation,
      })),
      expectedResearchHash: eligibility.researchHash,
      researchUnlocked: eligibility.effectiveStatus === 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH',
      contextHash: pack.contextHash,
      promptVersion: activePrompt.promptVersion,
      fieldRequirements: activePrompt.fieldRequirements,
    });
    const onlyRepairableApplicationError = validation.errors.length === 1
      && validation.errors[0] === 'REQUIRED_FIELD_EMPTY:application';
    if ((!validation.result || validation.status === 'INVALID_FATAL' || validation.status === 'INVALID_RETRYABLE')
      && onlyRepairableApplicationError
      && attemptNumber <= MAX_SEMANTIC_RETRIES_PER_ISSUE) {
      recordAttemptTrace(response, 'VALIDATION_FAILED', validation);
      const retryPrompt = buildTargetedIssueRetryPrompt(activePrompt, ['APPLICATION_MISSING']);
      return runAttempt(2, retryPrompt, attempts.map((item) => ({ ...item, status: 'VALIDATION_WEAK' })));
    }
    if (!validation.result || validation.status === 'INVALID_FATAL' || validation.status === 'INVALID_RETRYABLE') {
      console.log('[issueScopedGeneration:validation_error]', task.id, validation.errors);
      recordAttemptTrace(response, 'VALIDATION_FAILED', validation);
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: attemptNumber > 1 ? 'INSUFFICIENT' : 'VALIDATION',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'VALIDATION_FAILED' } : item),
        validation,
      };
    }

    const evaluation = evaluateIssueDraftResult(validation.result, task, doc, pack);
    if (evaluation.verdict === 'FAIL') {
      console.log('[issueScopedGeneration:semantic_fail]', task.id, evaluation.verdict, evaluation.hardFailReasons, evaluation.deficiencies);
      recordAttemptTrace(response, 'SEMANTIC_FAILED', validation, validation.result, evaluation);
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: 'SEMANTIC',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'SEMANTIC_FAILED' } : item),
        result: validation.result,
        validation,
        evaluation,
      };
    }

    // Quality is evaluated before non-final legal status is materialized. A
    // REVIEW_REQUIRED/VALID_NON_FINAL result may remain a provisional legal
    // status, but it must never be used to admit semantically weak prose.
    if (evaluation.verdict === 'WEAK' && attemptNumber <= MAX_SEMANTIC_RETRIES_PER_ISSUE) {
      recordAttemptTrace(response, 'SEMANTIC_FAILED', validation, validation.result, evaluation);
      const retryPrompt = buildTargetedIssueRetryPrompt(activePrompt, evaluation.deficiencies);
      return runAttempt(2, retryPrompt, attempts.map((item) => ({ ...item, status: 'SEMANTIC_WEAK' })));
    }
    if (evaluation.verdict === 'WEAK') {
      console.log('[issueScopedGeneration:semantic_weak]', task.id, evaluation.verdict, evaluation.deficiencies);
      recordAttemptTrace(response, 'SEMANTIC_FAILED', validation, validation.result, evaluation);
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'FAILED',
        failureReason: 'INSUFFICIENT',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'SEMANTIC_WEAK' } : item),
        result: validation.result,
        validation,
        evaluation,
      };
    }

    const effectiveNonFinal = validation.status === 'VALID_NON_FINAL'
      || eligibility.effectiveStatus === 'GENERATABLE_REQUIRES_REVIEW';
    const effectiveValidationStatus: IssueDraftValidationStatus = effectiveNonFinal ? 'VALID_NON_FINAL' : validation.status;
    const block = draftBlockFromIssueResult(
      validation.result,
      task,
      toBlockQualityEvaluation(evaluation, task),
      effectiveValidationStatus,
    );
    if (effectiveNonFinal) {
      recordAttemptTrace(response, 'PROVIDER_SUCCESS', validation, validation.result, evaluation);
      return {
        legalIssueId: eligibility.legalIssueId!,
        taskId: task.id,
        status: 'VALID_NON_FINAL',
        attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'VALID_NON_FINAL' } : item),
        result: validation.result,
        validation: {
          ...validation,
          status: 'VALID_NON_FINAL',
          warnings: [...validation.warnings, ...(eligibility.effectiveStatus === 'GENERATABLE_REQUIRES_REVIEW' ? ['REQUIRES_LAWYER_REVIEW'] : [])],
        },
        evaluation,
        block,
      };
    }

    recordAttemptTrace(response, 'ACCEPTED', validation, validation.result, evaluation);
    return {
      legalIssueId: eligibility.legalIssueId!,
      taskId: task.id,
      status: 'ACCEPTED',
      attempts: attempts.map((item, index) => index === attempts.length - 1 ? { ...item, status: 'ACCEPTED' } : item),
      result: validation.result,
      validation,
      evaluation,
      block,
    };
  };

  return runAttempt(1, prompt, []).then(traceOutcome);
}
