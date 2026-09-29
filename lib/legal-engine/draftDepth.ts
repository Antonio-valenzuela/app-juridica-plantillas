export type DraftDepth = 'PROFESSIONAL_20' | 'EXTENSIVE_40';

export interface DraftDepthProfile {
  draftDepth: DraftDepth;
  targetPages: { min: number; preferred: number; max: number };
  targetWords: number;
  maxProviderCalls: number;
  maxPasses: number;
  maxTokensPerPass: number;
}

export type DraftSupportStatus = 'IN_PROGRESS' | 'CONTENT_LIMIT_REACHED' | 'COVERAGE_COMPLETE';

export interface RemainingDraftSupportInput {
  pendingCoverageItemIds: readonly string[];
  unusedFactIds: readonly string[];
  unusedEvidenceIds: readonly string[];
  verifiedUnappliedAuthorityIds: readonly string[];
  unresolvedAttorneyQuestionIds: readonly string[];
}

export interface RemainingDraftSupportAssessment {
  status: DraftSupportStatus;
  canExpand: boolean;
  reason: 'SUPPORTED_COVERAGE_REMAINS' | 'NO_UNCONSUMED_SOURCE_SUPPORT' | 'COVERAGE_COMPLETE';
  supportIds: string[];
}

const DRAFT_PROFILES: Record<DraftDepth, DraftDepthProfile> = {
  PROFESSIONAL_20: {
    draftDepth: 'PROFESSIONAL_20',
    targetPages: { min: 18, preferred: 20, max: 24 },
    targetWords: 10_000,
    maxProviderCalls: 24,
    maxPasses: 3,
    maxTokensPerPass: 5_000,
  },
  EXTENSIVE_40: {
    draftDepth: 'EXTENSIVE_40',
    targetPages: { min: 35, preferred: 40, max: 45 },
    targetWords: 20_000,
    maxProviderCalls: 48,
    maxPasses: 5,
    maxTokensPerPass: 6_500,
  },
};

export class DraftDepthValidationError extends Error {
  readonly code = 'INVALID_DRAFT_DEPTH';

  constructor(value: unknown) {
    super(`La profundidad de redacción no está permitida: ${String(value)}.`);
    this.name = 'DraftDepthValidationError';
  }
}

export function resolveDraftDepthProfile(value?: unknown): DraftDepthProfile {
  const draftDepth = value === undefined ? 'PROFESSIONAL_20' : value;
  if (draftDepth !== 'PROFESSIONAL_20' && draftDepth !== 'EXTENSIVE_40') {
    throw new DraftDepthValidationError(draftDepth);
  }
  return { ...DRAFT_PROFILES[draftDepth], targetPages: { ...DRAFT_PROFILES[draftDepth].targetPages } };
}

export function assessRemainingDraftSupport(
  input: RemainingDraftSupportInput,
): RemainingDraftSupportAssessment {
  const supportIds = Array.from(new Set([
    ...input.unusedFactIds,
    ...input.unusedEvidenceIds,
    ...input.verifiedUnappliedAuthorityIds,
  ].filter(Boolean)));
  const pendingCoverage = Array.from(new Set(input.pendingCoverageItemIds.filter(Boolean)));

  if (pendingCoverage.length > 0 && supportIds.length > 0) {
    return {
      status: 'IN_PROGRESS',
      canExpand: true,
      reason: 'SUPPORTED_COVERAGE_REMAINS',
      supportIds,
    };
  }

  if (pendingCoverage.length === 0 && input.unresolvedAttorneyQuestionIds.length === 0) {
    return {
      status: 'COVERAGE_COMPLETE',
      canExpand: false,
      reason: 'COVERAGE_COMPLETE',
      supportIds: [],
    };
  }

  return {
    status: 'CONTENT_LIMIT_REACHED',
    canExpand: false,
    reason: 'NO_UNCONSUMED_SOURCE_SUPPORT',
    supportIds: [],
  };
}
