import type { UploadedSourceDocument } from './types';
import { detectCaseFicha } from './caseFichaDetection';
import { extractAddressedCourt } from './partyExtraction';
import { extractAppealResolutionReview, selectPrimaryAppealResolution } from './case-extraction/appealResolutionReview';
import { proceduralActsOf } from './proceduralActs';
import type { SignerRole, WritingContract } from './writingContract';

/**
 * Ficha del caso: lo que el sistema extrajo del expediente subido y el abogado CONFIRMA antes de redactar.
 *
 * Es la única fuente de datos para nombres, órgano, lugar, fechas y número de expediente en el escrito: el
 * redactor no puede usar otros. La representación (a quién representa el abogado) la ELIGE el abogado; nunca
 * se infiere. Todo dato no extraído queda vacío y se lista en `missing`, nunca se rellena.
 */

/** Lado en el juicio de origen. */
export type ProcessSide = 'actor' | 'demandado' | 'otro';

export interface DossierParty {
  name: string;
  /** Lado en el juicio de origen (actor / demandado). */
  role: ProcessSide;
  page?: number;
}

export interface DossierAgravio {
  number: number;
  /** Texto del agravio tal como consta en el escrito del apelante. */
  text: string;
  page?: number;
}

export interface CaseDossier {
  version: 1;
  /** Órgano jurisdiccional que consta en el expediente (editable por el abogado). */
  court: string;
  /** Lugar de presentación, tomado del encabezado del órgano; vacío si no consta. */
  city: string;
  expediente: string;
  parties: DossierParty[];
  resolution?: { kind: 'AUTO' | 'SENTENCIA_DEFINITIVA'; date: string; court: string; startPage: number; endPage: number };
  notifications: Array<{ date: string; description: string }>;
  agravios: DossierAgravio[];
  /** Puntos resolutivos de la sentencia apelada, textuales. */
  resolutivos: string[];
  /** Lado que apela, si el expediente incluye el escrito de agravios (quien lo firma). */
  appellantSide?: ProcessSide;
  /** A quién representa el abogado: lo elige él, no se infiere. */
  representedSide?: ProcessSide;
  representedName?: string;
  confirmed: boolean;
  confirmedAt?: string;
  sourceFingerprint: string;
  /** Campos que no constan en el expediente. */
  missing: string[];
}

/* ── utilidades ───────────────────────────────────────────────────────────── */

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const NUMERIC_DATE = new RegExp(String.raw`\b\d{1,2}\s+de\s+(?:${MONTHS})\s+de(?:l\s+a[ñn]o)?\s+(?:\d{4}|dos\s+mil\s+[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)?)`, 'gi');

function fingerprintOf(sources: UploadedSourceDocument[]): string {
  let a = 2166136261;
  for (const source of sources) {
    const text = sources.length ? (source.pages?.map((page) => page.text).join('\n') || source.extractedText || source.content || '') : '';
    for (let i = 0; i < text.length; i += 7) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    a = Math.imul(a ^ text.length, 16777619);
  }
  return `${(a >>> 0).toString(16)}-${sources.length}`;
}

function textOf(source: UploadedSourceDocument): string {
  return source.pages?.map((page) => page.text).join('\n') || source.extractedText || source.content || '';
}

const SMALL_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'en']);
function titleCase(value: string): string {
  return value.toLocaleLowerCase('es-MX').split(/\s+/).filter(Boolean)
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toLocaleUpperCase('es-MX') + word.slice(1))).join(' ');
}

