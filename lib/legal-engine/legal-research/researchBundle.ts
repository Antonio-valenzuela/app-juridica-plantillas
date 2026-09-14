import type { AuthorityVerificationResult } from './authorityVerification';
import { sha256ResearchValue, stableResearchId } from './canonical';
import type {
  HumanReviewDecision,
  LegalRegimeResolution,
  LegalResearchBundle,
  LegalResearchRequest,
  RejectedAuthorityCandidate,
  VerifiedAuthority,
} from './types';

type VerificationRecord = VerifiedAuthority | AuthorityVerificationResult;

export interface BuildLegalResearchBundleInput {
  request: LegalResearchRequest;
  regime: LegalRegimeResolution;
  verifications: VerificationRecord[];
  rejections?: RejectedAuthorityCandidate[];
  unresolvedQuestions?: string[];
}

function isVerifiedAuthority(value: VerificationRecord): value is VerifiedAuthority {
  return 'verificationStatus' in value && value.verificationStatus === 'VERIFIED';
}

function verifiedAuthorityFrom(value: VerificationRecord): VerifiedAuthority | undefined {
  if (isVerifiedAuthority(value)) return value;
  return value.verifiedAuthority;
}

function rejectionFrom(value: VerificationRecord): RejectedAuthorityCandidate | undefined {
  if (isVerifiedAuthority(value) || !value.rejection?.candidate) return undefined;
  return value.rejection as RejectedAuthorityCandidate;
}

function semanticAuthority(authority: VerifiedAuthority): object {
  return {
    id: authority.id,
    identity: authority.identity,
    source: {
      sourceUrl: authority.source.sourceUrl,
      sourceDomain: authority.source.sourceDomain,
      sourceTier: authority.source.sourceTier,
      locator: authority.source.locator,
      sourceHash: authority.source.sourceHash,
      excerptHash: authority.source.excerptHash,
      isFixture: authority.source.isFixture,
    },
    temporalValidity: {
      status: authority.temporalValidity.status,
      relevantDate: authority.temporalValidity.relevantDate,
      effectiveFrom: authority.temporalValidity.effectiveFrom,
      effectiveTo: authority.temporalValidity.effectiveTo,
      basis: authority.temporalValidity.basis,
    },
    jurisdictionValidity: authority.jurisdictionValidity,
    proposition: authority.proposition,
    verificationStatus: authority.verificationStatus,
    supportsLegalIssueIds: [...authority.supportsLegalIssueIds].sort(),
    sourceAuthorityMentionIds: [...authority.sourceAuthorityMentionIds].sort(),
    verificationHash: authority.verificationHash,
  };
}

function semanticRejection(rejection: RejectedAuthorityCandidate): object {
  return {
    candidate: {
      id: rejection.candidate.id,
      requestId: rejection.candidate.requestId,
      authorityType: rejection.candidate.authorityType,
      observedCitation: rejection.candidate.observedCitation,
      canonicalCitationCandidate: rejection.candidate.canonicalCitationCandidate,
      sourceUrl: rejection.candidate.sourceUrl,
      sourceDomain: rejection.candidate.sourceDomain,
      sourceTier: rejection.candidate.sourceTier,
      issuingAuthority: rejection.candidate.issuingAuthority,
      jurisdiction: rejection.candidate.jurisdiction,
      matter: rejection.candidate.matter,
      procedure: rejection.candidate.procedure,
      publicationDate: rejection.candidate.publicationDate,
      effectiveFrom: rejection.candidate.effectiveFrom,
      effectiveTo: rejection.candidate.effectiveTo,
      temporalStatus: rejection.candidate.temporalStatus,
      locator: rejection.candidate.locator,
      evidenceHash: rejection.candidate.evidenceHash,
      evidenceExcerptHash: rejection.candidate.evidenceExcerptHash,
      metadataStatus: rejection.candidate.metadataStatus,
      candidateStatus: rejection.candidate.candidateStatus,
    },
    reasons: [...rejection.reasons].sort(),
    detail: [...rejection.detail].sort(),
  };
}

