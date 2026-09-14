import type { SourceAuthorityMention } from '../case-extraction/types';
import {
  canonicalizeResearchValue,
  sha256ResearchValue,
  stableResearchId,
} from './canonical';
import type {
  AuthorityCandidate,
  AuthorityType,
  LegalRegimeResolution,
  LegalResearchTarget,
  LegalScope,
} from './types';
import type { LegalResearchProvider } from './adapters/types';

export type ResearchPlanPurpose = 'AUTHORITY_VERIFICATION' | 'STRATEGIC_ISSUE_RESEARCH';

export type LegalResearchPlanTarget = LegalResearchTarget;

export type ResearchPlanStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'INCOMPLETE' | 'SUFFICIENT';

export type ResearchPlanBlocker =
  | 'BLOCKED_MISSING_PROPOSITION'
  | 'BLOCKED_MISSING_EXPLICIT_RELATION'
  | 'BLOCKED_MISSING_SCOPE'
  | 'BLOCKED_MISSING_TEMPORAL_SCOPE'
  | 'BLOCKED_MISSING_SOURCE_SCOPE'
  | 'BLOCKED_MISSING_AUTHORITY_TYPES'
  | 'MISSING_REQUIRED_PROPOSITION'
  | 'MISSING_AUTHORITY_VERIFICATION'
  | 'SOURCE_ADAPTER_NOT_CHECKED'
  | 'SOURCE_TIER_NOT_CHECKED'
  | 'ADVERSE_AUTHORITY_CHECK_REQUIRED';

export type ResearchTemporalPrecision = NonNullable<LegalRegimeResolution['temporalPrecision']>;
export type ResearchProviderId = LegalResearchProvider['id'];
export type ResearchSourceTier = AuthorityCandidate['sourceTier'];

export interface ResearchPlanScopeInput {
  scope: LegalScope;
  matter?: string;
  procedure?: string;
  temporalCutoff?: string;
  temporalPrecision?: ResearchTemporalPrecision;
  sourceAdapters?: readonly ResearchProviderId[];
  sourceTiers?: readonly ResearchSourceTier[];
}

export interface ResearchQuestion {
  id: string;
  semanticKey: string;
  purpose: ResearchPlanPurpose;
  legalIssueId?: string;
  target?: LegalResearchPlanTarget;
  question: string;
  propositionToEstablish?: string;
  required: boolean;
  authorityTypes: AuthorityType[];
  adverseAuthorityRequired: boolean;
}

export interface AuthorityVerificationRequirements {
  identityMatchRequired: boolean;
  officialSourceRequired: boolean;
  jurisdictionApplicabilityRequired: boolean;
  temporalValidityRequired: boolean;
  propositionSupportRequired: boolean;
}

export interface AuthorityRequirement {
  id: string;
  researchQuestionId: string;
  legalIssueId?: string;
  target?: LegalResearchPlanTarget;
  sourceAuthorityMentionId?: string;
  authorityIdentity?: string;
  authorityTypes: AuthorityType[];
  required: boolean;
  sourceAdapters: ResearchProviderId[];
  allowedSourceTiers: ResearchSourceTier[];
  verificationRequirements: AuthorityVerificationRequirements;
}

export interface SearchScope {
  id: string;
  researchQuestionId: string;
  scope: LegalScope;
  matter?: string;
  procedure?: string;
  temporalCutoff?: string;
  temporalPrecision: ResearchTemporalPrecision;
  sourceAdapters: ResearchProviderId[];
  sourceTiers: ResearchSourceTier[];
}

export type AdverseAuthorityStatus =
  | 'NOT_REQUIRED'
  | 'REQUIRED_NOT_CHECKED'
  | 'CHECKED_WITH_RESULTS'
  | 'CHECKED_NO_RESULTS'
  | 'BLOCKED';

