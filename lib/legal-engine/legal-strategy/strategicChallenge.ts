import type { DecisionReasoningItem, SourceProvenance } from '../case-extraction/types';
import {
  assessLegalResearchPlanCompleteness,
  type LegalResearchPlan,
  type ResearchPlanScopeInput,
} from '../legal-research/plan';
import { stableResearchId } from '../legal-research/canonical';
import { normalizeResearchQuery } from '../legal-research/researchRequest';
import { verifyAuthorityCandidate } from '../legal-research/authorityVerification';
import type { LegalResearchProvider } from '../legal-research/adapters/types';
import type {
  AuthorityType,
  LegalRegimeResolution,
  ResearchClock,
  StrategicChallengeResearchRequest,
  VerifiedAuthority,
} from '../legal-research/types';

export type StrategicChallengeCandidateStatus =
  | 'PROPOSED'
  | 'RESEARCH_REQUIRED'
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'INSUFFICIENT'
  | 'LIMITED'
  | 'CLIENT_DECISION_REQUIRED';

export interface StrategicChallengeProposal {
  thesis: string;
  legalQuestion: string;
  propositionToEstablish: string;
  researchGaps?: string[];
}

export interface StrategicChallengeCandidate {
  id: string;
  decisionReasoningId: string;
  thesis: string;
  legalQuestion: string;
  propositionToEstablish: string;
  sourceFactIds: string[];
  sourceArgumentIds: string[];
  authorityTypes: AuthorityType[];
  adverseAuthorityRequired: boolean;
  researchNeeded: true;
  clientPositionRequired: boolean;
  origin: 'SYSTEM_DERIVED' | 'MODEL_PROPOSED_SYSTEM_VALIDATED';
  status: StrategicChallengeCandidateStatus;
  unresolvedRequirements: string[];
  scope: ResearchPlanScopeInput;
  provenance: SourceProvenance[];
}

export interface CreateStrategicChallengeCandidateInput {
  reasoning: DecisionReasoningItem;
  proposal: StrategicChallengeProposal;
  allowlistedFactIds: readonly string[];
  allowlistedArgumentIds: readonly string[];
  sourceFactIds: readonly string[];
  sourceArgumentIds: readonly string[];
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope: ResearchPlanScopeInput;
  clientPositionRequired?: boolean;
}

export interface StrategicChallengeAnalyzer {
  propose(input: { reasoning: DecisionReasoningItem }): StrategicChallengeProposal;
}

export type StrategicChallengeResearchPolarity = 'SUPPORTING' | 'ADVERSE';

export interface StrategicChallengeResearchPass {
  polarity: StrategicChallengeResearchPolarity;
  provider: LegalResearchProvider;
}

export type StrategicChallengeSubstantiveOutcome =
  | 'SUPPORTED'
  | 'CONTRADICTED'
  | 'INSUFFICIENT'
  | 'LIMITED';

export interface StrategicChallengeReassessment {
  status: StrategicChallengeCandidateStatus;
  substantiveOutcome: StrategicChallengeSubstantiveOutcome;
  clientPositionAdopted: false;
  clientDecisionRequired: boolean;
  unresolvedRequirements: string[];
}

export interface ControlledStrategicChallengeResearchResult {
  plan: LegalResearchPlan;
  requests: StrategicChallengeResearchRequest[];
  supportingVerified: VerifiedAuthority[];
  adverseVerified: VerifiedAuthority[];
  passAudit: StrategicChallengePassAudit[];
  unresolvedRequirements: string[];
  reassessment: StrategicChallengeReassessment;
}

