import type { DerivedIssueReadiness } from './types';
import type {
  AuthorityCandidate,
  LegalRegimeResolution,
  LegalResearchBundle,
  LegalResearchRequest,
  LegalResearchStatus,
  NormalizedResearchQuery,
  ResearchClock,
  VerifiedAuthority,
} from './types';
import { stableResearchId } from './canonical';
import { sanitizeTraceValue } from '../generationTraceSanitizer';

export interface ResearchTraceCandidate {
  candidateId: string;
  requestId: string;
  authorityType: AuthorityCandidate['authorityType'];
  sourceTier: AuthorityCandidate['sourceTier'];
  sourceUrl?: string;
  sourceHash?: string;
  status: AuthorityCandidate['candidateStatus'] | 'REJECTED';
}

export interface ResearchTraceVerification {
  authorityId?: string;
  candidateId?: string;
  status: 'VERIFIED' | 'REJECTED';
  verificationHash?: string;
  reasons: string[];
}

export interface ResearchTraceAttemptInput {
  attemptId?: string;
  adapterId: string;
  outcome: 'PASS' | 'PARTIAL' | 'FAIL';
  candidateIds: string[];
  acceptedAuthorityIds: string[];
  rejectedCandidateIds: string[];
  officialUrls: string[];
  sourceHashes: string[];
  reasons: string[];
}

export interface ResearchTraceAttempt extends ResearchTraceAttemptInput {
  attemptId: string;
  startedAt: string;
  completedAt: string;
}

export interface LegalResearchTrace {
  schemaVersion: '1.0';
  requestId?: string;
  legalIssueId?: string;
  regimeResolutionId?: string;
  regimeHash?: string;
  query?: {
    requestId: string;
    queryHash: string;
    normalizedQuery: string;
    explicitTerms: string[];
    regimeHash: string;
    relevantDate?: string;
  };
  attempts: ResearchTraceAttempt[];
  candidates: ResearchTraceCandidate[];
  verifications: ResearchTraceVerification[];
  bundle?: {
    legalIssueId: string;
    requestId: string;
    researchStatus: LegalResearchStatus;
    researchHash: string;
    verifiedAuthorityIds: string[];
    rejectedCandidateIds: string[];
  };
  readiness?: DerivedIssueReadiness;
  status: LegalResearchStatus | 'PENDING';
  startedAt: string;
  completedAt?: string;
}

function bounded(value: unknown, maxStringLength = 500): unknown {
  const sanitized = sanitizeTraceValue(value);
  if (typeof sanitized === 'string') return sanitized.slice(0, maxStringLength);
  if (Array.isArray(sanitized)) return sanitized.map((item) => bounded(item, maxStringLength));
  if (sanitized && typeof sanitized === 'object') {
    return Object.fromEntries(
      Object.entries(sanitized as Record<string, unknown>).map(([key, child]) => [key, bounded(child, maxStringLength)]),
    );
  }
  return sanitized;
}

function attemptRecord(
  input: ResearchTraceAttemptInput,
  clock: ResearchClock,
): ResearchTraceAttempt {
  const startedAt = clock().toISOString();
  return {
    ...bounded(input) as ResearchTraceAttemptInput,
    attemptId: input.attemptId || stableResearchId('research-attempt', {
      adapterId: input.adapterId,
      outcome: input.outcome,
      candidateIds: input.candidateIds,
      acceptedAuthorityIds: input.acceptedAuthorityIds,
      rejectedCandidateIds: input.rejectedCandidateIds,
      sourceHashes: input.sourceHashes,
      reasons: input.reasons,
    }),
    startedAt,
    completedAt: clock().toISOString(),
  };
}

export function recordResearchAttempt(
  trace: LegalResearchTrace,
  input: ResearchTraceAttemptInput,
  clock: ResearchClock,
): void {
  trace.attempts.push(attemptRecord(input, clock));
}

export function recordResearchCandidate(
  trace: LegalResearchTrace,
  candidate: ResearchTraceCandidate,
): void {
  trace.candidates.push(bounded(candidate) as ResearchTraceCandidate);
}

export function recordResearchVerification(
  trace: LegalResearchTrace,
  verification: ResearchTraceVerification,
): void {
  trace.verifications.push(bounded(verification) as ResearchTraceVerification);
}

export function recordResearchBundle(
  trace: LegalResearchTrace,
  bundle: LegalResearchBundle,
  readiness: DerivedIssueReadiness,
): void {
  trace.bundle = {
    legalIssueId: bundle.legalIssueId,
    requestId: bundle.requestId,
    researchStatus: bundle.researchStatus,
    researchHash: bundle.researchHash,
    verifiedAuthorityIds: bundle.verifiedAuthorities.map((authority) => authority.id),
    rejectedCandidateIds: bundle.rejectedCandidates.map((rejection) => rejection.candidate.id),
  };
  trace.readiness = bounded(readiness) as DerivedIssueReadiness;
  trace.status = bundle.researchStatus;
}

export function createResearchTraceRecorder(input: {
  clock?: ResearchClock;
}): {
  recordRequest(request: LegalResearchRequest, regime: LegalRegimeResolution): void;
  recordQuery(query: NormalizedResearchQuery): void;
  recordAttempt(attempt: ResearchTraceAttemptInput): void;
  recordCandidate(candidate: ResearchTraceCandidate): void;
  recordVerification(verification: ResearchTraceVerification): void;
  recordBundle(bundle: LegalResearchBundle, readiness: DerivedIssueReadiness): void;
  close(): LegalResearchTrace;
} {
  const clock = input.clock || (() => new Date());
  const trace: LegalResearchTrace = {
    schemaVersion: '1.0',
    attempts: [],
    candidates: [],
    verifications: [],
    status: 'PENDING',
    startedAt: clock().toISOString(),
  };
  let closed = false;

  return {
    recordRequest(request, regime) {
      trace.requestId = request.id;
      trace.legalIssueId = request.legalIssueId;
      trace.regimeResolutionId = regime.id;
      trace.regimeHash = regime.resolutionHash;
    },
    recordQuery(query) {
      trace.query = bounded({
        requestId: query.requestId,
        queryHash: query.queryHash,
        normalizedQuery: query.normalizedQuery,
        explicitTerms: query.explicitTerms,
        regimeHash: query.regimeHash,
        relevantDate: query.relevantDate,
      }) as LegalResearchTrace['query'];
    },
    recordAttempt(attempt) {
      recordResearchAttempt(trace, attempt, clock);
    },
    recordCandidate(candidate) {
      recordResearchCandidate(trace, candidate);
    },
    recordVerification(verification) {
      recordResearchVerification(trace, verification);
    },
    recordBundle(bundle, readiness) {
      recordResearchBundle(trace, bundle, readiness);
    },
    close() {
      if (!closed) {
        trace.completedAt = clock().toISOString();
        closed = true;
      }
      return bounded(trace) as LegalResearchTrace;
    },
  };
}

export function researchTraceCandidateFromAuthority(candidate: AuthorityCandidate): ResearchTraceCandidate {
  return {
    candidateId: candidate.id,
    requestId: candidate.requestId,
    authorityType: candidate.authorityType,
    sourceTier: candidate.sourceTier,
    sourceUrl: candidate.sourceUrl,
    sourceHash: candidate.evidenceHash,
    status: candidate.candidateStatus,
  };
}

export function researchTraceVerificationFromAuthority(authority: VerifiedAuthority): ResearchTraceVerification {
  return {
    authorityId: authority.id,
    status: 'VERIFIED',
    verificationHash: authority.verificationHash,
    reasons: [],
  };
}
