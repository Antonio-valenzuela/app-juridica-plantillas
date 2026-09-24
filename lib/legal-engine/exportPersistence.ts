/**
 * The export routes only accept documents that already belong to the
 * authenticated principal. A generated document can be visible in the editor
 * before its first draft persistence, so exporting must establish ownership
 * before sending the binary-export request.
 */
export async function persistDocumentBeforeExport<TDocument, TResult>(
  document: TDocument,
  saveDraft: (document: TDocument) => Promise<boolean>,
  sendExport: (document: TDocument) => Promise<TResult>,
): Promise<TResult> {
  const persisted = await saveDraft(document);
  if (!persisted) {
    throw new Error('No se pudo guardar el documento antes de exportar.');
  }
  return sendExport(document);
}
