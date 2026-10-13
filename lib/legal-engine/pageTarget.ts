import type { GenerationExtensionInput } from './generationExtension';

/**
 * Meta de extensión del escrito (páginas aproximadas).
 *
 * Es un parámetro REAL del pipeline: viaja tipado desde el selector de la interfaz hasta el
 * contrato de extensión (`generationExtension`), el presupuesto por sección y el registro del
 * borrador. No es una promesa: «el sistema no añadirá contenido para llenar páginas». Si la
 * información disponible no sostiene la meta, se genera lo defendible y se informa.
 *
 * No debe confundirse con el número de páginas del PDF fuente.
 */

export const PAGE_TARGET_PRESETS = [
  { id: 'BREVE', pages: 5, label: 'Breve', hint: '≈ 5 páginas' },
  { id: 'INTERMEDIO', pages: 10, label: 'Intermedio', hint: '≈ 10 páginas' },
  { id: 'DETALLADO', pages: 20, label: 'Detallado', hint: '≈ 20 páginas' },
  { id: 'EXTENSO', pages: 40, label: 'Extenso', hint: '≈ 40 páginas' },
] as const;

export type PageTargetPresetId = (typeof PAGE_TARGET_PRESETS)[number]['id'] | 'PERSONALIZADO';

/**
 * Rango del valor personalizado. Mínimo 2: una sola página no admite estructura jurídica
 * completa (proemio, cuerpo y petitorios) con legibilidad. Máximo 60: por encima de las 40
 * del preset «Extenso» el motor ya no puede sostener el contenido sin redundancia con una
 * sola fuente, y cada página adicional multiplica las llamadas al proveedor (límite de 100).
 */
export const CUSTOM_PAGE_TARGET_RANGE = { min: 2, max: 60 } as const;

/**
 * Palabras por página renderizada por el generador PDF del proyecto (Letter, márgenes de 1"), MEDIDO
 * con prosa jurídica de 6,2 caracteres por palabra: 290–342 palabras/página. Los perfiles heredados
 * `PROFESSIONAL_20`/`EXTENSIVE_40` asumen 500 y por eso producen ≈ 30 y ≈ 60 páginas.
 */
export const WORDS_PER_PAGE = 340;

/** Proporción máxima de texto redundante (párrafos casi idénticos) tolerada en un borrador. */
export const MAX_REDUNDANCY_RATIO = 0.03;

export const PAGE_TARGET_HELP_TEXT =
  'La extensión es una meta aproximada; dependerá de la complejidad, los hechos disponibles, la evidencia y las reglas aplicables. El sistema no añadirá contenido para llenar páginas.';

export interface PageTarget {
  preset: PageTargetPresetId;
  pages: number;
}

export type PageTargetOutcome = 'MET' | 'BELOW_TARGET' | 'ABOVE_TARGET';

/** Resultado registrado con el borrador: objetivo vs páginas medidas sobre el documento renderizado. */
export interface PageTargetResult {
  requestedPages: number;
  preset: PageTargetPresetId;
  actualPages: number;
  outcome: PageTargetOutcome;
  /** Mensaje para el abogado cuando no se alcanzó la meta. */
  notice?: string;
  redundancyRatio?: number;
  measuredWith: 'PDF_RENDERER';
}

export class PageTargetValidationError extends Error {
  readonly code = 'INVALID_PAGE_TARGET';

  constructor(value: unknown) {
    super(`La extensión debe ser 5, 10, 20, 40 o un entero entre ${CUSTOM_PAGE_TARGET_RANGE.min} y ${CUSTOM_PAGE_TARGET_RANGE.max} páginas: ${String(value)}.`);
    this.name = 'PageTargetValidationError';
  }
}

export const DEFAULT_PAGE_TARGET: PageTarget = { preset: 'DETALLADO', pages: 20 };

