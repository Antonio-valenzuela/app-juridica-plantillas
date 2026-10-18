import { isSectionContractId, requiredSectionTitle } from '@/lib/legal-engine/documentStrategies';

/** Clave comparable de un rótulo: sin acentos, minúsculas y sin espacios repetidos. */
export function normalizeSectionLabel(value: string): string {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface CoverageSection {
  title?: string;
  content?: Array<{ text?: string }>;
}

/**
 * Secciones requeridas que NO están presentes. Para los IDs de contrato (demanda civil y mercantil) el
 * ID se traduce a su título visible con `requiredSectionTitle`, que lanza si el ID no tiene título:
 * nunca hay un fallback silencioso. Además, una sección de contrato presente debe tener cuerpo.
 */
export function missingRequiredSections(requiredSections: readonly string[], sections: readonly CoverageSection[]): string[] {
  return requiredSections.filter((required) => {
    const key = normalizeSectionLabel(requiredSectionTitle(required));
    const matches = sections.filter((section) => {
      const title = normalizeSectionLabel(section.title || '');
      return title.length > 0 && (title.includes(key) || key.includes(title));
    });
    if (matches.length === 0) return true;
    if (!isSectionContractId(required)) return false;
    return !matches.some((section) => (section.content || []).some((block) => String(block.text || '').trim().length > 0));
  });
}
