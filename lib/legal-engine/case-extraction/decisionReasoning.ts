import { createSourceProvenance, hashExcerpt, sanitizeExcerpt } from './provenance';
import type {
  ArgumentItem,
  DecisionReasoningItem,
  DecisionReasoningType,
  ExtractionCandidate,
  SourceProvenance,
} from './types';

const MAX_REASONING_LENGTH = 800;

const HOLDING_ANCHOR_RE = /\b(?:se\s+impone\s+(?:negar|conceder)\s+el\s+amparo|no\s+ampara\s+ni\s+protege|r\s*e\s*s\s*u\s*e\s*l\s*v\s*e(?=\s*:))\b/giu;
const DECISION_REASONING_ANCHOR_RES = [
  /\beste\s+(?:órgano\s+colegiado|tribunal|juzgado|tribunal\s+colegiado)\s+(?:advierte|considera|estima|concluye)\b/giu,
  /\btal\s+sustento\s+es\s+(?:in)?fundado\b/giu,
  /\bresulta\s+(?:in)?fundad[ao]\b/giu,
  /\bson\s+inoperantes\b/giu,
  /\bde\s+los\s+antecedentes\s+expuestos\s+se\s+obtiene\b/giu,
  /\bde\s+lo\s+antes\s+citado\s+se\s+concluye\b/giu,
  /\bluego,?\s+de\s+las\s+actuaciones\b/giu,
  /\btales\s+probanzas\b/giu,
  /\bfinalmente,?\s+resulta\s+innecesario\b/giu,
];

interface ReasoningSpan {
  type: DecisionReasoningType;
  start: number;
  end: number;
  proposition: string;
  referenceNumber?: string;
}

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isInsideQuotedText(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const curlyOpen = before.lastIndexOf('“');
  const curlyClose = before.lastIndexOf('”');
  if (curlyOpen > curlyClose) return true;
  const guillemetOpen = before.lastIndexOf('«');
  const guillemetClose = before.lastIndexOf('»');
  if (guillemetOpen > guillemetClose) return true;
  return (before.match(/"/g) || []).length % 2 === 1;
}

function referenceNumberFor(text: string, start: number): string | undefined {
  const prefix = text.slice(Math.max(0, start - 120), start);
  const match = prefix.match(/\bCONSIDERANDO\s+([IVXLCDM]+|\d+)\s*[:.\-]?\s*$/i);
  return match?.[1]?.toUpperCase();
}

function sentenceEnd(text: string, start: number): number {
  const limit = Math.min(text.length, start + MAX_REASONING_LENGTH);
  const punctuation = text.slice(start, limit).search(/[.!?](?=\s|$)/);
  return punctuation >= 0 ? start + punctuation + 1 : limit;
}

function boundedSpan(text: string, start: number, type: DecisionReasoningType): ReasoningSpan {
  const end = sentenceEnd(text, start);
  const proposition = normalizedText(text.slice(start, end));
  return {
    type,
    start,
    end,
    proposition,
    referenceNumber: referenceNumberFor(text, start),
  };
}

function hasSubstantiveHolding(span: ReasoningSpan): boolean {
  return span.type !== 'HOLDING' || !/^r\s*e\s*s\s*u\s*e\s*l\s*v\s*e\s*:\s*$/i.test(span.proposition);
}

function reasoningSpans(candidate: ExtractionCandidate): ReasoningSpan[] {
  if (candidate.decision === 'REJECTED' || !candidate.rawText.trim()) return [];
  const text = candidate.rawText;
  const spans: ReasoningSpan[] = [];

  for (const match of text.matchAll(HOLDING_ANCHOR_RE)) {
    const start = match.index ?? -1;
    if (start < 0 || isInsideQuotedText(text, start)) continue;
    const span = boundedSpan(text, start, 'HOLDING');
    if (hasSubstantiveHolding(span)) spans.push(span);
  }
  for (const pattern of DECISION_REASONING_ANCHOR_RES) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? -1;
      if (start < 0 || isInsideQuotedText(text, start)) continue;
      spans.push(boundedSpan(text, start, 'DECISION_REASONING'));
    }
  }

  return spans
    .filter((span) => span.proposition.length > 0)
    .sort((left, right) => left.start - right.start || left.type.localeCompare(right.type))
    .filter((span, index, all) => all.findIndex((item) => item.start === span.start && item.type === span.type) === index);
}

