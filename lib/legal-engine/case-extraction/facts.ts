import { normalizeAmountCandidate, normalizeDateCandidate } from './normalization';
import { inferSpeakerRole } from './classification';
import type { ExtractionCandidate, FactItem, SourceAssertion, SpeakerRole } from './types';

const ASSERTION_VERB_RE = /\b(afirma|manifiesta|sostiene|señala|refiere|aduce|niega|alega|expone|admite|reporta)\b/i;
const ESTABLISHED_CANDIDATE_RE = /\b(?:sentencia|resoluci[oó]n|laudo|auto|ejecutoria)\b[^.!?]{0,180}\b(?:establec\w*|determin\w*|tuvo\s+por\s+acreditad\w*|resolvi\w*|acredit\w*)\b/i;
const DATE_RE = /\b(?:\d{1,2}\s+de\s+[a-záéíóúñ]+(?:\s+de\s+\d{4})?|\d{1,2}[\/-]\d{1,2}[\/-]\d{4}|[a-záéíóúñ]+\s+de\s+\d{4})\b/i;
const COURT_SUBJECT_RE = /\b(?:este|el|la)\s+(?:tribunal|sala|juzgado|\xF3rgano\s+jurisdiccional|\xF3rgano\s+resolutor)\b/i;
const COURT_FINDING_RE = /\b(?:establec\w*|determin\w*|tuvo\s+por\s+acreditad\w*|resolv\w*|concluy\w*|declar\xF3?\w*|consider\xF3?\w*)\b/i;
const JUDICIAL_DOCUMENT_RE = /\b(?:sentencia|resoluci[oó]n|laudo|auto|ejecutoria)\b[^.!?]{0,180}\b(?:establec\w*|determin\w*|tuvo\s+por\s+acreditad\w*|resolv\w*|acredit\w*)\b/i;
const PARTY_ROLE_RE = /\b(?:la\s+)?(?:parte\s+actora|parte\s+demandada|actor(?:a)?|demandad[oa]|quejos[oa]|promovente|tercero\s+interesad[oa])\b/i;
const PARTY_ATTRIBUTION_RE = /\b(?:afirm\w*|manifest\w*|sosten\w*|señal\w*|refier\w*|aduj\w*|neg\w*|aleg\w*|expon\w*|admit\w*|report\w*)\b/i;
const CITATION_RE = /\b(?:jurisprudencia|tesis|precedente|criterio\s+jurisprudencial|doctrina)\b/i;
const QUOTE_RE = /["“”«»]/;

type FactAttribution = 'COURT' | 'PARTY' | 'QUOTED_AUTHORITY' | 'DOCUMENT' | 'UNKNOWN';

function partySpeaker(candidate: ExtractionCandidate): boolean {
  const roles = [candidate.speakerRole, ...candidate.provenance.map((item) => item.speakerRole)];
  return roles.some((role) => role === 'PARTE_ACTORA' || role === 'PARTE_DEMANDADA' || role === 'PROMOVENTE' || role === 'TERCERO');
}

function attributionFor(candidate: ExtractionCandidate, text: string): FactAttribution {
  if (CITATION_RE.test(text) || candidate.kind === 'AUTHORITY' || candidate.classification?.label === 'AUTHORITY') {
    return 'QUOTED_AUTHORITY';
  }
  // Prefer local sentence attribution over candidate-level metadata.  A
  // wrapped paragraph may contain both a court finding and a later party
  // allegation; the latter must not contaminate the former's status.
  if (PARTY_ROLE_RE.test(text) && PARTY_ATTRIBUTION_RE.test(text)) return 'PARTY';
  if (QUOTE_RE.test(text)) return 'UNKNOWN';
  if (candidate.speakerRole === 'RESOLUTOR' && COURT_FINDING_RE.test(text)) return 'COURT';
  if (COURT_SUBJECT_RE.test(text) && COURT_FINDING_RE.test(text)) return 'COURT';
  if (candidate.kind === 'ASSERTION' && JUDICIAL_DOCUMENT_RE.test(text)) return 'DOCUMENT';
  if (partySpeaker(candidate)) return 'PARTY';
  return 'UNKNOWN';
}

/**
 * Keeps judicial-finding candidates from being lost before factStatus runs.
 * A candidate must either be an explicit FACT/SOURCE_ASSERTION or contain a
 * narrow judicial-act plus finding verb pair; ordinary party assertions do
 * not enter through the judicial branch.
 */
export function isFactCandidate(candidate: ExtractionCandidate): boolean {
  return candidate.kind === 'FACT'
    || candidate.classification?.label === 'SOURCE_ASSERTION'
    || (candidate.kind === 'ASSERTION' && ESTABLISHED_CANDIDATE_RE.test(candidate.rawText));
}

function statusForVerb(verb: string): SourceAssertion['status'] {
  if (/niega/i.test(verb)) return 'DENIED';
  if (/admite/i.test(verb)) return 'ADMITTED';
  if (/reporta/i.test(verb)) return 'REPORTED';
  if (ASSERTION_VERB_RE.test(verb)) return 'ALLEGED';
  return 'UNKNOWN';
}

function propositionFromAssertion(text: string, verbMatch: RegExpMatchArray): string {
  const afterVerb = text.slice((verbMatch.index || 0) + verbMatch[0].length).trim();
  return afterVerb.replace(/^que\s+/i, '').replace(/[.?!]+$/, '').trim();
}

export function extractAssertions(candidates: ExtractionCandidate[]): SourceAssertion[] {
  return candidates.flatMap((candidate) => {
    const match = candidate.rawText.match(ASSERTION_VERB_RE);
    if (!match) return [];
    const proposition = propositionFromAssertion(candidate.rawText, match);
    if (!proposition) return [];
    const actorRole: SpeakerRole | undefined = candidate.speakerRole ?? inferSpeakerRole(candidate.rawText);
    return [{
      id: `assertion-${candidate.candidateId}`,
      actorRole,
      proposition,
      status: statusForVerb(match[1]),
      provenance: [...candidate.provenance],
    }];
  });
}

function splitDatedEvents(text: string): string[] {
  const dates = Array.from(text.matchAll(new RegExp(DATE_RE.source, 'gi')));
  if (dates.length < 2) return [text.trim()];
  const parts = text
    .split(/\s+y\s+(?=(?:el\s+)?[^.!?]{0,120}\b(?:\d{1,2}\s+de\s+[a-záéíóúñ]+|\d{1,2}[\/-]\d{1,2}))/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text.trim()];
}

function dateForFact(text: string, candidate: ExtractionCandidate) {
  const match = text.match(DATE_RE);
  return match
    ? normalizeDateCandidate({ ...candidate, rawText: match[0], kind: 'DATE' })
    : undefined;
}

function amountForFact(text: string, candidate: ExtractionCandidate) {
  const match = text.match(/(?:[$€£]\s*[\d.,]+|[\d.,]+\s*(?:MXN|USD|EUR|pesos?|d[oó]lares?))/i);
  if (!match) return undefined;
  const amount = normalizeAmountCandidate({ ...candidate, rawText: match[0], kind: 'AMOUNT' });
  return amount.normalizedValue === undefined ? undefined : amount;
}

function factStatus(candidate: ExtractionCandidate, text: string): FactItem['assertionStatus'] {
  const attribution = attributionFor(candidate, text);
  if (attribution === 'COURT' || attribution === 'DOCUMENT') return 'ESTABLISHED_FACT';
  if (attribution === 'QUOTED_AUTHORITY') return 'UNKNOWN';
  if (attribution === 'PARTY' || candidate.classification?.label === 'SOURCE_ASSERTION') return 'SOURCE_ASSERTION';
  if (candidate.speakerRole === 'PARTE_ACTORA' || candidate.speakerRole === 'PARTE_DEMANDADA' || ASSERTION_VERB_RE.test(text)) return 'SOURCE_ASSERTION';
  return 'UNKNOWN';
}

export function extractAtomicFacts(candidates: ExtractionCandidate[]): FactItem[] {
  const facts: FactItem[] = [];
  for (const candidate of candidates) {
    const sourceSegments = splitDatedEvents(candidate.rawText);
    for (const segment of sourceSegments) {
      const proposition = segment.replace(/[.?!]+$/, '').trim();
      if (!proposition) continue;
      facts.push({
        id: `fact-${facts.length + 1}`,
        proposition,
        date: dateForFact(segment, candidate),
        participants: [],
        amount: amountForFact(segment, candidate),
        sourceRole: candidate.speakerRole ?? inferSpeakerRole(segment),
        assertionStatus: factStatus(candidate, segment),
        provenance: [...candidate.provenance],
        relatedDocumentIds: Array.from(new Set(candidate.provenance.map((item) => item.sourceId))),
      });
    }
  }
  return facts;
}
