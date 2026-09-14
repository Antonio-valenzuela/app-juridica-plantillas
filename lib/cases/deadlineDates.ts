export const MEXICO_CITY_TIMEZONE = 'America/Mexico_City';

export type DeadlineState = 'pending' | 'overdue';

export function parseProceduralDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('La fecha procesal debe usar YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error('La fecha procesal no es válida.');
  }
  return candidate;
}

export function proceduralDateKey(value: Date, timezone = MEXICO_CITY_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function deadlineStatus(dueDate: Date, options: { now?: Date; timezone?: string } = {}): DeadlineState {
  const timezone = options.timezone || MEXICO_CITY_TIMEZONE;
  const today = proceduralDateKey(options.now || new Date(), timezone);
  return proceduralDateKey(dueDate, timezone) < today ? 'overdue' : 'pending';
}

export function proceduralDateLabel(value: Date | string, timezone = MEXICO_CITY_TIMEZONE) {
  const date = typeof value === 'string' ? parseProceduralDate(value) : value;
  return new Intl.DateTimeFormat('es-MX', { timeZone: timezone, dateStyle: 'long' }).format(date);
}
