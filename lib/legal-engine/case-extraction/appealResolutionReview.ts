import type { UploadedSourceDocument } from '../types';
export { extractAppealReasoningCandidates } from './appealReasoningCandidates';
// Browser/server identical revision fingerprint; not an authentication capability.
function fingerprint(text: string) {
  let a = 2166136261, b = 2246822507;
  for (const ch of text) { a = Math.imul(a ^ ch.charCodeAt(0), 16777619); b = Math.imul(b ^ ch.charCodeAt(0), 3266489909); }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${text.length}`;
}

export const isCivilFamilyAppeal = (type?: string) => ['apelacion_civil', 'apelacion_familiar', 'recurso_apelacion_civil', 'recurso_apelacion_familiar'].includes(type || '');
export interface AppealOrigin { sourceId: string; page: number; excerpt: string; start: number; end: number }
export interface AppealParty { role: 'actor' | 'demandado'; name: string; origin: AppealOrigin }
export interface AppealResolution {
  id: string; sourceId: string; type: 'AUTO' | 'SENTENCIA_DEFINITIVA'; date: string;
  court: string; courtOrigin?: AppealOrigin; startPage: number; endPage: number;
  dateStatus?: 'EXTRACTED' | 'CONFIRM_DATE'; dateOrigin?: AppealOrigin;
  /** Número de expediente que consta en el encabezado de la propia resolución. */
  expediente?: string;
  parties: AppealParty[]; notification?: { date: string; bulletin: string; origin: AppealOrigin };
}
export interface AppealResolutionReview {
  sourceFingerprint: string; resolutions: AppealResolution[]; status: 'NEEDS_USER_INPUT'; opportunity: '[A VERIFICAR]';
}
export interface AppealConfirmation {
  sourceFingerprint: string; resolutionId: string; parties: AppealParty[]; representedNames: string[];
  recipient: string; notification: string; expediente: string; confirmed: boolean; resolutionDate?: string;
  /**
   * Confirmación derivada automáticamente de la resolución principal detectada. No la ratificó el
   * abogado: permite generar un BORRADOR con los datos no verificados como pendientes.
   */
  provisional?: boolean;
}
const pending = '[A CONFIRMAR POR EL ABOGADO]';
const origin = (sourceId: string, page: number, text: string, excerpt: string): AppealOrigin => {
  const start = text.indexOf(excerpt);
  return { sourceId, page, excerpt, start, end: start + excerpt.length };
};
const sourcePages = (source: UploadedSourceDocument) => [...(source.pages || [])].sort((a, b) => a.page - b.page);
// Matching view only: offsets always refer to the untouched source text.
const comparable = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function matchingLine(raw: string) {
  let text = raw.trim().replace(/^[\s|“”"'_:;!+—–-]+/, '');
  // Observed margin tokens, not arbitrary words or meaningful initials (J., LIC.).
  const margin = /^(?:E|e|o|a|D|Fo|IR|Ne|rea)(?=\s|[|—-])(?:\s|[|—-])+/;
  while (margin.test(text)) text = text.replace(margin, '').replace(/^[\s|“”"'_:;!+—–-]+/, '');
  return text.replace(/[\s|—–-]+$/, '').trim();
}
export function lineView(text: string) {
  let offset = 0;
  return text.split('\n').map(raw => {
    const line = { raw, text: matchingLine(raw), start: offset, end: offset + raw.length };
    offset += raw.length + 1;
    return { ...line, key: comparable(line.text) };
  });
}
const bodyStart = /^(?:VISTO\s*S|RESULTANDO|CONSIDERANDO|POR RECIBIDO)\b/;
const citedContext = /\b(?:TESIS|JURISPRUDENCIA|CONSIDERANDO|SE TRANSCRIBE|RESOLUCION CITADA)\b/;
// Exact lexical number reading, never fuzzy OCR correction.
function writtenNumber(text: string): number | undefined {
  const units: Record<string, number> = { CERO: 0, UNO: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10, ONCE: 11, DOCE: 12, TRECE: 13, CATORCE: 14, QUINCE: 15, DIECISEIS: 16, DIECISIETE: 17, DIECIOCHO: 18, DIECINUEVE: 19, VEINTE: 20 };
  const key = comparable(text).replace(/[.,;|]+$/, '').trim();
  if (key in units) return units[key];
  if (key.startsWith('VEINTI') && key.slice(6) in units) return 20 + units[key.slice(6)];
  const m = key.match(/^(TREINTA|CUARENTA|CINCUENTA|SESENTA|SETENTA|OCHENTA|NOVENTA)(?: Y (UNO|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE))?$/);
  const tens: Record<string, number> = { TREINTA: 30, CUARENTA: 40, CINCUENTA: 50, SESENTA: 60, SETENTA: 70, OCHENTA: 80, NOVENTA: 90 };
  return m ? tens[m[1]] + (m[2] ? units[m[2]] : 0) : undefined;
}
export function extractAppealResolutionReview(sources: UploadedSourceDocument[]): AppealResolutionReview {
  const resolutions: AppealResolution[] = [];
  for (const source of sources) {
    const pages = sourcePages(source);
    // Only anchored operative headings, never discussion of judgments or quoted precedents.
    const starts = pages.flatMap((page, index) => {
      const lines = lineView(page.text);
      const position = lines.findIndex(l => /^(?:SE DICTA )?SENTENCIA DEFINITIVA\b|^AUTO\s*[:.\-]/.test(l.key));
      if (position < 0 || lines.slice(0, position + 1).some(l => citedContext.test(l.key) || bodyStart.test(l.key))) return [];
      return [{ index, heading: lines[position].raw, type: /^AUTO/.test(lines[position].key) ? 'AUTO' as const : 'SENTENCIA_DEFINITIVA' as const }];
    });
    for (const [i, start] of starts.entries()) {
      const range = pages.slice(start.index, starts[i + 1]?.index ?? pages.length);
      const first = range[0];
      const allLines = lineView(first.text);
      const narrativeStart = allLines.findIndex(l => bodyStart.test(l.key) || citedContext.test(l.key));
      const lines = allLines.slice(0, narrativeStart < 0 ? allLines.length : narrativeStart);
      const span = (from: number, to = from): AppealOrigin => ({ sourceId: source.id, page: first.page, start: lines[from].start, end: lines[to].end, excerpt: first.text.slice(lines[from].start, lines[to].end) });
      const courtIndex = lines.findIndex(l => /^(?:JUZGADO|TRIBUNAL)\b/.test(l.key));
      let courtEnd = courtIndex;
      while (courtEnd >= 0 && courtEnd + 1 < lines.length && /^(?:JUDICIAL|DEL|ESTADO)\b/.test(lines[courtEnd + 1].key)) courtEnd++;
      const court = courtIndex < 0 ? pending : lines.slice(courtIndex, courtEnd + 1).map(l => l.text).join(' ').split(/\s+PODER JUDICIAL\b/i)[0].trim();
      const dateIndex = lines.findIndex(l => /\bA \d{1,2}\b.*\b\d{4}\b/.test(l.key));
      let dateEnd = dateIndex;
      while (dateEnd >= 0 && dateEnd + 1 < lines.length && /^(?:MIL|DOS MIL|VEINTI\w+)\b/.test(lines[dateEnd + 1].key)) dateEnd++;
      const dateText = dateIndex < 0 ? '' : lines.slice(dateIndex, dateEnd + 1).map(l => l.text).join(' ');
      const dateMatch = dateText.match(/\bA\s+(\d{1,2}.*?\b\d{4})\b/i);
      const year = dateMatch?.[1].match(/\b(\d{4})$/)?.[1];
      const writtenYear = comparable(dateText).match(/DOS MIL\s+(.+)$/);
      const yearNumber = writtenYear ? writtenNumber(writtenYear[1]) : undefined;
      const day = comparable(dateText).match(/\bA (\d{1,2}) (?!DE\b)(.+?) DE /);
      const dayNumber = day ? writtenNumber(day[2]) : undefined;
      // Unreadable written numbers also require confirmation, not a guessed correction.
      const dateConflict = Boolean((writtenYear && (yearNumber === undefined || 2000 + yearNumber !== Number(year)))
        || (day && (dayNumber === undefined || dayNumber !== Number(day[1]))));
      const expedienteLine = lines.find(l => /^EXPEDIENTE\b/.test(l.key));
      const expedienteValue = expedienteLine?.text.match(/^EXPEDIENTE\s*(?:N[ÚU]M(?:ERO)?\.?)?\s*[:.\-]?\s*(\S.*)$/i)?.[1]?.trim().replace(/[.;,]$/, '');
      const parties: AppealParty[] = [];
      for (let j = 0; j < lines.length; j++) {
        const match = lines[j].text.match(/^(ACTOR(?:A|ES|AS)?|DEMANDAD[OA]S?)\s*:\s*(.*)$/i);
        if (!match) continue;
        const from = j;
        const pieces = [match[2]];
        while (j + 1 < lines.length && !/^(?:ACTOR(?:A|ES|AS)?|DEMANDAD[OA]S?|EXPEDIENTE|JUICIO|JUZGADO|TRIBUNAL)\b/.test(lines[j + 1].key) && !/\bA \d{1,2}\b/.test(lines[j + 1].key)) pieces.push(lines[++j].text);
        const role = /^ACTOR/i.test(match[1]) ? 'actor' as const : 'demandado' as const;
        const raw = pieces.join(' ').trim();
        const shared = raw.match(/^([^]+?),?\s+DE\s+APELLIDOS\s+([^]+?)[.]?$/i);
        const names = shared
          ? shared[1].split(/,|\s+Y\s+/i).map(n => `${n.trim()} ${shared[2].replace(/[.]$/, '').trim()}`)
          : raw.split(/;|:\s*(?=LIC\.)|,\s*(?:A\s+)?Y\s+(?=SUCESI[ÓO]N)/i).map(n => n.trim().replace(/[.;,:]$/, ''));
        for (const name of names.filter(n => n && !/^\d|\b(?:AHORA|VISTOS|SE\s+CITA|SE\s+DESECHA)\b/i.test(n))) {
          parties.push({ role, name, origin: span(from, j) });
        }
      }
      const resolution: AppealResolution = {
        id: `resolution-${fingerprint(`${source.id}:${first.page}:${start.heading}`)}`,
        sourceId: source.id, type: start.type, startPage: first.page, endPage: range.at(-1)!.page,
        ...(expedienteValue ? { expediente: expedienteValue } : {}),
        date: dateMatch?.[1]?.trim() || pending, court,
        dateStatus: dateConflict ? 'CONFIRM_DATE' : 'EXTRACTED', dateOrigin: dateIndex < 0 ? undefined : span(dateIndex, dateEnd),
        courtOrigin: courtIndex < 0 ? undefined : span(courtIndex, courtEnd), parties,
      };
      for (const page of range) {
        for (const match of page.text.matchAll(/^.*(?:NOTIFICACI[ÓO]N|BOLET[IÍ]N)[^\n]*$/gim)) {
          const bulletin = match[0].match(/BOLET[IÍ]N\s*(?:N[ÚU]M(?:ERO)?[.:]?\s*)?(\d+)/i)?.[1];
          const date = match[0].match(/\b(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+20\d{2})\b/i)?.[1];
          if (bulletin && date) resolution.notification = { date, bulletin, origin: origin(source.id, page.page, page.text, match[0]) };
        }
      }
      resolutions.push(resolution);
    }
  }
  return { sourceFingerprint: fingerprint(JSON.stringify(sources.map(s => [s.id, sourcePages(s).map(p => [p.page, p.text])]))), resolutions: consolidateAppealResolutions(resolutions), status: 'NEEDS_USER_INPUT', opportunity: '[A VERIFICAR]' };
}
export function validateAppealConfirmation(review: AppealResolutionReview, confirmation?: AppealConfirmation) {
  const selected = review.resolutions.find(r => r.id === confirmation?.resolutionId);
  const usable = (text?: string) => Boolean(text?.trim() && !/\[(?:A CONFIRMAR|DATO PENDIENTE)/i.test(text));
  const eligible = Boolean(selected && confirmation?.confirmed === true && confirmation.sourceFingerprint === review.sourceFingerprint
    && Array.isArray(confirmation.parties) && confirmation.parties.length && confirmation.parties.every(p => p && usable(p.name) && ['actor', 'demandado'].includes(p.role))
    && Array.isArray(confirmation.representedNames) && confirmation.representedNames.length && confirmation.representedNames.every(n => confirmation.parties.some(p => p.name === n))
    && usable(confirmation.recipient) && usable(confirmation.notification) && usable(confirmation.expediente)
    && (selected.dateStatus !== 'CONFIRM_DATE' || usable(confirmation.resolutionDate)));
  return { eligible, status: eligible ? 'CONFIRMED' as const : 'NEEDS_USER_INPUT' as const, selected };
}
/**
 * El PDF completo es la fuente de trabajo. Las páginas de la resolución elegida
 * controlan el escrito (fuente principal, primera del arreglo); el resto de las
 * páginas del MISMO documento (antecedentes, otras resoluciones, anexos) viajan
 * como fuente `REFERENCE`, que nunca controla ni clasifica la salida. Así no se
 * descarta información y una resolución distinta no se adopta como propia.
 */
export function selectAppealSources(sources: UploadedSourceDocument[], selected: AppealResolution): UploadedSourceDocument[] {
  return sources.filter(s => s.id === selected.sourceId).flatMap(s => {
    const all = sourcePages(s);
    const inRange = (p: { page: number }) => p.page >= selected.startPage && p.page <= selected.endPage;
    const pages = all.filter(inRange);
    const text = pages.map(p => p.text).join('\n\n');
    const primary: UploadedSourceDocument = { ...s, pages, content: text, extractedText: text };
    const rest = all.filter(p => !inRange(p));
    if (!rest.length) return [primary];
    const restText = rest.map(p => p.text).join('\n\n');
    const antecedents: UploadedSourceDocument = {
      ...s, id: `${s.id}::antecedentes`, filename: `${s.filename || s.name || s.id} (antecedentes)`,
      pages: rest, content: restText, extractedText: restText,
      classification: { ...(s.classification || {}), role: 'REFERENCE' },
    };
    return [primary, antecedents];
  });
}

/* ── Consolidación y resolución principal ────────────────────────────────── */
const isPending = (value?: string) => !value || value.trim().startsWith('[');
const sameValue = (a?: string, b?: string) => isPending(a) || isPending(b) || comparable(a!) === comparable(b!);
const equalKnown = (a?: string, b?: string) => !isPending(a) && !isPending(b) && comparable(a!) === comparable(b!);
const partyKey = (p: AppealParty) => `${p.role}:${comparable(p.name)}`;
function partySets(a: AppealParty[], b: AppealParty[]) {
  return { ka: new Set(a.map(partyKey)), kb: new Set(b.map(partyKey)) };
}
function partiesCompatible(a: AppealParty[], b: AppealParty[]) {
  if (!a.length || !b.length) return true;
  const { ka, kb } = partySets(a, b);
  return [...ka].every(k => kb.has(k)) || [...kb].every(k => ka.has(k));
}
function partiesEqual(a: AppealParty[], b: AppealParty[]) {
  if (!a.length || !b.length) return false;
  const { ka, kb } = partySets(a, b);
  return ka.size === kb.size && [...ka].every(k => kb.has(k));
}
const hasOwnIdentity = (r: AppealResolution) => !isPending(r.court) || !isPending(r.date) || r.parties.length > 0;

function mergeResolutions(a: AppealResolution, b: AppealResolution): AppealResolution {
  const courtFromA = !isPending(a.court) || isPending(b.court);
  const dateFromA = !isPending(a.date) || isPending(b.date);
  const parties = [...a.parties];
  for (const p of b.parties) if (!parties.some(q => partyKey(q) === partyKey(p))) parties.push(p);
  return {
    ...a,
    startPage: Math.min(a.startPage, b.startPage), endPage: Math.max(a.endPage, b.endPage),
    court: courtFromA ? a.court : b.court, courtOrigin: courtFromA ? (a.courtOrigin ?? b.courtOrigin) : b.courtOrigin,
    date: dateFromA ? a.date : b.date, dateStatus: dateFromA ? a.dateStatus : b.dateStatus, dateOrigin: dateFromA ? (a.dateOrigin ?? b.dateOrigin) : b.dateOrigin,
    parties, notification: a.notification ?? b.notification, expediente: a.expediente ?? b.expediente,
  };
}

/**
 * Agrupa detecciones que son el MISMO documento: fragmentos de página sin ficha
 * propia o repeticiones con la misma identidad (tipo + órgano + fecha + partes).
 * Dos decisiones distintas (otro tipo, otra fecha explícita, otro órgano u otras
 * partes) NUNCA se fusionan. El rango de páginas fusionado cubre todo el texto,
 * de modo que no se pierde contenido sustantivo.
 */
export function consolidateAppealResolutions(resolutions: AppealResolution[]): AppealResolution[] {
  const out: AppealResolution[] = [];
  for (const current of resolutions) {
    const previous = out.at(-1);
    let mergeable = false;
    if (previous && previous.sourceId === current.sourceId && previous.type === current.type) {
      const noConflict = sameValue(previous.court, current.court) && sameValue(previous.date, current.date) && sameValue(previous.expediente, current.expediente) && partiesCompatible(previous.parties, current.parties);
      if (noConflict) {
        const fragment = !hasOwnIdentity(current) || !hasOwnIdentity(previous);
        const matches = equalKnown(previous.court, current.court) || equalKnown(previous.date, current.date) || equalKnown(previous.expediente, current.expediente) || partiesEqual(previous.parties, current.parties);
        mergeable = fragment || matches;
      }
    }
    if (previous && mergeable) out[out.length - 1] = mergeResolutions(previous, current);
    else out.push(current);
  }
  return out;
}

const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
/** Clave numérica AAAAMMDD de una fecha escrita en español; undefined si no es legible. */
function dateKey(date: string): number | undefined {
  const m = comparable(date).replace('SETIEMBRE', 'SEPTIEMBRE')
    .match(/(\d{1,2}).*?\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b.*?(\d{4})/);
  return m ? Number(m[3]) * 10000 + (MONTHS.indexOf(m[2]) + 1) * 100 + Number(m[1]) : undefined;
}

/**
 * Resolución principal de trabajo: la sentencia definitiva prevalece sobre un
 * auto; entre iguales, la de fecha más reciente (o la posterior en el documento).
 * El resto son antecedentes, no candidatas que el abogado deba elegir de nuevo.
 */
export function selectPrimaryAppealResolution(resolutions: AppealResolution[]): { primary?: AppealResolution; antecedents: AppealResolution[] } {
  if (!resolutions.length) return { antecedents: [] };
  const rank = (r: AppealResolution) => (r.type === 'SENTENCIA_DEFINITIVA' ? 1 : 0);
  const primary = [...resolutions].sort((a, b) =>
    rank(b) - rank(a) || (dateKey(b.date) ?? -1) - (dateKey(a.date) ?? -1) || b.startPage - a.startPage)[0];
  return { primary, antecedents: resolutions.filter(r => r !== primary) };
}

/** Confirmación provisional derivada de la resolución principal; lo no verificable queda pendiente. */
export function deriveProvisionalAppealConfirmation(review: AppealResolutionReview, hints: { expediente?: string } = {}): AppealConfirmation {
  const { primary } = selectPrimaryAppealResolution(review.resolutions);
  return {
    sourceFingerprint: review.sourceFingerprint,
    resolutionId: primary?.id ?? '',
    parties: primary?.parties ?? [],
    representedNames: [],
    recipient: primary && !isPending(primary.court) ? primary.court : pending,
    notification: primary?.notification ? `${primary.notification.date} · Boletín ${primary.notification.bulletin}` : pending,
    expediente: !isPending(primary?.expediente) ? primary!.expediente!.trim() : !isPending(hints.expediente) ? hints.expediente!.trim() : pending,
    resolutionDate: '',
    confirmed: false,
    provisional: true,
  };
}

export interface AppealGenerationDecision {
  canGenerate: boolean;
  mode: 'CONFIRMED' | 'PROVISIONAL' | 'BLOCKED';
  selected?: AppealResolution;
  /** Datos que el borrador debe dejar marcados para revisión del abogado. */
  pendingFields: string[];
}

/**
 * Compuerta de generación de apelaciones. Acepta la confirmación explícita del
 * abogado (estricta, sin cambios) o una provisional ligada a la huella de la
 * fuente. Sin ninguna de las dos, o con una huella distinta, sigue bloqueada.
 */
export function resolveAppealGeneration(review: AppealResolutionReview, confirmation?: AppealConfirmation): AppealGenerationDecision {
  const strict = validateAppealConfirmation(review, confirmation);
  if (strict.eligible) return { canGenerate: true, mode: 'CONFIRMED', selected: strict.selected, pendingFields: [] };
  if (!confirmation || confirmation.provisional !== true || confirmation.sourceFingerprint !== review.sourceFingerprint) {
    return { canGenerate: false, mode: 'BLOCKED', pendingFields: [] };
  }
  const selected = review.resolutions.find(r => r.id === confirmation.resolutionId);
  if (review.resolutions.length > 0 && !selected) return { canGenerate: false, mode: 'BLOCKED', pendingFields: [] };
  const pendingFields = ['parte que representa'];
  if (!selected) pendingFields.push('resolución impugnada');
  if (isPending(confirmation.recipient)) pendingFields.push('autoridad destinataria');
  if (isPending(confirmation.notification)) pendingFields.push('fecha de notificación');
  if (isPending(confirmation.expediente)) pendingFields.push('número de expediente');
  if (selected?.dateStatus === 'CONFIRM_DATE') pendingFields.push('fecha de la resolución');
  return { canGenerate: true, mode: 'PROVISIONAL', selected, pendingFields };
}

/* ── Partes y secciones deterministas del escrito de apelación ─────────── */
const PARTE_REPRESENTADA_PENDIENTE = '[A CONFIRMAR POR EL ABOGADO: parte que representa]';
const PARTE_CONTRARIA_PENDIENTE = '[A CONFIRMAR POR EL ABOGADO: parte contraria]';

/** Una entrada por rol con TODOS los nombres: asignar rol por rol conservaba solo al último. */
export function consolidatePartiesByRole(parties: readonly AppealParty[]): Array<{ role: 'actor' | 'demandado'; name: string; source: 'detected' }> {
  const out: Array<{ role: 'actor' | 'demandado'; name: string; source: 'detected' }> = [];
  for (const role of ['actor', 'demandado'] as const) {
    const names = parties.filter(p => p.role === role).map(p => p.name);
    if (names.length) out.push({ role, name: names.join('; '), source: 'detected' });
  }
  return out;
}

/**
 * Quién comparece en la apelación: la parte representada confirmada. Si el abogado
 * no la ha indicado NO se elige una parte al azar: queda un marcador editable.
 */
export function appealAppearingParties(confirmation?: { representedNames?: string[]; parties?: AppealParty[] }): { appellant: string; counterpart: string } | undefined {
  if (!confirmation) return undefined;
  const parties = confirmation.parties ?? [];
  const represented = (confirmation.representedNames ?? []).filter(name => parties.some(p => p.name === name));
  if (!represented.length) return { appellant: PARTE_REPRESENTADA_PENDIENTE, counterpart: PARTE_CONTRARIA_PENDIENTE };
  const role = parties.find(p => p.name === represented[0])!.role;
  const counterpart = parties.filter(p => p.role !== role).map(p => p.name).join('; ');
  return { appellant: represented.join('; '), counterpart: counterpart || PARTE_CONTRARIA_PENDIENTE };
}

export interface AppealDocumentMeta {
  resolution?: AppealResolution;
  antecedents?: AppealResolution[];
  expediente?: string;
  notification?: string;
}

const kindLabel = (r: AppealResolution) => (r.type === 'AUTO' ? 'auto' : 'sentencia definitiva');
const fojas = (r: AppealResolution) => (r.startPage === r.endPage ? `foja ${r.startPage}` : `fojas ${r.startPage} a ${r.endPage}`);
function dateLabel(r: AppealResolution): string {
  if (isPending(r.date)) return '[A CONFIRMAR POR EL ABOGADO: fecha de la resolución]';
  return r.dateStatus === 'CONFIRM_DATE' ? `${r.date} [A CONFIRMAR POR EL ABOGADO: la lectura de la fecha en el documento es inconsistente]` : r.date;
}

/**
 * Texto determinista de las secciones que describen la resolución impugnada y sus
 * antecedentes, construido SOLO con datos extraídos de la fuente (con su foja) y
 * marcadores para lo que no consta. Devuelve undefined si el título no corresponde.
 */
export function renderAppealBackgroundSection(title: string, meta: AppealDocumentMeta): string | undefined {
  const titleKey = comparable(title).toLowerCase();
  const { resolution } = meta;
  const expediente = isPending(meta.expediente) ? '[A CONFIRMAR POR EL ABOGADO: número de expediente]' : meta.expediente!.trim();
  if (/resolucion\s+recurrida/.test(titleKey)) {
    if (!resolution) return '[A CONFIRMAR POR EL ABOGADO: resolución que se impugna]';
    const court = isPending(resolution.court) ? '[A CONFIRMAR POR EL ABOGADO: órgano jurisdiccional]' : resolution.court;
    const notification = isPending(meta.notification) ? 'La fecha de notificación queda por confirmar [A CONFIRMAR POR EL ABOGADO].' : `Notificada: ${meta.notification!.trim()}.`;
    return `Se recurre la ${kindLabel(resolution)} dictada por ${court} dentro del expediente ${expediente}, de fecha ${dateLabel(resolution)}. ${notification} Consta en ${fojas(resolution)} del documento fuente.`;
  }
  if (/resolucion\s+impugnada/.test(titleKey)) {
    return resolution
      ? `La resolución impugnada es la ${kindLabel(resolution)} identificada en el apartado de resolución recurrida, dictada dentro del expediente ${expediente}.`
      : '[A CONFIRMAR POR EL ABOGADO: resolución que se impugna]';
  }
  if (/antecedentes\s+procesales/.test(titleKey)) {
    const antecedents = meta.antecedents ?? [];
    if (!antecedents.length) return '[A CONFIRMAR POR EL ABOGADO: antecedentes procesales relevantes del expediente]';
    return ['Constan en el documento fuente las siguientes actuaciones previas:',
      ...antecedents.map((a, i) => `${i + 1}. ${kindLabel(a).replace(/^./, c => c.toUpperCase())} de fecha ${dateLabel(a)}${isPending(a.court) ? '' : `, dictado por ${a.court}`} (${fojas(a)}).`)].join('\n');
  }
  return undefined;
}
