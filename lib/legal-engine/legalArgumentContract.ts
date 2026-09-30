import type { UniversalLegalDocument } from './types';

export interface RecordSource { id: string; text: string }
export interface CaseRecordLink { sourceId: string; page?: number; excerpt: string }
export interface ArgumentFinding { code: string; field?: string; sectionId?: string; message: string }
export interface GrievanceContract {
  resolution: string; challengedReasoning: string; error: string; normOrQuestion: string;
  caseRecord: CaseRecordLink[]; reasoning: string; prejudice: string; requestedEffect: string;
}
export interface ConstitutionalConceptContract {
  act: string; authorityReasoning: string; norm: string; factRecord: CaseRecordLink[];
  contradiction: string; affectation: string; effect: string;
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const usable = (text?: string) => Boolean(text?.trim() && !/\[(?:DATO PENDIENTE|REQUIERE|PENDIENTE)/i.test(text));
const generic = (text?: string) => !usable(text) || /^(?:se violan mis derechos|la resolucion es ilegal|se formulan los conceptos|planteamiento juridico|desarrollo del bloque|se desarrollan los argumentos)/.test(normalize(text!));
const finding = (code: string, field?: string): ArgumentFinding => ({ code, ...(field ? { field } : {}), message: `${code}${field ? `: ${field}` : ''}; requiere desarrollo verificable y revisión del abogado.` });
function linked(links: CaseRecordLink[] | undefined, sources: RecordSource[]): boolean {
  return Boolean(links?.length && links.every(link => usable(link.excerpt) && sources.some(source => source.id === link.sourceId && normalize(source.text).includes(normalize(link.excerpt)))));
}

/** Structural completeness only. Never verifies an authority or marks facts
 * proven, client positions confirmed, coverage covered, or readiness FINAL. */
export function validateGrievance(unit: Partial<GrievanceContract>, sources: RecordSource[]): ArgumentFinding[] {
  const results: ArgumentFinding[] = [];
  if (!Object.values(unit).some(value => typeof value === 'string' && value.trim())) results.push(finding('EMPTY_GRIEVANCE'));
  if (generic(unit.reasoning)) results.push(finding('GENERIC_GRIEVANCE', 'reasoning'));
  const fields = [
    ['resolution', 'MISSING_CHALLENGED_RESOLUTION'], ['challengedReasoning', 'MISSING_CHALLENGED_REASONING'],
    ['error', 'MISSING_ATTRIBUTED_ERROR'], ['normOrQuestion', 'MISSING_NORM_OR_LEGAL_QUESTION'],
    ['prejudice', 'MISSING_PREJUDICE'], ['requestedEffect', 'MISSING_REQUESTED_EFFECT'],
  ] as const;
  for (const [field, code] of fields) if (!usable(unit[field])) results.push(finding(code, field));
  if (usable(unit.challengedReasoning) && !sources.some(source => normalize(source.text).includes(normalize(unit.challengedReasoning!)))) results.push(finding('MISSING_CHALLENGED_REASONING', 'sourceSpan'));
  if (!linked(unit.caseRecord, sources)) results.push(finding('MISSING_CASE_RECORD_LINK', 'caseRecord'));
  return results;
}
export function validateConstitutionalConcept(unit: Partial<ConstitutionalConceptContract>, sources: RecordSource[]): ArgumentFinding[] {
  const results: ArgumentFinding[] = [];
  for (const field of ['act', 'authorityReasoning', 'norm', 'contradiction', 'affectation', 'effect'] as const) {
    if (!usable(unit[field]) || (field === 'contradiction' && generic(unit[field]))) results.push(finding('INCOMPLETE_CONSTITUTIONAL_CONCEPT', field));
  }
  if (!linked(unit.factRecord, sources)) results.push(finding('MISSING_CASE_RECORD_LINK', 'factRecord'));
  if (usable(unit.authorityReasoning) && !sources.some(source => normalize(source.text).includes(normalize(unit.authorityReasoning!)))) results.push(finding('INCOMPLETE_CONSTITUTIONAL_CONCEPT', 'authorityReasoningSourceSpan'));
  return results;
}
export function detectSyntheticPlaceholders(text: string): ArgumentFinding[] {
  // Internal planning markers are visible pending data, not asserted prose.
  const prose = text.replace(/\[(?:DATO PENDIENTE[^\]]*|REQUIERE[^\]]*|PENDIENTE[^\]]*)\]/gi, '');
  const results: ArgumentFinding[] = [];
  const pattern = /\b(?:delito de imputado|nombre del actor|nombre del demandado|autoridad responsable correspondiente|art[ií]culo aplicable|jurisprudencia aplicable|hechos del caso|prueba correspondiente)\b/gi;
  for (const match of prose.matchAll(pattern)) results.push({ code: 'UNRESOLVED_SYNTHETIC_PLACEHOLDER', field: match[0], message: `Texto sintético no resuelto: ${match[0]}.` });
  return results;
}

