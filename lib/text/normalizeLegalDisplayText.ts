const MOJIBAKE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u00C3\x9altima/g, "Última"],
  [/\u00C3\x9altimo/g, "Último"],
  [/A\u00C3\xb1os/g, "Años"],
  [/a\u00C3\xb1os/g, "años"],
  [/P\u00C3\xbablicas/g, "Públicas"],
  [/P\u00C3\xbablico/g, "Público"],
  [/P\u00C3\xbablica/g, "Pública"],
  [/Protecci\u00C3\xb3n/g, "Protección"],
  [/Administraci\u00C3\xb3n/g, "Administración"],
  [/Cronol\u00C3\xb3gico/g, "Cronológico"],
  [/Art\u00C3\xadculo/g, "Artículo"],
  [/Relaci\u00C3\xb3n/g, "Relación"],
  [/M\u00C3\xa1s/g, "Más"],
  [/M\u00C3\xa9xico/g, "México"],
  [/Federaci\u00C3\xb3n/g, "Federación"],
  [/Secretar\u00C3\xada/g, "Secretaría"],
  [/Fiscal\u00C3\xada/g, "Fiscalía"],
  [/C\u00C3\x93DIGO/g, "CÓDIGO"],
  [/C\u00C3\xb3digo/g, "Código"],
  [/CONSTITUCI\u00C3\x93N/g, "CONSTITUCIÓN"],
  [/Constituci\u00C3\xb3n/g, "Constitución"],
  [/Energ\u00C3\xada/g, "Energía"],
  [/P\u00C3\xa1gina/g, "Página"],
  [/C\u00C3\xa1mara/g, "Cámara"],
  [/Jur\u00C3\xaddico/g, "Jurídico"],
];

const HTML_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;|&#160;/gi, " "],
  [/&quot;|&#34;/gi, '"'],
  [/&apos;|&#39;/gi, "'"],
  [/&amp;|&#38;/gi, "&"],
  [/&lt;|&#60;/gi, "<"],
  [/&gt;|&#62;/gi, ">"],
  [/&ldquo;|&rdquo;/gi, '"'],
  [/&lsquo;|&rsquo;/gi, "'"],
];

// Algunos extractores históricos devolvieron bytes UTF-8 interpretados como
// CP437. Por eso el texto llegó como `P├ígina` en vez de `Página`. Esta tabla
// permite reparar el patrón de forma general; no sustituye frases jurídicas
// concretas y solo acepta el resultado si vuelve a ser UTF-8 válido.
const CP437_EXTENDED =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»' +
  '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' +
  'αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

const CP437_REVERSE = new Map<string, number>(
  Array.from(CP437_EXTENDED).map((character, index) => [character, index + 0x80])
);

// El archivo histórico mezcla CP437 con algunos bytes CP1252. Este caso es
// deliberadamente pequeño: solo se usa como alternativa dentro de un
// segmento que ya contiene un marcador CP437.
const MIXED_CODEPAGE_REVERSE = new Map<string, number>([['®', 0xA9]]);

const CP437_MARKER_RE = /[░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀]/u;

function countMojibakeMarkers(value: string): number {
  return (value.match(/[ÃÂ├┤│╔╚╠═╬]/gu) || []).length;
}

function repairCp437Utf8Pairs(value: string): string {
  const chars = Array.from(value);
  let result = '';

  for (let index = 0; index < chars.length; index++) {
    const firstByte = CP437_REVERSE.get(chars[index]);
    const secondByte = index + 1 < chars.length
      ? CP437_REVERSE.get(chars[index + 1]) ?? MIXED_CODEPAGE_REVERSE.get(chars[index + 1])
      : undefined;

    if (firstByte !== undefined && firstByte >= 0xc2 && firstByte <= 0xf4 && secondByte !== undefined) {
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([firstByte, secondByte]));
        if (!CP437_MARKER_RE.test(decoded)) {
          result += decoded;
          index++;
          continue;
        }
      } catch {
        // No era un par UTF-8 válido; conservar los caracteres originales.
      }
    }

    result += chars[index];
  }

  return result;
}

function repairCp437Line(value: string): string {
  if (!CP437_MARKER_RE.test(value)) return value;

  const paired = repairCp437Utf8Pairs(value);
  if (paired !== value) return paired;

  const repairSegment = (segment: string): string => {
    const bytes: number[] = [];
    for (const character of segment) {
      const codePoint = character.codePointAt(0) || 0;
      if (codePoint <= 0x7f) {
        bytes.push(codePoint);
        continue;
      }
      const byte = CP437_REVERSE.get(character) ?? MIXED_CODEPAGE_REVERSE.get(character);
      if (byte === undefined) return segment;
      bytes.push(byte);
    }

    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      return countMojibakeMarkers(decoded) < countMojibakeMarkers(segment) ? decoded : segment;
    } catch {
      return segment;
    }
  };

  let result = '';
  let segment = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint <= 0x7f || CP437_REVERSE.has(character) || MIXED_CODEPAGE_REVERSE.has(character)) {
      segment += character;
    } else {
      result += repairSegment(segment) + character;
      segment = '';
    }
  }
  result += repairSegment(segment);
  return result;
}

function repairCp437Mojibake(value: string): string {
  // Reiniciar por línea evita que un carácter legítimo de otra codificación
  // impida reparar los fragmentos CP437 válidos del resto del documento.
  return value.split('\n').map(repairCp437Line).join('\n');
}

function normalizeEntitiesAndMojibake(value: string): string {
  if (!value) return "";

  let normalized = repairCp437Mojibake(value)
    .replace(/ÔÇö/g, '—')
    .replace(/ÔÇ£/g, '“')
    .replace(/ÔÇØ/g, '”')
    .replace(/ÔÇÖ/g, '’')
    .replace(/\u00C3\u00A1/g, "á")
    .replace(/\u00C3\u00A9/g, "é")
    .replace(/\u00C3\u00AD/g, "í")
    .replace(/\u00C3\u00B3/g, "ó")
    .replace(/\u00C3\u00BA/g, "ú")
    .replace(/\u00C3\u00B1/g, "ñ")
    .replace(/\u00C3\u009A/g, "Ú")
    .replace(/\u00C3\u0093/g, "Ó")
    .replace(/\u00C3\u0089/g, "É")

  for (const [pattern, replacement] of HTML_ENTITY_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(parseInt(decimal, 10)));

  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

/**
 * Normaliza texto jurídico conservando saltos de línea y párrafos.
 * Úsala en extracción, persistencia, render y exportación.
 */
export function normalizeLegalDocumentText(value: string | null | undefined): string {
  if (!value) return '';

  return normalizeEntitiesAndMojibake(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFD]/g, '')
    .replace(/[□■]+/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Normalización compacta para etiquetas y textos de interfaz. */
export function normalizeLegalDisplayText(value: string | null | undefined): string {
  return normalizeLegalDocumentText(value).replace(/\s+/g, ' ').trim();
}
