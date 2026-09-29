import type { UploadedSourceDocument } from './types';
import {
  normalizeSourceDocumentType,
  UNKNOWN_SOURCE_DOCUMENT_TYPE,
  type SourceDocumentTypeValue,
} from './sourceDocumentTypes';

export const SOURCE_SEMANTIC_CATEGORIES = [
  'CASE_METADATA',
  'CASE_FACT',
  'CASE_CLAIM',
  'CASE_EVIDENCE',
  'CLIENT_POSITION',
  'OPPOSING_PARTY_POSITION',
  'STATUTE',
  'JURISPRUDENCE',
  'PRECEDENT_FACTS',
  'PRECEDENT_HOLDING',
  'LEGAL_ARGUMENT',
  'UNKNOWN',
] as const;

export type SourceSemanticCategory = (typeof SOURCE_SEMANTIC_CATEGORIES)[number];
export type SourceDocumentFamily = 'DEMANDA' | 'CONTESTACION' | 'RECURSO' | 'AMPARO' | 'SENTENCIA' | 'UNKNOWN';
export type SourceSegmentRole = 'CASE_DOCUMENT' | 'JURISPRUDENCE' | 'PRECEDENT' | 'UNKNOWN';
export type ProvenanceIntegrityStatus = 'PASS' | 'REVIEW_REQUIRED' | 'BLOCKED';

export interface SourceGroundedSpan {
  sourceId: string;
  sourceName?: string;
  page?: number;
  startOffset: number;
  endOffset: number;
  text: string;
  category: SourceSemanticCategory;
  confidence: number;
  reason: string;
  canUseAsCaseFact: boolean;
  canUseAsCaseMetadata: boolean;
  authorityOnly: boolean;
}

export interface SourceGroundedValue {
  value: string;
  category: SourceSemanticCategory;
  provenance: SourceGroundedSpan;
  confidence: number;
  canUseAsCaseFact: boolean;
  canUseAsCaseMetadata: boolean;
  canUseAsAuthority: boolean;
}

export interface SourceGroundedField {
  value: string | null;
  category: SourceSemanticCategory;
  provenance: SourceGroundedSpan | null;
  confidence: number;
  status: 'CONFIRMED' | 'REQUIRES_INPUT' | 'AMBIGUOUS';
}

export interface SourceGroundingContainer {
  documentFamily: SourceDocumentFamily;
  documentType: SourceDocumentTypeValue;
  matter: string;
  confidence: number;
  evidence: SourceGroundedSpan[];
}

export interface SourceProvenanceIntegrityGate {
  name: 'PROVENANCE_INTEGRITY_GATE';
  status: ProvenanceIntegrityStatus;
  issues: string[];
  blockedFields: string[];
}

export interface SourceGrounding {
  schemaVersion: 'phase2-v1';
  sourceId: string;
  sourceName?: string;
  sourceText: string;
  caseText: string;
  casePages: Array<{ page: number; text: string; chars: number }>;
  authorityText: string;
  segments: Array<{
    role: SourceSegmentRole;
    startOffset: number;
    endOffset: number;
    text: string;
  }>;
  container: SourceGroundingContainer;
  caseMetadata: {
    expediente: SourceGroundedField;
    candidates: SourceGroundedValue[];
    status: SourceGroundedField['status'];
  };
  caseFacts: SourceGroundedSpan[];
  caseClaims: SourceGroundedSpan[];
  caseEvidence: SourceGroundedSpan[];
  authoritySpans: SourceGroundedSpan[];
  precedentFacts: SourceGroundedSpan[];
  precedentHoldings: SourceGroundedSpan[];
  values: SourceGroundedValue[];
  provenanceIntegrity: SourceProvenanceIntegrityGate;
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
  page?: number;
}

