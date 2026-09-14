/**
 * lib/legal-taxonomy/index.ts
 * Índice central — única fuente de verdad para toda taxonomía jurídica.
 * Las 4 pestañas deben consumir este módulo. §4
 */

export * from './matters';
export * from './jurisdictions';
export * from './documentTypes';
export * from './procedures';
export * from '../catalog/legalCatalog';

import { MATTERS } from './matters';
import { JURISDICTIONS } from './jurisdictions';
import { DOCUMENT_TYPES } from './documentTypes';
import { LEGAL_CATALOG_REGISTRY } from '../catalog/legalCatalog';

export const TAXONOMY = {
  matters: MATTERS,
  jurisdictions: JURISDICTIONS,
  documentTypes: DOCUMENT_TYPES,
  catalog: LEGAL_CATALOG_REGISTRY,
} as const;

// ─── "Otro" + customValue ( §8 ) ────────────────────────────────────────────

export const CUSTOM_VALUE_MAX_LENGTH = 80;

export interface CustomTaxonomyValue {
  value: string; // "otro" | "otra"
  label: string; // "Otro" / "Otra"
  customValue: string; // valor especificado por el usuario (1..80 chars)
}

export function sanitizeCustomValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, CUSTOM_VALUE_MAX_LENGTH);
  if (trimmed.length < 2) return null;
  if (trimmed.length > CUSTOM_VALUE_MAX_LENGTH) return null;
  return trimmed;
}

export function validateCustomTaxonomyValue(input: unknown): { ok: true; value: CustomTaxonomyValue } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'INVALID_CUSTOM_VALUE' };
  const obj = input as Record<string, unknown>;
  const value = typeof obj.value === 'string' ? obj.value.trim().toLowerCase() : '';
  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  const customValue = sanitizeCustomValue(obj.customValue);
  if (value !== 'otro' && value !== 'otra') return { ok: false, error: 'VALUE_MUST_BE_OTRO' };
  if (!customValue) return { ok: false, error: 'CUSTOM_VALUE_REQUIRED' };
  if (customValue.length > CUSTOM_VALUE_MAX_LENGTH) return { ok: false, error: 'CUSTOM_VALUE_TOO_LONG' };
  return { ok: true, value: { value, label: label || 'Otro', customValue } };
}

export interface LegalTaxonomySelection {
  matter: string; // value de MATTERS
  matterCustom?: CustomTaxonomyValue | null;
  jurisdiction: string;
  jurisdictionCustom?: CustomTaxonomyValue | null;
  documentType: string;
  documentTypeCustom?: CustomTaxonomyValue | null;
  procedure?: string | null;
  via?: string | null;
  authority?: string | null;
}

/**
 * Resuelve el label efectivo para mostrar/generar: si es "otro" usa customValue, si no el label canónico.
 */
export function resolveEffectiveLabel(
  value: string,
  custom: CustomTaxonomyValue | null | undefined,
  catalog: Array<{ value: string; label: string }>
): string {
  const norm = value?.trim().toLowerCase();
  if ((norm === 'otro' || norm === 'otra') && custom?.customValue) return custom.customValue;
  const found = catalog.find((c) => c.value === norm);
  return found?.label || value;
}

export function resolveMatterLabel(sel: LegalTaxonomySelection): string {
  return resolveEffectiveLabel(sel.matter, sel.matterCustom || null, MATTERS);
}
export function resolveJurisdictionLabel(sel: LegalTaxonomySelection): string {
  return resolveEffectiveLabel(sel.jurisdiction, sel.jurisdictionCustom || null, JURISDICTIONS);
}
export function resolveDocumentTypeLabel(sel: LegalTaxonomySelection): string {
  return resolveEffectiveLabel(sel.documentType, sel.documentTypeCustom || null, DOCUMENT_TYPES);
}

/**
 * Para viaje UI → API → pipeline → metadata.
 * Serializa la selección completa a un objeto plano que puede ir en legalContext / generationMetadata.
 */
export function serializeTaxonomyForPipeline(sel: LegalTaxonomySelection): Record<string, unknown> {
  return {
    matter: sel.matter,
    matterLabel: resolveMatterLabel(sel),
    matterCustom: sel.matterCustom || null,
    jurisdiction: sel.jurisdiction,
    jurisdictionLabel: resolveJurisdictionLabel(sel),
    jurisdictionCustom: sel.jurisdictionCustom || null,
    documentType: sel.documentType,
    documentTypeLabel: resolveDocumentTypeLabel(sel),
    documentTypeCustom: sel.documentTypeCustom || null,
    procedure: sel.procedure || null,
    via: sel.via || null,
    authority: sel.authority || null,
  };
}
