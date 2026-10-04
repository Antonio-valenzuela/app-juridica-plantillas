import type { UploadedSourceDocument } from '../types';
import { isCivilFamilyAppeal, lineView, type AppealOrigin, type AppealParty, type AppealResolution } from './appealResolutionReview';

export interface AppealReasoningContext {
  documentType: string; resolution: AppealResolution; parties: AppealParty[];
  representedNames: string[]; sourceFingerprint: string;
}
export interface AppealStatement {
  id: string; blockId: string; resolutionId: string; origin: AppealOrigin; text: string; section: string;
  kind: 'ALLEGATION' | 'RECORD_REFERENCE' | 'JUDICIAL_FINDING';
  attribution: 'SOURCE_STATEMENT';
}
export interface AppealSourceCitation {
  text: string; origin: AppealOrigin; status: 'SOURCE_CITED'; officiallyVerified: false;
}
export type AppealImpact = 'ADVERSE' | 'BENEFICIAL' | 'NEUTRAL' | 'UNDETERMINED';
export type AppealClassificationRule = 1 | 2 | 3 | 4 | 5;
export interface AppealOutcomeFinding {
  impact: 'ADVERSE' | 'BENEFICIAL'; origin: AppealOrigin; affectedNames: string[]; affectedRole: string;
}
export interface AppealGlobalOutcome {
  impact: AppealImpact | 'MIXED'; appliedRule: 1; origin?: AppealOrigin;
  findings: AppealOutcomeFinding[]; classificationReason: string;
}
export interface AppealReasoning {
  id: string; blockId: string; resolutionId: string; origin: AppealOrigin; decisionOrigin: AppealOrigin; section: string;
  judgeDecision: string; impact: AppealImpact; appliedRule: AppealClassificationRule; classificationReason: string;
  affectedNames: string[]; authorities: AppealSourceCitation[]; statementIds: string[];
}
export interface AppealReasoningBlock {
  id: string; resolutionId: string; section: string; kind: 'REASONING' | 'OPERATIVE' | 'OTHER';
  origin: AppealOrigin; impact: AppealImpact; appliedRule: AppealClassificationRule;
  classificationReason: string; decisionOrigins: AppealOrigin[];
  pages: number[]; sourceSpans: AppealOrigin[]; sourceText: string;
  canonicalSection?: string; ocrReadingDoubtful?: boolean;
}
export interface AppealCandidate extends AppealReasoning {
  reasoningId: string; proposedReview: string; legalSupport: 'sin soporte';
  weakness?: 'débil'; weaknessReason?: string;
  recordSupport: 'sin soporte';
}
export interface AppealCandidateReview {
  bindingKey: string; resolutionId: string; blocks: AppealReasoningBlock[]; reasonings: AppealReasoning[];
  candidates: AppealCandidate[]; statements: AppealStatement[]; globalOutcome: AppealGlobalOutcome; warnings: string[];
  documentType: string; representedRole: 'actor' | 'demandado' | null; representedNames: string[];
}
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const decisionAnchor = /\b(?:este\s+(?:juzgado|tribunal|[óo]rgano)\s+(?:declara|considera|estima|concluye|determina|desestima|rechaza|reconoce|tiene\s+por)|se\s+(?:declara|desestima|estima|rechaza|condena|absuelve|determina|reconoce)|(?:la\s+)?acci[óo]n[^.!?]{0,100}?\s+resulta\s+(?:in)?fundada|no\s+(?:se\s+)?(?:acredit[óo]|demostr[óo]|prob[óo])|carece\s+de\s+(?:valor|eficacia|alcance)|(?:es|resulta)\s+insuficiente\s+para|no\s+se\s+actualiza|resulta\s+inaplicable)\b/i;
const citedOnly = /^(?:[\s\W]*[Ee]\s+)?(?:TESIS|JURISPRUDENCIA|PRECEDENTE|CITA(?:DA)?\s+RESOLUCION)\b/;
const adverseFinding = /\b(?:IMPROCEDENTE|INFUNDAD[AO]|INOPERANTE|DESESTIMA|RECHAZA|NO\s+(?:SE\s+)?(?:ACREDIT[ÓO]|DEMOSTR[ÓO]|PROB[ÓO]|EXHIBI[ÓO]|PRESENT[ÓO])|NO\s+EXISTE\s+(?:PRUEBA|CONSTANCIA)|CARECE\s+DE\s+(?:VALOR|EFICACIA|ALCANCE)(?:\s+PROBATORIO)?|(?:ES|RESULTA)\s+INSUFICIENTE\s+PARA|RESULTA\s+INAPLICABLE|NO\s+SE\s+ACTUALIZA|SE\s+DESESTIMA|SE\s+RECHAZA)\b/;
const beneficialFinding = /\b(?:ACOGE|RECONOCE|TIENE\s+POR\s+ACREDITAD[AO]|SE\s+ACREDITA|DECLARA\s+(?:PROCEDENTE|FUNDAD[AO])|RESULTA\s+(?:PROCEDENTE|FUNDAD[AO])|SE\s+CONCEDE)\b/;
const neutralFinding = /\b(?:ES\s+COMPETENTE\b|COMPETENCIA\s+(?:DE\s+ESTE\s+ORGANO|DEL\s+JUZGADO)|ANTECEDENTES\s+PROCESALES|SE\s+TRANSCRIBE|MARCO\s+NORMATIVO|METODO\s+DE\s+ESTUDIO)\b/;
type BlockKind = AppealReasoningBlock['kind'];
interface SourceBlock {
  id: string; section: string; kind: BlockKind; parentSection: string;
  origin?: AppealOrigin; segments: Array<{ page: number; start: number; end: number; text: string }>;
  canonicalSection?: string; ocrReadingDoubtful?: boolean;
}
const operativeHeading = /^(?:PROPOSICIONES|PUNTOS\s+RESOLUTIVOS|RESOLUTIVOS|SE\s+RESUELVE|RESUELVE|POR\s+LO\s+EXPUESTO|POR\s+TANTO)$/;
const romanHeading = /^[IVXLCDM]{1,12}$/;

