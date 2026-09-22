import type { LegalIssueStatus } from '../legalIssueMatrix';

export type ResearchClock = () => Date;

export interface LegalCodeLabel {
  code: string;
  displayName: string;
}

export type LegalScope =
  | 'FEDERAL'
  | 'STATE'
  | 'LOCAL'
  | 'MUNICIPAL'
  | 'ADMINISTRATIVE'
  | 'ELECTORAL'
  | 'MILITARY'
  | 'OTHER'
  | 'UNKNOWN';

export type LegalRegimeResolutionStatus =
  | 'RESOLVED'
  | 'PARTIALLY_RESOLVED'
  | 'LEGAL_REGIME_UNRESOLVED';

export interface LegalRegimeResolution {
  id: string;
  status: LegalRegimeResolutionStatus;
  country?: LegalCodeLabel;
  scope: LegalScope;
  federativeEntity?: LegalCodeLabel;
  matter?: LegalCodeLabel;
  procedure?: LegalCodeLabel;
  proceduralStage?: string;
  instance?: string;
  issuingOrAdjudicatingBody?: string;
  relevantDate?: string;
  temporalPrecision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  fieldEvidence: Array<{
    field: string;
    value: LegalCodeLabel | string;
    source: 'EXPLICIT_TAXONOMY' | 'EXPLICIT_SOURCE' | 'MANUAL_INPUT' | 'RESOLVED_METADATA';
    provenanceIds: string[];
  }>;
  unresolvedFields: string[];
  resolutionHash: string;
}

export type AuthorityType =
  | 'CONSTITUTION'
  | 'STATUTE'
  | 'CODE'
  | 'REGULATION'
  | 'JURISPRUDENCE'
  | 'THESIS'
  | 'PRECEDENT'
  | 'OFFICIAL_AGREEMENT'
  | 'OTHER_OFFICIAL_SOURCE';

export type LegalResearchRequestStatus =
  | 'PENDING'
  | 'READY_FOR_RETRIEVAL'
  | 'RETRIEVAL_PARTIAL'
  | 'VERIFICATION_PENDING'
  | 'COMPLETED'
  | 'BLOCKED';

export type LegalResearchTarget =
  | { kind: 'LEGAL_ISSUE'; legalIssueId: string }
  | {
      kind: 'STRATEGIC_CHALLENGE_CANDIDATE';
      strategicChallengeCandidateId: string;
      decisionReasoningId: string;
    };

export interface LegalResearchRequest {
  id: string;
  legalIssueId: string;
  target?: Extract<LegalResearchTarget, { kind: 'LEGAL_ISSUE' }>;
  coverageItemIds: string[];
  question: string;
  jurisdiction?: string;
  matter?: string;
  procedure?: string;
  relevantDate?: string;
  temporalPrecision?: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  requestedAuthorityTypes: AuthorityType[];
  sourceAuthorityMentionIds: string[];
  contextHash: string;
  regimeResolutionId: string;
  status: LegalResearchRequestStatus;
  createdAt: string;
}

export interface StrategicChallengeResearchRequest extends Omit<LegalResearchRequest, 'legalIssueId' | 'target'> {
  legalIssueId?: never;
  target: Extract<LegalResearchTarget, { kind: 'STRATEGIC_CHALLENGE_CANDIDATE' }>;
}

export type ResearchVerificationRequest = LegalResearchRequest | StrategicChallengeResearchRequest;

export interface NormalizedResearchQuery {
  requestId: string;
  normalizedQuery: string;
  queryHash: string;
  explicitTerms: string[];
  regimeHash: string;
  relevantDate?: string;
}

export interface AuthorityCandidate {
  id: string;
  requestId: string;
  provider?: 'SCJN' | 'FEDERAL_LEGISLATION' | 'DOF' | 'STATE_OFFICIAL' | 'FIXTURE_OFFICIAL' | 'CORPUS_IURIS' | 'LEX_MX' | 'RESEARCH_ROUTER';
  identifier?: string;
  title?: string;
  sourceAuthorityMentionId?: string;
  authorityType: AuthorityType;
  observedCitation: string;
  canonicalCitationCandidate?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  sourceTier: 'OFFICIAL_PRIMARY' | 'SECONDARY_SUPPORT' | 'UNKNOWN';
  issuingAuthority?: string;
  jurisdiction?: string;
  matter?: string;
  procedure?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  temporalStatus?: 'CURRENT' | 'REPEALED' | 'SUPERSEDED';
  locator?: string;
  retrievedAt: string;
  evidenceHash?: string;
  evidenceExcerptHash?: string;
  metadataStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';
  candidateStatus: 'DISCOVERED' | 'RETRIEVED' | 'REJECTED';
}

