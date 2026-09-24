import type { UniversalLegalDocument } from './types';
import { paginateDocument, type DocumentPageBreakdown } from '@/app/machotes/components/documentPagination';

export interface GenerationProgressSnapshot {
  status?: string | null;
  percentage?: number | null;
  completed?: number | null;
  total?: number | null;
}

/** Uses server progress while guaranteeing that processing never renders as complete. */
export function deriveGenerationDisplayPercentage(snapshot: GenerationProgressSnapshot): number {
  const raw = Number.isFinite(Number(snapshot.percentage))
    ? Number(snapshot.percentage)
    : (Number(snapshot.total) > 0 ? Math.round((Number(snapshot.completed) / Number(snapshot.total)) * 100) : 0);
  const bounded = Math.max(0, Math.min(100, Math.round(raw)));
  return snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled'
    ? bounded
    : Math.min(99, bounded);
}

export function canSwitchWorkspaceMode(
  isGenerating: boolean,
  originMode: string | null | undefined,
  requestedMode: string,
): boolean {
  return !isGenerating || !originMode || originMode === requestedMode;
}

export function buildWorkspacePageModel(document: UniversalLegalDocument | null): {
  pages: DocumentPageBreakdown[];
  totalPages: number;
} {
  const pages = paginateDocument(document, 1750);
  return { pages, totalPages: Math.max(1, pages.length) };
}
