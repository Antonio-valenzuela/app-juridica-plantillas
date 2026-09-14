import type { SourceUnit } from './sourceUnits';
import type { ExtractionCandidate, SegmentationStats, SourceProvenance } from './types';

export interface SegmentationResult {
  candidates: ExtractionCandidate[];
  stats: SegmentationStats;
}

const LIST_SECTION_RE = /^(?:HECH(?:O|OS)|ANTECEDENTE(?:S)?|PRESTACION(?:ES)?|PRETENSION(?:ES)?|PETICION(?:ES)?|PETITORIO(?:S)?|PRUEBA(?:S)?|DOCUMENTAL(?:ES)?|ANEXO(?:S)?|ARGUMENTO(?:S)?|FUNDAMENTO(?:S)?|DERECHO|CONCEPTO(?:S)?\s+DE\s+VIOLACI[ÓO]N|AGRAVIO(?:S)?)$/i;

function normalizeHeading(text: string): string | undefined {
  const normalized = text
    .replace(/^\s*(?:[IVXLCDM]+|\d+)[.)-]?\s*/i, '')
    .replace(/[\s:;,.\-]+$/, '')
    .trim()
    .toUpperCase();
  return LIST_SECTION_RE.test(normalized) ? normalized : undefined;
}

function headingWithTail(text: string): { heading?: string; tail?: string } {
  const match = text.match(/^\s*(.+?)\s*[:.-]\s*(.*?)\s*$/);
  if (!match) return { heading: normalizeHeading(text) };
  const heading = normalizeHeading(match[1]);
  return heading ? { heading, tail: match[2] || undefined } : {};
}

function listItemBody(text: string): string | undefined {
  const match = text.match(/^\s*(?:(?:HECHO\s+)?(?:\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|[A-Z])[\s.)\-:]+|[-*•]\s+)(.+?)\s*$/i);
  return match?.[1]?.trim() || undefined;
}

