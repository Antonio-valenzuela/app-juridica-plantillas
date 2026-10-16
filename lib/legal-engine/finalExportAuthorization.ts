import { canExportDocumentFinal, getCatalogDocument, getFunctionalDocumentStatus } from '@/lib/catalog/legalCatalog';

export type FinalExportBlockReason = 'TYPE_REQUIRED' | 'TYPE_UNRECOGNIZED' | 'NOT_FUNCTIONALLY_CERTIFIED' | 'HUMAN_REVIEW_PENDING';

export type FinalExportAuthorization =
  | { ok: true }
  | { ok: false; status: 422; errorCode: 'UNCERTIFIED_TYPE_FINAL_BLOCKED'; reason: FinalExportBlockReason; message: string };

const DRAFT_HINT = 'Puedes exportar este documento como DRAFT para revisión.';

/**
 * Autorización de exportación FINAL en el borde HTTP. Se evalúa SIEMPRE en el
 * servidor, para documentos guardados y no guardados, y solo depende del
 * catálogo (functionalStatus + humanReview); ningún flag del cliente la relaja.
 *
 * `PASS` es evidencia técnica determinista, no certificación jurídica: sin
 * `humanReview: APPROVED` la descarga FINAL permanece bloqueada. Los borradores
 * (DRAFT) no pasan por aquí. El `errorCode` se mantiene estable para los
 * clientes existentes; `reason` distingue la causa.
 */
export function authorizeFinalExport(documentType: unknown): FinalExportAuthorization {
  const type = typeof documentType === 'string' ? documentType.trim() : '';
  const blocked = (reason: FinalExportBlockReason, message: string): FinalExportAuthorization => (
    { ok: false, status: 422, errorCode: 'UNCERTIFIED_TYPE_FINAL_BLOCKED', reason, message: `${message} ${DRAFT_HINT}` }
  );
  if (!type) return blocked('TYPE_REQUIRED', 'La exportación FINAL requiere un tipo de documento del catálogo.');
  if (!getCatalogDocument(type)) return blocked('TYPE_UNRECOGNIZED', 'La exportación FINAL requiere un tipo de documento reconocido del catálogo.');
  if (canExportDocumentFinal(type)) return { ok: true };
  if (getFunctionalDocumentStatus(type) !== 'PASS') {
    return blocked('NOT_FUNCTIONALLY_CERTIFIED', 'La exportación FINAL está bloqueada para tipos en desarrollo (sin certificar).');
  }
  return blocked('HUMAN_REVIEW_PENDING', 'La exportación FINAL requiere la aprobación de la revisión jurídica de este tipo de escrito, que aún está pendiente.');
}

/** Cuerpo JSON de la respuesta 422 cuando FINAL no está autorizado. */
export function finalExportBlockedBody(authorization: Extract<FinalExportAuthorization, { ok: false }>) {
  return { ok: false, errorCode: authorization.errorCode, reason: authorization.reason, message: authorization.message };
}