/** Explicit field labels provide an auditable contract. Missing narrative
 * links are reported, not reconstructed from the source to disguise omissions. */
function labeled(text: string, names: string[]): string {
  const wanted = new Set(names.map(normalize));
  const lines = text.split(/\n/);
  let active = false;
  const result: string[] = [];
  for (const line of lines) {
    const label = line.match(/^\s*([A-ZÁÉÍÓÚÑ /-]+)\s*:\s*(.*)$/);
    if (label) { active = wanted.has(normalize(label[1])); if (active && label[2]) result.push(label[2]); }
    else if (active) result.push(line);
  }
  return result.join('\n').trim();
}
export function auditLegalArgumentStructure(doc: UniversalLegalDocument): ArgumentFinding[] {
  const sources = doc.sourceDocuments.map(source => ({ id: source.id, text: source.extractedText ?? source.content ?? source.pages?.map(p => p.text).join('\n') ?? '' }));
  const findings: ArgumentFinding[] = [];
  for (const section of doc.sections) {
    const text = section.content.map(block => block.text).join('\n\n');
    const local = detectSyntheticPlaceholders(text);
    const title = normalize(section.title);
    const isConcept = /conceptos? de violacion/.test(title) && /amparo/.test(doc.documentType);
    const isGrievance = /agravio/.test(title) && /apelacion/.test(doc.documentType);
    if (isConcept || isGrievance) {
      const units = text.split(/(?:^|\n)\s*(?:AGRAVIO|CONCEPTO(?: DE VIOLACI[ÓO]N)?)\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|\d+)\s*[.:\-]?\s*\n/gi).filter(part => part.trim());
      for (const unit of units.length ? units : ['']) {
        const recordText = labeled(unit, ['CONSTANCIA DEL EXPEDIENTE', 'HECHO/CONSTANCIA', 'CONSTANCIA']);
        const links = sources.filter(source => recordText && normalize(source.text).includes(normalize(recordText))).map(source => ({ sourceId: source.id, excerpt: recordText }));
        if (isConcept) local.push(...validateConstitutionalConcept({
          act: labeled(unit, ['ACTO RECLAMADO']), authorityReasoning: labeled(unit, ['RAZONAMIENTO DE LA AUTORIDAD']),
          norm: labeled(unit, ['NORMA CONSTITUCIONAL/LEGAL', 'NORMA']), factRecord: links,
          contradiction: labeled(unit, ['CONTRADICCIÓN JURÍDICA']), affectation: labeled(unit, ['AFECTACIÓN']), effect: labeled(unit, ['EFECTO']),
        }, sources));
        else local.push(...validateGrievance({
          resolution: labeled(unit, ['RESOLUCIÓN COMBATIDA']), challengedReasoning: labeled(unit, ['CONSIDERACIÓN ESPECÍFICA']),
          error: labeled(unit, ['ERROR ATRIBUIDO']), normOrQuestion: labeled(unit, ['NORMA/CUESTIÓN JURÍDICA']), caseRecord: links,
          reasoning: labeled(unit, ['RAZONAMIENTO']), prejudice: labeled(unit, ['PERJUICIO/TRASCENDENCIA', 'PERJUICIO']), requestedEffect: labeled(unit, ['EFECTO QUE SE SOLICITA', 'EFECTO']),
        }, sources));
      }
    }
    findings.push(...local.map(item => ({ ...item, sectionId: section.id })));
  }
  return findings;
}
