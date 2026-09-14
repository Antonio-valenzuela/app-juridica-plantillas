/**
 * lib/legal-taxonomy/procedures.ts
 * Proyección legacy de procedimientos; el árbol completo vive en el registry.
 */

import { getLegacyProcedures } from '@/lib/catalog/legalCatalog';

export interface TaxonomyItem {
  value: string;
  label: string;
  description?: string;
}

export const PROCEDURES: TaxonomyItem[] = getLegacyProcedures();

export const VIAS: TaxonomyItem[] = [
  { value: 'jurisdiccional', label: 'Jurisdiccional' },
  { value: 'administrativa', label: 'Administrativa' },
  { value: 'constitucional', label: 'Constitucional' },
  { value: 'electoral', label: 'Electoral' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'otra', label: 'Otra' },
];

export const AUTHORITIES: TaxonomyItem[] = [
  { value: 'juzgado_distrito', label: 'Juzgado de Distrito' },
  { value: 'tribunal_colegiado', label: 'Tribunal Colegiado' },
  { value: 'suprema_corte', label: 'Suprema Corte de Justicia de la Nación' },
  { value: 'juzgado_civil', label: 'Juzgado Civil' },
  { value: 'juzgado_familiar', label: 'Juzgado Familiar' },
  { value: 'junta_conciliacion', label: 'Junta de Conciliación / Tribunal Laboral' },
  { value: 'tfja', label: 'Tribunal Federal de Justicia Administrativa' },
  { value: 'otra', label: 'Otra' },
];

export const AREAS: TaxonomyItem[] = [
  { value: 'federal', label: 'Federal' },
  { value: 'estatal', label: 'Estatal' },
  { value: 'municipal', label: 'Municipal' },
  { value: 'otra', label: 'Otra' },
];
