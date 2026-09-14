import type { CaseConflict, CaseParty, NormalizedAmount, NormalizedDate, RichCaseAnalysis, SourceAssertion } from './types';

function sourceIds(...provenances: Array<{ sourceId: string }[]>): string[] {
  return Array.from(new Set(provenances.flat().map((item) => item.sourceId)));
}

function sameContext(left: { provenance: Array<{ section?: string }> }, right: { provenance: Array<{ section?: string }> }): boolean {
  const leftSection = left.provenance[0]?.section;
  const rightSection = right.provenance[0]?.section;
  return !leftSection || !rightSection || leftSection === rightSection;
}

const DATE_TOKEN_RE = /\b(?:\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|[a-záéíóúñ]+\s+(?:de\s+)?\d{4}|\d{4})\b/i;

function dateSemanticWindow(date: NormalizedDate): string {
  const raw = date.rawValue.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = DATE_TOKEN_RE.exec(raw);
  if (!match || match.index === undefined) return raw.slice(0, 180);
  const start = Math.max(0, match.index - 100);
  const end = Math.min(raw.length, match.index + match[0].length + 100);
  return raw.slice(start, end);
}

/**
 * A normalized date is not an event identity.  Only compare dates when the
 * source text exposes the same narrow event anchor; ranges, citations, case
 * identifiers, and uncued dates are intentionally fail-closed.
 */
