/**
 * Catálogo de leyes federales vigentes a partir del índice oficial de la Cámara de Diputados
 * (https://www.diputados.gob.mx/LeyesBiblio/index.htm). Solo metadatos públicos: título, sigla,
 * fecha de publicación original, fecha de última reforma y enlaces oficiales. No incluye texto.
 */

export const FEDERAL_LAWS_INDEX_URL = 'https://www.diputados.gob.mx/LeyesBiblio/index.htm';
const BASE = 'https://www.diputados.gob.mx/LeyesBiblio/';

export interface FederalLawEntry {
  sigla: string;
  titulo: string;
  pdf_url: string;
  ref_url?: string;
  /** Publicación original en el DOF (AAAA-MM-DD). */
  publicacion_original?: string;
  /** Última reforma publicada en el DOF (AAAA-MM-DD); ausente si el índice no trae una fecha DOF. */
  ultima_reforma?: string;
  /** Texto literal de la columna de reforma cuando no es una fecha DOF (p. ej. «Notificación 17/06/2025 Sentencia SCJN»). */
  ultima_reforma_nota?: string;
  /** Nota de vigencia del índice (p. ej. «Abrogado en un plazo que no exceda del 01/04/2027»). */
  nota_vigencia?: string;
}

export interface FederalLawsCatalog {
  source: string;
  retrievedAt: string;
  sourceHash: string;
  laws: FederalLawEntry[];
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü' };

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|[a-zA-Z]+);/g, (whole, name: string) => name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : ENTITIES[name] ?? whole)
    .replace(/\s+/g, ' ')
    .trim();
}

function isoFromDof(value: string | undefined): string | undefined {
  const match = value?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

/** El índice escribe la primera palabra en mayúsculas («LEY de Amparo…»): se normaliza solo esa palabra. */
function displayTitle(raw: string): string {
  return raw.replace(/^([A-ZÁÉÍÓÚÑ]{2,})(?=\s)/, (word) => word.charAt(0) + word.slice(1).toLocaleLowerCase('es-MX'));
}

export function parseFederalLawsIndex(html: string): FederalLawEntry[] {
  const laws = new Map<string, FederalLawEntry>();
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const pdf = row.match(/href="(pdf\/([^"/]+)\.pdf)"/i);
    const ref = row.match(/<a[^>]+href="(ref\/[^"]+\.htm)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!pdf || !ref) continue;
    const titulo = displayTitle(text(ref[2]));
    if (titulo.length < 8) continue;
    const sigla = pdf[2];
    if (laws.has(sigla)) continue;
    // Celdas: [n.º] [título + publicación original + notas] [última reforma] [archivos].
    const cells = row.split(/<td\b[^>]*>/i).slice(1);
    const titleIndex = cells.findIndex((cell) => cell.includes(ref[1]));
    const titleCell = text(cells[titleIndex] ?? '');
    const reformCell = text(cells[titleIndex + 1] ?? '');
    const reform = reformCell.match(/^DOF\s+(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
    const reformDate = reform?.[1];
    const reformRemark = reform ? reform[2].trim() : reformCell;
    const note = titleCell.match(/\(([^)]*(?:abroga|deroga|vigor|plazo|vigencia)[^)]*)\)/i)?.[1];
    // Algunos PDF tienen nombre numérico («79.pdf»): la sigla visible sale entonces de la ficha `ref/`.
    const visibleSigla = /[A-Za-z]/.test(sigla) ? sigla : (ref[1].match(/ref\/([^/.]+)\.htm/i)?.[1] || sigla).toUpperCase();
    laws.set(sigla, {
      sigla: visibleSigla,
      titulo,
      pdf_url: BASE + pdf[1],
      ref_url: BASE + ref[1],
      publicacion_original: isoFromDof(titleCell.match(/DOF\s+(\d{2}\/\d{2}\/\d{4})/)?.[1]),
      ...(reformDate ? { ultima_reforma: isoFromDof(reformDate) } : {}),
      ...(reformRemark ? { ultima_reforma_nota: reformRemark } : {}),
      ...(note ? { nota_vigencia: note.trim() } : {}),
    });
  }
  return [...laws.values()];
}