const ordinalWords = new Set([
  'UNICO', 'UNICA', 'PRIMERO', 'PRIMERA', 'SEGUNDO', 'SEGUNDA', 'TERCERO', 'TERCERA', 'CUARTO', 'CUARTA',
  'QUINTO', 'QUINTA', 'SEXTO', 'SEXTA', 'SEPTIMO', 'SEPTIMA', 'OCTAVO', 'OCTAVA', 'NOVENO', 'NOVENA',
  'DECIMO', 'DECIMA', 'UNDECIMO', 'UNDECIMA', 'DUODECIMO', 'DUODECIMA', 'DECIMOTERCERO', 'DECIMOTERCERA',
  'DECIMOCUARTO', 'DECIMOCUARTA', 'DECIMOQUINTO', 'DECIMOQUINTA', 'DECIMOSEXTO', 'DECIMOSEXTA',
  'DECIMOSEPTIMO', 'DECIMOSEPTIMA', 'DECIMOOCTAVO', 'DECIMOOCTAVA', 'DECIMONOVENO', 'DECIMONOVENA',
  'VIGESIMO', 'VIGESIMA', 'DECIMA PRIMERA', 'DECIMA SEGUNDA', 'DECIMA TERCERA', 'DECIMA CUARTA',
  'DECIMA QUINTA', 'DECIMA SEXTA', 'DECIMA SEPTIMA', 'DECIMA OCTAVA', 'DECIMA NOVENA',
  'DECIMO PRIMERO', 'DECIMO SEGUNDO', 'DECIMO TERCERO', 'DECIMO CUARTO', 'DECIMO QUINTO',
  'DECIMO SEXTO', 'DECIMO SEPTIMO', 'DECIMO OCTAVO', 'DECIMO NOVENO',
]);
const compactOrdinalWords = [...ordinalWords].map(word => word.replace(/\s+/g, '')).sort((a, b) => b.length - a.length);
const compactHeaderForms = [
  ['RESULTANDOYCONSIDERANDO', 'RESULTANDO Y CONSIDERANDO'], ['PUNTOSRESOLUTIVOS', 'PUNTOS RESOLUTIVOS'],
  ['FUNDAMENTOSYDECISION', 'FUNDAMENTOS Y DECISION'], ['PORLOEXPUESTO', 'POR LO EXPUESTO'], ['PORTANTO', 'POR TANTO'],
  ['CONSIDERANDOS', 'CONSIDERANDOS'], ['CONSIDERANDO', 'CONSIDERANDO'],
  ['RESULTANDOS', 'RESULTANDOS'], ['RESULTANDO', 'RESULTANDO'], ['PROPOSICIONES', 'PROPOSICIONES'],
  ['RESOLUTIVOS', 'RESOLUTIVOS'], ['FUNDAMENTOS', 'FUNDAMENTOS'], ['SERESUELVE', 'SE RESUELVE'],
  ['VISTOS', 'VISTOS'], ['VISTO', 'VISTO'], ['RESUELVE', 'RESUELVE'],
].sort((a, b) => b[0].length - a[0].length);

function normalizedHeadingKey(key: string): string {
  const compact = key.replace(/\s+/g, '');
  for (const [compactHeader, displayHeader] of compactHeaderForms) {
    if (!compact.startsWith(compactHeader)) continue;
    const suffixWithoutSpaces = compact.slice(compactHeader.length);
    const ordinalSuffix = compactOrdinalWords.some(word => suffixWithoutSpaces.startsWith(word));
    const romanSuffix = /^[IVXLCDM]{1,12}(?=[.:)\-]|$)/.test(suffixWithoutSpaces);
    if (suffixWithoutSpaces && !/^[.:)\-]/.test(suffixWithoutSpaces) && !ordinalSuffix && !romanSuffix) continue;
    let consumed = 0, end = 0;
    while (end < key.length && consumed < compactHeader.length) {
      if (!/\s/.test(key[end])) consumed++;
      end++;
    }
    const suffix = key.slice(end).trimStart();
    key = `${displayHeader}${suffix ? ` ${suffix}` : ''}`;
    break;
  }
  return key.replace(/\b(DECIMA|UNDECIMA)[“”"'’]\s*(?=(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SEPTIMA|OCTAVA|NOVENA)\b)/g, '$1 ');
}

function leadingOrdinal(text: string): string | undefined {
  const match = text.match(/^([A-Z]+)(?:\s+([A-Z]+))?(?=\s|[.:)-]|$)/);
  const compound = match?.[2] ? `${match[1]} ${match[2]}` : '';
  if (compound && ordinalWords.has(compound)) return compound;
  return match && ordinalWords.has(match[1]) ? match[1] : undefined;
}

