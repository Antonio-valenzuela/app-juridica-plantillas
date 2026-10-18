/**
 * Filtro anti-arrastre: detecta datos propios del caso VIEJO de una plantilla del
 * abogado (personas, expedientes, montos, fechas, domicilios, autoridades, números
 * de prueba, contactos) y bloquea cualquier párrafo del resultado que los contenga.
 *
 * Determinista y local: nunca llama a servicios externos. Conservador: puede
 * bloquear de más (el párrafo va al anexo de revisión), no deja pasar un dato
 * reconocible. Lo que el caso nuevo comparte legítimamente (misma autoridad,
 * mismo apellido) se resta de la lista de bloqueo.
 */

export const CARRYOVER_REASON = 'dato de la plantilla anterior';
export const CARRYOVER_FINDING_CODE = 'TEMPLATE_CARRYOVER';

export type CarryoverKind =
  | 'persona'
  | 'expediente'
  | 'monto'
  | 'fecha'
  | 'domicilio'
  | 'contacto'
  | 'identificador'
  | 'prueba'
  | 'autoridad';

export interface CarryoverEntity {
  kind: CarryoverKind;
  /** Valor tal como aparece en la plantilla (solo para el anexo del abogado). */
  value: string;
  /** Clave normalizada para comparar. */
  key: string;
}

export interface CarryoverBlocklist {
  entities: CarryoverEntity[];
}