export interface CompletenessCriteria {
  requiredPropositionIds: string[];
  requiredResearchQuestionIds: string[];
  requiredAuthorityRequirementIds: string[];
  requiredSourceAdapters: ResearchProviderId[];
  requiredSourceTiers: ResearchSourceTier[];
  verificationCompleted: boolean;
  adverseAuthorityStatus: AdverseAuthorityStatus;
  unresolvedGaps: string[];
}

export interface LegalResearchPlan {
  id: string;
  legalIssueId?: string;
  target: LegalResearchPlanTarget;
  purpose: ResearchPlanPurpose;
  sourceFactIds: string[];
  sourceArgumentIds: string[];
  sourceClaimIds: string[];
  challengedReasoningIds: string[];
  researchQuestions: ResearchQuestion[];
  authorityRequirements: AuthorityRequirement[];
  searchScopes: SearchScope[];
  completenessCriteria: CompletenessCriteria;
  status: ResearchPlanStatus;
  blockers: ResearchPlanBlocker[];
  unresolvedGaps: string[];
  planHash: string;
}

export interface BuildAuthorityVerificationPlanInput {
  legalIssueId: string;
  authority: SourceAuthorityMention;
  scope?: ResearchPlanScopeInput;
}

export interface BuildStrategicLegalResearchPlanInput {
  legalIssueId: string;
  propositionToEstablish: string;
  sourceFactIds?: readonly string[];
  sourceArgumentIds?: readonly string[];
  sourceClaimIds?: readonly string[];
  challengedReasoningIds?: readonly string[];
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope?: ResearchPlanScopeInput;
}

export interface BuildStrategicChallengeResearchPlanInput {
  id: string;
  decisionReasoningId: string;
  propositionToEstablish: string;
  sourceFactIds?: readonly string[];
  sourceArgumentIds?: readonly string[];
  sourceClaimIds?: readonly string[];
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope?: ResearchPlanScopeInput;
}

export interface LegalResearchPlanAssessmentEvidence {
  coveredResearchQuestionIds?: readonly string[];
  verifiedAuthorityRequirementIds?: readonly string[];
  checkedSourceAdapters?: readonly ResearchProviderId[];
  checkedSourceTiers?: readonly ResearchSourceTier[];
  adverseAuthorityStatus?: Exclude<AdverseAuthorityStatus, 'NOT_REQUIRED'>;
  unresolvedGaps?: readonly string[];
}

export interface LegalResearchPlanAssessment {
  status: ResearchPlanStatus;
  completenessCriteria: CompletenessCriteria;
  blockers: ResearchPlanBlocker[];
  unresolvedGaps: string[];
}

export interface AuthorityVerificationRequestProjection {
  legalIssueId: string;
  question: string;
  requestedAuthorityTypes: AuthorityType[];
  sourceAuthorityMentionIds: string[];
}

const STRATEGIC_QUESTION = '¿Qué regla y criterio deben aplicarse a la proposición jurídica delimitada?';
const AUTHORITY_VERIFICATION_QUESTION = '¿Qué referencia, vigencia y aplicabilidad requiere la autoridad citada?';

function normalizedText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sortedUnique<T extends string>(values: readonly T[] | undefined): T[] {
  return Array.from(new Set(values ?? [])).sort() as T[];
}

function authorityTypeFromMention(type: SourceAuthorityMention['authorityType']): AuthorityType {
  switch (type) {
    case 'ARTICLE':
    case 'LAW':
      return 'STATUTE';
    case 'CODE':
      return 'CODE';
    case 'THESIS':
      return 'THESIS';
    case 'JURISPRUDENCE':
      return 'JURISPRUDENCE';
    case 'PRECEDENT':
      return 'PRECEDENT';
    default:
      return 'OTHER_OFFICIAL_SOURCE';
  }
}

