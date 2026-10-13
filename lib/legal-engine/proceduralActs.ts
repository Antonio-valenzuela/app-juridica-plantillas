import type { UploadedSourceDocument } from './types';
import { isPartyWriting } from './sourceGrounding';
import { classifyMatter } from './matterClassification';

/**
 * Segmentación de un PDF en actos procesales.
 *
 * Un expediente escaneado mezcla demanda, contestación, autos, constancias y
 * sentencias. Clasificar el corpus completo con una cascada de expresiones
 * (como hacía la inferencia por documento) hace que la primera señal de
 * "demanda" en cualquier foja arrastre a todo el PDF. Aquí se clasifica cada
 * foja por su ENCABEZADO y su fórmula dispositiva, se agrupan las fojas
 * contiguas del mismo acto y se conserva el rango de páginas.
 *
 * Es heurístico y declara su confianza: un acto que no se pueda identificar
 * queda `DESCONOCIDO` y se marca para revisión; nunca se adivina.
 */

export const PROCEDURAL_ACT_KINDS = [
  'DEMANDA',
  'CONTESTACION',
  'REPLICA',
  'DUPLICA',
  'RECURSO',
  'ESCRITO_PARTE',
  'SENTENCIA_DEFINITIVA',
  'AUTO_INTERLOCUTORIO',
  'ACUERDO_TRAMITE',
  'SENTENCIA_AMPARO',
  'LAUDO',
  'CONSTANCIA_O_ANEXO',
  'DESCONOCIDO',
] as const;
export type ProceduralActKind = (typeof PROCEDURAL_ACT_KINDS)[number];

export interface ProceduralAct {
  kind: ProceduralActKind;
  startPage: number;
  endPage: number;
  pages: Array<{ page: number; text: string; chars: number }>;
  /** Materia sustantiva del acto (puede diferir de la del resto del PDF). */
  matter: string;
  confidence: number;
  /** Línea de encabezado o fórmula que sustenta la clasificación (trazabilidad). */
  evidence: string;
  /** Un auto que resuelve un incidente o cuestión (no es mero trámite). */
  decidesIncident?: boolean;
  /** Orden de trámite adicional incluida en el mismo auto (p. ej. citación para sentencia). */
  citesForJudgment?: boolean;
}

export const RESOLUTION_KINDS: readonly ProceduralActKind[] = [
  'SENTENCIA_DEFINITIVA', 'AUTO_INTERLOCUTORIO', 'ACUERDO_TRAMITE', 'SENTENCIA_AMPARO', 'LAUDO',
];

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function headOf(text: string, lines = 14): string[] {
  return fold(text).split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, lines);
}

const FORUM_RE = /\b(?:juzgado|juez(?:a)?|tribunal|sala|junta|magistrad[oa]s?)\b/;
const RESOLUTION_FORMULA_RE = /(?:^|\n)\s*(?:visto|vistos|vista|vistas|resultando|sentencia|auto|acuerdo|proveido|cuenta|con\s+el\s+escrito\s+de\s+cuenta|se\s+(?:tiene|acuerda|desecha|provee|resuelve)|resuelve)\b|\bnotifiquese\b|\bas[ií]\s+lo\s+(?:acordo|resolvio|proveyo|sentencio)\b/;
const CONSTANCIA_RE = /^(?:constancia|razon|cedula|certificacion|se\s+hace\s+constar|razon\s+actuarial|anexo\b|documental\b)/;
const INCIDENT_RE = /\b(?:incidente|nulidad\s+de\s+actuaciones|excepci(?:on|ones)\s+(?:previa|previas|dilatoria|dilatorias)|recusacion|reposicion|medida\s+cautelar|medidas\s+provisionales)\b/;
const DECISION_RE = /\b(?:se\s+desecha|desecha(?:r)?|se\s+declara\s+(?:improcedente|procedente|fundado|infundado)|se\s+resuelve\s+el\s+incidente|ha\s+lugar|no\s+ha\s+lugar|se\s+admite|se\s+declara\s+sin\s+materia|resuelve\s+el\s+incidente)\b/;

/**
 * Clasifica una foja por su encabezado. Devuelve `null` si no inicia un acto
 * (continuación del acto anterior).
 */
const DATE_RE = /\b(?:a\s+)?(?:\d{1,2}|[a-z]+(?:\s+[a-z]+)?)\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(?:dos\s+mil\s+[a-z]+(?:\s+[a-z]+)?|\d{4})\b/;

