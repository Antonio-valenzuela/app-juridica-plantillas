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
  parties: AppealParty[]; notification?: { date: string; bulletin: string; origin: AppealOrigin };
}
export interface AppealResolutionReview {
  sourceFingerprint: string; resolutions: AppealResolution[]; status: 'NEEDS_USER_INPUT'; opportunity: '[A VERIFICAR]';
}
export interface AppealConfirmation {
  sourceFingerprint: string; resolutionId: string; parties: AppealParty[]; representedNames: string[];
  recipient: string; notification: string; confirmed: boolean; resolutionDate?: string;
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
  return { sourceFingerprint: fingerprint(JSON.stringify(sources.map(s => [s.id, sourcePages(s).map(p => [p.page, p.text])]))), resolutions, status: 'NEEDS_USER_INPUT', opportunity: '[A VERIFICAR]' };
}
export function validateAppealConfirmation(review: AppealResolutionReview, confirmation?: AppealConfirmation) {
  const selected = review.resolutions.find(r => r.id === confirmation?.resolutionId);
  const usable = (text?: string) => Boolean(text?.trim() && !/\[(?:A CONFIRMAR|DATO PENDIENTE)/i.test(text));
  const eligible = Boolean(selected && confirmation?.confirmed === true && confirmation.sourceFingerprint === review.sourceFingerprint
    && Array.isArray(confirmation.parties) && confirmation.parties.length && confirmation.parties.every(p => p && usable(p.name) && ['actor', 'demandado'].includes(p.role))
    && Array.isArray(confirmation.representedNames) && confirmation.representedNames.length && confirmation.representedNames.every(n => confirmation.parties.some(p => p.name === n))
    && usable(confirmation.recipient) && usable(confirmation.notification)
    && (selected.dateStatus !== 'CONFIRM_DATE' || usable(confirmation.resolutionDate)));
  return { eligible, status: eligible ? 'CONFIRMED' as const : 'NEEDS_USER_INPUT' as const, selected };
}
export function selectAppealSources(sources: UploadedSourceDocument[], selected: AppealResolution): UploadedSourceDocument[] {
  return sources.filter(s => s.id === selected.sourceId).map(s => {
    const pages = sourcePages(s).filter(p => p.page >= selected.startPage && p.page <= selected.endPage);
    const text = pages.map(p => p.text).join('\n\n');
    return { ...s, pages, content: text, extractedText: text };
  });
}
