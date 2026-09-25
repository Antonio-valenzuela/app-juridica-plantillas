export type WorkspaceTermMode = 'BUSINESS' | 'CALENDAR';

export interface WorkspaceTermInput {
  startDate: string;
  days: number;
  mode: WorkspaceTermMode;
  excludedDates: string[];
  includeStart: boolean;
  jurisdiction?: string;
}
export interface WorkspaceTermResult {
  calculatedDate: string;
  provisional: true;
  assumptions: string[];
}

export interface WorkspaceTermRecord {
  input: WorkspaceTermInput;
  result: WorkspaceTermResult;
  calculatedAt: string;
  caseId?: string;
  expediente?: string;
}

export function workspaceTermStorageKey(caseId?: string): string {
  return `workspace-term:last:${caseId?.trim() || 'unassigned'}`;
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('La fecha debe usar YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('La fecha no es válida.');
  }
  return date;
}

function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function eligible(date: Date, mode: WorkspaceTermMode, excluded: Set<string>): boolean {
  if (excluded.has(key(date))) return false;
  if (mode === 'BUSINESS' && [0, 6].includes(date.getUTCDay())) return false;
  return true;
}

export function calculateWorkspaceTerm(input: WorkspaceTermInput): WorkspaceTermResult {
  if (!Number.isInteger(input.days) || input.days < 1) throw new Error('Los días deben ser un entero mayor que cero.');
  const start = parseDate(input.startDate);
  const excludedDates = input.excludedDates.map(parseDate).map(key);
  const excluded = new Set(excludedDates);
  const current = new Date(start);
  let counted = 0;

  if (input.includeStart && eligible(current, input.mode, excluded)) counted += 1;
  while (counted < input.days) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (eligible(current, input.mode, excluded)) counted += 1;
  }

  const assumptions = [
    `Modo ${input.mode === 'BUSINESS' ? 'hábil' : 'natural'} aplicado localmente`,
    `Inicio ${input.includeStart ? 'incluido' : 'no incluido'}`,
    ...(input.jurisdiction?.trim() ? [`Jurisdicción indicada: ${input.jurisdiction.trim()}`] : []),
    ...(excludedDates.length ? [`Fechas excluidas configuradas: ${excludedDates.join(', ')}`] : []),
    'El resultado es provisional y requiere verificación del calendario oficial aplicable',
  ];

  return { calculatedDate: key(current), provisional: true, assumptions };
}
