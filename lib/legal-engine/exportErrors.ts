/**
 * Convierte errores de validación serializados como texto u objetos en un
 * mensaje que pueda leer el abogado. La UI nunca debe usar Array#join sobre
 * objetos porque eso produce el engañoso texto "[object Object]".
 */
export function formatExportIssues(value: unknown): string {
  if (value == null) return '';

  if (Array.isArray(value)) {
    return value
      .map((item) => formatExportIssues(item))
      .filter(Boolean)
      .join(' | ');
  }

  if (typeof value === 'string') {
    if (value.includes('LIFECYCLE_NOT_EXPORTABLE')) {
      return 'El documento aún está en borrador o revisión. Completa los campos pendientes y pulsa "Finalizar revisión" para habilitar la exportación oficial.';
    }
    return value;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') return formatExportIssues(record.message);
    if (typeof record.friendlyMessage === 'string') return formatExportIssues(record.friendlyMessage);
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return String(value);
}