export interface StrategicChallengePassAudit {
  polarity: StrategicChallengeResearchPolarity;
  requestId: string;
  searchStatus: 'PASS' | 'PARTIAL' | 'FAIL';
  discoveredCandidateCount: number;
  retrievedCandidateCount: number;
  verifiedAuthorityCount: number;
  rejectedCandidateCount: number;
  noResults: boolean;
  reasons: string[];
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizedIdentity(value: string): string {
  return normalizedText(value).toLocaleLowerCase();
}

function sortedUnique(values: readonly string[] | undefined): string[] {
  return Array.from(new Set((values || []).map(normalizedText).filter(Boolean))).sort();
}

function meaningfulTokens(value: string): string[] {
  return Array.from(new Set(
    normalizedIdentity(value)
      .replace(/[^a-záéíóúüñ0-9 ]/gi, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 6),
  ));
}

function hasReasoningAnchor(reasoning: DecisionReasoningItem, proposal: StrategicChallengeProposal): boolean {
  const proposalText = normalizedIdentity([
    proposal.thesis,
    proposal.legalQuestion,
    proposal.propositionToEstablish,
  ].join(' '));
  return meaningfulTokens(reasoning.proposition).some((token) => proposalText.includes(token));
}

function validateScope(scope: ResearchPlanScopeInput | undefined): void {
  if (!scope) throw new Error('MISSING_STRATEGIC_SCOPE');
  if (!scope.temporalCutoff || (scope.temporalPrecision || 'UNKNOWN') === 'UNKNOWN') {
    throw new Error('MISSING_STRATEGIC_TEMPORAL_SCOPE');
  }
  if (!scope.sourceAdapters || scope.sourceAdapters.length === 0 || !scope.sourceTiers || scope.sourceTiers.length === 0) {
    throw new Error('MISSING_STRATEGIC_SOURCE_SCOPE');
  }
}

function validateProposalShape(proposal: StrategicChallengeProposal, reasoning: DecisionReasoningItem): void {
  const record = proposal as unknown as Record<string, unknown>;
  const forbiddenFields = [
    'status',
    'origin',
    'id',
    'decisionReasoningId',
    'clientAdopted',
    'clientPosition',
    'clientPositionRequired',
    'researchNeeded',
    'unresolvedRequirements',
    'scope',
    'authorityTypes',
    'adverseAuthorityRequired',
    'provenance',
    'verifiedAuthorityIds',
    'authorityIds',
    'legalIssueId',
    'coverageItemIds',
    'researchComplete',
  ];
  if (forbiddenFields.some((field) => Object.prototype.hasOwnProperty.call(record, field))) {
    throw new Error('MODEL_OWNED_FIELD_FORBIDDEN');
  }

  const thesis = normalizedText(proposal.thesis || '');
  const question = normalizedText(proposal.legalQuestion || '');
  const proposition = normalizedText(proposal.propositionToEstablish || '');
  if (thesis.length < 32 || /^(?:hay|existe|posible)\b.*\b(?:error|problema)\b/i.test(thesis)) {
    throw new Error('NON_SPECIFIC_CHALLENGE_THESIS');
  }
  if (question.length < 32 || !question.includes('?')) throw new Error('NON_SPECIFIC_LEGAL_QUESTION');
  if (proposition.length < 32) throw new Error('NON_SPECIFIC_PROPOSITION');
  if (/\b(?:el tribunal viol[oó]|se viol[oó]|es ilegal|qued[oó] demostrado|es definitivamente incorrecto)\b/i.test(`${thesis} ${proposition}`)) {
    throw new Error('DEFINITIVE_LEGAL_CONCLUSION');
  }
  if (!hasReasoningAnchor(reasoning, proposal)) throw new Error('CHALLENGE_NOT_SPECIFIC_TO_REASONING');
}

export function validateStrategicChallengeProposal(
  input: CreateStrategicChallengeCandidateInput,
): string[] {
  const errors: string[] = [];
  if (!input.reasoning.id.trim()) errors.push('MISSING_REASONING_ID');
  if (input.reasoning.provenance.length === 0) errors.push('MISSING_REASONING_PROVENANCE');
  if (input.reasoning.courtAttribution !== 'RESOLUTOR') errors.push('REASONING_NOT_COURT_OWNED');
  try {
    validateScope(input.scope);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'INVALID_STRATEGIC_SCOPE');
  }
  try {
    validateProposalShape(input.proposal, input.reasoning);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'INVALID_CHALLENGE_PROPOSAL');
  }

  const facts = sortedUnique(input.sourceFactIds);
  const allowedFacts = new Set(sortedUnique(input.allowlistedFactIds));
  if (facts.some((id) => !allowedFacts.has(id))) errors.push('UNALLOWLISTED_SOURCE_FACT');
  const argumentsFound = sortedUnique(input.sourceArgumentIds);
  const allowedArguments = new Set(sortedUnique(input.allowlistedArgumentIds));
  if (argumentsFound.some((id) => !allowedArguments.has(id))) errors.push('UNALLOWLISTED_SOURCE_ARGUMENT');
  if (sortedUnique(input.authorityTypes).length === 0) errors.push('MISSING_STRATEGIC_AUTHORITY_TYPES');
  return Array.from(new Set(errors));
}