function normalizedScope(scope: ResearchPlanScopeInput | undefined): SearchScope {
  const semantic = {
    scope: scope?.scope ?? 'UNKNOWN',
    matter: normalizedText(scope?.matter) || undefined,
    procedure: normalizedText(scope?.procedure) || undefined,
    temporalCutoff: scope?.temporalCutoff,
    temporalPrecision: scope?.temporalPrecision ?? 'UNKNOWN',
    sourceAdapters: sortedUnique(scope?.sourceAdapters),
    sourceTiers: sortedUnique(scope?.sourceTiers),
  };

  return {
    id: stableResearchId('research-scope', semantic),
    researchQuestionId: '',
    ...semantic,
  };
}

function questionIdentity(input: {
  purpose: ResearchPlanPurpose;
  question: string;
  propositionToEstablish?: string;
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope: SearchScope;
}): Record<string, unknown> {
  return {
    purpose: input.purpose,
    question: normalizedText(input.question),
    propositionToEstablish: normalizedText(input.propositionToEstablish) || undefined,
    authorityTypes: sortedUnique(input.authorityTypes),
    adverseAuthorityRequired: input.adverseAuthorityRequired,
    scope: {
      scope: input.scope.scope,
      matter: normalizedText(input.scope.matter) || undefined,
      procedure: normalizedText(input.scope.procedure) || undefined,
      temporalCutoff: input.scope.temporalCutoff,
      temporalPrecision: input.scope.temporalPrecision,
      sourceAdapters: sortedUnique(input.scope.sourceAdapters),
      sourceTiers: sortedUnique(input.scope.sourceTiers),
    },
  };
}

function questionFor(input: {
  legalIssueId?: string;
  target?: LegalResearchPlanTarget;
  purpose: ResearchPlanPurpose;
  question: string;
  propositionToEstablish?: string;
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope: SearchScope;
}): ResearchQuestion {
  const identity = questionIdentity(input);
  const id = stableResearchId('research-question', identity);
  const propositionToEstablish = normalizedText(input.propositionToEstablish)
    ? input.propositionToEstablish?.trim().replace(/\s+/g, ' ')
    : undefined;
  return {
    id,
    semanticKey: stableResearchId('research-question-key', identity),
    purpose: input.purpose,
    ...(input.legalIssueId ? { legalIssueId: input.legalIssueId } : {}),
    ...(input.target ? { target: input.target } : {}),
    question: input.question,
    ...(propositionToEstablish ? { propositionToEstablish } : {}),
    required: true,
    authorityTypes: sortedUnique(input.authorityTypes),
    adverseAuthorityRequired: input.adverseAuthorityRequired,
  };
}

function verificationRequirements(): AuthorityVerificationRequirements {
  return {
    identityMatchRequired: true,
    officialSourceRequired: true,
    jurisdictionApplicabilityRequired: true,
    temporalValidityRequired: true,
    propositionSupportRequired: true,
  };
}

function initialCriteria(
  question: ResearchQuestion,
  requirements: AuthorityRequirement[],
  scope: SearchScope,
  unresolvedGaps: string[],
): CompletenessCriteria {
  return {
    requiredPropositionIds: question.propositionToEstablish ? [question.id] : [],
    requiredResearchQuestionIds: [question.id],
    requiredAuthorityRequirementIds: requirements.filter((requirement) => requirement.required).map((requirement) => requirement.id),
    requiredSourceAdapters: scope.sourceAdapters,
    requiredSourceTiers: scope.sourceTiers,
    verificationCompleted: false,
    adverseAuthorityStatus: question.adverseAuthorityRequired ? 'REQUIRED_NOT_CHECKED' : 'NOT_REQUIRED',
    unresolvedGaps: [...unresolvedGaps],
  };
}

