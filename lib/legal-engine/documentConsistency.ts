import type { RichCaseAnalysis } from './case-extraction/types';
import type { DocumentAssemblyFinding, DocumentAssemblyResult } from './documentAssemblyTypes';

export type DocumentPropositionKind = 'FACT' | 'STANCE' | 'LEGAL_CONCLUSION' | 'EVENT';
export type DocumentPropositionScope = 'SOURCE' | 'CLIENT' | 'UNKNOWN';

export interface DocumentPropositionEntry {
  kind: DocumentPropositionKind;
  propositionKey: string;
  value: string;
  scope: DocumentPropositionScope;
  blockIds: readonly string[];
  factIds: readonly string[];
  legalIssueIds: readonly string[];
}

export interface DocumentConsistencyInput {
  assembly: DocumentAssemblyResult;
  richCaseAnalysis?: RichCaseAnalysis;
}

const MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12',
};
const DATE_PATTERN = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(\d{4})\b/gi;
const AMOUNT_PATTERN = /(?:\$\s*)?\b(\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{1,2})?)\s*(?:pesos|mxn|usd|d[oó]lares)?\b/gi;
const STANCE_PATTERN = /\b(?:POSICI[ÓO]N\s+PROCESAL\s*:\s*)?(SE\s+ADMITE|SE\s+NIEGA|SE\s+DESCONOCE|NO\s+ES\s+UN\s+HECHO\s+PROPIO|SE\s+ADMITE\s+PARCIALMENTE)\b/i;
const LEGAL_CONCLUSION_PATTERN = /\b(?:prescripci[oó]n|absoluci[oó]n|improcedencia|revocaci[oó]n|fundabilidad|infundabilidad)\b/i;

function sortedUnique(values: readonly string[] | undefined): string[] {
  return [...new Set((values || []).filter((value): value is string => Boolean(value)))].sort();
}

function normalizeDate(day: string, month: string, year: string): string {
  return `${year}-${MONTHS[month.toLowerCase()]}-${day.padStart(2, '0')}`;
}

function datesInText(text: string): string[] {
  const dates: string[] = [];
  DATE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(DATE_PATTERN)) {
    dates.push(normalizeDate(match[1], match[2], match[3]));
  }
  return dates;
}

function amountsInText(text: string): string[] {
  const values: string[] = [];
  AMOUNT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const raw = match[1];
    if (!raw || !(/[\d,.]/.test(raw))) continue;
    values.push(raw.replace(/,/g, ''));
  }
  return values;
}

function sourceScope(block: DocumentAssemblyResult['orderedBlocks'][number]): DocumentPropositionScope {
  if (block.generatedBy === 'SOURCE_DIRECT' || block.layer === 'SOURCE_FACT') return 'SOURCE';
  if (block.generatedBy === 'AI' || block.generatedBy === 'USER' || block.generatedBy === 'DETERMINISTIC') return 'CLIENT';
  return 'UNKNOWN';
}

function makeEntry(
  kind: DocumentPropositionKind,
  propositionKey: string,
  value: string,
  block: DocumentAssemblyResult['orderedBlocks'][number],
  scope: DocumentPropositionScope,
): DocumentPropositionEntry {
  return {
    kind,
    propositionKey,
    value,
    scope,
    blockIds: [block.id],
    factIds: sortedUnique(block.factIds),
    legalIssueIds: sortedUnique(block.legalIssueIds),
  };
}