export function createStrategicChallengeCandidate(
  input: CreateStrategicChallengeCandidateInput,
): StrategicChallengeCandidate {
  const errors = validateStrategicChallengeProposal(input);
  if (errors.length > 0) throw new Error(errors[0]);

  const thesis = normalizedText(input.proposal.thesis);
  const legalQuestion = normalizedText(input.proposal.legalQuestion);
  const propositionToEstablish = normalizedText(input.proposal.propositionToEstablish);
  const sourceFactIds = sortedUnique(input.sourceFactIds);
  const sourceArgumentIds = sortedUnique(input.sourceArgumentIds);
  const authorityTypes = sortedUnique(input.authorityTypes) as AuthorityType[];
  const scope = {
    ...input.scope,
    sourceAdapters: sortedUnique(input.scope.sourceAdapters) as ResearchPlanScopeInput['sourceAdapters'],
    sourceTiers: sortedUnique(input.scope.sourceTiers) as ResearchPlanScopeInput['sourceTiers'],
  };
  const identity = {
    decisionReasoningId: input.reasoning.id,
    thesis: normalizedIdentity(thesis),
    legalQuestion: normalizedIdentity(legalQuestion),
    propositionToEstablish: normalizedIdentity(propositionToEstablish),
  };

  return {
    id: stableResearchId('strategic-challenge-candidate', identity),
    decisionReasoningId: input.reasoning.id,
    thesis,
    legalQuestion,
    propositionToEstablish,
    sourceFactIds,
    sourceArgumentIds,
    authorityTypes,
    adverseAuthorityRequired: input.adverseAuthorityRequired,
    researchNeeded: true,
    clientPositionRequired: input.clientPositionRequired ?? true,
    origin: 'MODEL_PROPOSED_SYSTEM_VALIDATED',
    status: 'RESEARCH_REQUIRED',
    unresolvedRequirements: Array.from(new Set(input.proposal.researchGaps || [])).map(normalizedText).filter(Boolean).sort(),
    scope,
    provenance: input.reasoning.provenance.map((entry) => ({ ...entry })),
  };
}

export function createControlledStrategicChallengeAnalyzer(
  proposal: StrategicChallengeProposal,
): StrategicChallengeAnalyzer {
  return {
    propose: () => ({
      ...proposal,
      ...(proposal.researchGaps ? { researchGaps: [...proposal.researchGaps] } : {}),
    }),
  };
}

function meaningfulIdentityTokens(value: string): string[] {
  return Array.from(new Set(
    normalizedIdentity(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 6),
  ));
}

function verifiedPropositionMatches(
  candidate: StrategicChallengeCandidate,
  authority: VerifiedAuthority,
): boolean {
  const authorityText = meaningfulIdentityTokens(authority.proposition.text);
  return meaningfulIdentityTokens(candidate.propositionToEstablish)
    .some((token) => authorityText.includes(token));
}

function strategicRequestFor(
  candidate: StrategicChallengeCandidate,
  plan: LegalResearchPlan,
  regime: LegalRegimeResolution,
  polarity: StrategicChallengeResearchPolarity,
  clock: ResearchClock,
  providerId: LegalResearchProvider['id'],
): StrategicChallengeResearchRequest {
  if (plan.target.kind !== 'STRATEGIC_CHALLENGE_CANDIDATE') throw new Error('RESEARCH_PLAN_TARGET_MISMATCH');
  const question = plan.researchQuestions[0];
  if (!question) throw new Error('RESEARCH_PLAN_MISSING_QUESTION');
  const scope = plan.searchScopes[0];
  if (!scope) throw new Error('RESEARCH_PLAN_MISSING_SCOPE');
  const semantic = {
    candidateId: candidate.id,
    planHash: plan.planHash,
    target: plan.target,
    polarity,
    providerId,
    regimeId: regime.id,
  };
  return {
    id: stableResearchId('strategic-challenge-research-request', semantic),
    coverageItemIds: [],
    question: question.question,
    jurisdiction: regime.scope.toLowerCase(),
    matter: regime.matter?.code,
    procedure: regime.procedure?.code,
    relevantDate: regime.relevantDate,
    temporalPrecision: regime.temporalPrecision,
    requestedAuthorityTypes: [...question.authorityTypes].sort(),
    sourceAuthorityMentionIds: [],
    contextHash: plan.planHash,
    regimeResolutionId: regime.id,
    status: 'READY_FOR_RETRIEVAL',
    createdAt: clock().toISOString(),
    target: plan.target,
  };
}

