const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) current[j] = Math.min(
      current[j - 1] + 1,
      previous[j] + 1,
      previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
    );
    previous = current;
  }
  return previous[right.length];
}

type Span = { start: number; end: number };

function replaceSpans(text: string, spans: Span[], replacement: string): string {
  const ordered = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [];
  for (const span of ordered) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  return merged.reverse().reduce((result, span) => result.slice(0, span.start) + replacement + result.slice(span.end), text);
}

/** Audit-only redaction: confirmed names get one OCR substitution tolerance; legal-result clauses redact 2–4 title-cased words. */
export function redactAppealReplayText(text: string, confirmedNames: string[]): string {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map(match => ({
    value: fold(match[0]), start: match.index!, end: match.index! + match[0].length,
  }));
  const partySpans: Span[] = [];

  for (const name of confirmedNames) {
    const targetWords = fold(name).split(' ').filter(Boolean);
    if (targetWords.length < 2) continue;
    const target = targetWords.join(' ');
    for (let index = 0; index + targetWords.length <= words.length; index++) {
      const candidate = words.slice(index, index + targetWords.length);
      if (distance(target, candidate.map(word => word.value).join(' ')) <= 1) {
        partySpans.push({ start: candidate[0].start, end: candidate[candidate.length - 1].end });
      }
    }
  }

  let redacted = replaceSpans(text, partySpans, '[PARTE]');
  const identifyingClause = /((?:[Ss][Ee]\s+[Aa][Bb][Ss][Uu][Ee][Ll][Vv][Ee]\s+[Aa]|[Ss][Ee]\s+[Cc][Oo][Nn][Dd][Ee][Nn][Aa]\s+[Aa]|[Oo][Tt][Oo][Rr][Gg][Aa][Dd][Oo]?[Aa]?\s+[Pp][Oo][Rr])\s+)(\p{Lu}[\p{L}\p{M}'’-]*(?:\s+\p{Lu}[\p{L}\p{M}'’-]*){1,3})/gu;
  redacted = redacted.replace(identifyingClause, '$1[PERSONA]');
  return redacted;
}
