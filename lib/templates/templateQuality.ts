export function hasPendingMarkers(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasPendingMarkers(item));
  if (typeof value !== 'string') return false;
  return /\[PENDIENTE:[^\]]+\]/i.test(value);
}

export const DRAFT_WARNING = 'BORRADOR — REQUIERE REVISIÓN PROFESIONAL';