const ordinalValues: Record<string, number> = {
  UNICO: 1, UNICA: 1, PRIMERO: 1, PRIMERA: 1, SEGUNDO: 2, SEGUNDA: 2,
  TERCERO: 3, TERCERA: 3, CUARTO: 4, CUARTA: 4, QUINTO: 5, QUINTA: 5,
  SEXTO: 6, SEXTA: 6, SEPTIMO: 7, SEPTIMA: 7, OCTAVO: 8, OCTAVA: 8,
  NOVENO: 9, NOVENA: 9, DECIMO: 10, DECIMA: 10, UNDECIMO: 11, UNDECIMA: 11,
  DUODECIMO: 12, DUODECIMA: 12, DECIMOTERCERO: 13, DECIMOTERCERA: 13,
  DECIMOCUARTO: 14, DECIMOCUARTA: 14, DECIMOQUINTO: 15, DECIMOQUINTA: 15,
  DECIMOSEXTO: 16, DECIMOSEXTA: 16, DECIMOSEPTIMO: 17, DECIMOSEPTIMA: 17,
  DECIMOOCTAVO: 18, DECIMOOCTAVA: 18, DECIMONOVENO: 19, DECIMONOVENA: 19,
  VIGESIMO: 20, VIGESIMA: 20,
};
const decimalUnits: Record<string, number> = {
  PRIMERO: 1, PRIMERA: 1, SEGUNDO: 2, SEGUNDA: 2, TERCERO: 3, TERCERA: 3,
  CUARTO: 4, CUARTA: 4, QUINTO: 5, QUINTA: 5, SEXTO: 6, SEXTA: 6,
  SEPTIMO: 7, SEPTIMA: 7, OCTAVO: 8, OCTAVA: 8, NOVENO: 9, NOVENA: 9,
};

function ordinalValue(token: string): number | undefined {
  const normalized = fold(token).replace(/\s+/g, ' ');
  if (ordinalValues[normalized]) return ordinalValues[normalized];
  const [tens, unit] = normalized.split(' ');
  if ((tens === 'DECIMA' || tens === 'DECIMO') && decimalUnits[unit]) return 10 + decimalUnits[unit];
  return undefined;
}

function romanValue(token: string): number | undefined {
  if (!/^[IVXLCDM]+$/.test(token) || token === 'VIL') return undefined;
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < token.length; i++) total += values[token[i]] < (values[token[i + 1]] || 0) ? -values[token[i]] : values[token[i]];
  const canonical = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as const;
  let remainder = total, encoded = '';
  for (const [value, glyph] of canonical) while (remainder >= value) { encoded += glyph; remainder -= value; }
  return encoded === token ? total : undefined;
}

interface NumberedHeading { token: string; sequenceType: 'ROMAN' | 'ORDINAL'; hasTitle: boolean }
interface HeadingDescription { section: string; kind: BlockKind; parentSection: string; numbered?: NumberedHeading }

function hasUppercaseRomanTitle(raw: string): boolean {
  const match = raw.trim().match(/^[IVXLCDM]{1,12}\s*[.):\-]\s*(.+)$/i);
  if (!match) return false;
  let title = match[1].trim();
  const terminal = title.lastIndexOf('.');
  if (terminal > 2) title = title.slice(0, terminal + 1);
  const letters = [...title].filter(char => /\p{L}/u.test(char));
  if (letters.length < 5 || title.split(/\s+/).length < 2) return false;
  return letters.filter(char => char === char.toUpperCase()).length / letters.length >= 0.78;
}

const operativeOrdinalLead = /^(?:SE\s+(?:DECLARA|ABSUELVE|CONDENA|RECHAZA|DESESTIMA)|EN\s+CONSECUENCIA|A\s+MAYOR\s+ABUNDAMIENTO|RESPECTO\b|EN\s+CUANTO\b|SUBSISTEN\b|UNA\s+VEZ\b|NOTIFIQUESE\b)/;

