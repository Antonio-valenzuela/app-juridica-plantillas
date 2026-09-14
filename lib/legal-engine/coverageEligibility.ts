import type { ContentBlock } from './types';
import type { CoverageCategory, DocumentCoverageItem } from './coverageMatrix';

export type CoverageStatusReason =
  | 'VALID_SUBSTANTIVE_BLOCK'
  | 'VALID_STRUCTURAL_BLOCK'
  | 'PLACEHOLDER_NOT_COVERAGE'
  | 'LOCAL_FALLBACK_NOT_COVERAGE'
  | 'DETERMINISTIC_NOT_COVERAGE'
  | 'EMPTY_OUTPUT_NOT_COVERAGE'
  | 'SEMANTIC_SCORE_BELOW_THRESHOLD'
  | 'NO_GENERATED_BLOCK';

export interface CoverageEligibility {
  eligible: boolean;
  reason: CoverageStatusReason;
}

type CoverageItemScope = Pick<DocumentCoverageItem, 'category' | 'metadata'>;

export function isSubstantiveCoverageItem(item: CoverageItemScope): boolean {
  return item.metadata?.coverageScope !== 'STRUCTURAL';
}

function hasUnresolvedMarker(text: string): boolean {
  return /\[(?:REQUIERE|DATO\s+PENDIENTE)\b[^\]]*\]/i.test(text);
}

function isStructuralCategory(category: CoverageCategory): boolean {
  return category === 'PROCEDURAL_REQUIREMENT';
}

export function assessCoverageEligibility(
  block: Pick<ContentBlock, 'text' | 'generatedBy' | 'fallbackStatus' | 'generationRequirement'>,
  item?: CoverageItemScope,
): CoverageEligibility {
  const text = String(block.text || '').trim();
  if (!text) return { eligible: false, reason: 'EMPTY_OUTPUT_NOT_COVERAGE' };
  if (hasUnresolvedMarker(text)) return { eligible: false, reason: 'PLACEHOLDER_NOT_COVERAGE' };

  const structural = item ? !isSubstantiveCoverageItem(item) : false;
  const fallback = Boolean(block.fallbackStatus && block.fallbackStatus !== 'NONE');
  if (fallback || block.generatedBy === 'FALLBACK') {
    return { eligible: false, reason: 'LOCAL_FALLBACK_NOT_COVERAGE' };
  }

  if (item && structural && (isStructuralCategory(item.category) || item.metadata?.coverageScope === 'STRUCTURAL')) {
    return { eligible: true, reason: 'VALID_STRUCTURAL_BLOCK' };
  }

  if (block.generatedBy === 'DETERMINISTIC' || block.generationRequirement === 'DETERMINISTIC') {
    return { eligible: false, reason: 'DETERMINISTIC_NOT_COVERAGE' };
  }

  return { eligible: true, reason: 'VALID_SUBSTANTIVE_BLOCK' };
}
