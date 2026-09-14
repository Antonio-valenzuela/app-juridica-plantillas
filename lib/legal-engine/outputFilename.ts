import type { UniversalLegalDocument } from './types';
import type { CaseContext } from './caseContext';
import { DocumentTemplates } from './documentTemplates';
import { getDocumentStrategy } from './documentStrategies';

export type ExportFileExtension = 'docx' | 'pdf';

function sanitizeFilenameBase(value: string): string {
  const sanitized = String(value || '')
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim()
    .replace(/[. ]+$/g, '');
  if (!sanitized) return 'documento_generado';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(sanitized)) {
    return `_${sanitized}`;
  }
  return sanitized;
}

/**
 * Deriva el nombre únicamente del ID documental canónico. El CaseContext se
 * acepta para mantener una firma estable para los consumidores, pero nunca se
 * consulta la fuente ni su nombre de archivo para formar el nombre de salida.
 */
export function getCanonicalOutputFilename(
  selectedDocumentType: string,
  _caseContext?: CaseContext,
  extension: ExportFileExtension = 'docx',
): string {
  const canonicalId = getDocumentStrategy(selectedDocumentType)?.id
    || String(selectedDocumentType || '').trim().toLowerCase();
  const template = DocumentTemplates[canonicalId];
  const label = template?.etiquetas[0] || canonicalId.replace(/_/g, ' ') || 'documento generado';
  return `${sanitizeFilenameBase(label)}.${extension}`;
}

/**
 * Reads the server-selected download name without trusting path separators or
 * control characters from a response header. Returns undefined when the
 * server did not provide a usable filename so callers can use a local fallback.
 */
export function extractDownloadFilename(contentDisposition: string | null): string | undefined {
  if (!contentDisposition) return undefined;

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  const raw = encodedMatch?.[1] || plainMatch?.[1];
  if (!raw) return undefined;

  let decoded = raw.trim();
  if (encodedMatch) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return undefined;
    }
  }

  const safe = decoded
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim()
    .replace(/[. ]+$/g, '');
  if (!safe) return undefined;
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(safe)
    ? `_${safe}`
    : safe;
}

/**
 * Uses the filename selected by the document-routing metadata and sanitizes it
 * only at the filesystem boundary. The source PDF name is never used as a
 * substitute when a routed output name is already available.
 */
export function resolveDocumentOutputFilename(
  doc: Pick<UniversalLegalDocument, 'title' | 'generationMetadata'>
    & Partial<Pick<UniversalLegalDocument, 'documentType' | 'caseContext'>>,
  extension: ExportFileExtension,
): string {
  if (doc.documentType) return getCanonicalOutputFilename(doc.documentType, doc.caseContext, extension);
  const routed = doc.generationMetadata?.routing?.outputFilename;
  const base = sanitizeFilenameBase(String(routed || doc.title || 'documento_generado'));
  return `${base}.${extension}`;
}