export interface CarryoverHit {
  kind: CarryoverKind;
  value: string;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const L = '\\p{L}';

const NAME_STOPWORDS = new Set([
  'juez', 'jueza', 'magistrado', 'magistrada', 'secretario', 'secretaria', 'licenciado', 'licenciada', 'ministro', 'ministra',
  'presidente', 'presidenta', 'actuario', 'actuaria', 'notario', 'notaria', 'agente', 'representante', 'tribunal', 'juzgado',
  'sala', 'unidad', 'autoridad', 'parte', 'actor', 'actora', 'demandado', 'demandada', 'quejoso', 'quejosa', 'promovente',
  'tercero', 'interesado', 'interesada', 'apoderado', 'apoderada', 'compareciente', 'suscrito', 'suscrita', 'mexico', 'nacion',
  'federal', 'estado', 'republica', 'codigo', 'civil', 'penal', 'ley', 'articulo', 'constitucion', 'federacion', 'justicia',
  'distrito', 'circuito', 'colegiado', 'familiar', 'mercantil', 'laboral', 'administrativo', 'primera', 'instancia',
  'protesto', 'necesario', 'respetuosamente', 'comparezco', 'ante', 'usted', 'senor', 'senora', 'ciudadano', 'ciudadana',
]);

export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordMatcher(key: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(key)}(?![\\p{L}\\p{N}])`, 'u');
}

function moneyKey(raw: string): string {
  return raw.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '').replace(/,/g, '').replace(/\.00$/, '');
}

function isoDate(day: string, month: number, year: string): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
}

function nameTokens(name: string): string[] {
  return foldText(name)
    .split(/[\s,.]+/)
    .filter((token) => token.length >= 5 && !NAME_STOPWORDS.has(token) && !['del', 'de la', 'los', 'las'].includes(token));
}

function cleanName(raw: string): string {
  return raw.replace(/[\s.,;:]+$/, '').replace(/\s+/g, ' ').trim();
}

function plausibleName(name: string): boolean {
  const words = foldText(name).split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (NAME_STOPWORDS.has(words[0])) return false;
  return nameTokens(name).length > 0;
}

type Add = (kind: CarryoverKind, value: string, key: string) => void;

function scanEntities(text: string, add: Add): void {
  // Expedientes: 345/2022, EXP-XXXX (sin confundir con fechas dd/mm/aaaa).
  for (const m of text.matchAll(/(?<![\d/])\d{1,6}\/\d{4}(?![\d/])/g)) add('expediente', m[0], m[0]);
  for (const m of text.matchAll(/\bEXP-[A-Z0-9_-]+\b/gi)) add('expediente', m[0], foldText(m[0]));

  // Montos: $85,000.00 · 85,000 pesos.
  for (const m of text.matchAll(/\$\s*(\d[\d.,]*)/g)) {
    const key = moneyKey(m[1]);
    if (key) add('monto', m[0], key);
  }
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d{2})?\s+pesos/gi)) {
    add('monto', m[0], moneyKey(m[1]));
  }

  // Fechas: «18 de agosto de 2026», 18/08/2026.
  const longDate = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTHS.join('|')})\\s+(?:de|del)\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(longDate)) add('fecha', m[0], isoDate(m[1], MONTHS.indexOf(m[2].toLowerCase()) + 1, m[3]));
  for (const m of text.matchAll(/(?<![\d/-])(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?![\d/-])/g)) {
    add('fecha', m[0], isoDate(m[1], Number(m[2]), m[3]));
  }

  // Contactos e identificadores.
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) add('contacto', m[0], foldText(m[0]));
  for (const m of text.matchAll(/(?<!\d)(?:\d[\s-]?){9}\d(?!\d)/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length === 10) add('contacto', m[0].trim(), digits);
  }
  for (const m of text.matchAll(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g)) add('identificador', m[0], foldText(m[0]));
  for (const m of text.matchAll(/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g)) add('identificador', m[0], foldText(m[0]));
  for (const m of text.matchAll(/\b(?:PERSONA|DOMICILIO)_CANARIO_[A-Z0-9_-]+\b/gi)) add('persona', m[0], foldText(m[0]));

  // Domicilios.
  for (const m of text.matchAll(/\b(?:calle|avenida|av\.|boulevard|blvd\.|privada|andador|calzada)\s+[\p{L}0-9 .]{2,50}?\s*(?:n[úu]mero|n[úu]m\.?|no\.?|#)\s*\d+[A-Za-z]?/giu)) {
    add('domicilio', m[0], foldText(m[0]));
  }
  for (const m of text.matchAll(/\b(?:colonia|col\.|fraccionamiento|fracc\.)\s+[\p{L} ]{3,40}/giu)) {
    add('domicilio', m[0].trim(), foldText(m[0]));
  }
  for (const m of text.matchAll(/\bc\.?\s?p\.?\s*(\d{5})\b/gi)) add('domicilio', m[0], `cp ${m[1]}`);

  // Autoridades del caso viejo (con ordinal o número, para no atrapar «juzgado competente»).
  for (const m of text.matchAll(/\b(?:juzgado|tribunal|sala)\s+[^\n,;.]{3,80}/gi)) {
    if (/(primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|\d+)/i.test(m[0])) {
      add('autoridad', cleanName(m[0]), foldText(cleanName(m[0])));
    }
  }

  // Pruebas / anexos numerados con su descripción.
  for (const m of text.matchAll(/\b(?:prueba|anexo|documental)\s+(?:n[úu]m(?:ero)?\.?\s*|no\.?\s*)?\d{1,3}\b[\s:.\-–]+[\p{L}0-9 ]{3,40}/giu)) {
    add('prueba', cleanName(m[0]), foldText(cleanName(m[0])));
  }

  // Personas: tras honorífico, tras etiqueta de parte, o antes de «por mi propio derecho».
  const person = (raw: string) => {
    const name = cleanName(raw);
    if (!plausibleName(name)) return;
    add('persona', name, foldText(name));
    for (const token of nameTokens(name)) add('persona', token, token);
  };
  const cap = `[A-ZÁÉÍÓÚÑ][${L}]+`;
  const nameBody = `${cap}(?:\\s+(?:de\\s+la\\s+|del\\s+|de\\s+|y\\s+)?${cap}){0,4}`;
  for (const m of text.matchAll(new RegExp(`\\b(?:C\\.|CC\\.|Lic\\.|Ing\\.|Dr\\.|Dra\\.|Sr\\.|Sra\\.|se[ñn]or(?:a)?|ciudadan[oa])\\s+(${nameBody})`, 'gu'))) person(m[1]);
  for (const m of text.matchAll(/\b(?:actor(?:a)?|demandad[oa]|quejos[oa]|promovente|tercero\s+interesad[oa]|apoderad[oa]|testigo|menor)\s*[:\-]\s*([^\n;]{3,80})/gi)) person(m[1]);
  for (const m of text.matchAll(new RegExp(`(${nameBody}),?\\s+(?:por\\s+(?:mi|su)\\s+propio\\s+derecho|en\\s+mi\\s+car[aá]cter|en\\s+representaci[oó]n)`, 'gu'))) person(m[1]);
}

export function extractTemplateEntities(templateText: string): CarryoverEntity[] {
  const seen = new Set<string>();
  const out: CarryoverEntity[] = [];
  scanEntities(templateText || '', (kind, value, key) => {
    const k = key.trim();
    if (!k) return;
    const id = `${kind}|${k}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ kind, value: value.trim(), key: k });
  });
  return out;
}