/** Lugar de la resolución: «ZAPOPAN, JALISCO A 12 DOCE DE AGOSTO…» / «Guadalajara, Jalisco, a veinte de…». */
export function extractCity(text: string): string {
  const head = text.split(/\r?\n/).slice(0, 40);
  for (const raw of head) {
    const line = raw.replace(/^[\s|“”"'_:;!+—–-]+/, '').replace(/^(?:[a-zA-Z]{1,2}\s+)(?=[A-ZÁÉÍÓÚÑ]{3,})/, '');
    const match = line.match(/([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,3}),\s*([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,2}),?\s+(?:a|A)\s+(?:\d{1,2}\b|[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?\s+(?:de|DE)\s)/);
    if (!match) continue;
    const city = match[1].trim();
    if (/\b(?:fecha|lugar|expediente|juzgado|tribunal|sala)\b/i.test(city)) continue;
    return `${titleCase(city)}, ${titleCase(match[2].trim())}`;
  }
  return '';
}

/** Fechas de notificación que el expediente declara expresamente. */
export function extractNotifications(text: string): Array<{ date: string; description: string }> {
  const found: Array<{ date: string; description: string }> = [];
  const re = new RegExp(String.raw`(notific(?:ad[oa]s?|aci[oó]n)[^.\n]{0,90}?)(?:el|con\s+fecha(?:\s+de)?|en\s+fecha)\s+(${NUMERIC_DATE.source})`, 'gi');
  for (const match of text.matchAll(re)) {
    const date = match[2].replace(/\s+/g, ' ').trim();
    if (!found.some((item) => item.date.toLowerCase() === date.toLowerCase())) found.push({ date, description: match[1].replace(/\s+/g, ' ').trim() });
  }
  return found.slice(0, 6);
}

const ORDINALS: Record<string, number> = {
  PRIMERO: 1, PRIMER: 1, SEGUNDO: 2, TERCERO: 3, TERCER: 3, CUARTO: 4, QUINTO: 5, SEXTO: 6, SEPTIMO: 7, OCTAVO: 8, NOVENO: 9, DECIMO: 10, UNICO: 1,
};
const ordinalKey = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/**
 * Agravios numerados del escrito del apelante: «AGRAVIO PRIMERO», «PRIMER AGRAVIO», «AGRAVIO 2.-»… Cada
 * agravio llega hasta el siguiente encabezado de agravio o hasta los puntos petitorios/pruebas/firma.
 */
export function extractAgravios(text: string, pageOf?: (offset: number) => number | undefined): DossierAgravio[] {
  const heading = /(?:^|\n)[ \t]*(?:(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)\s+AGRAVIO|AGRAVIO\s+(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO|[ÚU]NICO|\d{1,2}))\b[ \t]*[.:\-–—]*/gi;
  const end = /(?:^|\n)[ \t]*(?:PUNTOS\s+PETITORIOS|PETITORIOS|PRUEBAS|PROTESTO|ATENTAMENTE|BAJO\s+PROTESTA)\b/i;
  const marks: Array<{ index: number; bodyStart: number; number: number }> = [];
  for (const match of text.matchAll(heading)) {
    const raw = match[1] || match[2];
    const number = /^\d+$/.test(raw) ? Number(raw) : ORDINALS[ordinalKey(raw)];
    if (!number) continue;
    marks.push({ index: match.index ?? 0, bodyStart: (match.index ?? 0) + match[0].length, number });
  }
  const agravios: DossierAgravio[] = [];
  marks.forEach((mark, position) => {
    const next = marks[position + 1]?.index ?? text.length;
    let body = text.slice(mark.bodyStart, next);
    const stop = body.search(end);
    if (stop >= 0) body = body.slice(0, stop);
    body = body.replace(/\s+/g, ' ').trim();
    if (body.length < 25) return;
    if (agravios.some((item) => item.number === mark.number)) return;
    agravios.push({ number: mark.number, text: body.slice(0, 2400), page: pageOf?.(mark.index) });
  });
  return agravios.sort((a, b) => a.number - b.number);
}

function pageLocator(source: UploadedSourceDocument): (offset: number) => number | undefined {
  const pages = [...(source.pages || [])].sort((a, b) => a.page - b.page);
  const starts: Array<{ page: number; start: number }> = [];
  let cursor = 0;
  for (const page of pages) { starts.push({ page: page.page, start: cursor }); cursor += page.text.length + 1; }
  return (offset) => [...starts].reverse().find((item) => offset >= item.start)?.page;
}

/** Fuentes que contienen el escrito de agravios del contrario (por tipo de acto o por encabezados de agravio). */
function appealBriefTexts(sources: UploadedSourceDocument[]): Array<{ source: UploadedSourceDocument; text: string }> {
  const out: Array<{ source: UploadedSourceDocument; text: string }> = [];
  for (const source of sources) {
    const acts = proceduralActsOf(source);
    const recursoActs = acts.filter((act) => act.kind === 'RECURSO');
    if (recursoActs.length) {
      out.push({ source, text: recursoActs.flatMap((act) => act.pages.map((page) => page.text)).join('\n') });
    } else if (extractAgravios(textOf(source)).length >= 1 && !acts.some((act) => ['SENTENCIA_DEFINITIVA', 'AUTO_INTERLOCUTORIO'].includes(act.kind) && act.startPage === 1)) {
      out.push({ source, text: textOf(source) });
    }
  }
  return out;
}

/** Resolutivos textuales de la sentencia (después de «SE RESUELVE» / «RESUELVE»). */
export function extractResolutivos(text: string): string[] {
  const start = text.search(/(?:^|\n)\s*(?:SE\s+RESUELVE|RESUELVE|PUNTOS\s+RESOLUTIVOS|R\s*E\s*S\s*U\s*E\s*L\s*V\s*E)\s*:?/i);
  if (start < 0) return [];
  const tail = text.slice(start).split('\n').slice(1);
  const lines: string[] = [];
  for (const raw of tail) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(?:notif[ií]quese|as[ií]\s+lo\s+(?:resolvi[oó]|sentenci[oó]|proveyo|acord[oó])|firma|constancia\b)/i.test(line)) break;
    if (/^(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|ÚNICO|UNICO)\b/i.test(line)) lines.push(line.slice(0, 500));
    else if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} ${line}`.slice(0, 500);
    if (lines.length >= 8) break;
  }
  return lines;
}

/* ── construcción ─────────────────────────────────────────────────────────── */

function partyNames(raw: string): string[] {
  return raw.split(/;|\s+y\s+(?=[A-ZÁÉÍÓÚÑ])/).map((name) => name.trim()).filter((name) => name.length > 2);
}

export function buildCaseDossier(sources: UploadedSourceDocument[]): CaseDossier {
  const texts = sources.map(textOf);
  const full = texts.join('\n\n');
  const ficha = detectCaseFicha(texts);
  const review = extractAppealResolutionReview(sources);
  const { primary } = selectPrimaryAppealResolution(review.resolutions);

  const parties: DossierParty[] = [];
  const pushParty = (name: string, role: ProcessSide, page?: number) => {
    const key = name.toLowerCase();
    if (name && !parties.some((party) => party.name.toLowerCase() === key && party.role === role)) parties.push({ name, role, ...(page ? { page } : {}) });
  };
  if (primary?.parties.length) {
    for (const party of primary.parties) pushParty(party.name, party.role, party.origin.page);
  } else {
    for (const name of partyNames(ficha.actor)) pushParty(name, 'actor');
    for (const name of partyNames(ficha.demandado)) pushParty(name, 'demandado');
  }

  // Si el expediente trae el escrito del apelante, quien lo firma es el apelante y la contraparte, el apelado.
  const briefs = appealBriefTexts(sources);
  const agravios = briefs.flatMap(({ source, text }) => extractAgravios(text, pageLocator({ ...source, pages: (source.pages || []).length ? source.pages : undefined })));
  const dedupedAgravios = agravios.filter((item, index) => agravios.findIndex((other) => other.number === item.number) === index).sort((a, b) => a.number - b.number);

  const appellantSide = appellantSideOf(briefs.map((brief) => brief.text), parties);

  const court = primary?.court && !primary.court.startsWith('[')
    ? primary.court
    : ficha.autoridad || extractAddressedCourt(full) || '';
  const resolutionText = primary
    ? sources.flatMap((source) => (source.pages || []).filter((page) => page.page >= primary.startPage && page.page <= primary.endPage).map((page) => page.text)).join('\n')
    : full;
  const city = extractCity(resolutionText) || extractCity(full);
  const expediente = primary?.expediente || ficha.expediente || '';

  const notifications = [
    ...(primary?.notification ? [{ date: primary.notification.date, description: `Notificación por boletín ${primary.notification.bulletin}` }] : []),
    ...extractNotifications(resolutionText),
  ].filter((item, index, all) => all.findIndex((other) => other.date.toLowerCase() === item.date.toLowerCase()) === index);

  const dossier: CaseDossier = {
    version: 1,
    court,
    city,
    expediente,
    parties,
    ...(primary ? { resolution: { kind: primary.type, date: primary.date.startsWith('[') ? '' : primary.date, court: primary.court.startsWith('[') ? '' : primary.court, startPage: primary.startPage, endPage: primary.endPage } } : {}),
    notifications,
    agravios: dedupedAgravios,
    resolutivos: primary ? extractResolutivos(resolutionText) : [],
    ...(appellantSide ? { appellantSide } : {}),
    confirmed: false,
    sourceFingerprint: fingerprintOf(sources),
    missing: [],
  };
  dossier.missing = dossierMissing(dossier);
  return dossier;
}

/** Lado de las partes cuyos nombres comparecen en el proemio del escrito de agravios. */
function appellantSideOf(briefTexts: string[], parties: DossierParty[]): ProcessSide | undefined {
  const head = briefTexts.map((text) => text.slice(0, 2500)).join('\n').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (!head.trim()) return undefined;
  const score = (side: ProcessSide) => parties.filter((party) => party.role === side).reduce((sum, party) => {
    const tokens = party.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/).filter((token) => token.length > 3);
    if (!tokens.length) return sum;
    return sum + (tokens.filter((token) => head.includes(token)).length / tokens.length >= 0.6 ? 1 : 0);
  }, 0);
  const actor = score('actor');
  const demandado = score('demandado');
  if (actor === demandado) return undefined;
  return actor > demandado ? 'actor' : 'demandado';
}

function dossierMissing(dossier: CaseDossier): string[] {
  const missing: string[] = [];
  if (!dossier.court) missing.push('órgano jurisdiccional');
  if (!dossier.city) missing.push('lugar');
  if (!dossier.expediente) missing.push('número de expediente');
  if (!dossier.parties.length) missing.push('partes');
  return missing;
}

/* ── confirmación y validación ────────────────────────────────────────────── */

export interface DossierProblem {
  code: 'DOSSIER_NOT_CONFIRMED' | 'REPRESENTATION_NOT_CHOSEN' | 'REPRESENTATION_ROLE_MISMATCH' | 'REQUIRED_INPUT_MISSING';
  message: string;
  inputId?: string;
}

/**
 * ¿La ficha basta para redactar este tipo? El abogado debe haberla confirmado y haber elegido a quién
 * representa; si el tipo exige un documento fuente (p. ej. la apelación del contrario), se pide.
 */
export function missingRequiredInputs(
  dossier: CaseDossier | undefined,
  contract: WritingContract,
  sources: UploadedSourceDocument[],
  options: { sourceTypeOf?: (source: UploadedSourceDocument) => string } = {},
): DossierProblem[] {
  const problems: DossierProblem[] = [];
  for (const input of contract.requiredInputs) {
    const bySource = options.sourceTypeOf
      ? sources.some((source) => input.sourceTypes.includes(options.sourceTypeOf!(source)))
      : false;
    const byDossier = input.dossierKey === 'agravios' ? Boolean(dossier?.agravios.length)
      : input.dossierKey === 'resolucion' ? Boolean(dossier?.resolution) : false;
    if (!bySource && !byDossier) problems.push({ code: 'REQUIRED_INPUT_MISSING', message: input.ask, inputId: input.id });
  }
  return problems;
}

/** La ficha se hizo sobre estos mismos documentos (no sobre otro PDF). */
export function dossierMatchesSources(dossier: CaseDossier, sources: UploadedSourceDocument[]): boolean {
  return dossier.sourceFingerprint === fingerprintOf(sources);
}

export function validateDossierForContract(
  dossier: CaseDossier | undefined,
  contract: WritingContract,
  sources: UploadedSourceDocument[],
  options: { sourceTypeOf?: (source: UploadedSourceDocument) => string } = {},
): DossierProblem[] {
  const problems = missingRequiredInputs(dossier, contract, sources, options);
  if (!dossier || dossier.confirmed !== true) {
    problems.push({ code: 'DOSSIER_NOT_CONFIRMED', message: 'Confirma la ficha del caso antes de generar.' });
    return problems;
  }
  if (contract.needsRepresentation && (!dossier.representedName?.trim() || !dossier.representedSide)) {
    problems.push({ code: 'REPRESENTATION_NOT_CHOSEN', message: 'Indica a quién representas: el sistema no lo infiere.' });
  } else if (contract.needsRepresentation) {
    const side = dossier.representedSide!;
    const expected = expectedSide(contract.signerRole, dossier.appellantSide);
    if (expected && side !== 'otro' && side !== expected) {
      problems.push({
        code: 'REPRESENTATION_ROLE_MISMATCH',
        message: `Este escrito lo firma la ${contract.signerLabel}, pero la parte que indicaste (${dossier.representedName}) está del lado ${side === 'actor' ? 'actor' : 'demandado'} en el juicio de origen${contract.signerRole === 'apelado' || contract.signerRole === 'apelante' ? ' y no corresponde a ese rol en la apelación' : ''}.`,
      });
    }
  }
  return problems;
}

/** Lado del juicio de origen que debe firmar según el rol del escrito (si se puede determinar). */
export function expectedSide(role: SignerRole, appellantSide?: ProcessSide): ProcessSide | undefined {
  if (role === 'actor') return 'actor';
  if (role === 'demandado') return 'demandado';
  if (role === 'apelante') return appellantSide;
  if (role === 'apelado') return appellantSide ? (appellantSide === 'actor' ? 'demandado' : 'actor') : undefined;
  return undefined;
}

/** Marca la ficha como confirmada por el abogado con la representación elegida. */
export function confirmDossier(
  dossier: CaseDossier,
  choice: { representedName: string; representedSide: ProcessSide; edits?: Partial<Pick<CaseDossier, 'court' | 'city' | 'expediente'>> },
  now = new Date(),
): CaseDossier {
  const next: CaseDossier = {
    ...dossier,
    ...(choice.edits || {}),
    representedName: choice.representedName.trim(),
    representedSide: choice.representedSide,
    confirmed: true,
    confirmedAt: now.toISOString(),
  };
  next.missing = dossierMissing(next);
  return next;
}

/** Resumen de la ficha para el redactor: solo datos confirmados, sin contenido del expediente. */
export function dossierSummaryText(dossier: CaseDossier): string {
  const lines = [
    `- Órgano jurisdiccional: ${dossier.court || '(no consta)'}`,
    `- Lugar: ${dossier.city || '(no consta)'}`,
    `- Expediente: ${dossier.expediente || '(no consta)'}`,
    ...(dossier.representedName ? [`- Representa a: ${dossier.representedName}`] : []),
    ...dossier.parties.map((party) => `- Parte: ${party.name} (${party.role === 'actor' ? 'actora en el juicio de origen' : party.role === 'demandado' ? 'demandada en el juicio de origen' : 'otra'})`),
    ...(dossier.appellantSide ? [`- Apela la parte ${dossier.appellantSide === 'actor' ? 'actora' : 'demandada'} del juicio de origen`] : []),
    ...(dossier.resolution ? [`- Resolución: ${dossier.resolution.kind === 'AUTO' ? 'auto' : 'sentencia definitiva'}${dossier.resolution.date ? ` de ${dossier.resolution.date}` : ''}`] : []),
    ...dossier.notifications.map((item) => `- Notificación: ${item.date}`),
    ...(dossier.agravios.length ? [`- Agravios del apelante: ${dossier.agravios.length} (numerados ${dossier.agravios.map((item) => item.number).join(', ')})`] : []),
  ];
  return lines.join('\n');
}

/** Valores que el texto narrativo puede mencionar sin estar en la fuente: los de la ficha confirmada. */
export function dossierAllowedValues(dossier: CaseDossier): { dates: string[]; places: string[]; organs: string[] } {
  const dates = [dossier.resolution?.date, ...dossier.notifications.map((item) => item.date)].filter((value): value is string => Boolean(value));
  const places = [dossier.city, ...(dossier.city ? [dossier.city.split(',')[0]] : [])].filter(Boolean);
  const organs = [dossier.court, dossier.resolution?.court].filter((value): value is string => Boolean(value));
  return { dates, places, organs };
}

export { NUMERIC_DATE as DATE_IN_TEXT };

/* ── entrada externa ──────────────────────────────────────────────────────── */

const clean = (value: unknown, max = 500): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const side = (value: unknown): ProcessSide | undefined => (value === 'actor' || value === 'demandado' || value === 'otro' ? value : undefined);
const asArray = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

/** Reconstruye una ficha recibida del cliente con tipos y longitudes acotados; null si no tiene la forma esperada. */
export function parseCaseDossier(input: unknown): CaseDossier | null {
  if (!input || typeof input !== 'object' || (input as { version?: unknown }).version !== 1) return null;
  const raw = input as Record<string, unknown>;
  const fingerprint = clean(raw.sourceFingerprint, 80);
  if (!fingerprint) return null;
  const parties = asArray(raw.parties, 30).flatMap((item): DossierParty[] => {
    const party = item as Record<string, unknown>;
    const name = clean(party?.name, 200);
    return name ? [{ name, role: side(party.role) || 'otro', ...(typeof party.page === 'number' ? { page: party.page } : {}) }] : [];
  });
  const agravios = asArray(raw.agravios, 40).flatMap((item): DossierAgravio[] => {
    const agravio = item as Record<string, unknown>;
    const body = clean(agravio?.text, 20000);
    return typeof agravio?.number === 'number' && body ? [{ number: agravio.number, text: body, ...(typeof agravio.page === 'number' ? { page: agravio.page } : {}) }] : [];
  });
  const resolution = raw.resolution && typeof raw.resolution === 'object' ? raw.resolution as Record<string, unknown> : undefined;
  const dossier: CaseDossier = {
    version: 1,
    court: clean(raw.court),
    city: clean(raw.city, 120),
    expediente: clean(raw.expediente, 80),
    parties,
    ...(resolution ? { resolution: {
      kind: resolution.kind === 'AUTO' ? 'AUTO' : 'SENTENCIA_DEFINITIVA',
      date: clean(resolution.date, 120),
      court: clean(resolution.court),
      startPage: Number(resolution.startPage) || 0,
      endPage: Number(resolution.endPage) || 0,
    } } : {}),
    notifications: asArray(raw.notifications, 10).flatMap((item) => {
      const note = item as Record<string, unknown>;
      const date = clean(note?.date, 120);
      return date ? [{ date, description: clean(note.description, 300) }] : [];
    }),
    agravios,
    resolutivos: asArray(raw.resolutivos, 30).map((item) => clean(item, 4000)).filter(Boolean),
    ...(side(raw.appellantSide) ? { appellantSide: side(raw.appellantSide) } : {}),
    ...(side(raw.representedSide) ? { representedSide: side(raw.representedSide) } : {}),
    ...(clean(raw.representedName, 200) ? { representedName: clean(raw.representedName, 200) } : {}),
    confirmed: raw.confirmed === true,
    ...(clean(raw.confirmedAt, 40) ? { confirmedAt: clean(raw.confirmedAt, 40) } : {}),
    sourceFingerprint: fingerprint,
    missing: [],
  };
  dossier.missing = dossierMissing(dossier);
  return dossier;
}