function inlineListBodies(text: string, section?: string): string[] {
  // Comma/semicolon lists are safe for evidence/document headings.  In
  // claims and prose, commas commonly belong to monetary values or a single
  // relief and must remain part of the original candidate.
  if (!section || !/^(?:PRUEBAS?|MEDIOS?\s+DE\s+PRUEBA|DOCUMENTAL(?:ES)?|ANEXOS?|EVIDENCIA)$/i.test(section)) return [];
  if (!text.includes(',') && !text.includes(';')) return [];
  const values = text
    .split(/[,;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 1
    ? values.flatMap((value) => value.split(/\s+y\s+/i).map((item) => item.trim()).filter(Boolean))
    : [];
}

function provenanceForSection(provenance: SourceProvenance, section?: string): SourceProvenance {
  return section && provenance.section !== section ? { ...provenance, section } : provenance;
}

function wrappedArgumentBlocks(unit: SourceUnit): SourceUnit[] {
  const lines = unit.text.split(/\n+/).map((text) => text.trim()).filter(Boolean);
  const heading = /^(?:(?:PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s+CONCEPTO(?:S)?\s+DE\s+VIOLACI[ÓO]N|AGRAVIO(?:S)?)\b/i;
  const starts = lines.reduce<number[]>((indices, line, index) => {
    if (heading.test(line)) indices.push(index);
    return indices;
  }, []);
  if (starts.length === 0) return [unit];
  const preamble = lines.slice(0, starts[0]).join('\n');
  const preambleUnit = preamble
    ? [{ ...unit, unitId: `${unit.unitId}:argument:preamble`, text: preamble }]
    : [];
  const argumentUnits = starts.map((start, index) => ({
    ...unit,
    unitId: `${unit.unitId}:argument:${index}`,
    text: lines.slice(start, starts[index + 1]).join('\n'),
  }));
  return [...preambleUnit, ...argumentUnits];
}

function hasMultipleWrappedArguments(unit: SourceUnit): boolean {
  const heading = /^(?:(?:PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s+CONCEPTO(?:S)?\s+DE\s+VIOLACI[ÓO]N|AGRAVIO(?:S)?)\b/i;
  return unit.text.split(/\n+/).filter((line) => heading.test(line.trim())).length > 1;
}

function candidateFor(
  unit: SourceUnit,
  rawText: string,
  index: number,
  section?: string,
): ExtractionCandidate {
  const candidateId = `${unit.unitId}:candidate:${index}`;
  return {
    candidateId,
    kind: 'ASSERTION',
    rawText: rawText.trim(),
    provenance: [{ ...provenanceForSection(unit.provenance, section), candidateId }],
    decision: 'REQUIRES_REVIEW',
    decisionReason: 'Candidate awaits deterministic classification and layered extraction.',
  };
}

function candidatesFromUnit(unit: SourceUnit, section: string | undefined): {
  candidates: ExtractionCandidate[];
  nextSection?: string;
  wasSplit: boolean;
} {
  const headingInfo = headingWithTail(unit.text);
  const inferredFactSection = /^\s*HECHO\s+(?:\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\b/i.test(unit.text)
    ? 'HECHOS'
    : undefined;
  const effectiveSection = (headingInfo.heading && !headingInfo.tail && unit.kind !== 'HEADING')
    ? unit.section ?? section ?? inferredFactSection
    : headingInfo.heading ?? unit.section ?? section ?? inferredFactSection;

  if (headingInfo.heading && !headingInfo.tail && unit.kind === 'HEADING') {
    return { candidates: [], nextSection: headingInfo.heading, wasSplit: false };
  }

  const rows = unit.tableRows?.map((row) => row.map((cell) => cell.trim()).filter(Boolean).join(' | '));
  const listBodies = rows && rows.length > 0 ? rows : undefined;
  const body = headingInfo.tail ?? unit.text;
  const numberedOrBulleted = listBodies ?? [listItemBody(body) ?? body.trim()];
  const inlineBodies = listBodies ? [] : inlineListBodies(body, effectiveSection);
  const segments = inlineBodies.length > 0 ? inlineBodies : numberedOrBulleted;
  const filtered = segments.filter((segment) => segment.trim().length > 0);

  if (headingInfo.heading && !headingInfo.tail && !listBodies && unit.kind === 'HEADING') {
    return { candidates: [], nextSection: headingInfo.heading, wasSplit: false };
  }

  return {
    candidates: filtered.map((text, index) => candidateFor(unit, text, index, effectiveSection)),
    nextSection: effectiveSection,
    wasSplit: filtered.length > 1 || Boolean(listBodies && listBodies.length > 1) || inlineBodies.length > 1,
  };
}

export function segmentCandidates(units: SourceUnit[]): SegmentationResult {
  const candidates: ExtractionCandidate[] = [];
  const stats: SegmentationStats = {
    candidatesDetected: 0,
    splitCandidates: 0,
    reviewCandidates: 0,
    bySection: {},
  };
  let section: string | undefined;
  let previousSourceId: string | undefined;

  for (const unit of units) {
    if (previousSourceId !== undefined && unit.sourceId !== previousSourceId) section = undefined;
    previousSourceId = unit.sourceId;
    // DocumentIndex intentionally keeps long mixed paragraphs intact.  Split
    // only explicit line boundaries here so numbered/heading items can be
    // classified without splitting ordinary sentences.
    const argumentUnits = unit.kind === 'TABLE' || (unit.kind === 'PARAGRAPH' && hasMultipleWrappedArguments(unit))
      ? wrappedArgumentBlocks(unit)
      : [unit];
    const sourceUnits = argumentUnits;
    for (const argumentUnit of sourceUnits) {
      const preservesWrappedLegalArgument = (argumentUnit.kind === 'PARAGRAPH' || argumentUnit.kind === 'TABLE')
      && /(?:CONCEPTO\s+DE\s+VIOLACI[ÓO]N|AGRAVIO)/i.test(unit.text)
      && argumentUnit.text.split(/\n+/).length > 1;
      const lineUnits = argumentUnit.text.includes('\n') && !preservesWrappedLegalArgument
        ? argumentUnit.text.split(/\n+/).map((text, index) => ({ ...argumentUnit, unitId: `${argumentUnit.unitId}:line:${index}`, text: text.trim() })).filter((item) => item.text)
        : [argumentUnit];
      for (const lineUnit of lineUnits) {
        const result = candidatesFromUnit(lineUnit, section);
      section = result.nextSection ?? section;
      if (result.wasSplit) stats.splitCandidates += result.candidates.length;

      for (const candidate of result.candidates) {
        candidates.push(candidate);
        stats.candidatesDetected += 1;
        stats.reviewCandidates += 1;
        const candidateSection = candidate.provenance[0]?.section || 'UNSECTIONED';
        stats.bySection[candidateSection] = (stats.bySection[candidateSection] || 0) + 1;
      }
      }
    }
  }

  return { candidates, stats };
}