async function finalizePlan(input: {
  legalIssueId?: string;
  target: LegalResearchPlanTarget;
  purpose: ResearchPlanPurpose;
  sourceFactIds: string[];
  sourceArgumentIds: string[];
  sourceClaimIds: string[];
  challengedReasoningIds: string[];
  researchQuestions: ResearchQuestion[];
  authorityRequirements: AuthorityRequirement[];
  searchScopes: SearchScope[];
  completenessCriteria: CompletenessCriteria;
  status: ResearchPlanStatus;
  blockers: ResearchPlanBlocker[];
  unresolvedGaps: string[];
}): Promise<LegalResearchPlan> {
  const questions = [...input.researchQuestions].sort((left, right) => left.id.localeCompare(right.id));
  const requirements = [...input.authorityRequirements].sort((left, right) => left.id.localeCompare(right.id));
  const scopes = [...input.searchScopes].sort((left, right) => left.id.localeCompare(right.id));
  const semantic = canonicalizeResearchValue({
    ...(input.target.kind === 'LEGAL_ISSUE' ? { legalIssueId: input.target.legalIssueId } : {}),
    ...(input.target.kind === 'STRATEGIC_CHALLENGE_CANDIDATE' ? { target: input.target } : {}),
    purpose: input.purpose,
    sourceFactIds: sortedUnique(input.sourceFactIds),
    sourceArgumentIds: sortedUnique(input.sourceArgumentIds),
    sourceClaimIds: sortedUnique(input.sourceClaimIds),
    challengedReasoningIds: sortedUnique(input.challengedReasoningIds),
    researchQuestions: questions,
    authorityRequirements: requirements,
    searchScopes: scopes,
    completenessCriteria: input.completenessCriteria,
  });

  return {
    id: stableResearchId('legal-research-plan', semantic),
    ...(input.legalIssueId ? { legalIssueId: input.legalIssueId } : {}),
    target: input.target,
    purpose: input.purpose,
    sourceFactIds: sortedUnique(input.sourceFactIds),
    sourceArgumentIds: sortedUnique(input.sourceArgumentIds),
    sourceClaimIds: sortedUnique(input.sourceClaimIds),
    challengedReasoningIds: sortedUnique(input.challengedReasoningIds),
    researchQuestions: questions,
    authorityRequirements: requirements,
    searchScopes: scopes,
    completenessCriteria: input.completenessCriteria,
    status: input.status,
    blockers: sortedUnique(input.blockers),
    unresolvedGaps: sortedUnique(input.unresolvedGaps),
    planHash: await sha256ResearchValue(semantic),
  };
}

export async function buildAuthorityVerificationPlan(
  input: BuildAuthorityVerificationPlanInput,
): Promise<LegalResearchPlan> {
  const authorityType = authorityTypeFromMention(input.authority.authorityType);
  const searchScope = normalizedScope(input.scope);
  const question = questionFor({
    legalIssueId: input.legalIssueId,
    target: { kind: 'LEGAL_ISSUE', legalIssueId: input.legalIssueId },
    purpose: 'AUTHORITY_VERIFICATION',
    question: AUTHORITY_VERIFICATION_QUESTION,
    authorityTypes: [authorityType],
    adverseAuthorityRequired: false,
    scope: searchScope,
  });
  searchScope.researchQuestionId = question.id;
  searchScope.id = stableResearchId('research-scope', { questionId: question.id, ...searchScope });

  const requirementIdentity = {
    researchQuestionId: question.id,
    legalIssueId: input.legalIssueId,
    sourceAuthorityMentionId: input.authority.id,
    authorityIdentity: normalizedText(input.authority.citationText),
    authorityTypes: [authorityType],
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
  };
  const requirement: AuthorityRequirement = {
    id: stableResearchId('authority-requirement', requirementIdentity),
    researchQuestionId: question.id,
    legalIssueId: input.legalIssueId,
    sourceAuthorityMentionId: input.authority.id,
    authorityIdentity: input.authority.citationText.trim().replace(/\s+/g, ' '),
    authorityTypes: [authorityType],
    required: true,
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
    verificationRequirements: verificationRequirements(),
  };
  const unresolvedGaps = input.scope ? [] : ['MISSING_SCOPE'];
  const completenessCriteria = initialCriteria(question, [requirement], searchScope, unresolvedGaps);

  return finalizePlan({
    legalIssueId: input.legalIssueId,
    target: { kind: 'LEGAL_ISSUE', legalIssueId: input.legalIssueId },
    purpose: 'AUTHORITY_VERIFICATION',
    sourceFactIds: [],
    sourceArgumentIds: [],
    sourceClaimIds: [],
    challengedReasoningIds: [],
    researchQuestions: [question],
    authorityRequirements: [requirement],
    searchScopes: [searchScope],
    completenessCriteria,
    status: 'NOT_STARTED',
    blockers: [],
    unresolvedGaps,
  });
}

