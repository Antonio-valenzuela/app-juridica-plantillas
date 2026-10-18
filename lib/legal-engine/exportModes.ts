export type ExportMode = 'DRAFT' | 'FINAL';

export const DRAFT_EXPORT_NOTICE = 'BORRADOR PARA REVISIÓN DEL ABOGADO - NO PRESENTAR SIN REVISIÓN';
export const UNSAVED_DRAFT_EXPORT_NOTICE = 'BORRADOR NO GUARDADO EN EL EXPEDIENTE - NO PRESENTAR SIN REVISIÓN DEL ABOGADO';

export function resolveExportMode(value: unknown): ExportMode | null {
  return value === 'DRAFT' || value === 'FINAL' ? value : null;
}