function semanticBundle(bundle: LegalResearchBundle): object {
  return {
    legalIssueId: bundle.legalIssueId,
    requestId: bundle.requestId,
    regimeResolution: {
      id: bundle.regimeResolution.id,
      status: bundle.regimeResolution.status,
      country: bundle.regimeResolution.country,
      scope: bundle.regimeResolution.scope,
      federativeEntity: bundle.regimeResolution.federativeEntity,
      matter: bundle.regimeResolution.matter,
      procedure: bundle.regimeResolution.procedure,
      proceduralStage: bundle.regimeResolution.proceduralStage,
      instance: bundle.regimeResolution.instance,
      issuingOrAdjudicatingBody: bundle.regimeResolution.issuingOrAdjudicatingBody,
      relevantDate: bundle.regimeResolution.relevantDate,
      temporalPrecision: bundle.regimeResolution.temporalPrecision,
      unresolvedFields: [...bundle.regimeResolution.unresolvedFields].sort(),
      resolutionHash: bundle.regimeResolution.resolutionHash,
    },
    verifiedAuthorities: [...bundle.verifiedAuthorities]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(semanticAuthority),
    rejectedCandidates: [...bundle.rejectedCandidates]
      .sort((left, right) => left.candidate.id.localeCompare(right.candidate.id))
      .map(semanticRejection),
    unresolvedQuestions: [...bundle.unresolvedQuestions].sort(),
    researchStatus: bundle.researchStatus,
  };
}

export async function hashResearchBundle(bundle: LegalResearchBundle): Promise<string> {
  return sha256ResearchValue(semanticBundle(bundle));
}

export async function buildLegalResearchBundle(
  input: BuildLegalResearchBundleInput,
): Promise<LegalResearchBundle> {
  const unresolvedQuestions = [...(input.unresolvedQuestions || [])];
  const verifiedAuthorities = input.regime.status === 'RESOLVED'
    ? input.verifications
        .map(verifiedAuthorityFrom)
        .filter((authority): authority is VerifiedAuthority => Boolean(authority))
        .filter((authority) =>
          authority.verificationStatus === 'VERIFIED' &&
          authority.source.sourceTier === 'OFFICIAL_PRIMARY' &&
          authority.supportsLegalIssueIds.includes(input.request.legalIssueId),
        )
    : [];
  const resultRejections = input.verifications
    .map(rejectionFrom)
    .filter((rejection): rejection is RejectedAuthorityCandidate => Boolean(rejection));
  const rejectedCandidates = [...(input.rejections || []), ...resultRejections]
    .filter((rejection) => rejection.candidate.requestId === input.request.id);

  let researchStatus: LegalResearchBundle['researchStatus'];
  if (input.regime.status !== 'RESOLVED') {
    researchStatus = 'REGIME_UNRESOLVED';
  } else if (verifiedAuthorities.length === 0) {
    researchStatus = 'NO_AUTHORITY_FOUND';
  } else if (
    unresolvedQuestions.length > 0 ||
    verifiedAuthorities.some((authority) => authority.proposition.supportLevel !== 'DIRECT')
  ) {
    researchStatus = 'VERIFIED_PARTIAL';
  } else {
    researchStatus = 'VERIFIED_SUFFICIENT';
  }

  const bundle: LegalResearchBundle = {
    legalIssueId: input.request.legalIssueId,
    requestId: input.request.id,
    regimeResolution: input.regime,
    verifiedAuthorities,
    rejectedCandidates,
    unresolvedQuestions,
    researchStatus,
    researchHash: '',
  };
  bundle.researchHash = await hashResearchBundle(bundle);
  return bundle;
}

export type HumanReviewDecisionInput = Omit<HumanReviewDecision, 'id'>;

export function recordHumanReviewDecision(input: HumanReviewDecisionInput): HumanReviewDecision {
  return {
    ...input,
    id: stableResearchId('human-review', {
      candidateId: input.candidateId,
      authorityId: input.authorityId,
      decision: input.decision,
      reason: input.reason,
      evidenceHash: input.evidenceHash,
      researchHash: input.researchHash,
    }),
  };
}
