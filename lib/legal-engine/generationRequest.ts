import type { CaseWorkflowSelection } from './types';
import type { UploadedSourceDocument } from './types';

/**
 * The browser keeps presentation-only fields and the extracted text in both
 * `content` and `extractedText`. Generation needs the latter plus page
 * provenance, but does not need a blob URL or a second full text copy.
 */
export function compactSourceDocumentsForGeneration(
  sources: UploadedSourceDocument[],
): UploadedSourceDocument[] {
  return sources.map((source) => {
    const {
      content,
      fileUrl: _fileUrl,
      extractedText,
      pages,
      ...metadata
    } = source;
    if (pages?.length) {
      return {
        ...metadata,
        pages,
      };
    }
    return {
      ...metadata,
      ...(extractedText || content
        ? { extractedText: extractedText || content }
        : {}),
    };
  });
}

/**
 * Workflow metadata is intentionally small. The canonical source and analysis
 * are reconstructed server-side from the top-level sourceDocuments payload.
 */
export function buildContestacionesWorkflowPayload(
  selection: CaseWorkflowSelection,
  updatedAt: string,
) {
  return {
    flow: 'DOCUMENT_ANALYSIS' as const,
    selection,
    updatedAt,
  };
}
