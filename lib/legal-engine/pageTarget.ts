import type { GenerationExtensionInput } from './generationExtension';

/**
 * Extensión OBJETIVO del escrito (páginas reales del PDF renderizado).
 *
 * Es un parámetro REAL del pipeline: viaja tipado desde el selector de la interfaz hasta el
 * contrato de extensión (`generationExtension`), el presupuesto por sección, la etapa de
 * ampliación sustantiva (`expandDocumentToPageTarget`) y el registro del borrador. Es una META:
 * el motor planifica por secciones, mide el PDF renderizado y amplía las secciones pertinentes
 * con análisis respaldado (hechos, pruebas y autoridades verificadas del expediente) hasta
 * alcanzarla. Si el material no sostiene más contenido sin repetir ni inventar, el resultado se
 * registra como `BELOW_TARGET` con el motivo y lo que haría falta; nunca se presenta como cumplido.
 *
 * Cambio de contrato (2026-10-16, a petición del titular): del 2026-10-14 a esa fecha era un máximo.
 * No debe confundirse con el número de páginas del PDF fuente.
 */

export const PAGE_TARGET_PRESETS = [
  { id: 'BREVE', pages: 5, label: 'Breve', hint: 'objetivo de 5 páginas' },
  { id: 'INTERMEDIO', pages: 10, label: 'Intermedio', hint: 'objetivo de 10 páginas' },
  { id: 'DETALLADO', pages: 20, label: 'Detallado', hint: 'objetivo de 20 páginas' },
  { id: 'EXTENSO', pages: 40, label: 'Extenso', hint: 'objetivo de 40 páginas' },
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
  'La extensión es un objetivo de generación: el sistema planifica las secciones, mide el PDF y amplía con análisis respaldado por el expediente hasta alcanzarla. Si los hechos, la evidencia y las fuentes verificables no lo permiten sin repetir ni inventar, el resultado se marca «por debajo del objetivo» con el motivo. Alcanzar las páginas no valida jurídicamente el escrito.';

export interface PageTarget {
  preset: PageTargetPresetId;
  pages: number;
}

/**
 * `MET`: el PDF renderizado alcanza la meta (dentro de la tolerancia superior).
 * `BELOW_TARGET`: no se alcanzó; nunca se presenta como cumplido.
 * `ABOVE_TARGET`: la supera por estructura obligatoria (cada hecho, prestación o agravio).
 */
export type PageTargetOutcome = 'MET' | 'BELOW_TARGET' | 'ABOVE_TARGET';

/** Resultado registrado con el borrador: objetivo vs páginas medidas sobre el documento renderizado. */
export interface PageTargetResult {
  requestedPages: number;
  preset: PageTargetPresetId;
  actualPages: number;
  outcome: PageTargetOutcome;
  /** Mensaje para el abogado cuando no se alcanzó la meta o se superó. */
  notice?: string;
  /** Motivo de parada de la ampliación (`contentStopReason`) cuando no se alcanzó. */
  stopReason?: string;
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
  const heavy = target.pages > 20;
  return {
    generationMode: 'extended-legal',
    // Meta real: el PDF renderizado debe alcanzar `minPages`; la ampliación sustantiva se detiene al llegar.
    targetPages: target.pages,
    minPages: target.pages,
    maxPages: target.pages + pageTolerance(target.pages),
    targetWords: target.pages * WORDS_PER_PAGE,
    // Redacción por sección + ampliación (≈ 1/3 de página nueva por llamada admitida), con holgura para
    // rechazos por admisión jurídica, duplicado o salida truncada del proveedor.
    maxCallsPerDocument: Math.min(100, Math.max(12, Math.round(target.pages * 1.5))),
    maxContinuationsPerSection: heavy ? 5 : 3,
    maxExpansionPasses: heavy ? 6 : 4,
    maxGeneratedTokens: heavy ? 6500 : 5000,
  };
}

const STOP_REASON_EXPLANATION: Record<string, string> = {
  CONTENT_LIMIT_REACHED: 'los hechos, pruebas y autoridades verificadas del expediente ya están desarrollados; ampliar más exigiría repetir o inventar',
  COVERAGE_COMPLETE: 'toda la cobertura respaldada del expediente ya está desarrollada; ampliar más exigiría repetir o inventar',
  ATTORNEY_INPUT_REQUIRED: 'hay hechos o puntos que requieren la postura del abogado o del cliente antes de desarrollarlos',
  REPETITION_BLOCKED: 'las ampliaciones propuestas repetían contenido existente y se rechazaron',
  PROVIDER_UNAVAILABLE: 'el proveedor de IA falló, respondió de forma parcial o no devolvió contenido jurídico utilizable',
  RESOURCE_LIMIT: 'se agotó el presupuesto de llamadas o pasadas de ampliación',
};

/** Compara el PDF medido con la meta. Quedarse corto es `BELOW_TARGET`, se explica y nunca se marca cumplido. */
export function evaluatePageTarget(
  target: PageTarget,
  actualPages: number,
  redundancyRatio?: number,
  stopReason?: string,
): PageTargetResult {
  const outcome: PageTargetOutcome = actualPages < target.pages
    ? 'BELOW_TARGET'
    : actualPages > target.pages + pageTolerance(target.pages) ? 'ABOVE_TARGET' : 'MET';
  const reason = stopReason ? STOP_REASON_EXPLANATION[stopReason] : undefined;
  const notice = outcome === 'BELOW_TARGET'
    ? `No se alcanzó la extensión solicitada (${target.pages} páginas; resultado: ${actualPages}). ${reason ? `Motivo: ${reason}. ` : ''}No se añadió texto de relleno ni hechos o fundamentos no respaldados. Para ampliar con calidad hace falta más material: documentos fuente adicionales, la postura del abogado sobre los hechos pendientes o fuentes jurídicas oficiales verificadas.`
    : outcome === 'ABOVE_TARGET'
      ? `El borrador supera la meta (${target.pages} páginas; resultado: ${actualPages}): incluye la estructura obligatoria del escrito (p. ej. responder individualmente cada hecho, prestación o agravio). No se omitió ninguna respuesta ni sección para ajustar la extensión.`
      : undefined;
  return {
    requestedPages: target.pages,
    preset: target.preset,
    actualPages,
    outcome,
    ...(notice ? { notice } : {}),
    ...(outcome === 'BELOW_TARGET' && stopReason ? { stopReason } : {}),
    ...(redundancyRatio === undefined ? {} : { redundancyRatio }),
    measuredWith: 'PDF_RENDERER',
  };
}

export function describePageTargetResult(result: Pick<PageTargetResult, 'requestedPages' | 'actualPages'> & { outcome?: string }): string {
  const status = result.outcome === 'BELOW_TARGET' ? ' (por debajo del objetivo)'
    : result.outcome === 'MET' ? ' (objetivo alcanzado)' : '';
  return `Objetivo: ${result.requestedPages} páginas · Resultado: ${result.actualPages} páginas${status}`;
}

/** `PAGE_TARGET_UNMET` cuando el PDF quedó por debajo; `PAGE_TARGET_EXCEEDED` cuando la superó. */
export function pageTargetCheckId(result: Pick<PageTargetResult, 'outcome'>): 'PAGE_TARGET_UNMET' | 'PAGE_TARGET_EXCEEDED' {
  return result.outcome === 'BELOW_TARGET' ? 'PAGE_TARGET_UNMET' : 'PAGE_TARGET_EXCEEDED';
}