/**
 * Lista de bloqueo = entidades de la plantilla − entidades del caso nuevo.
 * `caseValues` son los textos del caso nuevo (partes, expediente, juzgado, domicilio,
 * fecha, montos, etc.). Cualquier entidad que el caso nuevo comparte queda permitida.
 */
export function buildCarryoverBlocklist(templateText: string, caseValues: Array<string | undefined | null>): CarryoverBlocklist {
  const caseTexts = caseValues.map((v) => (v || '').trim()).filter(Boolean);
  const caseKeys = new Set<string>();
  const caseFolded = caseTexts.map(foldText);
  for (const text of caseTexts) {
    scanEntities(text, (_kind, _value, key) => caseKeys.add(key.trim()));
    for (const token of nameTokens(text)) caseKeys.add(token);
  }
  for (const folded of caseFolded) caseKeys.add(folded);

  const textual = new Set<CarryoverKind>(['persona', 'autoridad', 'domicilio', 'prueba']);
  const entities = extractTemplateEntities(templateText).filter((entity) => {
    if (caseKeys.has(entity.key)) return false;
    if (textual.has(entity.kind) && caseFolded.some((folded) => wordMatcher(entity.key).test(folded))) return false;
    return true;
  });
  return { entities };
}

export function findCarryover(text: string, blocklist: CarryoverBlocklist): CarryoverHit[] {
  if (!text || blocklist.entities.length === 0) return [];
  const folded = foldText(text);
  const present = new Map<string, true>();
  scanEntities(text, (kind, _value, key) => present.set(`${kind}|${key.trim()}`, true));

  const hits: CarryoverHit[] = [];
  for (const entity of blocklist.entities) {
    const structured = entity.kind === 'monto' || entity.kind === 'fecha' || entity.kind === 'expediente'
      || entity.kind === 'contacto' || entity.kind === 'identificador';
    const found = structured
      ? present.has(`${entity.kind}|${entity.key}`) || (entity.kind !== 'monto' && wordMatcher(entity.key).test(folded))
      : wordMatcher(entity.key).test(folded);
    if (found) hits.push({ kind: entity.kind, value: entity.value });
  }
  return hits;
}

export interface CarryoverBlockedParagraph {
  excerpt: string;
  hits: CarryoverHit[];
}

/** Párrafo a párrafo: conserva los limpios y devuelve los bloqueados con su motivo. */
export function filterCarryoverText(text: string, blocklist: CarryoverBlocklist): { text: string; blocked: CarryoverBlockedParagraph[] } {
  if (!text) return { text, blocked: [] };
  const parts = text.split(/(\n{2,})/);
  const blocked: CarryoverBlockedParagraph[] = [];
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const paragraph = parts[i];
    const separator = parts[i + 1] ?? '';
    const hits = findCarryover(paragraph, blocklist);
    if (hits.length > 0) {
      blocked.push({ excerpt: paragraph.length > 200 ? `${paragraph.slice(0, 199).trimEnd()}…` : paragraph, hits });
    } else {
      kept.push(paragraph, separator);
    }
  }
  return { text: kept.join('').replace(/\n{3,}/g, '\n\n').trim(), blocked };
}

export function describeCarryover(blocked: CarryoverBlockedParagraph): string {
  const data = [...new Set(blocked.hits.map((hit) => `${hit.kind}: ${hit.value}`))].join('; ');
  return `Bloqueado por ${CARRYOVER_REASON} (${data}). Texto: «${blocked.excerpt}»`;
}