export async function buildStrategicLegalResearchPlan(
  input: BuildStrategicLegalResearchPlanInput,
): Promise<LegalResearchPlan> {
  const sourceFactIds = sortedUnique(input.sourceFactIds);
  const sourceArgumentIds = sortedUnique(input.sourceArgumentIds);
  const sourceClaimIds = sortedUnique(input.sourceClaimIds);
  const challengedReasoningIds = sortedUnique(input.challengedReasoningIds);
  const authorityTypes = sortedUnique(input.authorityTypes);
  const searchScope = normalizedScope(input.scope);
  const question = questionFor({
    legalIssueId: input.legalIssueId,
    target: { kind: 'LEGAL_ISSUE', legalIssueId: input.legalIssueId },
    purpose: 'STRATEGIC_ISSUE_RESEARCH',
    question: STRATEGIC_QUESTION,
    propositionToEstablish: input.propositionToEstablish,
    authorityTypes,
    adverseAuthorityRequired: input.adverseAuthorityRequired,
    scope: searchScope,
  });
  searchScope.researchQuestionId = question.id;
  searchScope.id = stableResearchId('research-scope', { questionId: question.id, ...searchScope });

  const relationIds = [...sourceFactIds, ...sourceArgumentIds, ...sourceClaimIds, ...challengedReasoningIds];
  const blockers: ResearchPlanBlocker[] = [];
  if (!normalizedText(input.propositionToEstablish)) blockers.push('BLOCKED_MISSING_PROPOSITION');
  if (relationIds.length === 0) blockers.push('BLOCKED_MISSING_EXPLICIT_RELATION');
  if (!input.scope) blockers.push('BLOCKED_MISSING_SCOPE');
  if (input.scope && (!input.scope.temporalCutoff || (input.scope.temporalPrecision ?? 'UNKNOWN') === 'UNKNOWN')) {
    blockers.push('BLOCKED_MISSING_TEMPORAL_SCOPE');
  }
  if (input.scope && ((input.scope.sourceAdapters ?? []).length === 0 || (input.scope.sourceTiers ?? []).length === 0)) {
    blockers.push('BLOCKED_MISSING_SOURCE_SCOPE');
  }
  if (authorityTypes.length === 0) blockers.push('BLOCKED_MISSING_AUTHORITY_TYPES');

  const requirementIdentity = {
    researchQuestionId: question.id,
    legalIssueId: input.legalIssueId,
    authorityTypes,
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
    requirementKind: 'STRATEGIC_RULE_SUPPORT',
  };
  const requirement: AuthorityRequirement = {
    id: stableResearchId('authority-requirement', requirementIdentity),
    researchQuestionId: question.id,
    legalIssueId: input.legalIssueId,
    authorityTypes,
    required: true,
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
    verificationRequirements: verificationRequirements(),
  };
  const unresolvedGaps = input.scope ? [] : ['MISSING_SCOPE'];
  const completenessCriteria = initialCriteria(question, [requirement], searchScope, unresolvedGaps);

  return finalizePlan({
    legalIssueId: input.legalIssueId,
    target: { kind: 'LEGAL_ISSUE', legalIssueId: input.legalIssueId },
    purpose: 'STRATEGIC_ISSUE_RESEARCH',
    sourceFactIds,
    sourceArgumentIds,
    sourceClaimIds,
    challengedReasoningIds,
    researchQuestions: [question],
    authorityRequirements: [requirement],
    searchScopes: [searchScope],
    completenessCriteria,
    status: blockers.length > 0 ? 'BLOCKED' : 'INCOMPLETE',
    blockers,
    unresolvedGaps,
  });
}