const AUTHORITY_INTRO_RE = /(?:TESIS\s+JURISPRUDENCIALES?|CRITERIOS?\s+JUR[IÍ]DICOS?|CRITERIOS?\s+JURISPRUDENCIALES?|JURISPRUDENCIA(?:S)?\s+APLICABLES?|A\s+LA\s+LETRA\s+DICEN|SIRVE\s+DE\s+APOYO|FUNDAMENTO\s+EN\s+LA\s+SIGUIENTE)/i;
// A case judgment routinely mentions its own amparo/expediente number in the
// factual narrative. Only explicit authority metadata labels may start the
// cited-authority segment; a bare case citation is not a safe boundary.
const AUTHORITY_METADATA_RE = /^\s*(?:REGISTRO\s+DIGITAL\s*:|INSTANCIA\s*:|TESIS\s*:|FUENTE\s*:|TIPO\s*:\s*(?:JURISPRUDENCIA|TESIS)\b)/i;
const PRECEDENT_FACT_RE = /^\s*(?:HECHOS?|ANTECEDENTES?)\s*:/i;
const PRECEDENT_HOLDING_RE = /^\s*(?:CRITERIO\s+JUR[IÍ]DICO|JUSTIFICACI[ÓO]N|PUNTO\s+RESOLUTIVO|RESUELVE)\s*:/i;
const STRUCTURAL_HEADING_RE = /^\s*(?:H\s*E\s*C\s*H\s*O\s*S?|A\s*N\s*T\s*E\s*C\s*E\s*D\s*E\s*N\s*T\s*E\s*S?|PRESTACIONES?|PRETENSIONES?|CONCEPTOS?|PRUEBAS?|DERECHO|FUNDAMENTOS?|PETITORIOS?|PUNTOS\s+PETITORIOS?)\s*[:.\-]?\s*$/i;

function sourceText(source: UploadedSourceDocument): string {
  if (typeof source.extractedText === 'string') return source.extractedText;
  if (typeof source.content === 'string') return source.content;
  return source.pages?.map((page) => page.text || '').join('\n\n') || '';
}

function linesFor(source: UploadedSourceDocument, text: string): SourceLine[] {
  const pageByOffset: Array<{ start: number; end: number; page: number }> = [];
  let pageOffset = 0;
  for (const page of source.pages || []) {
    const pageText = page.text || '';
    pageByOffset.push({ start: pageOffset, end: pageOffset + pageText.length, page: page.page });
    pageOffset += pageText.length + 2;
  }
  const lines: SourceLine[] = [];
  let start = 0;
  for (const match of text.matchAll(/[^\r\n]*(?:\r?\n|$)/g)) {
    const raw = match[0];
    if (!raw && start >= text.length) break;
    const lineText = raw.replace(/\r?\n$/, '');
    const end = start + lineText.length;
    const page = pageByOffset.find((entry) => start >= entry.start && start <= entry.end)?.page;
    lines.push({ text: lineText, start, end, page });
    start += raw.length;
    if (start >= text.length) break;
  }
  return lines.filter((line) => line.text.trim().length > 0);
}