async function runResearchPass(
  candidate: StrategicChallengeCandidate,
  plan: LegalResearchPlan,
  regime: LegalRegimeResolution,
  pass: StrategicChallengeResearchPass,
  clock: ResearchClock,
): Promise<{ request: StrategicChallengeResearchRequest; verified: VerifiedAuthority[]; unresolved: string[]; audit: StrategicChallengePassAudit }> {
  const request = strategicRequestFor(candidate, plan, regime, pass.polarity, clock, pass.provider.id);
  const query = await normalizeResearchQuery(request, regime);
  let search: Awaited<ReturnType<LegalResearchProvider['search']>>;
  try {
    search = await pass.provider.search({ request, query, regime });
  } catch (error) {
    return {
      request,
      verified: [],
      unresolved: [error instanceof Error ? error.message : 'STRATEGIC_RESEARCH_ADAPTER_ERROR'],
      audit: {
        polarity: pass.polarity,
        requestId: request.id,
        searchStatus: 'FAIL',
        discoveredCandidateCount: 0,
        retrievedCandidateCount: 0,
        verifiedAuthorityCount: 0,
        rejectedCandidateCount: 0,
        noResults: true,
        reasons: [error instanceof Error ? error.message : 'STRATEGIC_RESEARCH_ADAPTER_ERROR'],
      },
    };
  }
  if (search.status === 'FAIL') return {
    request,
    verified: [],
    unresolved: search.reasons,
    audit: {
      polarity: pass.polarity,
      requestId: request.id,
      searchStatus: search.status,
      discoveredCandidateCount: search.candidates.length,
      retrievedCandidateCount: 0,
      verifiedAuthorityCount: 0,
      rejectedCandidateCount: 0,
      noResults: search.candidates.length === 0,
      reasons: [...search.reasons],
    },
  };

  const verified: VerifiedAuthority[] = [];
  const unresolved = [...search.reasons];
  let retrievedCandidateCount = 0;
  let rejectedCandidateCount = 0;
  for (const searchCandidate of search.candidates) {
    let retrieved: Awaited<ReturnType<LegalResearchProvider['retrieve']>>;
    try {
      retrieved = await pass.provider.retrieve({ candidateId: searchCandidate.id, requestId: request.id });
    } catch (error) {
      rejectedCandidateCount += 1;
      unresolved.push(error instanceof Error ? error.message : 'STRATEGIC_RETRIEVAL_ERROR');
      continue;
    }
    if (retrieved.status !== 'PASS' || !retrieved.candidate || !retrieved.evidence) {
      rejectedCandidateCount += 1;
      unresolved.push(...retrieved.reasons);
      continue;
    }
    retrievedCandidateCount += 1;
    const verification = await verifyAuthorityCandidate({
      candidate: retrieved.candidate,
      evidence: retrieved.evidence,
      request,
      regime,
      proposition: retrieved.proposition,
    }, clock);
    if (!verification.verifiedAuthority) {
      rejectedCandidateCount += 1;
      unresolved.push(...(verification.rejection?.detail || ['STRATEGIC_AUTHORITY_NOT_VERIFIED']));
      continue;
    }
    if (!verifiedPropositionMatches(candidate, verification.verifiedAuthority)) {
      rejectedCandidateCount += 1;
      unresolved.push('VERIFIED_AUTHORITY_NOT_TIED_TO_PROPOSITION');
      continue;
    }
    verified.push(verification.verifiedAuthority);
  }
  return {
    request,
    verified,
    unresolved: Array.from(new Set(unresolved)),
    audit: {
      polarity: pass.polarity,
      requestId: request.id,
      searchStatus: search.status,
      discoveredCandidateCount: search.candidates.length,
      retrievedCandidateCount,
      verifiedAuthorityCount: verified.length,
      rejectedCandidateCount,
      noResults: search.candidates.length === 0,
      reasons: Array.from(new Set(unresolved)),
    },
  };
}

