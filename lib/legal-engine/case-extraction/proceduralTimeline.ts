import { createSourceProvenance } from './provenance';
import type { SourceUnit } from './sourceUnits';
import type { ProceduralEventType, RichProceduralTimelineEvent, SourceProvenance } from './types';

const DATE_RE = /(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/i;
const PROCEDURAL_ACTION_RE = /\b(?:present[oó]|promovi[oó]|interpuso|dict[oó]|emit[ií]|resolv[ií]|resuelt[oa]|notific[oó]|emplaz[oó]|celebr[oó]|acord[oó]|inici[oó]|concluy[oó])(?=\s|[.,;:!?)]|$)/i;
const PROCEDURAL_NOUN_RE = /\b(?:demanda|sentencia|resoluci[oó]n|notificaci[oó]n|emplazamiento|auto|acuerdo|recurso|apelaci[oó]n|audiencia)\b/i;
const EXCLUDED_SECTION_RE = /(?:AGRAVIO|ARGUMENTO|DERECHO|FUNDAMENTO|CONCEPTO\s+DE\s+VIOLACI[ÓO]N)/i;
const ARGUMENT_MARKER_RE = /\b(?:sostiene|argumenta|alega|afirma|considera|indebidamente|ilegal|inconstitucional|porque|por\s+tanto)\b/i;

interface TimelineLine {
  text: string;
  unit: SourceUnit;
  lineIndex: number;
}

function eventTypeFor(text: string): ProceduralEventType {
  if (/\b(?:notific[oó]|notificaci[oó]n)/i.test(text)) return 'NOTIFICATION';
  if (/\b(?:emplaz[oó]|emplazamiento)/i.test(text)) return 'SERVICE';
  if (/\b(?:present[oó]|promovi[oó])|\bdemanda\b/i.test(text)) return 'FILING';
  if (/\b(?:sentencia|resoluci[oó]n|dict[oó]|emit[ií]|resolv[ií]|resuelt[oa])/i.test(text)) return 'RESOLUTION';
  if (/\b(?:auto|acuerdo|acord[oó])/i.test(text)) return 'ORDER';
  if (/\b(?:recurso|apelaci[oó])/i.test(text)) return 'APPEAL';
  if (/\baudiencia\b/i.test(text)) return 'HEARING';
  return 'OTHER';
}

function isProceduralEventText(text: string): boolean {
  if (!PROCEDURAL_NOUN_RE.test(text) && !PROCEDURAL_ACTION_RE.test(text)) return false;
  if (PROCEDURAL_ACTION_RE.test(text)) return true;
  return /\b(?:se\s+)?(?:present[oó]|dict[oó]|notific[oó]|emit[ií]|resolv[ií])\b/i.test(text);
}

function isArgumentSection(line: TimelineLine): boolean {
  return Boolean(line.unit.section && EXCLUDED_SECTION_RE.test(line.unit.section))
    || (ARGUMENT_MARKER_RE.test(line.text) && /\b(?:parte\s+actora|parte\s+demandada|promovente|quejoso)\b/i.test(line.text));
}

function provenanceFor(unit: SourceUnit, excerpt: string): SourceProvenance {
  return createSourceProvenance({
    sourceId: unit.sourceId,
    sourceType: unit.sourceType,
    sourceName: unit.sourceName,
    page: unit.page,
    section: unit.section,
    paragraphIndex: unit.paragraphIndex,
    elementIndex: unit.elementIndex,
    excerpt,
    // The date is found by a lexical pattern, but its evidence still comes
    // from the source unit. Keep OCR/native provenance instead of replacing
    // it with PATTERN, otherwise VERIFY reports a source-backed OCR date as
    // untraceable derived data.
    extractionMethod: unit.provenance.extractionMethod,
    confidence: unit.provenance.confidence,
    inferenceLevel: 'LITERAL',
  });
}

function linesFromUnits(units: SourceUnit[]): TimelineLine[] {
  return units.flatMap((unit) => unit.text
    .split(/\r?\n/)
    .map((text, lineIndex) => ({ text: text.trim(), unit, lineIndex }))
    .filter((line) => line.text.length > 0));
}

function isDateOnlyAnchor(text: string): boolean {
  const remainder = text
    .replace(DATE_RE, '')
    .replace(/[\s,.;:()[\]-]/g, '')
    .trim();
  return remainder.length <= 20;
}

/**
 * Extracts only explicitly dated procedural acts from source text.  The
 * extractor is deliberately lexical: it does not infer actors, legal effect,
 * chronology beyond source order, or a position for any party.
 */
export function extractProceduralTimeline(units: SourceUnit[]): RichProceduralTimelineEvent[] {
  const lines = linesFromUnits(units);
  const events: RichProceduralTimelineEvent[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const anchor = lines[index];
    const date = anchor.text.match(DATE_RE)?.[1];
    if (!date || isArgumentSection(anchor)) continue;

    const candidates = [anchor.text];
    // Join an adjacent line only when the anchor is effectively a date label.
    // This prevents a date that merely starts an employment/amount period from
    // inheriting a procedural verb found in the following paragraph.
    if (isDateOnlyAnchor(anchor.text)) {
      candidates.push(`${anchor.text} ${lines[index + 1]?.text || ''}`.trim());
      candidates.push(`${lines[index - 1]?.text || ''} ${anchor.text}`.trim());
    }
    const eventText = candidates.find((candidate) => candidate.length > 20 && isProceduralEventText(candidate));
    if (!eventText) continue;

    const provenance = provenanceFor(anchor.unit, eventText);
    const key = `${anchor.unit.sourceId}|${anchor.unit.page ?? ''}|${date.toLocaleLowerCase()}|${eventText.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      id: `procedural-event-${anchor.unit.sourceId}-${anchor.unit.page ?? 0}-${anchor.unit.order}-${anchor.lineIndex}`
        .replace(/[^a-zA-Z0-9_-]+/g, '-'),
      date,
      event: eventText.slice(0, 180),
      eventType: eventTypeFor(eventText),
      provenance: [provenance],
      certainty: Math.round(Math.max(0, Math.min(1, provenance.confidence)) * 100),
    });
  }

  return events;
}
