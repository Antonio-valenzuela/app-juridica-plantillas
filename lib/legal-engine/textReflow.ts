/**
 * textReflow.ts
 *
 * Reconstrucción de párrafos a partir de renglones envueltos (PDF nativo u OCR).
 * Un PDF entrega un salto de línea por renglón visual: sin esta reconstrucción,
 * cada renglón de un hecho o de una prestación se trataba como un elemento
 * independiente ("del local comercial número 4…" acababa como otra prestación).
 *
 * Reglas (genéricas, no dependen de un documento concreto). Un renglón INICIA un
 * párrafo nuevo cuando:
 *  - es un encabezado estructural (HECHOS, PRESTACIONES, PUNTOS PETITORIOS…) o
 *    lo es el renglón anterior;
 *  - inicia una enumeración (1., A), I., PRIMERO., HECHO 3, viñeta);
 *  - es una fórmula de cierre (PROTESTO…, ATENTAMENTE) o una línea de lugar y fecha;
 *  - hay transición entre un renglón en mayúsculas (encabezado, destinatario,
 *    etiqueta) y uno en texto normal, o viceversa;
 *  - fuera de una enumeración, el renglón anterior termina la oración y el actual
 *    empieza con mayúscula.
 * Dentro de una enumeración, los renglones se unen hasta el siguiente elemento o
 * encabezado: un hecho de varias oraciones se conserva completo.
 */

const STRUCTURAL_HEADING_RE = new RegExp(
  '^\\s*(?:[IVXLC]+[.)-]?\\s+)?(?:'
  + 'H\\s*E\\s*C\\s*H\\s*O\\s*S?|ANTECEDENTES?|PRESTACION(?:ES)?|PRETENSION(?:ES)?|PRUEBAS?|OFRECIMIENTO\\s+DE\\s+PRUEBAS|DERECHO|FUNDAMENTOS?(?:\\s+DE\\s+DERECHO)?|'
  + '(?:PUNTOS\\s+)?PETITORIOS?|EXCEPCIONES(?:\\s+Y\\s+DEFENSAS)?|DEFENSAS|CONTESTACI[ÓO]N\\s+(?:A\\s+|DE\\s+)?(?:LOS\\s+|LAS\\s+)?(?:HECHOS|PRESTACIONES)|'
  + 'AGRAVIOS?|CONCEPTOS?\\s+DE\\s+VIOLACI[ÓO]N|RESULTANDOS?|CONSIDERANDOS?|RESUELVE|RESOLUTIVOS?|PUNTOS\\s+RESOLUTIVOS|'
  + 'PERSONALIDAD|COMPETENCIA|V[ÍI]A|CAPÍTULO\\s+[IVXLC\\d]+|CAP[IÍ]TULO\\s+DE\\s+\\w+'
  + ')\\s*[:.\\-]?\\s*$',
  'i',
);

const LIST_ITEM_RE = /^\s*(?:(?:HECHO|PRESTACI[ÓO]N|AGRAVIO|CONCEPTO\s+DE\s+VIOLACI[ÓO]N)\s+(?:\d{1,3}|[IVXLC]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\b|\d{1,3}\s*[.)\-]\s|[A-Za-z]\)\s|[A-Z]\.\s|[IVXLC]{1,6}[.)]\s|(?:PRIMER[OA]?|SEGUND[OA]|TERCER[OA]?|CUART[OA]|QUINT[OA]|SEXT[OA]|S[ÉE]PTIM[OA]|OCTAV[OA]|NOVEN[OA]|D[ÉE]CIM[OA])\s*[.:\-]\s|[-•*–]\s)/;

const CLOSING_RE = /^\s*(?:PROTESTO|ATENTAMENTE|BAJO\s+PROTESTA|SUFRAGIO\s+EFECTIVO|P\s*R\s*E\s*S\s*E\s*N\s*T\s*E\b)/i;
const PLACE_DATE_RE = /^\s*[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .]+,\s*(?:[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ .]+,\s*)?a\s+\d{1,2}\s+de\s+[a-záéíóúñ]+\s+(?:de|del)\s+\d{4}\.?\s*$/;

export function isStructuralHeading(line: string): boolean {
  return STRUCTURAL_HEADING_RE.test(line);
}

export function startsListItem(line: string): boolean {
  return LIST_ITEM_RE.test(line);
}

export function isClosingLine(line: string): boolean {
  return CLOSING_RE.test(line) || PLACE_DATE_RE.test(line);
}

function isUpperLine(line: string): boolean {
  const letters = line.match(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g) || [];
  if (letters.length < 3) return false;
  const upper = letters.filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
  return upper / letters.length >= 0.85;
}

export interface ReflowState {
  /** El párrafo en curso empezó con una enumeración. */
  inItem: boolean;
}

/**
 * Decide si `current` continúa el párrafo que termina en `previous`.
 * `state` describe el párrafo en curso.
 */
export function continuesParagraph(previous: string, current: string, state: ReflowState): boolean {
  const prev = previous.trim();
  const cur = current.trim();
  if (!prev || !cur) return false;
  if (isStructuralHeading(prev) || isStructuralHeading(cur)) return false;
  if (startsListItem(cur)) return false;
  if (isClosingLine(cur) || isClosingLine(prev)) return false;
  // Etiqueta corta "EXPEDIENTE: 123/2025" en su propio renglón.
  if (/^[A-ZÁÉÍÓÚÑ .]{3,40}:\s*\S.{0,40}$/.test(prev) && isUpperLine(prev.split(':')[0])) return false;
  const prevUpper = isUpperLine(prev);
  const curUpper = isUpperLine(cur);
  if (prevUpper !== curUpper) return false;
  if (state.inItem) return true;
  const sentenceEnded = /[.:;!?»”"]$/.test(prev);
  const startsUpper = /^[A-ZÁÉÍÓÚÑ¿¡"“«(]/.test(cur);
  return !(sentenceEnded && startsUpper);
}

/** Agrupa renglones en párrafos lógicos. Los renglones se unen con un espacio. */
export function reflowLines(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let state: ReflowState = { inItem: false };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current.length) paragraphs.push(current.join(' '));
      current = [];
      state = { inItem: false };
      continue;
    }
    if (current.length && continuesParagraph(current[current.length - 1], line, state)) {
      current.push(line);
      continue;
    }
    if (current.length) paragraphs.push(current.join(' '));
    current = [line];
    state = { inItem: startsListItem(line) };
  }
  if (current.length) paragraphs.push(current.join(' '));
  return paragraphs;
}
