import type { ExportValidationResult } from './exportGuards';
import type { DraftReviewInput } from './finalDocumentMaterializationTypes';
import type { DocumentNode, UniversalLegalDocument } from './types';

/** Explicit review-only input. Does not claim verified assembly, coverage or law. */
export function prepareDraftReviewMaterialization(document: UniversalLegalDocument, exportValidation: ExportValidationResult): DraftReviewInput {
  const containsText = (nodes: DocumentNode[]): boolean => nodes.some(node =>
    node.content.some(block => typeof block.text === 'string' && !!block.text.trim())
    || containsText(node.children || []));
  if (document.generationMetadata.exportMode !== 'DRAFT'
    || !document.generationMetadata.exportNotice
    || !containsText(document.sections)) {
    throw new Error('DRAFT_REVIEW_REQUIRES_NONEMPTY_MARKED_DRAFT');
  }
  return { verificationMode: 'DRAFT_REVIEW', document, exportValidation };
}