function headingForLine(key: string, raw: string, previous: Pick<SourceBlock, 'section' | 'kind' | 'parentSection'>): HeadingDescription | undefined {
  key = normalizedHeadingKey(key);
  const generic = key.match(/^(VISTOS?|RESULTANDO\s+Y\s+CONSIDERANDO|RESULTANDOS?|CONSIDERANDOS?|FUNDAMENTOS(?:\s+Y\s+DECISION)?|PROPOSICIONES|PUNTOS\s+RESOLUTIVOS|RESOLUTIVOS|SE\s+RESUELVE|RESUELVE|POR\s+LO\s+EXPUESTO|POR\s+TANTO)\b/);
  if (generic) {
    const base = generic[1];
    const tail = key.slice(generic[0].length).trimStart();
    const ordinal = leadingOrdinal(tail);
    const roman = tail.match(/^([IVXLCDM]{1,12})(?=\b|\s*[.:)-])/)?.[1];
    const item = ordinal || roman;
    if (!item && tail && !/^[:.)-](?:\s|$)/.test(tail)) return undefined;
    const section = `${base}${item ? ` ${item}` : ''}`;
    const kind: BlockKind = operativeHeading.test(base) ? 'OPERATIVE'
      : /^(?:CONSIDERANDOS?|FUNDAMENTOS|RESULTANDO Y CONSIDERANDO)/.test(base) ? 'REASONING' : 'OTHER';
    return { section, kind, parentSection: base, ...(ordinal ? { numbered: { token: ordinal, sequenceType: 'ORDINAL' as const, hasTitle: true } } : roman ? { numbered: { token: roman, sequenceType: 'ROMAN' as const, hasTitle: true } } : {}) };
  }
  const marker = key.match(/^([IVXLCDM]{1,12}|[A-Z]+(?:\s+[A-Z]+)?)\s*([.):\-])(?:\s*(.*))?$/);
  if (!marker) return undefined;
  const token = marker[1].replace(/\s+/g, ' ');
  const isRoman = romanHeading.test(token);
  if (!isRoman && !ordinalWords.has(token)) return undefined;
  const romanTitle = isRoman && hasUppercaseRomanTitle(raw);
  if (isRoman && !romanTitle) return undefined;
  const opensOperative = !isRoman && operativeOrdinalLead.test(marker[3] || '');
  const kind: BlockKind = previous.kind === 'OPERATIVE' || opensOperative ? 'OPERATIVE'
    : previous.kind === 'REASONING' || romanTitle ? 'REASONING' : 'OTHER';
  const parentSection = kind === 'REASONING'
    ? (previous.kind === 'REASONING' ? previous.parentSection : '')
    : kind === 'OPERATIVE' ? 'PROPOSICIONES' : token;
  const section = kind === 'REASONING' && parentSection ? `${parentSection} ${token}` : token;
  return { section, kind, parentSection, numbered: { token, sequenceType: isRoman ? 'ROMAN' : 'ORDINAL', hasTitle: isRoman ? romanTitle : true } };
}

function originFor(sourceId: string, page: number, text: string, start: number, end: number): AppealOrigin {
  return { sourceId, page, start, end, excerpt: text.slice(start, end) };
}

function sourceBlocks(source: UploadedSourceDocument, resolution: AppealResolution): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  const pages = (source.pages || []).filter(p => p.page >= resolution.startPage && p.page <= resolution.endPage).sort((a, b) => a.page - b.page);
  const lineRecords: Array<{ page: number; pageText: string; line: ReturnType<typeof lineView>[number]; heading: HeadingDescription }> = [];
  let probe: Pick<SourceBlock, 'section' | 'kind' | 'parentSection'> = { section: '', kind: 'OTHER', parentSection: '' };
  for (const page of pages) {
    for (const line of lineView(page.text)) {
      const heading = headingForLine(line.key, line.text, probe);
      if (!heading) continue;
      lineRecords.push({ page: page.page, pageText: page.text, line, heading });
      probe = heading;
    }
  }

  const numberedGroups = new Map<string, typeof lineRecords>();
  for (const record of lineRecords) {
    const numbered = record.heading.numbered;
    if (!numbered) continue;
    const groupKey = `${record.heading.kind}:${record.heading.parentSection}:${numbered.sequenceType}`;
    const group = numberedGroups.get(groupKey) || [];
    group.push(record);
    numberedGroups.set(groupKey, group);
  }
  const accepted = new Map<string, { canonicalSection?: string; ocrReadingDoubtful?: boolean }>();
  for (const group of numberedGroups.values()) {
    const numbered = group.map(record => {
      const token = record.heading.numbered!.token;
      const type = record.heading.numbered!.sequenceType;
      return { record, token, type, value: type === 'ORDINAL' ? ordinalValue(token) : romanValue(token), doubtful: false };
    });
    for (let i = 0; i < numbered.length; i++) {
      const item = numbered[i];
      if (item.type === 'ROMAN' && item.token === 'VIL' && numbered[i - 1]?.value === 6) {
        item.value = 7;
        item.doubtful = true;
      }
    }
    const validSequence = numbered.filter(item => item.value !== undefined);
    for (const item of validSequence) {
      const index = validSequence.indexOf(item);
      const previous = validSequence[index - 1];
      const next = validSequence[index + 1];
      const previousDelta = previous?.value === undefined ? undefined : item.value! - previous.value;
      const nextDelta = next?.value === undefined ? undefined : next.value - item.value!;
      let isCoherent = false;
      if (item.type === 'ORDINAL') {
        isCoherent = item.value === 1
          || (previousDelta !== undefined && previousDelta > 0 && previousDelta <= 3)
          || (nextDelta !== undefined && nextDelta > 0 && nextDelta <= 3);
      } else if (previousDelta === 0) {
        // Duplicate numbering, including literal VII after OCR VIL was positioned as VII.
        isCoherent = false;
      } else if (item.doubtful) {
        isCoherent = previous?.value === 6;
      } else if (item.token.length >= 3) {
        isCoherent = true;
      } else {
        const adjacent = previousDelta === 1 || nextDelta === 1;
        const monotonicRun = previousDelta !== undefined && nextDelta !== undefined
          && previousDelta > 0 && nextDelta > 0 && previousDelta <= 3 && nextDelta <= 3;
        isCoherent = adjacent || monotonicRun;
      }
      if (!isCoherent) continue;
      const canonicalSection = item.doubtful
        ? `${item.record.heading.parentSection ? `${item.record.heading.parentSection} ` : ''}VII`
        : undefined;
      accepted.set(`${item.record.page}:${item.record.line.start}`, {
        ...(canonicalSection ? { canonicalSection } : {}),
        ...(item.doubtful ? { ocrReadingDoubtful: true } : {}),
      });
    }
  }

  let serial = 0;
  let current: SourceBlock = { id: `${resolution.id}:block:${serial++}`, section: 'Texto previo a cabeceras', kind: 'OTHER', parentSection: '', segments: [] };
  const append = (page: number, text: string, start: number, end: number) => {
    if (end > start) current.segments.push({ page, start, end, text: text.slice(start, end) });
  };
  const finish = () => {
    if (current.segments.length || current.origin) blocks.push(current);
  };
  for (const page of pages) {
    let segmentStart = 0;
    for (const line of lineView(page.text)) {
      const metadata = accepted.get(`${page.page}:${line.start}`);
      if (!metadata && lineRecords.some(record => record.page === page.page && record.line.start === line.start && record.heading.numbered)) continue;
      const heading = headingForLine(line.key, line.text, current);
      if (!heading) continue;
      append(page.page, page.text, segmentStart, line.start);
      finish();
      current = {
        id: `${resolution.id}:block:${source.id}:${page.page}:${line.start}:${serial++}`,
        ...heading,
        origin: originFor(source.id, page.page, page.text, line.start, line.end),
        segments: [],
        ...metadata,
      };
      segmentStart = line.start;
    }
    append(page.page, page.text, segmentStart, page.text.length);
  }
  finish();
  return blocks;
}

