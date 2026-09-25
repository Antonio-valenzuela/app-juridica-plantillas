export type AgendaPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type AgendaStatus = 'PENDING' | 'COMPLETED';

export interface AgendaEvent {
  id: string;
  documentId: string;
  caseId?: string;
  expediente?: string;
  dueDate: string;
  title: string;
  priority: AgendaPriority;
  status: AgendaStatus;
  needsReview: boolean;
  source: 'DOCUMENT';
  sourceText: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaExtractionOptions {
  documentId: string;
  caseId?: string;
  expediente?: string;
  referenceDate?: string;
}

export const AGENDA_STORAGE_KEY = 'workspace-agenda:v1';
export const AGENDA_CHANGED_EVENT = 'workspace-agenda:changed';

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() === Number(match[2]) - 1
    && date.getUTCDate() === Number(match[3])
    ? date
    : null;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseSpanishDate(value: string): string | null {
  const long = /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i.exec(value);
  if (long) {
    const month = MONTHS[long[2].toLocaleLowerCase('es-MX')];
    if (!month) return null;
    const candidate = new Date(Date.UTC(Number(long[3]), month - 1, Number(long[1]), 12));
    return candidate.getUTCFullYear() === Number(long[3])
      && candidate.getUTCMonth() === month - 1
      && candidate.getUTCDate() === Number(long[1])
      ? dateKey(candidate)
      : null;
  }

  const numeric = /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/.exec(value);
  if (numeric) {
    const candidate = new Date(Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]), 12));
    return candidate.getUTCFullYear() === Number(numeric[3])
      && candidate.getUTCMonth() === Number(numeric[2]) - 1
      && candidate.getUTCDate() === Number(numeric[1])
      ? dateKey(candidate)
      : null;
  }

  const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(value)?.[1];
  return iso && parseDateKey(iso) ? iso : null;
}

function nextWeekday(referenceDate: string, weekdayName: string): string | null {
  const reference = parseDateKey(referenceDate);
  const target = WEEKDAYS[weekdayName.toLocaleLowerCase('es-MX')];
  if (!reference || target === undefined) return null;
  const delta = (target - reference.getUTCDay() + 7) % 7 || 7;
  reference.setUTCDate(reference.getUTCDate() + delta);
  return dateKey(reference);
}

function relativeDate(referenceDate: string, days: number): string | null {
  const reference = parseDateKey(referenceDate);
  if (!reference || !Number.isInteger(days) || days < 0 || days > 3650) return null;
  reference.setUTCDate(reference.getUTCDate() + days);
  return dateKey(reference);
}

function priorityFor(text: string): AgendaPriority {
  if (/\b(t[eé]rmino|plazo|vencimiento|fecha\s+l[ií]mite|presentar|cumplir)\b/i.test(text)) return 'HIGH';
  if (/\b(audiencia|comparecencia|diligencia)\b/i.test(text)) return 'MEDIUM';
  return 'LOW';
}

function titleFor(text: string): string {
  if (/\b(t[eé]rmino|plazo|vencimiento|fecha\s+l[ií]mite)\b/i.test(text)) return 'Término procesal';
  if (/\b(audiencia|comparecencia|diligencia)\b/i.test(text)) return 'Audiencia o diligencia';
  return 'Seguimiento procesal';
}

function dateFromSentence(sentence: string, referenceDate: string): { dueDate: string; needsReview: boolean } | null {
  const explicit = parseSpanishDate(sentence);
  if (explicit) return { dueDate: explicit, needsReview: false };

  const weekday = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.exec(sentence)?.[1];
  if (weekday) {
    const dueDate = nextWeekday(referenceDate, weekday);
    if (dueDate) return { dueDate, needsReview: true };
  }

  const relative = /\b(?:dentro\s+de|en)\s+(\d{1,4})\s+d[ií]as\b/i.exec(sentence)?.[1];
  if (relative) {
    const dueDate = relativeDate(referenceDate, Number(relative));
    if (dueDate) return { dueDate, needsReview: true };
  }
  return null;
}

export function extractAgendaEvents(text: string, options: AgendaExtractionOptions): AgendaEvent[] {
  const documentId = options.documentId.trim();
  if (!documentId) return [];
  const referenceDate = options.referenceDate || new Date().toISOString().slice(0, 10);
  const sentences = text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map(normalizeText)
    .filter((sentence) => sentence.length > 0);
  const events: AgendaEvent[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    if (!/\b(t[eé]rmino|plazo|vencimiento|fecha\s+l[ií]mite|presentar|cumplir|audiencia|comparecencia|diligencia)\b/i.test(sentence)) continue;
    const parsed = dateFromSentence(sentence, referenceDate);
    if (!parsed) continue;
    const key = `${documentId}|${parsed.dueDate}|${titleFor(sentence)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const now = new Date().toISOString();
    const baseId = `agenda-${documentId}-${parsed.dueDate}`;
    const id = events.some((event) => event.id === baseId) ? `${baseId}-${events.length + 1}` : baseId;
    events.push({
      id,
      documentId,
      caseId: options.caseId,
      expediente: options.expediente,
      dueDate: parsed.dueDate,
      title: titleFor(sentence),
      priority: priorityFor(sentence),
      status: 'PENDING',
      needsReview: parsed.needsReview,
      source: 'DOCUMENT',
      sourceText: sentence.slice(0, 280),
      createdAt: now,
      updatedAt: now,
    });
  }
  return events;
}

export function synchronizeDocumentAgenda(
  previous: AgendaEvent[],
  documentId: string,
  extracted: AgendaEvent[],
): AgendaEvent[] {
  const previousForDocument = new Map(previous.filter((event) => event.documentId === documentId).map((event) => [event.id, event]));
  const nextForDocument = extracted.map((event) => {
    const saved = previousForDocument.get(event.id);
    return saved
      ? { ...event, status: saved.status, createdAt: saved.createdAt, updatedAt: new Date().toISOString() }
      : event;
  });
  return [...previous.filter((event) => event.documentId !== documentId), ...nextForDocument].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function readAgendaEvents(): AgendaEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AGENDA_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((event): event is AgendaEvent => Boolean(event?.id && event?.documentId && event?.dueDate)) : [];
  } catch {
    return [];
  }
}

export function writeAgendaEvents(events: AgendaEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AGENDA_STORAGE_KEY, JSON.stringify(events));
    window.dispatchEvent(new CustomEvent(AGENDA_CHANGED_EVENT));
  } catch {
    // La generación no debe fallar si el almacenamiento local está bloqueado.
  }
}