export interface OfficialSourceEvidence {
  sourceUrl: string;
  sourceDomain: string;
  sourceTier: 'OFFICIAL_PRIMARY';
  retrievedAt: string;
  locator?: string;
  sourceHash: string;
  excerptHash?: string;
  isFixture?: boolean;
}

export interface SupportedProposition {
  text: string;
  supportLevel: 'DIRECT' | 'LIMITED' | 'CONTEXT_ONLY';
  sourceLocator?: string;
  limitations: string[];
}

export type TemporalValidityStatus =
  | 'CURRENT_AND_APPLICABLE'
  | 'HISTORICALLY_APPLICABLE'
  | 'CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED'
  | 'REPEALED'
  | 'SUPERSEDED'
  | 'UNKNOWN_EFFECTIVE_DATE';

export interface VerifiedAuthority {
  id: string;
  provider?: AuthorityCandidate['provider'];
  officialUrl?: string;
  identifier?: string;
  title?: string;
  identity: {
    canonicalCitation: string;
    authorityType: AuthorityType;
    issuingAuthority: string;
    identityKey: string;
  };
  source: OfficialSourceEvidence;
  temporalValidity: {
    status: TemporalValidityStatus;
    relevantDate?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    checkedAt: string;
    basis: string[];
  };
  jurisdictionValidity: {
    status: 'APPLICABLE' | 'WRONG_JURISDICTION' | 'REVIEW_REQUIRED' | 'UNKNOWN';
    country?: string;
    scope?: LegalScope;
    federativeEntity?: string;
    matter?: string;
    procedure?: string;
    issuingBody?: string;
    bindingCharacter?: 'BINDING_WHEN_APPLICABLE' | 'PERSUASIVE' | 'NON_BINDING' | 'UNKNOWN';
    basis: string[];
  };
  proposition: SupportedProposition;
  verificationStatus: 'VERIFIED';
  supportsLegalIssueIds: string[];
  sourceAuthorityMentionIds: string[];
  verificationHash: string;
}

export type AuthorityRejectionReason =
  | 'NOT_FOUND'
  | 'MISMATCH'
  | 'OUTDATED'
  | 'WRONG_JURISDICTION'
  | 'INSUFFICIENT_METADATA'
  | 'NON_OFFICIAL_ONLY'
  | 'NO_PROPOSITION_SUPPORT'
  | 'ADAPTER_ERROR';

export interface RejectedAuthorityCandidate {
  candidate: AuthorityCandidate;
  reasons: AuthorityRejectionReason[];
  detail: string[];
  rejectedAt: string;
}

export type LegalResearchStatus =
  | 'VERIFIED_SUFFICIENT'
  | 'VERIFIED_PARTIAL'
  | 'NO_AUTHORITY_FOUND'
  | 'REGIME_UNRESOLVED'
  | 'REQUIRES_HUMAN_REVIEW';

export interface LegalResearchBundle {
  legalIssueId: string;
  requestId: string;
  regimeResolution: LegalRegimeResolution;
  verifiedAuthorities: VerifiedAuthority[];
  rejectedCandidates: RejectedAuthorityCandidate[];
  unresolvedQuestions: string[];
  researchStatus: LegalResearchStatus;
  researchHash: string;
}

export interface DerivedIssueReadiness {
  legalIssueId: string;
  canonicalStatus: LegalIssueStatus;
  researchReadiness:
    | 'NOT_REQUIRED'
    | 'RESEARCH_REQUIRED'
    | 'LEGAL_REGIME_UNRESOLVED'
    | 'RESEARCH_PARTIAL'
    | 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH';
  researchBundleHash?: string;
  blockers: string[];
}

export interface HumanReviewDecision {
  id: string;
  candidateId: string;
  authorityId?: string;
  decision: 'APPROVE_CONSUMPTION' | 'REJECT';
  reason: string;
  decidedAt: string;
  evidenceHash?: string;
  researchHash: string;
}
