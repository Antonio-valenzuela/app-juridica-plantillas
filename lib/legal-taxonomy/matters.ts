/**
 * lib/legal-taxonomy/matters.ts
 * Proyección legacy del registry jurídico; conserva valores consumidos por la UI.
 */

import { getLegacyMatters } from '@/lib/catalog/legalCatalog';

export interface LegalMatterDef {
  value: string; // id normalizado (lowercase, sin acentos)
  label: string;
  description?: string;
  icon?: string;
}

export const MATTERS: LegalMatterDef[] = getLegacyMatters().map((matter) => ({ ...matter }));

export function getMatterByValue(value: string): LegalMatterDef | undefined {
  const norm = value?.trim().toLowerCase();
  return MATTERS.find((m) => m.value === norm);
}

export function isValidMatter(value: string): boolean {
  return MATTERS.some((m) => m.value === value?.trim().toLowerCase());
}

export const MATTER_VALUES = MATTERS.map((m) => m.value) as unknown as [string, ...string[]];