function dateSemanticGroup(date: NormalizedDate): string | undefined {
  const context = `${dateSemanticWindow(date)} ${date.provenance[0]?.section || ''}`;

  if (/\b(?:amparo|expediente|toca)\s+(?:directo|indirecto)?\s*[:#]/i.test(context)) return undefined;
  if (/\b(?:semanario|gaceta|tesis|jurisprudencia|registro\s+digital|instancia|libro)\b/i.test(context)) return undefined;
  if (/\b(?:periodo|per[ií]odo|comprendid[oa]|desde)\b/i.test(context) || /^\s*(?:al|hasta)\b/i.test(context)) return undefined;

  if (/\blaudo\b.{0,90}\b(?:fecha|dictad|emitid|pronunciad)\b|\b(?:fecha|dictad|emitid|pronunciad)\b.{0,90}\blaudo\b/i.test(context)) {
    return 'RULING_LAUDO_DATE';
  }
  if (/\b(?:sentencia|ejecutoria|resoluci[oó]n)\b.{0,90}\b(?:fecha|dictad|emitid|pronunciad)\b|\b(?:fecha|dictad|emitid|pronunciad)\b.{0,90}\b(?:sentencia|ejecutoria|resoluci[oó]n)\b/i.test(context)) {
    return 'RULING_DECISION_DATE';
  }
  if (/\b(?:contrato|convenio)\b.{0,90}\b(?:celebr|firm|suscri|formaliz)\w*/i.test(context)) {
    return 'CONTRACT_EXECUTION_DATE';
  }
  if (/\bdespido\b.{0,90}\b(?:fecha|ocurri|produj|notific)\w*/i.test(context)) {
    return 'DISMISSAL_DATE';
  }
  if (/\baudiencia\b.{0,90}\b(?:fecha|celebr|realiz|llev)\w*/i.test(context)) {
    return 'HEARING_DATE';
  }
  return undefined;
}

function datesCompatibleAtPrecision(first: NormalizedDate, second: NormalizedDate): boolean {
  if (!first.normalizedValue || !second.normalizedValue) return true;
  if (first.normalizedValue === second.normalizedValue) return true;
  if (first.precision === 'YEAR' && second.normalizedValue.startsWith(`${first.normalizedValue}-`)) return true;
  if (second.precision === 'YEAR' && first.normalizedValue.startsWith(`${second.normalizedValue}-`)) return true;
  if (first.precision === 'MONTH' && second.normalizedValue.startsWith(`${first.normalizedValue}-`)) return true;
  if (second.precision === 'MONTH' && first.normalizedValue.startsWith(`${second.normalizedValue}-`)) return true;
  return false;
}

function conflict(type: CaseConflict['type'], itemIds: string[], sources: string[], description: string): CaseConflict {
  return {
    conflictId: `conflict-${type.toLowerCase()}-${itemIds.join('-')}`,
    type,
    itemIds,
    sourceIds: sources,
    description,
    requiresReview: true,
  };
}

function normalizedName(value: string | undefined): string {
  return (value || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectAmountConflicts(amounts: NormalizedAmount[]): CaseConflict[] {
  const conflicts: CaseConflict[] = [];
  for (let left = 0; left < amounts.length; left += 1) {
    for (let right = left + 1; right < amounts.length; right += 1) {
      const first = amounts[left];
      const second = amounts[right];
      if (first.normalizedValue === undefined || second.normalizedValue === undefined || first.normalizedValue === second.normalizedValue || !sameContext(first, second)) continue;
      conflicts.push(conflict('AMOUNT', [`amount-${left}`, `amount-${right}`], sourceIds(first.provenance, second.provenance), `Incompatible source amounts: ${first.rawValue} / ${second.rawValue}.`));
    }
  }
  return conflicts;
}

function detectDateConflicts(dates: NormalizedDate[]): CaseConflict[] {
  const conflicts: CaseConflict[] = [];
  for (let left = 0; left < dates.length; left += 1) {
    for (let right = left + 1; right < dates.length; right += 1) {
      const first = dates[left];
      const second = dates[right];
      if (
        !first.normalizedValue
        || !second.normalizedValue
        || datesCompatibleAtPrecision(first, second)
        || !sameContext(first, second)
        || dateSemanticGroup(first) === undefined
        || dateSemanticGroup(first) !== dateSemanticGroup(second)
      ) continue;
      conflicts.push(conflict('DATE', [`date-${left}`, `date-${right}`], sourceIds(first.provenance, second.provenance), `Incompatible source dates: ${first.rawValue} / ${second.rawValue}.`));
    }
  }
  return conflicts;
}

function detectPartyConflicts(parties: CaseParty[]): CaseConflict[] {
  const conflicts: CaseConflict[] = [];
  for (let left = 0; left < parties.length; left += 1) {
    for (let right = left + 1; right < parties.length; right += 1) {
      const first = parties[left];
      const second = parties[right];
      const firstName = normalizedName(first.name);
      const secondName = normalizedName(second.name);
      if (!firstName || !secondName || firstName === secondName) continue;
      const firstToken = firstName.split(' ')[0];
      if (!secondName.split(' ').includes(firstToken)) continue;
      const type: CaseConflict['type'] = first.role === second.role ? 'IDENTITY' : 'ROLE';
      conflicts.push(conflict(type, [first.id, second.id], sourceIds(first.provenance, second.provenance), `Party names or roles may refer to the same identity: ${first.name} / ${second.name}.`));
    }
  }
  return conflicts;
}

function assertionBase(assertion: SourceAssertion): { base: string; negative: boolean } {
  const normalized = assertion.proposition.toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const negative = /^(?:no|nunca|jamas)\s+/.test(normalized);
  return { base: normalized.replace(/^(?:no|nunca|jamas)\s+/, ''), negative };
}

function detectAssertionConflicts(assertions: SourceAssertion[]): CaseConflict[] {
  const conflicts: CaseConflict[] = [];
  for (let left = 0; left < assertions.length; left += 1) {
    for (let right = left + 1; right < assertions.length; right += 1) {
      const first = assertionBase(assertions[left]);
      const second = assertionBase(assertions[right]);
      if (first.base !== second.base || first.negative === second.negative) continue;
      conflicts.push(conflict('OPPOSING_ASSERTION', [assertions[left].id, assertions[right].id], sourceIds(assertions[left].provenance, assertions[right].provenance), `Opposing source assertions remain open: ${assertions[left].proposition} / ${assertions[right].proposition}.`));
    }
  }
  return conflicts;
}

export function detectCaseConflicts(analysis: Pick<RichCaseAnalysis, 'amounts' | 'dates' | 'parties' | 'assertions'>): CaseConflict[] {
  return [
    ...detectAmountConflicts(analysis.amounts),
    ...detectDateConflicts(analysis.dates),
    ...detectPartyConflicts(analysis.parties),
    ...detectAssertionConflicts(analysis.assertions),
  ];
}
