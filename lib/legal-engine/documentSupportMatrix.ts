import { DOCUMENT_TYPES, type DocumentTypeDef } from '@/lib/legal-taxonomy';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { DocumentTemplates } from './documentTemplates';

export type DocumentSupportStatus =
  | 'SUPPORTED'
  | 'NEEDS_INPUT'
  | 'NOT_APPLICABLE'
  | 'MISSING_STRATEGY'
  | 'MISSING_TEMPLATE'
  | 'DEPRECATED'
  | 'LEGACY_SAFE_FALLBACK';

export interface DocumentSupportMatrixRow {
  tab: string;
  label: string;
  canonicalId: string;
  strategyId?: string;
  templateId?: string;
  status: DocumentSupportStatus;
  notes: string;
}

const GENERIC_FAMILY_IDS = new Set(['amparo_directo', 'amparo_indirecto']);

/** Inventario determinista del catálogo visible. */
export function buildDocumentSupportMatrix(
  documentTypes: readonly DocumentTypeDef[] = DOCUMENT_TYPES,
): DocumentSupportMatrixRow[] {
  return documentTypes.map((definition) => {
    const template = DocumentTemplates[definition.value];
    const catalogEntry = getCatalogDocument(definition.value);
    if (definition.value === 'otro') {
      return {
        tab: definition.category || 'otro',
        label: definition.label,
        canonicalId: definition.value,
        strategyId: 'escrito_libre',
        templateId: 'escrito_libre',
        status: 'LEGACY_SAFE_FALLBACK',
        notes: 'Solo sin selectedDocumentType explícito; usa el customValue como rótulo.',
      };
    }
    if (catalogEntry?.kind === 'FAMILY' && GENERIC_FAMILY_IDS.has(definition.value)) {
      return {
        tab: definition.category || 'general',
        label: definition.label,
        canonicalId: definition.value,
        status: 'NOT_APPLICABLE',
        notes: 'Familia genérica; debe solicitarse un ID documental específico.',
      };
    }
    if (!template) {
      return {
        tab: definition.category || 'general',
        label: definition.label,
        canonicalId: definition.value,
        status: 'MISSING_TEMPLATE',
        notes: 'Existe en taxonomía, pero no hay strategy/template generable.',
      };
    }
    return {
      tab: definition.category || 'general',
      label: definition.label,
      canonicalId: definition.value,
      strategyId: template.tipo,
      templateId: template.tipo,
      status: 'SUPPORTED',
      notes: 'Routing explícito y template canónico disponibles; faltantes se validan en generación.',
    };
  });
}
