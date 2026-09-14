'use client';
import { MATTERS, JURISDICTIONS, DOCUMENT_TYPES, LEGAL_CATALOG_REGISTRY, LEGAL_AREAS, LEGAL_PROCEDURES, DOCUMENT_FAMILIES, searchCatalog } from '@/lib/legal-taxonomy';

/**
 * useLegalTaxonomy — hook fino que expone la taxonomía centralizada a las 4 pestañas (P10, P13)
 * Evita listas hardcodeadas en JSX.
 */
export function useLegalTaxonomy() {
  return {
    matters: MATTERS,
    jurisdictions: JURISDICTIONS,
    documentTypes: DOCUMENT_TYPES,
    catalog: LEGAL_CATALOG_REGISTRY,
    areas: LEGAL_AREAS,
    procedures: LEGAL_PROCEDURES,
    families: DOCUMENT_FAMILIES,
    searchCatalog,
  };
}