/** Temas cuya polaridad (existió / nunca existió, se pagó / no se pagó) no puede contradecirse en el documento. */
const POLARITY_TOPICS: ReadonlyArray<{ topic: string; pattern: RegExp }> = [
  { topic: 'CONTRATO', pattern: /(?<!\p{L})(?:contrato|convenio)(?!\p{L})/iu },
  { topic: 'RELACION_LABORAL', pattern: /(?<!\p{L})(?:relaci[oó]n\s+laboral|trabaj[oó]|laboraba)(?!\p{L})/iu },
  { topic: 'PAGO', pattern: /(?<!\p{L})(?:pag[oó]|pagos?|liquid[oó])(?!\p{L})/iu },
  { topic: 'NOTIFICACION', pattern: /(?<!\p{L})notificaci[oó]n(?!\p{L})|(?<!\p{L})notific[oó](?!\p{L})/iu },
  { topic: 'ENTREGA', pattern: /(?<!\p{L})(?:entreg[oó]|entrega)(?!\p{L})/iu },
];
const POLARITY_NEGATION = /(?<!\p{L})(?:nunca|jam[áa]s|no\s+(?:existi[oó]|existe|celebr[oó]|celebra|se\s+(?:celebr[oó]|pag[oó]|notific[oó]|entreg[oó]|realiz[oó]))|no\s+hubo|no\s+fue\s+(?:pagad[oa]|notificad[oa]|entregad[oa]))(?!\p{L})/iu;

export function buildDocumentPropositionLedger(input: DocumentConsistencyInput): readonly DocumentPropositionEntry[] {
  const entries: DocumentPropositionEntry[] = [];
  for (const block of input.assembly.orderedBlocks) {
    const scope = sourceScope(block);
    const factIds = sortedUnique(block.factIds);
    for (const value of datesInText(block.text)) {
      for (const factId of factIds) {
        entries.push(makeEntry('FACT', `${factId}:DATE`, value, block, scope));
      }
    }
    for (const value of amountsInText(block.text)) {
      for (const factId of factIds) {
        entries.push(makeEntry('FACT', `${factId}:AMOUNT`, value, block, scope));
      }
    }
    const stance = block.text.match(STANCE_PATTERN)?.[1]?.toUpperCase();
    if (stance) {
      for (const factId of factIds) {
        entries.push(makeEntry('STANCE', `${factId}:STANCE:${scope}`, stance, block, scope));
      }
    }
    for (const sentence of block.text.split(/(?<=[.;!?])\s+/)) {
      for (const { topic, pattern } of POLARITY_TOPICS) {
        if (!pattern.test(sentence)) continue;
        const value = POLARITY_NEGATION.test(sentence) ? 'DENIED' : 'AFFIRMED';
        entries.push(makeEntry('EVENT', `EVENT:${topic}`, value, block, scope));
      }
    }
    if (LEGAL_CONCLUSION_PATTERN.test(block.text)) {
      LEGAL_CONCLUSION_PATTERN.lastIndex = 0;
      entries.push(makeEntry('LEGAL_CONCLUSION', `LEGAL_CONCLUSION:${sortedUnique(block.legalIssueIds).join('|')}`, block.text.trim(), block, scope));
    }
  }
  return entries;
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  blockIds: readonly string[],
  factIds: readonly string[],
  legalIssueIds: readonly string[],
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: code,
    blockIds: [...new Set(blockIds)].sort(),
    legalIssueIds: sortedUnique(legalIssueIds),
    coverageItemIds: [],
    sectionIds: [],
  };
}

function authorizedValues(input: DocumentConsistencyInput, factId: string, kind: 'DATE' | 'AMOUNT'): string[] {
  const fact = input.richCaseAnalysis?.facts?.find((item) => item.id === factId);
  if (!fact) return [];
  if (kind === 'DATE') {
    const values = fact.date ? [fact.date.normalizedValue || fact.date.rawValue] : [];
    return [...values, ...datesInText(fact.proposition)];
  }
  const values = fact.amount?.normalizedValue === undefined ? [] : [String(fact.amount.normalizedValue)];
  return [...values, ...amountsInText(fact.proposition)];
}

function hasExplicitConflict(input: DocumentConsistencyInput, factIds: readonly string[]): boolean {
  return Boolean(input.richCaseAnalysis?.conflicts?.some((conflict) => conflict.itemIds.some((itemId) => factIds.includes(itemId))));
}