/** Clave de línea de encabezado para detectar encabezados corrientes (los dígitos no cuentan). */
function headerKey(line: string): string {
  return line.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/**
 * Líneas que se repiten en el encabezado de la mayoría de las fojas (encabezado corriente:
 * juzgado, expediente, número de foja). No señalan el inicio de un acto nuevo.
 */
export function repeatedHeaderLines(pages: ReadonlyArray<{ text: string }>): Set<string> {
  const counts = new Map<string, number>();
  if (pages.length < 3) return new Set();
  for (const page of pages) {
    for (const key of new Set(headOf(page.text, 4).map(headerKey))) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.4));
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([key]) => key));
}

export function classifyPageStart(pageText: string, ignoredHeaders: ReadonlySet<string> = new Set()): { kind: ProceduralActKind; evidence: string; confidence: number; decidesIncident?: boolean; citesForJudgment?: boolean } | null {
  const lines = headOf(pageText, 24).filter((line) => !ignoredHeaders.has(headerKey(line)));
  if (lines.length === 0) return null;
  const head5 = lines.slice(0, 5);
  const head = lines.join('\n');
  const full = fold(pageText);
  const first = lines[0];

  const partyWriting = isPartyWriting(pageText);

  // Escritos de parte: se reconocen por su encabezado y fórmula de comparecencia/promoción.
  const demandaHeading = head5.find((line) => /^(?:demanda|escrito\s+inicial)\b/.test(line));
  const initiation = /\b(?:vengo\s+a\s+(?:demandar|promover|ejercer)|promuevo\s+(?:demanda|juicio)|interpongo\s+(?:demanda|accion)|demando)\b/.test(full);
  const pleadingStructure = /\b(?:hechos|puntos\s+petitorios|prestaciones|pretensiones)\b/.test(full);
  if (demandaHeading && (initiation || pleadingStructure)) {
    return { kind: 'DEMANDA', evidence: demandaHeading, confidence: initiation ? 0.95 : 0.85 };
  }
  const contestacion = head5.find((line) => /^(?:contestacion|se\s+contesta)\b.*\bdemanda\b/.test(line));
  if (contestacion) return { kind: 'CONTESTACION', evidence: contestacion, confidence: 0.9 };
  const replica = head5.find((line) => /^replica\b/.test(line));
  if (replica) return { kind: 'REPLICA', evidence: replica, confidence: 0.85 };
  const duplica = head5.find((line) => /^duplica\b/.test(line));
  if (duplica) return { kind: 'DUPLICA', evidence: duplica, confidence: 0.85 };
  const recurso = head5.find((line) => /^(?:recurso\s+de|expresion\s+de\s+agravios|agravios\b)/.test(line));
  if (recurso || (partyWriting && /\b(?:interpongo|interponer)\s+(?:el\s+)?recurso\b/.test(full))) {
    return { kind: 'RECURSO', evidence: recurso || 'interpongo recurso', confidence: 0.85 };
  }

  // Resoluciones: foro emisor en el encabezado + fórmula dispositiva. Una parte que
  // comparece ("por mi propio derecho…") nunca emite una resolución.
  const forumInHead = head5.some((line) => FORUM_RE.test(line));
  const hasDate = DATE_RE.test(head);
  const formula = RESOLUTION_FORMULA_RE.test(head) || /(?:^|\n)\s*(?:primero|unico)[.:]/.test(full);
  if (!partyWriting && forumInHead && formula && (hasDate || /\b(?:sentencia|ejecutoria|laudo)\b/.test(lines.slice(0, 4).join(' ')))) {
    // Solo líneas de ENCABEZADO (cortas): una frase como «cita para oír sentencia definitiva»
    // dentro de un párrafo dispositivo no convierte el auto en sentencia.
    const titleLines = lines.slice(0, 8).filter((line) => line.length <= 90).join('\n');
    if (/\bsentencia\s+interlocutoria\b/.test(titleLines)) {
      return { kind: 'AUTO_INTERLOCUTORIO', evidence: 'sentencia interlocutoria', confidence: 0.9, decidesIncident: true };
    }
    if (/\b(?:ejecutoria|amparo\s+directo)\b/.test(titleLines) && /\btribunal\s+colegiado\b/.test(full)) {
      return { kind: 'SENTENCIA_AMPARO', evidence: 'ejecutoria de amparo', confidence: 0.9 };
    }
    if (/\blaudo\b/.test(titleLines)) return { kind: 'LAUDO', evidence: 'laudo', confidence: 0.9 };
    const definitive = /\bsentencia\s+definitiva\b/.test(titleLines)
      || (/\bresultando\b/.test(full) && /\bconsiderando\b/.test(full) && /\b(?:puntos?\s+resolutivos?|se\s+resuelve|resuelve)\b/.test(full));
    if (definitive) return { kind: 'SENTENCIA_DEFINITIVA', evidence: 'sentencia definitiva / resultandos-considerandos-resolutivos', confidence: 0.9 };
    const decides = INCIDENT_RE.test(full) && DECISION_RE.test(full);
    const cites = /\b(?:cita(?:r)?\s+(?:a\s+las\s+partes\s+)?para\s+(?:oir|dictar)\s+sentencia|citese\s+para\s+sentencia)\b/.test(full);
    if (decides) {
      return { kind: 'AUTO_INTERLOCUTORIO', evidence: 'auto que resuelve incidente', confidence: 0.85, decidesIncident: true, citesForJudgment: cites };
    }
    return { kind: 'ACUERDO_TRAMITE', evidence: lines.find((line) => RESOLUTION_FORMULA_RE.test(line)) || 'proveido', confidence: 0.75, citesForJudgment: cites };
  }

  if (partyWriting) return { kind: 'ESCRITO_PARTE', evidence: 'comparecencia de parte', confidence: 0.7 };
  if (CONSTANCIA_RE.test(first)) return { kind: 'CONSTANCIA_O_ANEXO', evidence: first, confidence: 0.8 };
  return null;
}

