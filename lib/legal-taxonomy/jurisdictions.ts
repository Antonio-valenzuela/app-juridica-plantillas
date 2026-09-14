/**
 * lib/legal-taxonomy/jurisdictions.ts
 * Fuente única para jurisdicción / ámbito.
 * §6: Federal, Local, Estatal, Municipal, Administrativa, Electoral, Militar, Otra
 * No hardcodear CDMX como default.
 */

export interface JurisdictionDef {
  value: string;
  label: string;
  description?: string;
}

export const JURISDICTIONS: JurisdictionDef[] = [
  { value: 'federal', label: 'Federal', description: 'Poder Judicial de la Federación, SCJN, Juzgados de Distrito, Tribunales Colegiados' },
  { value: 'estatal', label: 'Estatal', description: 'Poder Judicial del Estado' },
  { value: 'local', label: 'Local', description: 'Juzgados locales, fueros comunes' },
  { value: 'municipal', label: 'Municipal', description: 'Autoridades municipales cuando proceda' },
  { value: 'administrativa', label: 'Administrativa', description: 'TFJA, Tribunales Administrativos estatales (TJAS), autoridades administrativas' },
  { value: 'electoral', label: 'Electoral', description: 'TEPJF, Tribunales electorales locales' },
  { value: 'militar', label: 'Militar', description: 'Justicia militar cuando corresponda' },
  { value: 'otra', label: 'Otra', description: 'Jurisdicción no listada (requiere especificar)' },
];

export function getJurisdictionByValue(value: string): JurisdictionDef | undefined {
  return JURISDICTIONS.find((j) => j.value === value?.trim().toLowerCase());
}

export function isValidJurisdiction(value: string): boolean {
  return JURISDICTIONS.some((j) => j.value === value?.trim().toLowerCase());
}

export const JURISDICTION_VALUES = JURISDICTIONS.map((j) => j.value) as unknown as [string, ...string[]];
