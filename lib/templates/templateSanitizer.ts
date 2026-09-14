import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';

/** Limpieza única para texto guardado de una plantilla, sin perder párrafos. */
export function sanitizeTemplateContent(value: string | null | undefined): string {
  return normalizeLegalDocumentText(value);
}