function blockOrigin(block: SourceBlock, sourceId: string): AppealOrigin {
  if (block.origin) return block.origin;
  const segment = block.segments[0];
  if (!segment) return { sourceId, page: 0, start: 0, end: 0, excerpt: '' };
  const newline = segment.text.indexOf('\n');
  const length = newline < 0 ? Math.min(segment.text.length, 200) : newline;
  return { sourceId, page: segment.page, start: segment.start, end: segment.start + length, excerpt: segment.text.slice(0, length) };
}

function sentences(text: string) {
  const result: { start: number; end: number }[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?](?=\s|$)/g)) {
    const end = m.index! + 1;
    const previous = text.slice(start, m.index).match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)$/)?.[1] || '';
    if (m[0] === '.' && /^(?:[A-ZÁÉÍÓÚ]|LIC|DR|MTRO|NUM|NO)$/i.test(previous)) continue;
    result.push({ start, end }); start = end;
  }
  if (start < text.length) result.push({ start, end: text.length });
  return result;
}

function targetRole(text: string, parties: AppealParty[]) {
  const key = fold(text);
  const explicitNames = parties.filter(p => key.includes(fold(p.name)));
  const roles = new Set(explicitNames.map(p => p.role));
  if (/\b(?:ACTOR(?:A|ES|AS)?|DEMANDANTE(?:S)?)\b/.test(key)) roles.add('actor');
  if (/\bDEMANDAD[OA]S?\b/.test(key)) roles.add('demandado');
  // A claim alone, without an identified target, is not enough to assign prejudice.
  return roles.size === 1 ? [...roles][0] : undefined;
}
function decisionEffect(text: string, parties: AppealParty[]): { role: string; benefitsRole: boolean } | undefined {
  const key = fold(text), explicitRole = targetRole(text, parties);
  if (/\b(?:ACCION|DEMANDA|PRETENSION|RECLAMACION)\b.{0,140}\b(?:IMPROCEDENTE|INFUNDAD[AO]|INOPERANTE)\b|\b(?:IMPROCEDENTE|INFUNDAD[AO]|INOPERANTE)\b.{0,140}\b(?:ACCION|DEMANDA|PRETENSION|RECLAMACION)\b/.test(key)) return { role: 'actor', benefitsRole: false };
  if (/\b(?:ACCION|DEMANDA|PRETENSION|RECLAMACION)\b.{0,140}\b(?:PROCEDENTE|FUNDAD[AO])\b|\b(?:PROCEDENTE|FUNDAD[AO])\b.{0,140}\b(?:ACCION|DEMANDA|PRETENSION|RECLAMACION)\b/.test(key)) return { role: 'actor', benefitsRole: true };
  if (/\b(?:SE\s+)?ABSUELVE\b/.test(key) && (explicitRole === 'demandado' || /\bDEMANDAD[OA]S?\b/.test(key))) return { role: 'demandado', benefitsRole: true };
  if (/\b(?:SE\s+)?CONDENA\b/.test(key) && (explicitRole === 'demandado' || /\bDEMANDAD[OA]S?\b/.test(key))) return { role: 'demandado', benefitsRole: false };
  if (!explicitRole) return undefined;
  if (adverseFinding.test(key)) return { role: explicitRole, benefitsRole: false };
  if (beneficialFinding.test(key) || /\bSE\s+ABSUELVE\b/.test(key)) return { role: explicitRole, benefitsRole: true };
  return undefined;
}

function impactAgainstRepresented(targetRole: string, benefitsRole: boolean, representedRole: string): AppealImpact {
  const benefitsRepresented = targetRole === representedRole ? benefitsRole : !benefitsRole;
  return benefitsRepresented ? 'BENEFICIAL' : 'ADVERSE';
}

