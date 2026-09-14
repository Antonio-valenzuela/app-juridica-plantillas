/**
 * lib/legal-taxonomy/documentTypes.ts
 * Fuente única para tipos de escrito / acto procesal.
 * §7: proyección legacy del registry jurídico, sin hardcodear en JSX.
 */

import { getLegacyDocumentTypes } from '@/lib/catalog/legalCatalog';

export interface DocumentTypeDef {
  value: string;
  label: string;
  category?: string; // agrupación para UI: demanda, contestacion, recurso, etc.
  description?: string;
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = getLegacyDocumentTypes();

export function getDocumentTypeByValue(value: string): DocumentTypeDef | undefined {
  const norm = value?.trim().toLowerCase();
  return DOCUMENT_TYPES.find((d) => d.value === norm);
}

export function isValidDocumentType(value: string): boolean {
  return DOCUMENT_TYPES.some((d) => d.value === value?.trim().toLowerCase());
}

export const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES.map((d) => d.value) as unknown as [string, ...string[]];
