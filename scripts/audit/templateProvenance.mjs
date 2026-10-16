import { DocumentTemplates, familyDerivedTemplateFor, getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';

/**
 * Procedencia de la plantilla de un tipo documental.
 *
 * Reutiliza el resolver real de producción (`getDocumentTemplate`, que a su vez prioriza la plantilla directa y
 * después la derivada por el motor de familias) en lugar de volver a implementar esa prioridad. Solo clasifica el
 * resultado comparando identidad con los dos registros:
 *  - DIRECT:         el resolver devolvió la plantilla declarada en `DocumentTemplates[id]`.
 *  - FAMILY_DERIVED: el resolver devolvió la plantilla registrada por el motor de familias para ese id.
 *  - NONE:           el resolver lanzó error o devolvió la plantilla de OTRO tipo (alias, estrategia o fallback);
 *                    eso no cuenta como plantilla propia del id.
 */
export const TEMPLATE_SOURCE = Object.freeze({
  DIRECT: 'DIRECT',
  FAMILY_DERIVED: 'FAMILY_DERIVED',
  NONE: 'NONE',
});

export function resolveTemplateProvenance(templateId) {
  const id = String(templateId || '').trim();
  const none = { source: TEMPLATE_SOURCE.NONE, template: undefined };
  if (!id) return none;
  let resolved;
  try {
    resolved = getDocumentTemplate(id);
  } catch {
    return none;
  }
  if (!resolved || resolved.tipo !== id) return none;
  if (DocumentTemplates[id] === resolved) return { source: TEMPLATE_SOURCE.DIRECT, template: resolved };
  if (familyDerivedTemplateFor(id) === resolved) return { source: TEMPLATE_SOURCE.FAMILY_DERIVED, template: resolved };
  return none;
}