function detectGlobalOutcome(source: UploadedSourceDocument, blocks: SourceBlock[], representedRole: string, representedNames: string[]): AppealGlobalOutcome {
  const findings: AppealOutcomeFinding[] = [];
  for (const block of blocks.filter(b => b.kind === 'OPERATIVE')) {
    for (const segment of block.segments) {
      for (const span of sentences(segment.text)) {
        const raw = segment.text.slice(span.start, span.end), trimmed = raw.trim();
        if (!trimmed || citedOnly.test(fold(trimmed))) continue;
        const leading = raw.length - raw.trimStart().length;
        const before = segment.text.slice(0, span.start + leading);
        if (before.lastIndexOf('«') > before.lastIndexOf('»') || /\b(?:TESIS|JURISPRUDENCIA|PRECEDENTE)\b/i.test(before)) continue;
        const effect = decisionEffect(trimmed, []);
        if (!effect) continue;
        const impact = impactAgainstRepresented(effect.role, effect.benefitsRole, representedRole);
        const start = segment.start + span.start + leading;
        const end = segment.start + span.end;
        findings.push({ impact: impact as 'ADVERSE' | 'BENEFICIAL', affectedRole: effect.role, affectedNames: representedNames, origin: { sourceId: source.id, page: segment.page, start, end, excerpt: segment.text.slice(span.start + leading, span.end) } });
      }
    }
  }
  const impacts = new Set(findings.map(f => f.impact));
  const impact: AppealGlobalOutcome['impact'] = impacts.size > 1 ? 'MIXED' : findings[0]?.impact || 'UNDETERMINED';
  return { impact, appliedRule: 1, origin: findings[0]?.origin, findings, classificationReason: findings.length ? 'Derivada de la parte resolutiva literal de la resolución confirmada; no determina por sí sola la viabilidad del recurso.' : 'No se identificó una disposición operativa inequívoca en la sección resolutiva; la afectación global requiere confirmación.' };
}

function classifyReasoning(text: string, parties: AppealParty[], representedRole: string, representedNames: string[], global: AppealGlobalOutcome, section: string): { impact: AppealImpact; appliedRule: AppealClassificationRule; classificationReason: string } {
  const key = fold(text), role = targetRole(text, parties);
  if (neutralFinding.test(key)) return { impact: 'NEUTRAL', appliedRule: 4, classificationReason: 'Encuadre procesal o metodológico sin decisión adversa o favorable identificable para la parte representada.' };
  const declinesProceduralBar = /\bNO\s+SE\s+ACTUALIZA(?:\s+PLENAMENTE)?\b.{0,100}\b(?:COSA\s+JUZGADA|PRESCRIPCION|CADUCIDAD)\b/.test(key);
  const proceedsToMerits = /\b(?:PROCEDE|ENTRA|CONTINUA|PASA)\b.{0,100}\b(?:ESTUDIO|ANALISIS|EXAMEN)\b/.test(key);
  if (declinesProceduralBar && proceedsToMerits) {
    const impact = impactAgainstRepresented('actor', true, representedRole);
    return { impact, appliedRule: impact === 'BENEFICIAL' ? 3 : 2, classificationReason: 'La frase rechaza un obstáculo preliminar y expresa que continúa el examen de la pretensión actora; la cita literal completa permite revisar esa lectura.' };
  }
  const effect = decisionEffect(text, parties);
  if (effect) {
    const impact = impactAgainstRepresented(effect.role, effect.benefitsRole, representedRole);
    return { impact, appliedRule: impact === 'ADVERSE' ? 2 : 3, classificationReason: impact === 'ADVERSE' ? 'La frase literal rechaza una pretensión, prueba o planteamiento atribuible a la parte representada.' : 'La frase literal reconoce o concede un resultado a la parte representada, o rechaza el planteamiento de la contraparte.' };
  }
  const adverse = adverseFinding.test(key), beneficial = beneficialFinding.test(key);
  if (role && adverse !== beneficial) {
    const impact = impactAgainstRepresented(role, !adverse, representedRole);
    return { impact, appliedRule: impact === 'ADVERSE' ? 2 : 3, classificationReason: impact === 'ADVERSE' ? 'El razonamiento tiene por insuficiente o rechaza el punto atribuido a la parte representada.' : 'El razonamiento rechaza un punto atribuible a la contraparte y beneficia a la parte representada.' };
  }
  const isConsidering = /\b(?:CONSIDERANDO|FUNDAMENTOS)\b/.test(fold(section));
  if (!role && isConsidering && adverse && !beneficial && ['ADVERSE', 'BENEFICIAL'].includes(global.impact)) {
    const impact = global.impact as 'ADVERSE' | 'BENEFICIAL';
    return { impact, appliedRule: impact === 'ADVERSE' ? 2 : 3, classificationReason: impact === 'ADVERSE' ? 'El considerando expresa una insuficiencia o rechazo probatorio; el resolutivo adverso identifica el sentido para la parte representada aunque esta frase omita su rol.' : 'El rechazo del considerando coincide con un resultado global favorable a la parte representada.' };
  }
  if (!role && !adverse && !beneficial && global.impact === 'ADVERSE' && isConsidering && /\b(?:PRUEBA|ACCION|PRETENSION|RECLAMACION|ACREDIT|DEMOSTR|CUMPLIMIENTO)\b/.test(key)) {
    return { impact: 'ADVERSE', appliedRule: 2, classificationReason: 'El considerando vincula expresamente prueba o pretensión con el resultado global adverso; el texto completo queda disponible para revisión.' };
  }
  return { impact: 'UNDETERMINED', appliedRule: 5, classificationReason: 'La frase no permite atribuir con seguridad este resultado a la posición confirmada; requiere revisión manual.' };
}

