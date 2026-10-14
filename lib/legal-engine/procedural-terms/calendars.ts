import type { CalendarId, IsoDate, NonWorkingDay, OfficialSuspension } from './types';

/**
 * Días inhábiles fijados por la ley. Las suspensiones de labores de cada órgano (vacaciones,
 * acuerdos, fuerza mayor) NO se infieren: se reciben como datos oficiales del abogado.
 */

export function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Fecha inválida: «${value}». Usa AAAA-MM-DD.`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Fecha inexistente: «${value}».`);
  }
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** n-ésimo lunes del mes (n ≥ 1), como fecha ISO. */
function nthMonday(year: number, monthIndex: number, n: number): IsoDate {
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const offset = (8 - first.getUTCDay()) % 7;
  return `${year}-${pad(monthIndex + 1)}-${pad(1 + offset + (n - 1) * 7)}`;
}

/** Ley de Amparo, art. 19: fechas fijas del año, además de sábados y domingos. */
function amparoStatutoryHolidays(year: number): NonWorkingDay[] {
  const fixed: Array<[string, string]> = [
    ['01-01', 'Uno de enero (art. 19 LA)'],
    ['02-05', 'Cinco de febrero (art. 19 LA)'],
    ['03-21', 'Veintiuno de marzo (art. 19 LA)'],
    ['05-01', 'Uno de mayo (art. 19 LA)'],
    ['05-05', 'Cinco de mayo (art. 19 LA)'],
    ['09-14', 'Catorce de septiembre (art. 19 LA)'],
    ['09-16', 'Dieciséis de septiembre (art. 19 LA)'],
    ['10-12', 'Doce de octubre (art. 19 LA)'],
    ['11-20', 'Veinte de noviembre (art. 19 LA)'],
    ['12-25', 'Veinticinco de diciembre (art. 19 LA)'],
  ];
  return fixed.map(([monthDay, reason]) => ({ date: `${year}-${monthDay}`, reason }));
}

/** LFT, art. 74 (descanso obligatorio) en relación con el art. 715. */
function lftStatutoryHolidays(year: number): NonWorkingDay[] {
  const days: NonWorkingDay[] = [
    { date: `${year}-01-01`, reason: '1o. de enero (art. 74-I LFT)' },
    { date: nthMonday(year, 1, 1), reason: 'Primer lunes de febrero (art. 74-II LFT)' },
    { date: nthMonday(year, 2, 3), reason: 'Tercer lunes de marzo (art. 74-III LFT)' },
    { date: `${year}-05-01`, reason: '1o. de mayo (art. 74-IV LFT)' },
    { date: `${year}-09-16`, reason: '16 de septiembre (art. 74-V LFT)' },
    { date: nthMonday(year, 10, 3), reason: 'Tercer lunes de noviembre (art. 74-VI LFT)' },
    { date: `${year}-12-25`, reason: '25 de diciembre (art. 74-VIII LFT)' },
  ];
  // Fr. VII: 1o. de octubre cada seis años, cuando corresponda a la transmisión del Ejecutivo Federal (2024, 2030…).
  if (year >= 2024 && (year - 2024) % 6 === 0) {
    days.push({ date: `${year}-10-01`, reason: 'Transmisión del Poder Ejecutivo Federal (art. 74-VII LFT)' });
  }
  return days;
}

export const CALENDAR_LABELS: Record<CalendarId, string> = {
  LEY_DE_AMPARO_ART_19: 'Días hábiles del juicio de amparo (art. 19 de la Ley de Amparo)',
  LFT_ARTS_74_715: 'Días hábiles laborales (arts. 74 y 715 de la Ley Federal del Trabajo)',
};

export class StatutoryCalendar {
  private readonly cache = new Map<number, Map<IsoDate, string>>();
  private readonly suspensions: Map<IsoDate, OfficialSuspension>;

  constructor(readonly id: CalendarId, suspensions: OfficialSuspension[] = []) {
    this.suspensions = new Map(suspensions.map((item) => [toIsoDate(parseIsoDate(item.date)), item]));
  }

  private holidays(year: number): Map<IsoDate, string> {
    let map = this.cache.get(year);
    if (!map) {
      const list = this.id === 'LEY_DE_AMPARO_ART_19' ? amparoStatutoryHolidays(year) : lftStatutoryHolidays(year);
      map = new Map(list.map((item) => [item.date, item.reason]));
      this.cache.set(year, map);
    }
    return map;
  }

  /** Razón por la que el día es inhábil, o null si es hábil. */
  nonWorkingReason(date: Date): string | null {
    const iso = toIsoDate(date);
    const suspension = this.suspensions.get(iso);
    if (suspension) return `Suspensión de labores: ${suspension.description}`;
    const holiday = this.holidays(date.getUTCFullYear()).get(iso);
    if (holiday) return holiday;
    const weekday = date.getUTCDay();
    if (weekday === 6) return 'Sábado';
    if (weekday === 0) return 'Domingo';
    return null;
  }

  isWorkingDay(date: Date): boolean {
    return this.nonWorkingReason(date) === null;
  }

  nextWorkingDay(after: Date): Date {
    let current = addDays(after, 1);
    for (let guard = 0; guard < 400 && !this.isWorkingDay(current); guard += 1) current = addDays(current, 1);
    return current;
  }

  appliedSuspensions(from: Date, to: Date): OfficialSuspension[] {
    const start = toIsoDate(from);
    const end = toIsoDate(to);
    return [...this.suspensions.values()].filter((item) => item.date >= start && item.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  }
}
