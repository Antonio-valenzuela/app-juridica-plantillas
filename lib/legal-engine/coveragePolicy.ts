import type { ContentBlock } from './types';
import type { BlockQualityEvaluation } from './semanticEvaluator';
import type { DocumentCoverageItem } from './coverageMatrix';
import type { CoverageTraceStatusReason } from './generationTrace';

export interface CoverageSatisfaction {
  satisfied: boolean;
  reason: CoverageTraceStatusReason;
}

/**
 * Returns the reason why generated prose cannot close a Coverage item that
 * still needs a human decision.  These states are deliberately orthogonal to
 * semantic quality: a PASS block can explain an open issue, but it cannot
 * resolve the conflict or supply the client's missing position.
 */
export function getCoverageResolutionBlockReason(item: DocumentCoverageItem): string | undefined {
  if (item.category === 'CONFLICT_REVIEW') {
    return 'BLOCKING_CONFLICT_REQUIRES_REVIEW';
  }
  if (item.category === 'AUTHORITY_MENTION' || item.metadata?.verificationStatus === 'SOURCE_CITED') {
    return 'LEGAL_RESEARCH_REQUIRED';
  }
  if (item.category === 'MISSING_CLIENT_POSITION'
    || item.requiresClientPosition
    || item.status === 'needs_client_position') {
    return 'MISSING_CLIENT_POSITION_REQUIRED';
  }
  if (item.status === 'blocked' && item.blocking) {
    return 'BLOCKING_COVERAGE_REQUIRES_REVIEW';
  }
  return undefined;
}

/** Hard blockers keep their current unresolved state (for example blocked or
 * needs_client_position). Other items that require a client position may be
 * marked generated/weak, but can never be promoted to covered automatically.
 */
export function isHardCoverageResolutionBlock(item: DocumentCoverageItem): boolean {
  return item.category === 'CONFLICT_REVIEW'
    || item.category === 'MISSING_CLIENT_POSITION'
    || (item.status === 'blocked' && Boolean(item.blocking));
}

type CoverageBlock = Pick<ContentBlock, 'id' | 'text' | 'generatedBy' | 'fallbackStatus' | 'generationRequirement' | 'coverageItemIds' | 'issueDraftValidationStatus' | 'semanticEvaluation' | 'provenance'>;

const PLACEHOLDER_MARKER = /\[(?:DATO\s+PENDIENTE|REQUIERE)[^\]]*\]/i;

function linkedBlocks(item: DocumentCoverageItem, blocks: CoverageBlock[]): CoverageBlock[] {
  return blocks.filter((block) => block.coverageItemIds?.includes(item.id));
}

function hasFallbackMarker(block: CoverageBlock): boolean {
  return Boolean(block.fallbackStatus && block.fallbackStatus !== 'NONE') || block.generatedBy === 'FALLBACK';
}

/**
 * Decides whether a block may satisfy a CoverageItem.  The decision is
 * intentionally stricter for substantive coverage: a block must be linked by
 * the exact Coverage ID and have a passing semantic evaluation.  Formal
 * structure may use a deterministic block, provided it contains no unresolved
 * marker or fallback metadata.
 */
export function isCoverageSatisfied(
  item: DocumentCoverageItem,
  blocks: CoverageBlock[],
  evaluations: Pick<BlockQualityEvaluation, 'blockId' | 'verdict' | 'hardFailReasons'>[],
): CoverageSatisfaction {
  const candidates = linkedBlocks(item, blocks);
  if (candidates.length === 0 || item.satisfactionPolicy === 'REFERENCE_ONLY') {
    return { satisfied: false, reason: 'NO_GENERATED_BLOCK' };
  }

  if (candidates.some((block) => block.issueDraftValidationStatus && block.issueDraftValidationStatus !== 'VALID_ACCEPTED')) {
    return { satisfied: false, reason: 'SEMANTIC_SCORE_BELOW_THRESHOLD' };
  }

  if (item.scope === 'FORMAL' || item.satisfactionPolicy === 'FORMAL_DETERMINISTIC_ALLOWED') {
    const valid = candidates.some((block) => {
      const text = String(block.text || '').trim();
      return Boolean(text)
        && block.generatedBy === 'DETERMINISTIC'
        && !PLACEHOLDER_MARKER.test(text)
        && !hasFallbackMarker(block);
    });
    return valid
      ? { satisfied: true, reason: 'VALID_STRUCTURAL_BLOCK' }
      : { satisfied: false, reason: 'PLACEHOLDER_NOT_COVERAGE' };
  }

  for (const block of candidates) {
    const text = String(block.text || '').trim();
    if (!text) continue;
    if (PLACEHOLDER_MARKER.test(text)) {
      return { satisfied: false, reason: 'PLACEHOLDER_NOT_COVERAGE' };
    }
    if (hasFallbackMarker(block)) {
      return { satisfied: false, reason: 'LOCAL_FALLBACK_NOT_COVERAGE' };
    }
    if (block.generatedBy === 'DETERMINISTIC' || block.generationRequirement === 'DETERMINISTIC' || block.provenance === 'TEMPLATE_STRUCTURE') {
      return { satisfied: false, reason: 'SEMANTIC_SCORE_BELOW_THRESHOLD' };
    }

    const evaluation = evaluations.find((candidate) => candidate.blockId === block.id) || block.semanticEvaluation;
    if (evaluation?.verdict === 'PASS' && evaluation.hardFailReasons.length === 0) {
      return { satisfied: true, reason: 'VALID_SUBSTANTIVE_BLOCK' };
    }
  }

  return candidates.every((block) => !String(block.text || '').trim())
    ? { satisfied: false, reason: 'EMPTY_OUTPUT_NOT_COVERAGE' }
    : { satisfied: false, reason: 'SEMANTIC_SCORE_BELOW_THRESHOLD' };
}