/** Offline discovery only. No authority verification, factual adoption, plan or gate mutations.
 * The UI calls this exclusively with a phase-1 validated confirmation. */
export function extractAppealReasoningCandidates(sources: UploadedSourceDocument[], context: AppealReasoningContext): AppealCandidateReview {
  const resolution = context.resolution;
  const result: AppealCandidateReview = {
    bindingKey: JSON.stringify([context.sourceFingerprint, resolution.id, context.documentType, context.parties.map(p => [p.role, p.name]), context.representedNames]),
    resolutionId: resolution.id, blocks: [], reasonings: [], candidates: [], statements: [], globalOutcome: { impact: 'UNDETERMINED', appliedRule: 1, findings: [], classificationReason: 'No fue posible determinar el resultado global hasta validar la resolución y las partes.' }, warnings: [],
    documentType: context.documentType, representedRole: null, representedNames: [],
  };
  if (!isCivilFamilyAppeal(context.documentType)) return result;
  const represented = context.parties.filter(p => context.representedNames.includes(p.name));
  if (!represented.length || represented.length !== context.representedNames.length || new Set(represented.map(p => p.role)).size !== 1) {
    result.warnings.push('La representación no permite atribuir una afectación; confirma las partes.'); return result;
  }
  const representedRole = represented[0].role;
  result.representedRole = representedRole;
  result.representedNames = represented.map(p => p.name);
  const source = sources.find(s => s.id === resolution.sourceId);
  if (!source) { result.warnings.push('No se encontró la fuente de la resolución seleccionada.'); return result; }
  const blocks = sourceBlocks(source, resolution);
  result.globalOutcome = detectGlobalOutcome(source, blocks, representedRole, represented.map(p => p.name));
  for (const block of blocks) {
    for (const segment of block.segments) {
      const citations = [...segment.text.matchAll(/\bart[ií]culo(?:s)?\s+\d+[\wº°.-]*(?:[^.!?\n]{0,140})|\btesis\s+(?:de\s+rubro\s*)?[«“"][^»”"\n]+[»”"]/gi)];
      const sentenceSpans = sentences(segment.text);
      for (const span of sentenceSpans) {
        const raw = segment.text.slice(span.start, span.end);
        const leading = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const literalStart = span.start + leading;
        const before = segment.text.slice(0, literalStart);
        if (before.lastIndexOf('«') > before.lastIndexOf('»')) continue;
        const key = fold(trimmed);
        let statementKind: AppealStatement['kind'] | undefined;
        if (/\b(?:PARTE ACTORA|ACTOR(?:A|ES)?|DEMANDAD[OA]S?)\s+(?:ALEGAN?|SOLICITAN?|MANIFIESTAN?|AFIRMAN?|INVOCAN?)\b/.test(key)) statementKind = 'ALLEGATION';
        else if (/^CONSTANCIA EN AUTOS\s*:/.test(key)) statementKind = 'RECORD_REFERENCE';
        else if (/\b(?:TIENE POR ACREDITADO|SE ACREDITA|QUEDO ACREDITADO)\b/.test(key)) statementKind = 'JUDICIAL_FINDING';
        const statementStart = segment.start + literalStart;
        const statementEnd = segment.start + span.end;
        const statementOrigin = { sourceId: source.id, page: segment.page, start: statementStart, end: statementEnd, excerpt: segment.text.slice(literalStart, span.end) };
        if (statementKind) result.statements.push({ id: `statement:${resolution.id}:${block.id}:${segment.page}:${statementStart}`, blockId: block.id, resolutionId: resolution.id, origin: statementOrigin, text: trimmed, section: block.section, kind: statementKind, attribution: 'SOURCE_STATEMENT' });
        if (block.kind !== 'REASONING' || statementKind === 'ALLEGATION' || statementKind === 'RECORD_REFERENCE' || citedOnly.test(key)) continue;
        const anchor = trimmed.match(decisionAnchor);
        if (!anchor) continue;
        const beforeAnchor = trimmed.slice(0, anchor.index);
        if (beforeAnchor.lastIndexOf('«') > beforeAnchor.lastIndexOf('»') || /\b(?:TESIS|JURISPRUDENCIA|PRECEDENTE)\b/i.test(beforeAnchor)) continue;
        const localStart = literalStart + anchor.index!;
        const start = segment.start + localStart;
        const end = segment.start + span.end;
        const decisionOrigin = { sourceId: source.id, page: segment.page, start, end, excerpt: segment.text.slice(localStart, span.end) };
        const judgeDecision = decisionOrigin.excerpt.replace(/\s+/g, ' ').trim();
        const next = sentenceSpans.find(s => s.start >= span.end);
        const nextIsCourtCitation = Boolean(next && /^\s*(?:Se cita|Se invoca|Sirve de apoyo|Es aplicable|Conforme al art[ií]culo)\b/i.test(segment.text.slice(next.start, next.end)));
        const authorities: AppealSourceCitation[] = citations.filter(m => (m.index! >= localStart && m.index! < span.end)
          || (nextIsCourtCitation && next && m.index! >= next.start && m.index! < next.end)).map(m => ({ text: m[0], origin: { sourceId: source.id, page: segment.page, start: segment.start + m.index!, end: segment.start + m.index! + m[0].length, excerpt: m[0] }, status: 'SOURCE_CITED', officiallyVerified: false }));
        const quoteLimit = decisionOrigin.excerpt.length <= 360 ? decisionOrigin.excerpt.length : Math.max(1, decisionOrigin.excerpt.lastIndexOf(' ', 360));
        const origin = { ...decisionOrigin, end: start + quoteLimit, excerpt: segment.text.slice(localStart, localStart + quoteLimit) };
        const classification = classifyReasoning(judgeDecision, context.parties, representedRole, represented.map(p => p.name), result.globalOutcome, block.section);
        const reasoning: AppealReasoning = {
          id: `reasoning:${resolution.id}:${segment.page}:${start}`, blockId: block.id, resolutionId: resolution.id,
          origin, decisionOrigin, section: block.section, judgeDecision, ...classification,
          affectedNames: classification.impact === 'ADVERSE' ? represented.map(p => p.name) : [], authorities,
          statementIds: result.statements.filter(s => s.blockId === block.id).map(s => s.id),
        };
        result.reasonings.push(reasoning);
        if (classification.impact !== 'ADVERSE') continue;
        if (judgeDecision.length > 1200) { result.warnings.push(`Página ${segment.page}: razonamiento extenso pendiente de revisión; no se truncó para fabricar un candidato.`); continue; }
        const refuted = /\b(?:NO EXISTE OBLIGACION|NO OBLIGA|NO ES OBLIGATORI[AO]|NO ES EXIGIBLE|NO TIENEN? QUE)\b/.test(fold(judgeDecision));
        result.candidates.push({ ...reasoning, id: `candidate:${reasoning.id}`, reasoningId: reasoning.id, proposedReview: 'Revisar si la decisión citada puede controvertirse con constancias y fundamento verificables. No es un agravio aprobado.', legalSupport: 'sin soporte', recordSupport: 'sin soporte', ...(refuted ? { weakness: 'débil' as const, weaknessReason: 'La resolución ya expresa una respuesta a esta objeción; requiere examinarla, no reiterarla como si no hubiera sido resuelta.' } : {}) });
      }
    }
    const blockReasonings = result.reasonings.filter(r => r.blockId === block.id);
    const blockFindings = result.globalOutcome.findings.filter(f => block.segments.some(s => s.page === f.origin.page && f.origin.start >= s.start && f.origin.end <= s.end));
    let impact: AppealImpact = 'UNDETERMINED';
    let appliedRule: AppealClassificationRule = 5;
    let classificationReason = 'El bloque no contiene una conclusión atribuible con seguridad; requiere revisión manual.';
    let decisionOrigins: AppealOrigin[] = [];
    if (block.kind === 'OPERATIVE' && blockFindings.length) {
      const impacts = new Set(blockFindings.map(f => f.impact));
      impact = impacts.size === 1 ? blockFindings[0].impact : 'UNDETERMINED';
      appliedRule = impact === 'UNDETERMINED' ? 5 : 1;
      classificationReason = impact === 'UNDETERMINED' ? 'Las proposiciones del bloque contienen resultados de distinto sentido; no se fuerza una clasificación única.' : 'Bloque de proposiciones utilizado solo para determinar el resultado global de la resolución.';
      decisionOrigins = blockFindings.map(f => f.origin);
    } else if (blockReasonings.length) {
      const impacts = new Set(blockReasonings.map(r => r.impact));
      impact = impacts.size === 1 ? blockReasonings[0].impact : 'UNDETERMINED';
      appliedRule = impact === 'UNDETERMINED' ? 5 : blockReasonings[0].appliedRule;
      classificationReason = impact === 'UNDETERMINED'
        ? 'El bloque contiene conclusiones de distinto sentido; se conservan por separado y el bloque queda indeterminado.'
        : [...new Set(blockReasonings.map(r => r.classificationReason))].join(' ');
      decisionOrigins = blockReasonings.map(r => r.decisionOrigin);
    } else if (neutralFinding.test(fold(block.segments.map(s => s.text).join(' ')))) {
      impact = 'NEUTRAL'; appliedRule = 4;
      classificationReason = 'El bloque es de encuadre procesal/metodológico y no contiene una decisión adversa o favorable identificable.';
    }
    const sourceSpans = block.segments.map(segment => ({
      sourceId: source.id, page: segment.page, start: segment.start, end: segment.end, excerpt: segment.text,
    }));
    const pages = [...new Set(sourceSpans.map(span => span.page).concat(block.origin ? [block.origin.page] : []))];
    result.blocks.push({
      id: block.id, resolutionId: resolution.id, section: block.section, kind: block.kind,
      origin: blockOrigin(block, source.id), impact, appliedRule, classificationReason, decisionOrigins,
      pages, sourceSpans, sourceText: block.segments.map(segment => segment.text).join('\n'),
      ...(block.canonicalSection ? { canonicalSection: block.canonicalSection } : {}),
      ...(block.ocrReadingDoubtful ? { ocrReadingDoubtful: true } : {}),
    });
  }
  result.warnings.push('Las citas SOURCE_CITED no son autoridades verificadas. Las referencias a constancias y hechos acreditados son atribuciones de la resolución, no comprobación independiente de autos.');
  return result;
}