/** Agrupa las fojas en actos contiguos. Una foja sin inicio de acto continúa el anterior. */
export function segmentProceduralActs(pages: ReadonlyArray<{ page: number; text: string; chars?: number }>): ProceduralAct[] {
  const acts: ProceduralAct[] = [];
  const ignoredHeaders = repeatedHeaderLines(pages);
  for (const page of pages) {
    const start = classifyPageStart(page.text, ignoredHeaders);
    const entry = { page: page.page, text: page.text, chars: page.chars ?? page.text.length };
    const current = acts[acts.length - 1];
    if (start) {
      acts.push({
        kind: start.kind, startPage: page.page, endPage: page.page, pages: [entry], matter: 'NO_IDENTIFICADA',
        confidence: start.confidence, evidence: start.evidence,
        ...(start.decidesIncident ? { decidesIncident: true } : {}),
        ...(start.citesForJudgment ? { citesForJudgment: true } : {}),
      });
    } else if (current) {
      current.pages.push(entry);
      current.endPage = page.page;
    } else {
      acts.push({ kind: 'DESCONOCIDO', startPage: page.page, endPage: page.page, pages: [entry], matter: 'NO_IDENTIFICADA', confidence: 0.3, evidence: '' });
    }
  }
  for (const act of acts) {
    // La materia se decide con las señales del propio acto (foro + contenido), no del PDF completo.
    act.matter = classifyMatter(act.pages.map((page) => page.text).join('\n')).matter;
  }
  return acts;
}

/**
 * ¿El documento mezcla varios actos? Solo entonces conviene sustituir la
 * clasificación global por la del acto que controla la actuación elegida.
 * Las constancias/anexos y las continuaciones no cuentan como actos distintos.
 */
export function isMultiActDocument(acts: readonly ProceduralAct[]): boolean {
  const meaningful = acts.filter((act) => act.kind !== 'CONSTANCIA_O_ANEXO' && act.kind !== 'DESCONOCIDO');
  return new Set(meaningful.map((act) => act.kind)).size >= 2
    || (meaningful.length >= 2 && acts.length >= 2);
}

export function proceduralActsOf(source: UploadedSourceDocument): ProceduralAct[] {
  const pages = source.pages?.length
    ? source.pages.map((page) => ({ page: page.page, text: page.text, chars: page.chars }))
    : [];
  return pages.length >= 1 ? segmentProceduralActs(pages) : [];
}

export function describeAct(kind: ProceduralActKind): string {
  return {
    DEMANDA: 'demanda',
    CONTESTACION: 'contestación de demanda',
    REPLICA: 'réplica',
    DUPLICA: 'dúplica',
    RECURSO: 'recurso',
    ESCRITO_PARTE: 'escrito de parte',
    SENTENCIA_DEFINITIVA: 'sentencia definitiva',
    AUTO_INTERLOCUTORIO: 'auto que resuelve un incidente',
    ACUERDO_TRAMITE: 'acuerdo de trámite',
    SENTENCIA_AMPARO: 'sentencia de amparo',
    LAUDO: 'laudo',
    CONSTANCIA_O_ANEXO: 'constancia o anexo',
    DESCONOCIDO: 'acto no identificado',
  }[kind];
}
