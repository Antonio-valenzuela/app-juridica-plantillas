import type { LegalIssueItem } from '../legalIssueMatrix';
import type { DerivedIssueReadiness, LegalResearchBundle } from './types';

function canonicalBlockers(issue: LegalIssueItem): string[] {
  const blockers: string[] = [];
  if (issue.conflictIds.length > 0 || issue.status === 'BLOCKED_BY_CONFLICT') {
    blockers.push('BLOCKING_CONFLICT_REQUIRES_REVIEW');
  }
  if (issue.clientPositionStatus === 'UNKNOWN' || issue.status === 'NEEDS_CLIENT_POSITION') {
    blockers.push('MISSING_CLIENT_POSITION_REQUIRED');
  }
  if (issue.relationStatus === 'UNLINKED' || issue.status === 'UNLINKED') {
    blockers.push('UNLINKED_COVERAGE_REQUIRES_REVIEW');
  }
  if (issue.status === 'UNKNOWN') {
    blockers.push('UNKNOWN_ISSUE_STATUS_REQUIRES_REVIEW');
  }
  return blockers;
}

export function deriveIssueResearchReadiness(
  issue: LegalIssueItem,
  bundle?: LegalResearchBundle,
): DerivedIssueReadiness {
  const blockers = canonicalBlockers(issue);
  if (issue.researchStatus === 'NOT_REQUIRED') {
    return {
      legalIssueId: issue.id,
      canonicalStatus: issue.status,
      researchReadiness: 'NOT_REQUIRED',
      blockers,
    };
  }

  let researchReadiness: DerivedIssueReadiness['researchReadiness'];
  if (!bundle) {
    researchReadiness = 'RESEARCH_REQUIRED';
  } else {
    if (bundle.researchStatus === 'REGIME_UNRESOLVED') {
      researchReadiness = 'LEGAL_REGIME_UNRESOLVED';
      blockers.push('LEGAL_REGIME_UNRESOLVED');
    } else if (bundle.researchStatus === 'VERIFIED_PARTIAL') {
      researchReadiness = 'RESEARCH_PARTIAL';
    } else if (bundle.researchStatus === 'VERIFIED_SUFFICIENT') {
      researchReadiness = blockers.length === 0
        ? 'READY_FOR_GENERATION_WITH_VERIFIED_RESEARCH'
        : 'RESEARCH_PARTIAL';
    } else {
      researchReadiness = 'RESEARCH_REQUIRED';
      blockers.push('LEGAL_RESEARCH_OR_SOURCE_VERIFICATION_REQUIRED');
    }
    if (bundle.unresolvedQuestions.length > 0 && !blockers.includes('LEGAL_REGIME_UNRESOLVED')) {
      blockers.push('UNRESOLVED_RESEARCH_QUESTIONS');
    }
  }

  return {
    legalIssueId: issue.id,
    canonicalStatus: issue.status,
    researchReadiness,
    researchBundleHash: bundle?.researchHash,
    blockers,
  };
}