export async function buildStrategicChallengeResearchPlan(
  input: BuildStrategicChallengeResearchPlanInput,
): Promise<LegalResearchPlan> {
  const sourceFactIds = sortedUnique(input.sourceFactIds);
  const sourceArgumentIds = sortedUnique(input.sourceArgumentIds);
  const sourceClaimIds = sortedUnique(input.sourceClaimIds);
  const authorityTypes = sortedUnique(input.authorityTypes);
  const target: LegalResearchPlanTarget = {
    kind: 'STRATEGIC_CHALLENGE_CANDIDATE',
    strategicChallengeCandidateId: input.id,
    decisionReasoningId: input.decisionReasoningId,
  };
  const searchScope = normalizedScope(input.scope);
  const question = questionFor({
    target,
    purpose: 'STRATEGIC_ISSUE_RESEARCH',
    question: STRATEGIC_QUESTION,
    propositionToEstablish: input.propositionToEstablish,
    authorityTypes,
    adverseAuthorityRequired: input.adverseAuthorityRequired,
    scope: searchScope,
  });
  searchScope.researchQuestionId = question.id;
  searchScope.id = stableResearchId('research-scope', { questionId: question.id, ...searchScope });

  const relationIds = [...sourceFactIds, ...sourceArgumentIds, ...sourceClaimIds, input.decisionReasoningId].filter(Boolean);
  const blockers: ResearchPlanBlocker[] = [];
  if (!normalizedText(input.propositionToEstablish)) blockers.push('BLOCKED_MISSING_PROPOSITION');
  if (relationIds.length === 0) blockers.push('BLOCKED_MISSING_EXPLICIT_RELATION');
  if (!input.scope) blockers.push('BLOCKED_MISSING_SCOPE');
  if (input.scope && (!input.scope.temporalCutoff || (input.scope.temporalPrecision ?? 'UNKNOWN') === 'UNKNOWN')) {
    blockers.push('BLOCKED_MISSING_TEMPORAL_SCOPE');
  }
  if (input.scope && ((input.scope.sourceAdapters ?? []).length === 0 || (input.scope.sourceTiers ?? []).length === 0)) {
    blockers.push('BLOCKED_MISSING_SOURCE_SCOPE');
  }
  if (authorityTypes.length === 0) blockers.push('BLOCKED_MISSING_AUTHORITY_TYPES');

  const requirementIdentity = {
    researchQuestionId: question.id,
    target,
    authorityTypes,
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
    requirementKind: 'STRATEGIC_RULE_SUPPORT',
  };
  const requirement: AuthorityRequirement = {
    id: stableResearchId('authority-requirement', requirementIdentity),
    researchQuestionId: question.id,
    target,
    authorityTypes,
    required: true,
    sourceAdapters: searchScope.sourceAdapters,
    allowedSourceTiers: searchScope.sourceTiers,
    verificationRequirements: verificationRequirements(),
  };
  const unresolvedGaps = input.scope ? [] : ['MISSING_SCOPE'];
  const completenessCriteria = initialCriteria(question, [requirement], searchScope, unresolvedGaps);

  return finalizePlan({
    target,
    purpose: 'STRATEGIC_ISSUE_RESEARCH',
    sourceFactIds,
    sourceArgumentIds,
    sourceClaimIds,
    challengedReasoningIds: [],
    researchQuestions: [question],
    authorityRequirements: [requirement],
    searchScopes: [searchScope],
    completenessCriteria,
    status: blockers.length > 0 ? 'BLOCKED' : 'INCOMPLETE',
    blockers,
    unresolvedGaps,
  });
}

