import { analyzePersonalTemplateText } from './personalTemplateBuilder';
import { resolveSectionKind, sectionKindKey, type TemplateSectionKind } from './sectionKind';

export type SectionKindOverrides = Record<string, TemplateSectionKind>;

export interface TemplatePreviewRow {
  key: string;
  title: string;
  autoKind: TemplateSectionKind;
  kind: TemplateSectionKind;
  overridden: boolean;
}

/** Qué secciones de la plantilla se conservan como fórmula y cuáles se reescriben, antes de generar. */
export function buildTemplateSectionPreview(templateText: string, overrides: SectionKindOverrides = {}): TemplatePreviewRow[] {
  if (!templateText?.trim()) return [];
  const { sections } = analyzePersonalTemplateText(templateText);
  return sections.map((section, index) => {
    const input = { title: section.title, text: section.preview || '', index, total: sections.length };
    const autoKind = resolveSectionKind(input);
    const key = sectionKindKey(section.title);
    const kind = resolveSectionKind(input, overrides);
    return { key, title: section.title, autoKind, kind, overridden: kind !== autoKind };
  });
}

/** Solo se aceptan claves de texto corto y los dos valores válidos; el servidor vuelve a validar. */
export function sanitizeSectionKinds(input: unknown): SectionKindOverrides | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: SectionKindOverrides = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 80)) {
    if ((value === 'FORMULA' || value === 'SUSTANTIVA') && key.length > 0 && key.length <= 120) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
