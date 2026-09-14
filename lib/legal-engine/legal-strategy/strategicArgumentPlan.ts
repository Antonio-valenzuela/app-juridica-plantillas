import { stableResearchId } from '../legal-research/canonical';
import type { VerifiedAuthority } from '../legal-research/types';
import type { StrategicChallengeCandidate, StrategicChallengeReassessment } from './strategicChallenge';

export type StrategicArgumentAdoptionState = 'NOT_ADOPTED' | 'ADOPTED';
export type StrategicArgumentReadiness = 'DRAFTABLE_FOR_REVIEW' | 'FINAL_CLIENT_ARGUMENT';

export interface StrategicArgumentPlan {
  id: string;
  decisionReasoningId: string;
  candidateId: string;
  thesis: string;
  legalQuestion: string;
  propositionToEstablish: string;
  sourceFactIds: string[];
  sourceArgumentIds: string[];
  supportingAuthorities: VerifiedAuthority[];
  adverseAuthorities: VerifiedAuthority[];
  distinctionOrRebuttal: string[];
  application: string;
  requestedLegalConsequence?: string;
  unresolvedRequirements: string[];
  clientPositionRequired: boolean;
  clientAdoption: StrategicArgumentAdoptionState;
  readiness: StrategicArgumentReadiness;
  researchHash: string;
}

export interface BuildStrategicArgumentPlanInput {
  candidate: StrategicChallengeCandidate;
  reassessment: StrategicChallengeReassessment;
  supportingAuthorities: readonly VerifiedAuthority[];
  adverseAuthorities: readonly VerifiedAuthority[];
  application: string;
  distinctionOrRebuttal?: readonly string[];
  requestedLegalConsequence?: string;
  researchHash: string;
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))].sort();
}

export function buildStrategicArgumentPlan(input: BuildStrategicArgumentPlanInput): StrategicArgumentPlan {
  if ((input.reassessment as unknown as Record<string, unknown>).clientPositionAdopted !== false) {
    throw new Error('STRATEGIC_ARGUMENT_PLAN_CLIENT_ADOPTION_FORBIDDEN');
  }
  const supported = input.reassessment.substantiveOutcome === 'SUPPORTED'
    || input.reassessment.substantiveOutcome === 'LIMITED';
  if (!supported) throw new Error('STRATEGIC_ARGUMENT_PLAN_REQUIRES_SUPPORTED_RESEARCH');
  if (!input.application.trim()) throw new Error('STRATEGIC_ARGUMENT_PLAN_MISSING_APPLICATION');
  if (!input.researchHash.trim()) throw new Error('STRATEGIC_ARGUMENT_PLAN_MISSING_RESEARCH_HASH');
  if (input.supportingAuthorities.length === 0) {
    throw new Error('STRATEGIC_ARGUMENT_PLAN_MISSING_VERIFIED_SUPPORT');
  }
  if (input.supportingAuthorities.some((authority) => authority.verificationStatus !== 'VERIFIED')) {
    throw new Error('STRATEGIC_ARGUMENT_PLAN_UNVERIFIED_SUPPORT');
  }
  if (input.adverseAuthorities.some((authority) => authority.verificationStatus !== 'VERIFIED')) {
    throw new Error('STRATEGIC_ARGUMENT_PLAN_UNVERIFIED_ADVERSE');
  }

  const identity = {
    candidateId: input.candidate.id,
    decisionReasoningId: input.candidate.decisionReasoningId,
    researchHash: input.researchHash,
  };
  const clientPositionRequired = input.candidate.clientPositionRequired || input.reassessment.clientDecisionRequired;
  return {
    id: stableResearchId('strategic-argument-plan', identity),
    decisionReasoningId: input.candidate.decisionReasoningId,
    candidateId: input.candidate.id,
    thesis: input.candidate.thesis,
    legalQuestion: input.candidate.legalQuestion,
    propositionToEstablish: input.candidate.propositionToEstablish,
    sourceFactIds: [...input.candidate.sourceFactIds].sort(),
    sourceArgumentIds: [...input.candidate.sourceArgumentIds].sort(),
    supportingAuthorities: [...input.supportingAuthorities],
    adverseAuthorities: [...input.adverseAuthorities],
    distinctionOrRebuttal: unique(input.distinctionOrRebuttal || []),
    application: clean(input.application),
    ...(input.requestedLegalConsequence?.trim()
      ? { requestedLegalConsequence: clean(input.requestedLegalConsequence) }
      : {}),
    unresolvedRequirements: unique([
      ...input.candidate.unresolvedRequirements,
      ...input.reassessment.unresolvedRequirements,
      ...(clientPositionRequired ? ['CLIENT_POSITION_REQUIRED'] : []),
    ]),
    clientPositionRequired,
    clientAdoption: 'NOT_ADOPTED',
    readiness: clientPositionRequired ? 'DRAFTABLE_FOR_REVIEW' : 'FINAL_CLIENT_ARGUMENT',
    researchHash: input.researchHash,
  };
}
