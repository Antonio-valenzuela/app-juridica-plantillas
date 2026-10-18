import type { PageTarget } from './pageTarget';

/**
 * Campo compartido de la solicitud de generación: todos los flujos (contestaciones, escritos iniciales,
 * Universal y el modal) usan este mismo constructor para que la meta llegue igual al servidor.
 * Sin meta válida no se añade el campo (el servidor aplica su comportamiento por defecto).
 */
export function pageTargetRequestField(pageTarget: PageTarget | null | undefined): { pageTarget?: { preset: string; pages: number } } {
  if (!pageTarget) return {};
  return { pageTarget: { preset: pageTarget.preset, pages: pageTarget.pages } };
}
