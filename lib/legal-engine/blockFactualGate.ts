/**
 * Control fáctico por bloque (audit P1-3). Se ejecuta ANTES de aceptar un bloque generado, tanto en las
 * secciones como en la ampliación. Una fecha o un monto que no aparece en el material del expediente
 * rechaza el bloque, con el motivo registrado. No sustituye la auditoría por oración (factualClaimGate).
 */

const DATE_RE = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/gi;
const AMOUNT_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|(\d{1,3}(?:,\d{3})+|\d{2,})(?:\.\d{1,2})?\s*pesos\b/gi;

export interface BlockFactualSupport {
  accepted: boolean;
  /** Motivos concretos: FECHA_NO_EN_FUENTE:<fecha> o MONTO_NO_EN_FUENTE:<monto>. */
  rejectedItems: string[];
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

/** Fechas del texto como clave canónica «d de mes de yyyy» (día sin cero a la izquierda). */
function datesOf(text: string): Array<{ key: string; display: string }> {
  return Array.from(text.matchAll(DATE_RE), (match) => {
    const day = String(Number(match[1]));
    const month = match[2].toLowerCase();
    return { key: `${day} de ${month} de ${match[3]}`, display: match[0] };
  });
}

/** Montos del texto como cifra entera sin separadores (los centavos no cambian el monto respaldado). */
function amountsOf(text: string): Array<{ key: string; display: string }> {
  return Array.from(text.matchAll(AMOUNT_RE), (match) => {
    const raw = match[1] || match[2];
    return { key: raw.replace(/,/g, ''), display: match[0].trim() };
  });
}

export function evaluateBlockFactualSupport(text: string, sourceTexts: readonly string[]): BlockFactualSupport {
  const corpus = fold(sourceTexts.join('\n'));
  const corpusDigits = sourceTexts.join('\n').replace(/,/g, '');
  const rejectedItems: string[] = [];

  for (const date of datesOf(text)) {
    if (!corpus.includes(fold(date.key))) rejectedItems.push(`FECHA_NO_EN_FUENTE:${date.display}`);
  }
  for (const amount of amountsOf(text)) {
    if (!corpusDigits.includes(amount.key)) rejectedItems.push(`MONTO_NO_EN_FUENTE:${amount.display}`);
  }
  return { accepted: rejectedItems.length === 0, rejectedItems };
}

/** Textos de las fuentes del documento (sourceGrounding), para comparar fechas y montos. */
export function sourceTextsOf(document: { generationMetadata?: { sourceGrounding?: Array<{ sourceText?: string }> } }): string[] {
  return (document.generationMetadata?.sourceGrounding || []).map((source) => source.sourceText || '').filter(Boolean);
}
