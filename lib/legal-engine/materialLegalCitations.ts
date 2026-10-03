export interface MaterialLegalCitation {
  text: string;
  start: number;
  end: number;
  aliases: readonly string[];
  articleText?: string;
  statuteText?: string;
}

const ARTICLE_CITATION_RE = /\b(?:art[ií]culos?|art\.)\s+\d+[a-z]?(?:\s*(?:bis|ter|qu[aá]ter))?(?:\s*,?\s*fracci[oó]n\s+[ivxlcdm\d]+)?/giu;
const STATUTE_TITLE_RE = /\b(?:constituci[oó]n(?:\s+pol[ií]tica)?(?:\s+de\s+(?:los\s+)?estados\s+unidos\s+mexicanos)?|(?:ley|c[oó]digo|reglamento|decreto|acuerdo)\s+(?:(?:federal|general|org[aá]nica|estatal|municipal|nacional)\s+)?(?:de(?:l)?\s+)?[\p{L}\d]+(?:\s+(?!(?:se|que|establece|dispone|prev[eé]|regula|aplica|aplicable|conforme|resulta|considera|ordena|garantiza|protege|permite|sustenta|se[nñ]ala|se[nñ]alan)\b)[\p{L}\d]+){0,7})/giu;
const ARTICLE_STATUTE_ABBREVIATION_RE = /\b(?:art[ií]culos?|art\.)\s+\d+[a-z]?(?:\s*(?:bis|ter|qu[aá]ter))?\s+de\s+(?:la|el)\s+([A-Z][A-Z0-9]{1,8})\b/gu;
const OTHER_MATERIAL_CITATION_RE = /\b(?:registro\s+digital\s*[:#]?\s*\d+|(?:tesis|jurisprudencia|precedente)\s+(?:[a-z0-9]+\s*){0,2}[a-z0-9]+(?:[./-][a-z0-9]+)+)\b/giu;
const UNVERIFIED_MARKER_RE = /\[NO VERIFICADO:[^\]]+\]/giu;

export function normalizeLegalCitation(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInsideUnverifiedMarker(text: string, offset: number): boolean {
  const markerStart = text.toLocaleLowerCase('es-MX').lastIndexOf('[no verificado:', offset);
  if (markerStart < 0) return false;
  const markerEnd = text.indexOf(']', markerStart);
  return markerEnd < 0 || offset < markerEnd;
}

function matches(re: RegExp, text: string): Array<{ text: string; start: number; end: number }> {
  const fresh = new RegExp(re.source, re.flags);
  return Array.from(text.matchAll(fresh), (match) => ({
    text: match[0],
    start: match.index || 0,
    end: (match.index || 0) + match[0].length,
  })).filter((match) => !isInsideUnverifiedMarker(text, match.start));
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeLegalCitation(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

/** Extracts legal references without treating bare docket numbers or dates as citations. */
export function extractMaterialLegalCitations(text: string): MaterialLegalCitation[] {
  const articles = matches(ARTICLE_CITATION_RE, text);
  const titles = matches(STATUTE_TITLE_RE, text);
  for (const match of text.matchAll(new RegExp(ARTICLE_STATUTE_ABBREVIATION_RE.source, ARTICLE_STATUTE_ABBREVIATION_RE.flags))) {
    const acronym = match[1];
    const matchStart = match.index || 0;
    const titleStart = matchStart + match[0].lastIndexOf(acronym);
    if (!isInsideUnverifiedMarker(text, titleStart)) {
      titles.push({ text: acronym, start: titleStart, end: titleStart + acronym.length });
    }
  }
  const other = matches(OTHER_MATERIAL_CITATION_RE, text);
  const usedTitles = new Set<number>();
  const citations: MaterialLegalCitation[] = [];

  for (const article of articles) {
    const relatedTitleIndex = titles.findIndex((title, index) => {
      if (usedTitles.has(index) || title.start < article.end || title.start - article.end > 32) return false;
      const connector = text.slice(article.end, title.start);
      return /^\s+de(?:l)?\s+(?:(?:la|el|los|las)\s+)?$/iu.test(connector);
    });
    const relatedTitle = relatedTitleIndex >= 0 ? titles[relatedTitleIndex] : undefined;
    if (relatedTitle && relatedTitleIndex >= 0) usedTitles.add(relatedTitleIndex);
    const end = relatedTitle?.end ?? article.end;
    const citationText = text.slice(article.start, end).trim();
    citations.push({
      text: citationText,
      start: article.start,
      end,
      articleText: article.text,
      statuteText: relatedTitle?.text,
      aliases: uniqueAliases([citationText, article.text, ...(relatedTitle ? [relatedTitle.text] : [])]),
    });
  }

  titles.forEach((title, index) => {
    if (usedTitles.has(index)) return;
    citations.push({
      ...title,
      aliases: [title.text],
    });
  });

  for (const citation of other) {
    citations.push({ ...citation, aliases: [citation.text] });
  }

  citations.sort((a, b) => a.start - b.start || b.end - a.end);
  const result: MaterialLegalCitation[] = [];
  for (const citation of citations) {
    const previous = result.at(-1);
    if (previous && citation.start < previous.end) {
      if (citation.end > previous.end) {
        result[result.length - 1] = {
          ...previous,
          text: text.slice(previous.start, citation.end).trim(),
          end: citation.end,
          aliases: uniqueAliases([...previous.aliases, ...citation.aliases]),
          articleText: previous.articleText || citation.articleText,
          statuteText: previous.statuteText || citation.statuteText,
        };
      }
      continue;
    }
    result.push(citation);
  }
  return result;
}

export function countUnverifiedCitationMarkers(text: string): number {
  return Array.from(text.matchAll(new RegExp(UNVERIFIED_MARKER_RE.source, UNVERIFIED_MARKER_RE.flags))).length;
}
