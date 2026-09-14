/**
 * Normaliza la selección documental que puede venir del formulario directo o
 * del objeto taxonomy. "otro/otra" describe una opción libre, no un ID
 * canónico generable, por lo que conserva el fallback legacy a escrito_libre.
 */
export function resolveSelectedDocumentType(
  directValue?: string,
  taxonomy?: { documentType?: string | null } | null,
): string | undefined {
  const candidate = String(directValue || taxonomy?.documentType || '').trim().toLowerCase();
  if (!candidate || candidate === 'otro' || candidate === 'otra') return undefined;
  return candidate;
}