function spanProvenance(candidate: ExtractionCandidate, span: ReasoningSpan): SourceProvenance[] {
  return candidate.provenance.map((entry) => ({
    ...createSourceProvenance({
      sourceId: entry.sourceId,
      sourceType: entry.sourceType,
      sourceName: entry.sourceName,
      page: entry.page,
      section: entry.section,
      paragraphIndex: entry.paragraphIndex,
      elementIndex: entry.elementIndex,
      excerpt: sanitizeExcerpt(span.proposition),
      speakerRole: 'RESOLUTOR',
      extractionMethod: 'PATTERN',
      confidence: entry.confidence,
      inferenceLevel: 'LITERAL',
    }),
    candidateId: entry.candidateId || candidate.candidateId,
  }));
}

function reasoningId(candidate: ExtractionCandidate, span: ReasoningSpan): string {
  const sourceId = candidate.provenance[0]?.sourceId || 'unknown-source';
  const candidateId = candidate.provenance[0]?.candidateId || candidate.candidateId;
  const identity = [sourceId, candidateId, span.type, span.referenceNumber || '', span.proposition].join('|');
  return `decision-reasoning-${hashExcerpt(identity).slice(0, 24)}`;
}

export function extractDecisionReasonings(candidates: ExtractionCandidate[]): DecisionReasoningItem[] {
  const byId = new Map<string, DecisionReasoningItem>();
  for (const candidate of candidates) {
    for (const span of reasoningSpans(candidate)) {
      const id = reasoningId(candidate, span);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        proposition: span.proposition,
        reasoningType: span.type,
        courtAttribution: 'RESOLUTOR',
        ...(span.referenceNumber ? { referenceNumber: span.referenceNumber } : {}),
        provenance: spanProvenance(candidate, span),
        challengedByArgumentIds: [],
      });
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function sourceIds(item: { provenance: SourceProvenance[] }): Set<string> {
  return new Set(item.provenance.map((entry) => entry.sourceId));
}

function explicitChallenge(
  argument: ArgumentItem,
  reasoning: DecisionReasoningItem,
  referenceOwners: Map<string, Set<string>>,
): boolean {
  if (!reasoning.referenceNumber) return false;
  if (!/\b(?:impugn\w*|combat\w*|controvert\w*|atac\w*|cuestion\w*|agravio)\b/i.test(argument.proposition)) return false;
  const reference = reasoning.referenceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`\\bconsideraci[oó]n\\s+${reference}\\b`, 'i').test(argument.proposition)) return false;
  const argumentSources = sourceIds(argument);
  return reasoning.provenance.some((entry) => argumentSources.has(entry.sourceId)
    && referenceOwners.get(`${entry.sourceId}|${reasoning.referenceNumber}`)?.size === 1);
}

export function linkArgumentsToDecisionReasonings(
  argumentsFound: ArgumentItem[],
  reasonings: DecisionReasoningItem[],
): { arguments: ArgumentItem[]; decisionReasonings: DecisionReasoningItem[] } {
  const referenceOwners = new Map<string, Set<string>>();
  for (const reasoning of reasonings) {
    if (!reasoning.referenceNumber) continue;
    for (const entry of reasoning.provenance) {
      const key = `${entry.sourceId}|${reasoning.referenceNumber}`;
      const owners = referenceOwners.get(key) || new Set<string>();
      owners.add(reasoning.id);
      referenceOwners.set(key, owners);
    }
  }
  const linkedArguments = argumentsFound.map((argument) => {
    const challengedReasoningIds = reasonings
      .filter((reasoning) => explicitChallenge(argument, reasoning, referenceOwners))
      .map((reasoning) => reasoning.id)
      .sort();
    return { ...argument, challengedReasoningIds };
  });
  const linkedReasonings = reasonings.map((reasoning) => ({
    ...reasoning,
    challengedByArgumentIds: linkedArguments
      .filter((argument) => argument.challengedReasoningIds?.includes(reasoning.id))
      .map((argument) => argument.id)
      .sort(),
  }));
  return { arguments: linkedArguments, decisionReasonings: linkedReasonings };
}