function normalizeMatter(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function span(
  source: UploadedSourceDocument,
  line: SourceLine,
  category: SourceSemanticCategory,
  reason: string,
  options: Partial<Pick<SourceGroundedSpan, 'canUseAsCaseFact' | 'canUseAsCaseMetadata' | 'authorityOnly' | 'confidence'>> = {},
): SourceGroundedSpan {
  return {
    sourceId: source.id,
    ...(source.filename || source.name ? { sourceName: source.filename || source.name } : {}),
    ...(line.page !== undefined ? { page: line.page } : {}),
    startOffset: line.start,
    endOffset: line.end,
    text: line.text.trim(),
    category,
    confidence: options.confidence ?? 0.95,
    reason,
    canUseAsCaseFact: options.canUseAsCaseFact ?? category === 'CASE_FACT',
    canUseAsCaseMetadata: options.canUseAsCaseMetadata ?? category === 'CASE_METADATA',
    authorityOnly: options.authorityOnly ?? false,
  };
}

function segmentBoundary(lines: SourceLine[]): number {
  const explicit = lines.findIndex((line, index) => index > 0 && AUTHORITY_INTRO_RE.test(line.text));
  if (explicit >= 0) return explicit;
  const metadata = lines.findIndex((line, index) => index > 2 && AUTHORITY_METADATA_RE.test(line.text));
  return metadata >= 0 ? metadata : lines.length;
}

function documentFamily(caseText: string): SourceDocumentFamily {
  if (/^\s*(?:demanda|escrito\s+inicial)\b/im.test(caseText)) return 'DEMANDA';
  const firstLine = caseText.split(/\r?\n/).find((line) => line.trim()) || '';
  // An explicit resolution title is stronger than phrases such as
  // "autoridad responsable" that also appear in an amparo complaint.
  if (/^\s*(?:sentencia|ejecutoria)\b.*\bamparo\b/i.test(firstLine)) return 'SENTENCIA';
  // Una resolución puede narrar una demanda, una contestación y una réplica.
  // Las señales propias de sentencia deben ganar a ese vocabulario incidental.
  if (/\b(?:sentencia|laudo|resuelve|considerando|resultando)\b/i.test(caseText)
    && /\b(?:visto|resuelve|magistrado|tribunal\s+colegiado)\b/i.test(caseText)) return 'SENTENCIA';
  if (/\b(?:vengo\s+a\s+)?(?:demandar|entablar\s+formal\s+demanda|interponer\s+juicio)\b/i.test(caseText)) return 'DEMANDA';
  if (/\bcontestaci[oó]n\s+(?:de\s+la\s+)?demanda\b/i.test(caseText)) return 'CONTESTACION';
  if (/\b(?:interpongo|interponer)\s+recurso\b|\bagravio(?:s)?\b/i.test(caseText)) return 'RECURSO';
  if (/\b(?:juicio\s+de\s+)?amparo\b/i.test(caseText) && /\b(?:acto\s+reclamado|autoridad\s+responsable|conceder\s+el\s+amparo)\b/i.test(caseText)) return 'AMPARO';
  return 'UNKNOWN';
}

function matterFor(caseText: string): string {
  const opening = caseText.slice(0, 6_000);
  if (/\b(?:juez\s+de\s+lo\s+familiar|alimentos?|pensi[oó]n\s+alimenticia|padre|hijo|patria\s+potestad|custodia)\b/i.test(opening)) return 'FAMILIAR';
  // Un encabezado procesal explícito controla vocabulario incidental del cuerpo.
  if (/\b(?:demanda|escrito\s+inicial)\b[^\n]{0,80}\b(?:civil|responsabilidad\s+civil)\b/i.test(opening)
    || /\b(?:juez|juzgado)\s+de\s+lo\s+civil\b/i.test(opening)
    || /\b(?:materia|v[ií]a)\s+civil\b/i.test(opening)) return 'CIVIL';
  if (/\b(?:demanda\s+mercantil|materia\s+mercantil|juicio\s+(?:ejecutivo|ordinario|oral)\s+mercantil)\b/i.test(opening)) return 'MERCANTIL';
  if (/\b(?:demanda\s+de\s+amparo(?:\s+directo)?|juicio\s+de\s+amparo\s+directo)\b/i.test(opening)) return 'AMPARO';
  if (/\b(?:tribunal\s+de\s+arbitraje|trabajador(?:a|es)?|despido|salario|reinstalaci[oó]n|relaci[oó]n\s+laboral|prestaciones\s+laborales?)\b/i.test(opening)) return 'LABORAL';
  if (/\b(?:oral\s+mercantil|materia\s+oral\s+mercantil|c[oó]digo\s+de\s+comercio|acci[oó]n\s+rescisoria|contrato\s+de\s+adhesi[oó]n)\b/i.test(opening)) return 'MERCANTIL';
  if (/\b(?:materia\s+civil|juez\s+en\s+materia\s+civil|juez\s+de\s+lo\s+civil|v[ií]a\s+civil|acci[oó]n\s+hipotecaria|c[oó]digo\s+civil)\b/i.test(opening)) return 'CIVIL';
  if (/\b(?:administrativ|tribunal\s+de\s+justicia\s+administrativa)\b/i.test(opening)) return 'ADMINISTRATIVA';
  if (/\bamparo|constitucional\b/i.test(opening)) return 'AMPARO';
  return 'NO_IDENTIFICADA';
}

function containerType(family: SourceDocumentFamily, matter: string, caseText: string): SourceDocumentTypeValue {
  if (family === 'DEMANDA') {
    if (matter === 'LABORAL') return 'DEMANDA_LABORAL';
    if (matter === 'MERCANTIL') return 'DEMANDA_MERCANTIL';
    if (matter === 'CIVIL' || matter === 'FAMILIAR') return 'DEMANDA_CIVIL';
    if (/\bdemanda\s+de\s+amparo\s+directo\b/i.test(caseText)) return 'DEMANDA_AMPARO_DIRECTO';
    if (matter === 'AMPARO' || /\bdemanda\s+de\s+amparo\b/i.test(caseText)) return 'DEMANDA_AMPARO';
    return 'DEMANDA';
  }
  if (family === 'CONTESTACION') return 'CONTESTACION_DEMANDA';
  if (family === 'RECURSO') return 'RECURSO';
  if (family === 'AMPARO') return 'DEMANDA_AMPARO';
  if (family === 'SENTENCIA') return /\bamparo\b/i.test(caseText) ? 'SENTENCIA_AMPARO_DIRECTO' : 'SENTENCIA_O_RESOLUCION';
  return UNKNOWN_SOURCE_DOCUMENT_TYPE;
}

function sectionSpans(
  source: UploadedSourceDocument,
  lines: SourceLine[],
  startIndex: number,
  endIndex: number,
): { facts: SourceGroundedSpan[]; claims: SourceGroundedSpan[]; evidence: SourceGroundedSpan[] } {
  const facts: SourceGroundedSpan[] = [];
  const claims: SourceGroundedSpan[] = [];
  const evidence: SourceGroundedSpan[] = [];
  let section: 'FACT' | 'CLAIM' | 'EVIDENCE' | undefined;
  for (let index = startIndex; index < endIndex; index += 1) {
    const line = lines[index];
    const normalized = line.text.replace(/[\s:;,.\-]+$/, '').trim();
    const compact = normalized.replace(/\s+/g, '');
    const isFactHeading = /^(?:HECHOS?|ANTECEDENTES?)$/i.test(compact);
    const isClaimHeading = /^(?:PRESTACIONES?|PRETENSIONES?|CONCEPTOS?|PETITORIOS?|PUNTOSPETITORIOS?)$/i.test(compact);
    const isEvidenceHeading = /^(?:PRUEBAS?|MEDIOSDEPRUEBA)$/i.test(compact);
    if (isFactHeading) section = 'FACT';
    else if (isClaimHeading) section = 'CLAIM';
    else if (isEvidenceHeading) section = 'EVIDENCE';
    else if (STRUCTURAL_HEADING_RE.test(line.text)) section = undefined;
    if (!section || isFactHeading || isClaimHeading || isEvidenceHeading) continue;
    const item = span(source, line, section === 'FACT' ? 'CASE_FACT' : section === 'CLAIM' ? 'CASE_CLAIM' : 'CASE_EVIDENCE', `Span ubicado bajo la sección principal ${section}.`, { canUseAsCaseFact: section === 'FACT' });
    if (section === 'FACT') facts.push(item);
    else if (section === 'CLAIM') claims.push(item);
    else evidence.push(item);
  }
  return { facts, claims, evidence };
}

function fallbackCaseSpans(
  source: UploadedSourceDocument,
  caseLines: SourceLine[],
  existing: { facts: SourceGroundedSpan[]; claims: SourceGroundedSpan[]; evidence: SourceGroundedSpan[] },
): { facts: SourceGroundedSpan[]; claims: SourceGroundedSpan[]; evidence: SourceGroundedSpan[] } {
  const facts = [...existing.facts];
  const claims = [...existing.claims];
  const evidence = [...existing.evidence];
  const narrativeLines = caseLines.filter((line) => line.text.length >= 80 && /\b(?:toda\s+vez|desde\s+que|se\s+desentendi[oó]|omisi[oó]n|abandono|contrato|incumpl|despido|relaci[oó]n|salario|hijo|padre|deudor)\b/i.test(line.text));
  if (facts.length === 0) {
    facts.push(...narrativeLines.slice(0, 12).map((line) => span(source, line, 'CASE_FACT', 'Narrativa ubicada en el segmento del documento principal; no existe un encabezado de hechos confiablemente delimitado.', { canUseAsCaseFact: true, confidence: 0.82 })));
  }
  if (claims.length === 0) {
    claims.push(...caseLines
      .filter((line) => line.text.length >= 45 && /\b(?:demandar|interponer\s+juicio|reclaman|prestaci[oó]n|cancelaci[oó]n|pensi[oó]n|cantidad|petitorio)\b/i.test(line.text))
      .slice(0, 12)
      .map((line) => span(source, line, 'CASE_CLAIM', 'Pretensión ubicada en el segmento del documento principal mediante un ancla verbal explícita.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, confidence: 0.82 })));
  }
  if (evidence.length === 0) {
    evidence.push(...caseLines
      .filter((line) => line.text.length >= 45 && /\b(?:prueba|documental|testimonial|confesional|estado\s+de\s+cuenta|recibo)\b/i.test(line.text))
      .slice(0, 12)
      .map((line) => span(source, line, 'CASE_EVIDENCE', 'Oferta o referencia probatoria ubicada en el segmento del documento principal.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, confidence: 0.82 })));
  }
  return { facts, claims, evidence };
}

function groundedValue(value: string, sourceSpan: SourceGroundedSpan, category: SourceSemanticCategory, options: Partial<Pick<SourceGroundedValue, 'canUseAsCaseFact' | 'canUseAsCaseMetadata' | 'canUseAsAuthority'>> = {}): SourceGroundedValue {
  return {
    value,
    category,
    provenance: { ...sourceSpan, category },
    confidence: sourceSpan.confidence,
    canUseAsCaseFact: options.canUseAsCaseFact ?? sourceSpan.canUseAsCaseFact,
    canUseAsCaseMetadata: options.canUseAsCaseMetadata ?? sourceSpan.canUseAsCaseMetadata,
    canUseAsAuthority: options.canUseAsAuthority ?? (category === 'JURISPRUDENCE' || category === 'STATUTE' || category === 'PRECEDENT_HOLDING'),
  };
}

function extractCaseMetadata(source: UploadedSourceDocument, lines: SourceLine[], caseEndIndex: number): { field: SourceGroundedField; candidates: SourceGroundedValue[] } {
  const candidates: SourceGroundedValue[] = [];
  const explicitPattern = /\b(?:expediente|n[uú]mero\s+de\s+expediente|expediente\s+judicial)\s*(?:n[uú]m(?:ero)?\.?\s*)?[:#-]?\s*([0-9]{1,6}\s*[\/-]\s*[0-9]{2,4})\b/gi;
  const caseLines = lines.slice(0, caseEndIndex);
  for (const line of caseLines) {
    for (const match of line.text.matchAll(explicitPattern)) {
      const value = match[1].replace(/\s+/g, '');
      candidates.push(groundedValue(value, span(source, line, 'CASE_METADATA', 'Número identificado mediante etiqueta explícita de expediente.', { canUseAsCaseMetadata: true }), 'CASE_METADATA', { canUseAsCaseMetadata: true }));
    }
  }
  const unique = Array.from(new Map(candidates.map((candidate) => [candidate.value, candidate])).values());
  if (unique.length === 1) return { field: { value: unique[0].value, category: 'CASE_METADATA', provenance: unique[0].provenance, confidence: unique[0].confidence, status: 'CONFIRMED' }, candidates: unique };
  if (unique.length > 1) return { field: { value: null, category: 'CASE_METADATA', provenance: null, confidence: 0, status: 'AMBIGUOUS' }, candidates: unique };
  return { field: { value: null, category: 'CASE_METADATA', provenance: null, confidence: 0, status: 'REQUIRES_INPUT' }, candidates: [] };
}

function authorityValues(source: UploadedSourceDocument, authorityLines: SourceLine[]): SourceGroundedValue[] {
  const result: SourceGroundedValue[] = [];
  const patterns = [
    /\b(?:amparo\s+(?:directo|indirecto)|toca|contradicci[oó]n\s+de\s+tesis)\s+([0-9]{1,6}\s*[\/-]\s*[0-9]{2,4})/gi,
    /\bregistro\s+digital\s*:\s*([0-9]{4,12})/gi,
  ];
  for (const line of authorityLines) {
    for (const pattern of patterns) {
      for (const match of line.text.matchAll(pattern)) {
        const value = match[1].replace(/\s+/g, '');
        const sourceSpan = span(source, line, 'JURISPRUDENCE', 'Número extraído de una autoridad o precedente citado, no del encabezado del expediente.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, authorityOnly: true });
        result.push(groundedValue(value, sourceSpan, 'JURISPRUDENCE', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, canUseAsAuthority: true }));
      }
    }
  }
  return Array.from(new Map(result.map((value) => [`${value.category}:${value.value}`, value])).values());
}

export function buildSourceGrounding(source: UploadedSourceDocument): SourceGrounding {
  const text = sourceText(source);
  const lines = linesFor(source, text);
  const boundary = segmentBoundary(lines);
  const caseLines = lines.slice(0, boundary);
  const authorityLines = lines.slice(boundary);
  const caseText = caseLines.map((line) => line.text).join('\n');
  const pageLines = new Map<number, string[]>();
  for (const line of caseLines) {
    const page = line.page ?? 1;
    pageLines.set(page, [...(pageLines.get(page) || []), line.text]);
  }
  const casePages = Array.from(pageLines, ([page, pageText]) => {
    const text = pageText.join('\n');
    return { page, text, chars: text.length };
  });
  const authorityText = authorityLines.map((line) => line.text).join('\n');
  const family = documentFamily(caseText);
  const matter = matterFor(caseText);
  const type = containerType(family, matter, caseText);
  const evidence = caseLines
    .filter((line) => /(?:juez|tribunal|comparezco|vengo\s+a\s+(?:demandar|promover)|interponer\s+juicio|prestaciones?|pretensiones?)/i.test(line.text))
    .slice(0, 12)
    .map((line) => span(source, line, /prestaci|pretensi/i.test(line.text) ? 'CASE_CLAIM' : 'CASE_METADATA', 'Evidencia estructural del documento contenedor.', { canUseAsCaseMetadata: true }));
  const sections = fallbackCaseSpans(source, caseLines, sectionSpans(source, lines, 0, boundary));
  const precedentFacts = authorityLines.filter((line) => PRECEDENT_FACT_RE.test(line.text)).map((line) => span(source, line, 'PRECEDENT_FACTS', 'La sección Hechos pertenece al precedente citado después del documento principal.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, authorityOnly: true }));
  const precedentHoldings = authorityLines.filter((line) => PRECEDENT_HOLDING_RE.test(line.text)).map((line) => span(source, line, 'PRECEDENT_HOLDING', 'Criterio o justificación de una jurisprudencia citada.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, authorityOnly: true }));
  const authoritySpans = authorityLines.map((line) => {
    if (PRECEDENT_FACT_RE.test(line.text)) return precedentFacts.find((item) => item.startOffset === line.start)!;
    if (PRECEDENT_HOLDING_RE.test(line.text)) return precedentHoldings.find((item) => item.startOffset === line.start)!;
    return span(source, line, 'JURISPRUDENCE', 'Texto ubicado en el segmento de autoridad citada.', { canUseAsCaseFact: false, canUseAsCaseMetadata: false, authorityOnly: true });
  });
  const metadata = extractCaseMetadata(source, lines, boundary);
  const values = [...metadata.candidates, ...authorityValues(source, authorityLines)];
  const integrityIssues: string[] = [];
  if (metadata.field.status !== 'CONFIRMED') integrityIssues.push(metadata.field.status === 'AMBIGUOUS' ? 'CASE_METADATA_AMBIGUOUS' : 'CASE_EXPEDIENTE_REQUIRES_INPUT');
  if (authorityValues(source, authorityLines).some((value) => value.canUseAsCaseMetadata || value.canUseAsCaseFact)) integrityIssues.push('AUTHORITY_VALUE_CANNOT_FEED_CASE_METADATA');
  const provenanceIntegrity: SourceProvenanceIntegrityGate = {
    name: 'PROVENANCE_INTEGRITY_GATE',
    status: integrityIssues.some((issue) => /CANNOT_FEED|DERIVED_FROM_JURISPRUDENCE/.test(issue)) ? 'BLOCKED' : integrityIssues.length > 0 ? 'REVIEW_REQUIRED' : 'PASS',
    issues: Array.from(new Set(integrityIssues)),
    blockedFields: integrityIssues.length > 0 ? ['expediente', 'caseFacts', 'caseClaims'] : [],
  };
  return {
    schemaVersion: 'phase2-v1',
    sourceId: source.id,
    ...(source.filename || source.name ? { sourceName: source.filename || source.name } : {}),
    sourceText: text,
    caseText,
    casePages,
    authorityText,
    segments: [
      { role: 'CASE_DOCUMENT', startOffset: caseLines[0]?.start || 0, endOffset: caseLines.at(-1)?.end || 0, text: caseText },
      ...(authorityText ? [{ role: 'JURISPRUDENCE' as const, startOffset: authorityLines[0]?.start || 0, endOffset: authorityLines.at(-1)?.end || 0, text: authorityText }] : []),
    ],
    container: { documentFamily: family, documentType: type, matter, confidence: family === 'UNKNOWN' || matter === 'NO_IDENTIFICADA' ? 0.45 : 0.95, evidence },
    caseMetadata: { expediente: metadata.field, candidates: metadata.candidates, status: metadata.field.status },
    caseFacts: sections.facts,
    caseClaims: sections.claims,
    caseEvidence: sections.evidence,
    authoritySpans,
    precedentFacts,
    precedentHoldings,
    values,
    provenanceIntegrity,
  };
}

export function buildSourceGroundingForDocuments(sources: UploadedSourceDocument[]): SourceGrounding[] {
  return sources.map(buildSourceGrounding);
}

export function sourceGroundingCaseText(grounding: SourceGrounding): string {
  return grounding.caseText;
}
