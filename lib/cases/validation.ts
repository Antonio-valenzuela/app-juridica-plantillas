import { MEXICO_CITY_TIMEZONE, parseProceduralDate } from '@/lib/cases/deadlineDates';

const value = (input: unknown, maxLength: number): string | null => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
};

const optionalHttpsUrl = (
  input: unknown
): { valid: true; value: string | null } | { valid: false; error: string } => {
  const parsedValue = value(input, 2_000);
  if (!parsedValue) return { valid: true, value: null };
  try {
    const url = new URL(parsedValue);
    if (url.protocol !== 'https:') throw new Error('protocol');
    return { valid: true, value: url.toString() };
  } catch {
    return { valid: false, error: 'La URL debe usar HTTPS.' };
  }
};

type Validation<T> =
  | { valid: true; data: T }
  | { valid: false; error: string };

export interface MatterCreateData {
  title: string;
  description: string | null;
  status: 'open';
  matter: string;
  reference: string | null;
  jurisdiction: string;
  court: string;
  caseNumber: string;
}

type MatterUpdateData = Partial<Omit<MatterCreateData, 'status'>> & {
  status?: 'open' | 'closed' | 'archived';
};

export const validateMatterCreate = (
  input: Record<string, unknown>
): Validation<MatterCreateData> => {
  const jurisdiction = value(input.jurisdiction, 120);
  const court = value(input.court, 300);
  const caseNumber = value(input.caseNumber, 120);
  const matter = value(input.matter, 120);
  if (!jurisdiction || !court || !caseNumber || !matter) {
    return {
      valid: false,
      error: 'Jurisdicción, órgano, número de expediente y materia son requeridos.',
    };
  }

  return {
    valid: true,
    data: {
      title: value(input.title, 300) || `${matter} — ${caseNumber}`,
      description: value(input.notes ?? input.description, 10_000),
      status: 'open',
      matter,
      reference: value(input.reference, 120),
      jurisdiction,
      court,
      caseNumber,
    },
  };
};

export const validateMatterUpdate = (
  input: Record<string, unknown>
): Validation<MatterUpdateData> => {
  const data: MatterUpdateData = {};

  if (input.status !== undefined) {
    if (!['open', 'closed', 'archived'].includes(String(input.status))) {
      return { valid: false, error: 'El estado del expediente no es válido.' };
    }
    data.status = input.status as 'open' | 'closed' | 'archived';
  }

  const fields = [
    ['title', 300],
    ['matter', 120],
    ['reference', 120],
    ['jurisdiction', 120],
    ['court', 300],
    ['caseNumber', 120],
  ] as const;
  for (const [field, maxLength] of fields) {
    if (input[field] !== undefined) {
      const parsed = value(input[field], maxLength);
      if (!parsed) return { valid: false, error: `El campo ${field} no es válido.` };
      data[field] = parsed;
    }
  }
  if (input.notes !== undefined || input.description !== undefined) {
    data.description = value(input.notes ?? input.description, 10_000);
  }
  if (Object.keys(data).length === 0) {
    return { valid: false, error: 'No hay cambios válidos para guardar.' };
  }
  return { valid: true, data };
};

export const validatePartyCreate = (
  input: Record<string, unknown>
): Validation<{ role: string; name: string; rfc: string | null; notes: string | null }> => {
  const role = value(input.role, 100);
  const name = value(input.name, 300);
  if (!role || !name) {
    return { valid: false, error: 'Rol y nombre de la parte son requeridos.' };
  }
  return {
    valid: true,
    data: {
      role,
      name,
      rfc: value(input.rfc, 30),
      notes: value(input.notes, 2_000),
    },
  };
};

export const validateActuationCreate = (
  input: Record<string, unknown>
): Validation<{
  date: Date;
  type: string;
  summary: string;
  sourceUrl: string | null;
}> => {
  const date = new Date(String(input.date || ''));
  const type = value(input.type, 100);
  const summary = value(input.summary, 10_000);
  const sourceUrl = optionalHttpsUrl(input.sourceUrl);
  if (Number.isNaN(date.getTime()) || !type || !summary || !sourceUrl.valid) {
    return {
      valid: false,
      error: sourceUrl.valid
        ? 'Fecha, tipo y resumen de la actuación son requeridos.'
        : sourceUrl.error,
    };
  }
  return { valid: true, data: { date, type, summary, sourceUrl: sourceUrl.value } };
};

export const validateDeadlineCreate = (
  input: Record<string, unknown>
): Validation<{
  title: string;
  dueDate: Date;
  dueTime: string | null;
  timezone: string;
  dayType: string;
  calendarStatus: string;
  calculationNote: string | null;
  type: string;
  daysTotal: number | null;
  notes: string | null;
}> => {
  const title = value(input.title, 300);
  const type = value(input.type, 100);
  let dueDate: Date;
  try {
    dueDate = parseProceduralDate(String(input.dueDate || ''));
  } catch {
    return { valid: false, error: 'Título, tipo y fecha límite válida son requeridos.' };
  }
  const dueTime = value(input.dueTime, 5);
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
    return { valid: false, error: 'La hora límite debe usar HH:mm.' };
  }
  const timezone = value(input.timezone, 80) || MEXICO_CITY_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(dueDate);
  } catch {
    return { valid: false, error: 'La zona horaria no es válida.' };
  }
  const dayType = ['calendar_date', 'business_day', 'judicial_calendar'].includes(String(input.dayType))
    ? String(input.dayType)
    : 'calendar_date';
  const calendarStatus = input.calendarStatus === 'verified' ? 'verified' : 'unverified';
  const daysTotal =
    typeof input.daysTotal === 'number' &&
    Number.isInteger(input.daysTotal) &&
    input.daysTotal >= 0
      ? input.daysTotal
      : null;
  if (!title || !type) {
    return { valid: false, error: 'Título, tipo y fecha límite son requeridos.' };
  }
  return {
    valid: true,
    data: {
      title,
      type,
      dueDate,
      dueTime,
      timezone,
      dayType,
      calendarStatus,
      calculationNote: calendarStatus === 'verified' ? value(input.calculationNote, 500) : 'Cálculo preliminar. Requiere validación profesional.',
      daysTotal,
      notes: value(input.notes, 2_000),
    },
  };
};

export const validateCaseFileCreate = (
  input: Record<string, unknown>
): Validation<{
  title: string;
  fileType: string;
  url: string | null;
  content: string | null;
  notes: string | null;
}> => {
  const title = value(input.title, 300);
  const fileType = value(input.fileType, 100);
  const url = optionalHttpsUrl(input.url);
  if (!title || !fileType || !url.valid) {
    return {
      valid: false,
      error: url.valid
        ? 'Título y tipo de documento son requeridos.'
        : url.error,
    };
  }
  return {
    valid: true,
    data: {
      title,
      fileType,
      url: url.value,
      content: value(input.content, 100_000),
      notes: value(input.notes, 2_000),
    },
  };
};
