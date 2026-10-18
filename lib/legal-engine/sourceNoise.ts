import type { UploadedSourceDocument } from './types';

/**
 * Ruido que los PDF oficiales meten en el texto extraído y que NO es parte del documento:
 *  - sellos de firma electrónica de la «versión pública» («AARÓN … 706a66…  20/10/28 13:41:15  PJF - Versión Pública»),
 *    partidos en varias líneas y caídos EN MEDIO de las frases;
 *  - volcados de bytes hexadecimales de la firma («b5 ac 60 8f 31 …») y cadenas hexadecimales largas;
 *  - marcas de página («- 22 -»).
 *
 * Si se dejan, se citan como si fueran del expediente, interrumpen las frases y hasta se toman por nombres de
 * parte. Se limpian al entrar a las fuentes del motor y, como red de seguridad, en el texto generado.
 */

// Sello completo en una sola línea (como queda al citarlo dentro de un párrafo).
const SEAL_INLINE = /(?:[A-ZÁÉÍÓÚÑ.]{2,}[ \t]+){1,6}[0-9a-f]{24,}[ \t]+\d{1,2}\/\d{1,2}\/\d{2,4}[ \t]+\d{1,2}:\d{2}:\d{2}[ \t]*(?:PJF[ \t]*)?-?[ \t]*Versi[oó]n[ \t]+P[uú]blica\.?/g;
const HEX_RUN = /(?:\b[0-9a-f]{2}\b[ \t\r\n]+){7,}\b[0-9a-f]{2}\b/gi;
const LONG_HEX = /\b[0-9a-f]{24,}\b/gi;
const SEAL_TAIL = /\d{1,2}\/\d{1,2}\/\d{2,4}[ \t\r\n]+\d{1,2}:\d{2}:\d{2}[ \t\r\n]*(?:PJF[ \t\r\n]*)?-?[ \t\r\n]*Versi[oó]n[ \t\r\n]+P[uú]blica\.?/gi;
const PAGE_MARK_LINE = /^[ \t]*-[ \t]*\d{1,4}[ \t]*-[ \t]*$/gm;
// Renglón con solo el nombre del firmante (MAYÚSCULAS) justo antes de la cadena hexadecimal del sello.
const SIGNER_BEFORE_HEX = /^[ \t]*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]*(?:[ \t]+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ.]*){1,6}[ \t]*\r?\n[ \t]*(?=[0-9a-f]{24,}\b)/gim;

const hasDigits = (token: string) => /\d/.test(token);

/** Quita sellos, volcados hexadecimales y marcas de página; devuelve el texto y cuántos fragmentos se retiraron. */
export function stripSourceNoise(text: string): { text: string; removed: number } {
  if (!text) return { text: text || '', removed: 0 };
  let removed = 0;
  const count = <T extends string>(replacement: T) => () => { removed++; return replacement; };
  let out = text;
  out = out.replace(SEAL_INLINE, count(''));
  out = out.replace(SIGNER_BEFORE_HEX, count(''));
  out = out.replace(LONG_HEX, count(''));
  out = out.replace(SEAL_TAIL, count(''));
  // Bytes sueltos: solo si la corrida parece volcado (la mayoría de los pares lleva algún dígito).
  out = out.replace(HEX_RUN, (run) => {
    const tokens = run.trim().split(/\s+/);
    if (tokens.filter(hasDigits).length < Math.ceil(tokens.length * 0.5)) return run;
    removed++;
    return '';
  });
  out = out.replace(PAGE_MARK_LINE, count(''));
  if (removed === 0) return { text, removed: 0 };
  // Sin los sellos quedan renglones vacíos o con tabuladores sueltos en medio de las frases.
  out = out.replace(/[ \t]+\r?\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  // Un renglón en blanco seguido de minúscula es una frase partida por el sello: se vuelve a unir.
  out = out.replace(/([^\n.:;?!)])\n\n(?=[a-záéíóúñ])/g, '$1\n');
  return { text: out, removed };
}

/** Identificadores internos de la aplicación que nunca deben leerse en un escrito. */
const INTERNAL_ID = /\bpending-upload-\d+(?:-\d+)?\b/gi;

export function stripInternalIds(text: string): string {
  return text.replace(INTERNAL_ID, '').replace(/[ \t]{2,}/g, ' ');
}

/** Copia de la fuente con el texto limpio (páginas, texto extraído y contenido). No toca el original. */
export function sanitizeSourceDocument<T extends UploadedSourceDocument>(source: T): T {
  let removed = 0;
  const clean = (value?: string) => {
    if (!value) return value;
    const result = stripSourceNoise(value);
    removed += result.removed;
    return result.text;
  };
  const pages = source.pages?.map((page) => {
    const text = clean(page.text) ?? '';
    return text === page.text ? page : { ...page, text, chars: text.length };
  });
  const extractedText = clean(source.extractedText);
  const content = clean(source.content);
  if (removed === 0) return source;
  return { ...source, ...(pages ? { pages } : {}), ...(extractedText !== undefined ? { extractedText } : {}), ...(content !== undefined ? { content } : {}) };
}
