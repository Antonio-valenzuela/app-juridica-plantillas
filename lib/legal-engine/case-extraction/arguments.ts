import type {
  ArgumentExtractionContext,
  ArgumentItem,
  ExtractionCandidate,
  SourceAuthorityMention,
  SourceProvenance,
} from './types';

export interface ArgumentsExtractionResult {
  arguments: ArgumentItem[];
  /** Kept explicit so callers cannot accidentally treat arguments as facts. */
  facts: [];
}

const ARGUMENT_SECTION_RE = /^(?:ARGUMENTOS?|AGRAVIOS?|DERECHO|FUNDAMENTOS?|CONCEPTOS?\s+DE\s+VIOLACI[ÓO]N)\s*:/i;
const ARGUMENT_MARKER_RE = /\b(?:improcedente|inconstitucional|ilegal|violaci[oó]n|porque|por\s+tanto|en\s+consecuencia|debe\s+considerarse|argumento)\b/i;
const AUTHORITY_LEADING_RE = /^\s*(?:art[ií]culo|tesis|jurisprudencia|precedente|ley|c[oó]digo|constituci[oó]n)\b/i;

function argumentBody(text: string): string {
  return text.replace(ARGUMENT_SECTION_RE, '').trim().replace(/[.?!]+$/, '').trim();
}

function argumentCandidate(candidate: ExtractionCandidate): boolean {
  if (candidate.decision === 'REJECTED') return false;
  if (candidate.kind === 'AUTHORITY' && AUTHORITY_LEADING_RE.test(candidate.rawText) && !ARGUMENT_SECTION_RE.test(candidate.rawText)) return false;
  const section = candidate.provenance.find((item) => item.section)?.section;
  return candidate.kind === 'ARGUMENT' || section === 'ARGUMENTOS' || ARGUMENT_SECTION_RE.test(candidate.rawText) || ARGUMENT_MARKER_RE.test(candidate.rawText);
}

function linkedFacts(text: string, context: ArgumentExtractionContext): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/\bhecho\s+(\d+)\b/gi)) {
    const id = context.factIds[Number(match[1]) - 1];
    if (id) ids.push(id);
  }
  return Array.from(new Set(ids));
}

function sameCandidate(left: SourceProvenance, right: SourceProvenance): boolean {
  return Boolean(
    left.candidateId
    && right.candidateId
    && left.sourceId === right.sourceId
    && left.candidateId === right.candidateId,
  );
}

function linkedAuthorities(candidate: ExtractionCandidate, context: ArgumentExtractionContext): string[] {
  const allowedAuthorityIds = new Set(context.authorityIds);
  return Array.from(new Set((context.authorityMentions || [])
    .filter((authority) => allowedAuthorityIds.has(authority.id))
    .filter((authority) => authority.provenance.some((authorityProvenance) =>
      candidate.provenance.some((candidateProvenance) => sameCandidate(authorityProvenance, candidateProvenance)),
    ))
    .map((authority) => authority.id)));
}

export function extractArguments(
  candidates: ExtractionCandidate[],
  context: ArgumentExtractionContext,
): ArgumentsExtractionResult {
  const argumentsFound: ArgumentItem[] = [];
  for (const candidate of candidates) {
    if (!argumentCandidate(candidate)) continue;
    const proposition = argumentBody(candidate.rawText);
    if (!proposition) continue;
    argumentsFound.push({
      id: `argument-${argumentsFound.length + 1}`,
      speakerRole: candidate.speakerRole,
      proposition,
      supportingFactIds: linkedFacts(proposition, context),
      citedAuthorityIds: linkedAuthorities(candidate, context),
      provenance: [...candidate.provenance],
    });
  }
  return { arguments: argumentsFound, facts: [] };
}

function authorityType(citationText: string): SourceAuthorityMention['authorityType'] {
  if (/\btesis\b/i.test(citationText)) return 'THESIS';
  if (/\bjurisprudencia\b/i.test(citationText)) return 'JURISPRUDENCE';
  if (/\bprecedente\b/i.test(citationText)) return 'PRECEDENT';
  if (/\bart[ií]culo\b/i.test(citationText)) return 'ARTICLE';
  if (/\bc[oó]digo\b/i.test(citationText)) return 'CODE';
  if (/\bley\b|\bconstituci[oó]n\b/i.test(citationText)) return 'LAW';
  return 'OTHER';
}

function citationsIn(text: string): string[] {
  const matches: string[] = [];
  const patterns = [
    /\bart[ií]culo\s+\d+(?:\s+(?:bis|ter))?(?:\s+[a-záéíóúñ]+){0,3}/gi,
    /\b(?:tesis|jurisprudencia|precedente)\s+[^,.;]+/gi,
    /\b(?:ley|c[oó]digo|constituci[oó]n)\s+[^,.;]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const citation = match[0].trim();
      if (citation && !matches.includes(citation)) matches.push(citation);
    }
  }
  return matches;
}

export function extractAuthorityMentions(candidates: ExtractionCandidate[]): SourceAuthorityMention[] {
  const authorities: SourceAuthorityMention[] = [];
  for (const candidate of candidates) {
    const citations = citationsIn(candidate.rawText);
    for (const citationText of citations) {
      authorities.push({
        id: `authority-${authorities.length + 1}`,
        authorityType: authorityType(citationText),
        citationText,
        verificationStatus: 'SOURCE_CITED',
        provenance: [...candidate.provenance],
      });
    }
  }
  return authorities;
}