function reassess(
  candidate: StrategicChallengeCandidate,
  plan: LegalResearchPlan,
  supportingVerified: VerifiedAuthority[],
  adverseVerified: VerifiedAuthority[],
  adversePassExecuted: boolean,
  completenessBlockers: string[],
): StrategicChallengeReassessment {
  const unresolvedRequirements = new Set(completenessBlockers);
  const directSupport = supportingVerified.some((authority) => authority.proposition.supportLevel === 'DIRECT');
  const directAdverse = adverseVerified.some((authority) => authority.proposition.supportLevel === 'DIRECT');
  let substantiveOutcome: StrategicChallengeSubstantiveOutcome = 'INSUFFICIENT';

  if (!directSupport) {
    unresolvedRequirements.add('MISSING_VERIFIED_SUPPORTING_AUTHORITY');
  } else if (plan.completenessCriteria.adverseAuthorityStatus !== 'NOT_REQUIRED' && !adversePassExecuted) {
    unresolvedRequirements.add('ADVERSE_AUTHORITY_CHECK_REQUIRED');
  } else if (directAdverse) {
    substantiveOutcome = adverseVerified.length > 0 && directSupport ? 'LIMITED' : 'CONTRADICTED';
  } else if (adversePassExecuted) {
    substantiveOutcome = 'SUPPORTED';
  }

  const status: StrategicChallengeCandidateStatus = substantiveOutcome === 'SUPPORTED' && candidate.clientPositionRequired
    ? 'CLIENT_DECISION_REQUIRED'
    : substantiveOutcome;
  return {
    status,
    substantiveOutcome,
    clientPositionAdopted: false,
    clientDecisionRequired: status === 'CLIENT_DECISION_REQUIRED',
    unresolvedRequirements: Array.from(unresolvedRequirements).sort(),
  };
}

export async function runControlledStrategicChallengeResearch(
  input: {
    candidate: StrategicChallengeCandidate;
    plan: LegalResearchPlan;
    regime: LegalRegimeResolution;
    passes: StrategicChallengeResearchPass[];
    clock?: ResearchClock;
  },
): Promise<ControlledStrategicChallengeResearchResult> {
  if (
    input.plan.target.kind !== 'STRATEGIC_CHALLENGE_CANDIDATE' ||
    input.plan.target.strategicChallengeCandidateId !== input.candidate.id ||
    input.plan.target.decisionReasoningId !== input.candidate.decisionReasoningId
  ) {
    throw new Error('STRATEGIC_RESEARCH_TARGET_MISMATCH');
  }
  const clock = input.clock || (() => new Date());
  const passResults = [];
  for (const pass of input.passes) {
    passResults.push({ polarity: pass.polarity, ...(await runResearchPass(input.candidate, input.plan, input.regime, pass, clock)) });
  }
  const supportingVerified = passResults.flatMap((result) => result.polarity === 'SUPPORTING' ? result.verified : []);
  const adverseVerified = passResults.flatMap((result) => result.polarity === 'ADVERSE' ? result.verified : []);
  const unresolvedRequirements = Array.from(new Set(passResults.flatMap((result) => result.unresolved))).sort();
  const adversePassExecuted = passResults.some((result) => result.polarity === 'ADVERSE');
  const questionId = input.plan.researchQuestions[0]?.id;
  const requirementId = input.plan.authorityRequirements[0]?.id;
  const assessment = await assessLegalResearchPlanCompleteness(input.plan, {
    coveredResearchQuestionIds: supportingVerified.length > 0 && questionId ? [questionId] : [],
    verifiedAuthorityRequirementIds: supportingVerified.length > 0 && requirementId ? [requirementId] : [],
    checkedSourceAdapters: input.passes.map((pass) => pass.provider.id),
    checkedSourceTiers: input.plan.searchScopes.flatMap((scope) => scope.sourceTiers),
    adverseAuthorityStatus: adversePassExecuted
      ? adverseVerified.length > 0 ? 'CHECKED_WITH_RESULTS' : 'CHECKED_NO_RESULTS'
      : undefined,
    unresolvedGaps: passResults.flatMap((result) => result.unresolved),
  });
  return {
    plan: input.plan,
    requests: passResults.map((result) => result.request),
    supportingVerified,
    adverseVerified,
    passAudit: passResults.map((result) => result.audit),
    unresolvedRequirements,
    reassessment: reassess(
      input.candidate,
      input.plan,
      supportingVerified,
      adverseVerified,
      adversePassExecuted,
      Array.from(new Set([...assessment.blockers, ...unresolvedRequirements])).sort(),
    ),
  };
}
