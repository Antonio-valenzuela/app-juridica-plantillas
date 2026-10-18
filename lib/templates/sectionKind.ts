/**
 * Clasificación de las secciones de una plantilla personal:
 *  - FORMULA: proemio, comparecencia, cierre, firma… se conserva el texto y se sustituyen los datos.
 *  - SUSTANTIVA: hechos, prestaciones, agravios, excepciones, pruebas, derecho, petitorios… se redacta de nuevo.
 * Ante la duda es SUSTANTIVA: reescribir nunca arrastra contenido del caso anterior.
 */
import { foldText } from './carryoverFilter';

export type TemplateSectionKind = 'FORMULA' | 'SUSTANTIVA';

export interface SectionKindInput {
  title: string;
  text: string;
  index: number;
  total: number;
}

const SUBSTANTIVE_TITLE = /(hecho|antecedente|prestacion|pretension|agravio|concepto de violacion|excepcion|defensa|prueba|ofrecimiento|derecho|fundamento|petitorio|alegato|consideracion|razonamiento|motivo|clausula|resuelve|considerando|declaracion)/;
const FORMULA_TITLE = /(proemio|comparecencia|personalidad|encabezado|rubro|cierre|firma|protesto|lugar y fecha|atentamente|domicilio (?:para|procesal)|bajo protesta|autorizad|nombre del promovente)/;
const CLOSING_TEXT = /(protesto lo necesario|atentamente|bajo protesta de decir verdad|lugar y fecha|rubrica|firma)/;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function classifySectionKind(input: SectionKindInput): TemplateSectionKind {
  const title = foldText(input.title).replace(/^(?:\d+|[ivxlc]+)[.)\s-]+(?=[a-z])/, '');
  if (SUBSTANTIVE_TITLE.test(title)) return 'SUSTANTIVA';
  if (FORMULA_TITLE.test(title)) return 'FORMULA';

  const body = foldText(input.text);
  const size = words(body);
  const isEdge = input.index === 0 || input.index === input.total - 1;
  if (isEdge && size <= 80 && (input.index === 0 || CLOSING_TEXT.test(body))) return 'FORMULA';
  if (CLOSING_TEXT.test(body) && size <= 40) return 'FORMULA';
  return 'SUSTANTIVA';
}

/** Clave estable de una sección para las correcciones del abogado. */
export function sectionKindKey(title: string): string {
  return foldText(title).replace(/[^a-z0-9 ]/g, '').trim();
}

export function resolveSectionKind(
  input: SectionKindInput,
  overrides?: Record<string, TemplateSectionKind>,
): TemplateSectionKind {
  return overrides?.[sectionKindKey(input.title)] ?? classifySectionKind(input);
}
