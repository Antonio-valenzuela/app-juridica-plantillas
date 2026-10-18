/**
 * Detección de redundancia: párrafos duplicados y casi duplicados.
 *
 * Similitud por n-gramas de palabras (shingles) y coeficiente de Jaccard. Se usa para
 * (a) detectar bloques duplicados en la salida generada y (b) impedir que una meta de
 * extensión se alcance repitiendo contenido.
 */

export interface ParagraphRef {
  /** Identificador estable del párrafo (p. ej. `${sectionId}/${blockId}#${index}`). */
  id: string;
  text: string;
}

export interface RedundantPair {
  a: ParagraphRef;
  b: ParagraphRef;
  similarity: number;
  exact: boolean;
}

/** Párrafos más cortos que esto no se comparan: fórmulas breves («PRIMERO.») se repiten con razón. */
export const MIN_COMPARABLE_CHARS = 80;
export const DEFAULT_NEAR_DUPLICATE_THRESHOLD = 0.8;

export function normalizeForComparison(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function shingles(text: string, size = 4): Set<string> {
  const words = normalizeForComparison(text).split(' ').filter(Boolean);
  const result = new Set<string>();
  if (words.length <= size) {
    if (words.length > 0) result.add(words.join(' '));
    return result;
  }
  for (let index = 0; index + size <= words.length; index++) result.add(words.slice(index, index + size).join(' '));
  return result;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

export function splitParagraphs(text: string): string[] {
  return String(text || '').split(/\n\s*\n|\r?\n/).map((part) => part.trim()).filter(Boolean);
}

/** Pares de párrafos idénticos o casi idénticos (por encima del umbral). */
export function findRedundantParagraphs(
  paragraphs: readonly ParagraphRef[],
  threshold = DEFAULT_NEAR_DUPLICATE_THRESHOLD,
): RedundantPair[] {
  const comparable = paragraphs
    .map((paragraph) => ({ paragraph, normalized: normalizeForComparison(paragraph.text) }))
    .filter((entry) => entry.normalized.length >= MIN_COMPARABLE_CHARS)
    .map((entry) => ({ ...entry, set: shingles(entry.paragraph.text) }));
  const pairs: RedundantPair[] = [];
  for (let i = 0; i < comparable.length; i++) {
    for (let j = i + 1; j < comparable.length; j++) {
      const exact = comparable[i].normalized === comparable[j].normalized;
      const similarity = exact ? 1 : jaccard(comparable[i].set, comparable[j].set);
      if (similarity >= threshold) pairs.push({ a: comparable[i].paragraph, b: comparable[j].paragraph, similarity, exact });
    }
  }
  return pairs;
}

/**
 * Proporción de texto redundante: caracteres de los párrafos que repiten a uno anterior
 * (≥ umbral) sobre el total de caracteres comparables. 0 = sin redundancia.
 */
export function redundancyRatio(
  paragraphs: readonly ParagraphRef[],
  threshold = DEFAULT_NEAR_DUPLICATE_THRESHOLD,
): { ratio: number; redundantChars: number; totalChars: number; pairs: RedundantPair[] } {
  const pairs = findRedundantParagraphs(paragraphs, threshold);
  const redundantIds = new Set(pairs.map((pair) => pair.b.id));
  const comparable = paragraphs.filter((paragraph) => normalizeForComparison(paragraph.text).length >= MIN_COMPARABLE_CHARS);
  const totalChars = comparable.reduce((sum, paragraph) => sum + paragraph.text.length, 0);
  const redundantChars = comparable.filter((paragraph) => redundantIds.has(paragraph.id)).reduce((sum, paragraph) => sum + paragraph.text.length, 0);
  return { ratio: totalChars === 0 ? 0 : redundantChars / totalChars, redundantChars, totalChars, pairs };
}
