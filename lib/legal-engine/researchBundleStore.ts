import type { LegalResearchBundle } from './legal-research/types';

/**
 * Almacén de bundles de investigación verificada, por propietario y expediente (Lote 7).
 *
 * Confianza: solo la ruta de investigación (con consentimiento explícito) escribe aquí. El cliente nunca
 * envía bundles a la generación: la generación los toma de este almacén por propietario y expediente.
 *
 * PENDIENTE DE MIGRAR: hoy vive en memoria del proceso (se pierde al reiniciar). Migrar a la persistencia
 * de trabajos cuando se autorice (no se toca Prisma en este lote).
 */
const STORE = new Map<string, Map<string, LegalResearchBundle>>();

export function researchStoreKey(ownerKey: string, expediente: string): string {
  return `${ownerKey}::${expediente.trim().toLowerCase().replace(/\s+/g, '')}`;
}

/** Guarda (reemplaza) los bundles de un propietario y expediente. Devuelve cuántos quedaron. */
export function saveResearchBundles(key: string, bundles: readonly LegalResearchBundle[]): number {
  const byIssue = new Map(bundles.map((bundle) => [bundle.legalIssueId, bundle]));
  STORE.set(key, byIssue);
  return byIssue.size;
}

/**
 * Aviso global cuando el trabajo no tiene investigación verificada: sus fundamentos no están verificados.
 * Se muestra en las incidencias del documento generado. Devuelve null si hay bundles.
 */
export function unverifiedFundamentalsNotice(bundles: ReadonlyMap<string, LegalResearchBundle>): string | null {
  if (bundles.size > 0) return null;
  return 'Fundamentos no verificados: este trabajo no tiene investigación oficial verificada. Las normas, tesis y precedentes citados deben verificarse en fuente oficial antes de usar el escrito.';
}

/** Bundles por issue; vacío si no hay investigación para ese propietario y expediente. */
export function loadResearchBundles(key: string): Map<string, LegalResearchBundle> {
  return new Map(STORE.get(key) ?? []);
}
