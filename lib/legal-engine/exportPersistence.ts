import type { ExportMode } from './exportModes';

/**
 * Normal export requires a persisted draft so the authenticated routes can
 * verify document ownership. A local DRAFT may use a separate ephemeral route
 * when persistence is unavailable; FINAL never uses that route.
 */
export async function persistDocumentBeforeExport<TDocument, TResult>(
  document: TDocument,
  saveDraft: (document: TDocument) => Promise<boolean>,
  sendExport: (document: TDocument) => Promise<TResult>,
  options: {
    exportMode?: ExportMode;
    sendUnsavedDraftExport?: (document: TDocument) => Promise<TResult>;
    isPersistenceUnavailableResponse?: (result: TResult) => boolean | Promise<boolean>;
  } = {},
): Promise<TResult> {
  let persisted: boolean;
  try {
    persisted = await saveDraft(document);
  } catch (error) {
    if (options.exportMode === 'DRAFT' && options.sendUnsavedDraftExport) {
      return options.sendUnsavedDraftExport(document);
    }
    throw error;
  }
  if (!persisted) {
    if (options.exportMode === 'DRAFT' && options.sendUnsavedDraftExport) {
      return options.sendUnsavedDraftExport(document);
    }
    throw new DraftPersistenceRequiredError();
  }
  const result = await sendExport(document);
  if (
    options.exportMode === 'DRAFT'
    && options.sendUnsavedDraftExport
    && await options.isPersistenceUnavailableResponse?.(result)
  ) {
    return options.sendUnsavedDraftExport(document);
  }
  return result;
}

export class DraftPersistenceRequiredError extends Error {
  readonly errorCode = 'DRAFT_PERSISTENCE_REQUIRED';

  constructor() {
    super('No se pudo guardar el documento antes de exportar.');
    this.name = 'DraftPersistenceRequiredError';
  }
}