function compareFacts(input: DocumentConsistencyInput, ledger: readonly DocumentPropositionEntry[]): DocumentAssemblyFinding[] {
  const findings: DocumentAssemblyFinding[] = [];
  const factEntries = ledger.filter((entry) => entry.kind === 'FACT');
  const groups = new Map<string, DocumentPropositionEntry[]>();
  for (const entry of factEntries) {
    const existing = groups.get(entry.propositionKey) || [];
    existing.push(entry);
    groups.set(entry.propositionKey, existing);
  }

  for (const [key, entries] of groups) {
    const values = [...new Set(entries.map((entry) => entry.value))];
    const factId = key.split(':')[0];
    const kind = key.endsWith(':DATE') ? 'DATE' : 'AMOUNT';
    const authorized = authorizedValues(input, factId, kind);
    if (authorized.length === 0 && values.length > 0) {
      findings.push(finding(
        'NEW_FACT_DURING_ASSEMBLY',
        'BLOCKER',
        `El bloque introduce un valor ${kind.toLowerCase()} no autorizado para ${factId}.`,
        entries.flatMap((entry) => entry.blockIds),
        [factId],
        entries.flatMap((entry) => entry.legalIssueIds),
      ));
      continue;
    }
    if (values.length <= 1) continue;
    const explicitConflict = hasExplicitConflict(input, [factId]);
    findings.push(finding(
      'MATERIAL_FACT_CONTRADICTION',
      explicitConflict ? 'REVIEW' : 'BLOCKER',
      `Existen valores incompatibles para ${factId}.`,
      entries.flatMap((entry) => entry.blockIds),
      [factId],
      entries.flatMap((entry) => entry.legalIssueIds),
    ));
  }
  return findings;
}

function compareStances(input: DocumentConsistencyInput, ledger: readonly DocumentPropositionEntry[]): DocumentAssemblyFinding[] {
  const groups = new Map<string, DocumentPropositionEntry[]>();
  for (const entry of ledger.filter((item) => item.kind === 'STANCE')) {
    const existing = groups.get(entry.propositionKey) || [];
    existing.push(entry);
    groups.set(entry.propositionKey, existing);
  }
  const findings: DocumentAssemblyFinding[] = [];
  for (const entries of groups.values()) {
    const values = new Set(entries.map((entry) => entry.value));
    if (values.size <= 1) continue;
    const factIds = entries.flatMap((entry) => entry.factIds);
    const sameClientScope = new Set(entries.filter((entry) => entry.scope === 'CLIENT').map((entry) => entry.value));
    if (sameClientScope.size <= 1) continue;
    const explicitConflict = hasExplicitConflict(input, factIds);
    findings.push(finding(
      'CONFLICTING_CLIENT_POSITION',
      explicitConflict ? 'REVIEW' : 'BLOCKER',
      'La misma proposición tiene posiciones procesales incompatibles.',
      entries.flatMap((entry) => entry.blockIds),
      factIds,
      entries.flatMap((entry) => entry.legalIssueIds),
    ));
  }
  return findings;
}

/** Un mismo tema afirmado y negado en el documento: conflicto a revisar por el abogado (nunca se resuelve solo). */
function comparePolarity(ledger: readonly DocumentPropositionEntry[]): DocumentAssemblyFinding[] {
  const groups = new Map<string, DocumentPropositionEntry[]>();
  for (const entry of ledger.filter((item) => item.kind === 'EVENT')) {
    const existing = groups.get(entry.propositionKey) || [];
    existing.push(entry);
    groups.set(entry.propositionKey, existing);
  }
  const findings: DocumentAssemblyFinding[] = [];
  for (const [key, entries] of groups) {
    const values = new Set(entries.map((entry) => entry.value));
    if (values.size <= 1) continue;
    findings.push(finding(
      'EVENT_POLARITY_CONFLICT',
      'REVIEW',
      `El documento afirma y niega el mismo hecho (${key.replace('EVENT:', '').toLowerCase()}).`,
      entries.flatMap((entry) => entry.blockIds),
      entries.flatMap((entry) => entry.factIds),
      entries.flatMap((entry) => entry.legalIssueIds),
    ));
  }
  return findings;
}

export function validateDocumentConsistency(input: DocumentConsistencyInput): readonly DocumentAssemblyFinding[] {
  const ledger = buildDocumentPropositionLedger(input);
  return [...compareFacts(input, ledger), ...compareStances(input, ledger), ...comparePolarity(ledger)];
}
