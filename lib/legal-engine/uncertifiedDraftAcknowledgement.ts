import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';

export const UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED = 'UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED' as const;

export function requiresUncertifiedDraftAcknowledgement(documentTypeId: string | undefined): boolean {
  if (!documentTypeId) return false;
  const entry = getCatalogDocument(documentTypeId);
  const canonical = entry?.kind === 'LEGACY_ALIAS' ? getCatalogDocument(entry.targetId) : entry;
  return canonical?.kind === 'DOCUMENT_TYPE'
    && canonical.status === 'IMPLEMENTED'
    && canonical.functionalStatus === 'FAIL';
}

export function isUncertifiedDraftAcknowledgementSatisfied(
  documentTypeId: string | undefined,
  acknowledgement: unknown,
): boolean {
  return !requiresUncertifiedDraftAcknowledgement(documentTypeId) || acknowledgement === true;
}

export function getUncertifiedDraftAcknowledgementError(
  documentTypeId: string | undefined,
  acknowledgement: unknown,
): { errorCode: typeof UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED; message: string } | null {
  if (isUncertifiedDraftAcknowledgementSatisfied(documentTypeId, acknowledgement)) return null;
  return {
    errorCode: UNCERTIFIED_DRAFT_ACKNOWLEDGEMENT_REQUIRED,
    message: 'Confirma que deseas generar un borrador asistido para este tipo aún no acreditado. La exportación FINAL seguirá bloqueada.',
  };
}

export function buildUncertifiedDraftAcknowledgement(documentTypeId: string | undefined, acknowledgement: unknown): boolean {
  return requiresUncertifiedDraftAcknowledgement(documentTypeId) && acknowledgement === true;
}

export function getDraftRegenerationRoutingError(documentTypeId: string | undefined): { errorCode: string; message: string } | null {
  if (!documentTypeId?.trim()) return null;
  try {
    resolveDocumentRouting({ selectedDocumentType: documentTypeId });
    return null;
  } catch (error) {
    const routingError = error as Error & { code?: string };
    return {
      errorCode: routingError.code || 'DOCUMENT_TYPE_NOT_IMPLEMENTED',
      message: routingError.message || 'El tipo de documento no está habilitado para regeneración.',
    };
  }
}
