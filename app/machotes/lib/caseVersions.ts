import type { WorkspaceCaseSummary } from '@/lib/workspace/cases';

/**
 * Agrupa, solo para presentación, los borradores del mismo escrito y expediente: cada generación persiste un
 * borrador nuevo (con su fecha al final del título), así que el abogado veía filas repetidas. No une, borra ni
 * modifica datos: cada versión conserva su ID y se puede abrir por separado.
 */
export interface CaseVersionGroup {
  key: string;
  /** Versión más reciente (la que encabeza la fila). */
  latest: WorkspaceCaseSummary;
  /** Todas las versiones, de la más reciente a la más antigua. */
  versions: WorkspaceCaseSummary[];
}

const TRAILING_DATE = /\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/;

/** Nombre del escrito sin la fecha de generación que se añade al final del título. */
export function caseWritingName(title: string): string {
  return title.replace(TRAILING_DATE, '').trim();
}

function groupKey(item: WorkspaceCaseSummary): string | null {
  // Los expedientes locales del abogado y los borradores sin expediente nunca se agrupan.
  if (item.kind === 'LOCAL_CASE' || !item.expediente?.trim()) return null;
  return [caseWritingName(item.title).toLocaleLowerCase('es-MX'), item.expediente.trim().toLocaleLowerCase('es-MX'), (item.matter || '').toLocaleLowerCase('es-MX')].join('\u0000');
}

const time = (item: WorkspaceCaseSummary) => {
  const value = Date.parse(item.updatedAt);
  return Number.isNaN(value) ? 0 : value;
};

/** Conserva el orden de la lista (primera aparición de cada grupo); dentro del grupo, la más reciente primero. */
export function groupCaseVersions(cases: WorkspaceCaseSummary[]): CaseVersionGroup[] {
  const groups = new Map<string, WorkspaceCaseSummary[]>();
  const order: string[] = [];
  for (const item of cases) {
    const key = groupKey(item) ?? `id:${item.id}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(item);
  }
  return order.map((key) => {
    const versions = [...groups.get(key)!].sort((a, b) => time(b) - time(a));
    return { key, latest: versions[0], versions };
  });
}