/** Acepta `{preset, pages}`, un número de páginas o un id de preset; lanza si es inválido. */
export function parsePageTarget(value: unknown): PageTarget {
  if (value === null || value === undefined || value === '') throw new PageTargetValidationError(value);
  let preset: unknown;
  let pages: unknown;
  if (typeof value === 'object') {
    preset = (value as { preset?: unknown }).preset;
    pages = (value as { pages?: unknown }).pages;
  } else if (typeof value === 'string' && PAGE_TARGET_PRESETS.some((item) => item.id === value)) {
    preset = value;
  } else {
    pages = value;
  }
  const named = PAGE_TARGET_PRESETS.find((item) => item.id === preset);
  if (named && (pages === undefined || Number(pages) === named.pages)) return { preset: named.id, pages: named.pages };
  const numeric = typeof pages === 'string' && /^\d+$/.test(pages.trim()) ? Number(pages) : pages;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric)) throw new PageTargetValidationError(value);
  if (numeric < CUSTOM_PAGE_TARGET_RANGE.min || numeric > CUSTOM_PAGE_TARGET_RANGE.max) throw new PageTargetValidationError(value);
  const matching = PAGE_TARGET_PRESETS.find((item) => item.pages === numeric);
  return matching ? { preset: matching.id, pages: numeric } : { preset: 'PERSONALIZADO', pages: numeric };
}

/** Versión que no lanza: para leer valores guardados en el navegador. */
export function tryParsePageTarget(value: unknown): PageTarget | null {
  try { return parsePageTarget(value); } catch { return null; }
}

/** Tolerancia de páginas alrededor de la meta (menos páginas = menos holgura). */
export function pageTolerance(pages: number): number {
  return Math.max(1, Math.round(pages * 0.15));
}

export function pageTargetToGenerationExtension(target: PageTarget): GenerationExtensionInput {
  const tolerance = pageTolerance(target.pages);
  const heavy = target.pages > 20;
  return {
    generationMode: 'extended-legal',
    targetPages: target.pages,
    minPages: Math.max(1, target.pages - tolerance),
    maxPages: target.pages + tolerance,
    targetWords: target.pages * WORDS_PER_PAGE,
    maxCallsPerDocument: Math.min(100, Math.max(12, Math.round(target.pages * 1.2))),
    maxContinuationsPerSection: heavy ? 5 : 3,
    maxExpansionPasses: heavy ? 5 : 3,
    maxGeneratedTokens: heavy ? 6500 : 5000,
  };
}

/** Compara el resultado medido con la meta. */
export function evaluatePageTarget(target: PageTarget, actualPages: number, redundancyRatio?: number): PageTargetResult {
  const tolerance = pageTolerance(target.pages);
  const outcome: PageTargetOutcome = actualPages < target.pages - tolerance
    ? 'BELOW_TARGET'
    : actualPages > target.pages + tolerance ? 'ABOVE_TARGET' : 'MET';
  return {
    requestedPages: target.pages,
    preset: target.preset,
    actualPages,
    outcome,
    ...(outcome === 'BELOW_TARGET'
      ? { notice: `No se alcanzó la extensión solicitada (${target.pages} páginas; resultado: ${actualPages}): la información, la evidencia y las reglas disponibles no sostienen más contenido sin redundancia. No se añadió texto de relleno.` }
      : outcome === 'ABOVE_TARGET'
        ? { notice: `El borrador supera la meta (${target.pages} páginas; resultado: ${actualPages}): incluye la estructura obligatoria del escrito (p. ej. responder individualmente cada hecho y cada prestación). No se omitió ninguna respuesta ni sección para ajustar la extensión.` }
        : {}),
    ...(redundancyRatio === undefined ? {} : { redundancyRatio }),
    measuredWith: 'PDF_RENDERER',
  };
}

export function describePageTargetResult(result: Pick<PageTargetResult, 'requestedPages' | 'actualPages'>): string {
  return `Objetivo: ${result.requestedPages} páginas · Resultado: ${result.actualPages} páginas`;
}
