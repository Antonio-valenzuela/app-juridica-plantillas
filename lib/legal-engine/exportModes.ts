export type ExportMode = 'DRAFT' | 'FINAL';

export const DRAFT_EXPORT_NOTICE = 'BORRADOR PARA REVISIÓN DEL ABOGADO · NO PRESENTAR SIN REVISIÓN';

export function resolveExportMode(value: unknown): ExportMode | null {
  return value === 'DRAFT' || value === 'FINAL' ? value : null;
}