export async function assessLegalResearchPlanCompleteness(
  plan: LegalResearchPlan,
  evidence: LegalResearchPlanAssessmentEvidence = {},
): Promise<LegalResearchPlanAssessment> {
  const coveredQuestions = new Set(evidence.coveredResearchQuestionIds ?? []);
  const verifiedRequirements = new Set(evidence.verifiedAuthorityRequirementIds ?? []);
  const checkedAdapters = new Set(evidence.checkedSourceAdapters ?? []);
  const checkedTiers = new Set(evidence.checkedSourceTiers ?? []);
  const blockers: ResearchPlanBlocker[] = plan.status === 'BLOCKED' ? [...plan.blockers] : [];

  for (const questionId of plan.completenessCriteria.requiredResearchQuestionIds) {
    if (!coveredQuestions.has(questionId)) blockers.push('MISSING_REQUIRED_PROPOSITION');
  }
  for (const requirementId of plan.completenessCriteria.requiredAuthorityRequirementIds) {
    if (!verifiedRequirements.has(requirementId)) blockers.push('MISSING_AUTHORITY_VERIFICATION');
  }
  for (const adapter of plan.completenessCriteria.requiredSourceAdapters) {
    if (!checkedAdapters.has(adapter)) blockers.push('SOURCE_ADAPTER_NOT_CHECKED');
  }
  for (const tier of plan.completenessCriteria.requiredSourceTiers) {
    if (!checkedTiers.has(tier)) blockers.push('SOURCE_TIER_NOT_CHECKED');
  }

  const adverseAuthorityStatus = plan.completenessCriteria.adverseAuthorityStatus === 'NOT_REQUIRED'
    ? 'NOT_REQUIRED'
    : evidence.adverseAuthorityStatus ?? 'REQUIRED_NOT_CHECKED';
  if (adverseAuthorityStatus === 'REQUIRED_NOT_CHECKED' || adverseAuthorityStatus === 'BLOCKED') {
    blockers.push('ADVERSE_AUTHORITY_CHECK_REQUIRED');
  }

  const unresolvedGaps = sortedUnique([
    ...plan.completenessCriteria.unresolvedGaps,
    ...(evidence.unresolvedGaps ?? []),
  ]);
  const criteria: CompletenessCriteria = {
    ...plan.completenessCriteria,
    verificationCompleted: plan.completenessCriteria.requiredAuthorityRequirementIds.every((id) => verifiedRequirements.has(id)),
    adverseAuthorityStatus,
    unresolvedGaps,
  };
  const uniqueBlockers = sortedUnique(blockers);
  return {
    status: plan.status === 'BLOCKED' ? 'BLOCKED' : uniqueBlockers.length > 0 ? 'INCOMPLETE' : 'SUFFICIENT',
    completenessCriteria: criteria,
    blockers: uniqueBlockers,
    unresolvedGaps,
  };
}

export function projectAuthorityVerificationPlan(
  plan: LegalResearchPlan,
): AuthorityVerificationRequestProjection {
  if (plan.purpose !== 'AUTHORITY_VERIFICATION') throw new Error('RESEARCH_PLAN_PURPOSE_MISMATCH');
  if (!plan.legalIssueId) throw new Error('RESEARCH_PLAN_TARGET_MISSING_LEGAL_ISSUE');
  return {
    legalIssueId: plan.legalIssueId,
    question: plan.researchQuestions[0]?.question ?? AUTHORITY_VERIFICATION_QUESTION,
    requestedAuthorityTypes: sortedUnique(plan.authorityRequirements.flatMap((requirement) => requirement.authorityTypes)),
    sourceAuthorityMentionIds: sortedUnique(plan.authorityRequirements
      .map((requirement) => requirement.sourceAuthorityMentionId)
      .filter((id): id is string => Boolean(id))),
  };
}
