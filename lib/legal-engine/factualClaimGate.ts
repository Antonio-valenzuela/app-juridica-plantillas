import type { SourceGrounding } from './sourceGrounding';
import type { UniversalLegalDocument } from './types';

export type FactualClaimStatus =
  | 'SOURCE_SUPPORTED'
  | 'OPPOSING_PARTY_ALLEGATION'
  | 'DERIVED_FROM_SUPPORTED_FACTS'
  | 'LEGAL_ARGUMENT'
  | 'UNSUPPORTED_FACTUAL_ASSERTION'
  | 'UNVERIFIED'
  | 'CONTRADICTORY';

export type FactualClaimClassification =
  | 'SOURCE_FACT'
  | 'OPPOSING_ALLEGATION'
  | 'CLIENT_POSTURE'
  | 'LEGAL_ARGUMENT'
  | 'PROCEDURAL'
  | 'SOURCE_CONFLICT'
  | 'UNCLASSIFIED';

export interface FactualClaimSourceSpan {
  sourceId: string;
  startOffset: number;
  endOffset: number;
  text: string;
}

export interface FactualClaimRecord {
  blockId: string;
  claim: string;
  status: FactualClaimStatus;
  classification?: FactualClaimClassification;
  sourceSpans: FactualClaimSourceSpan[];
  /** Derived propositions require a separate attorney review; a model label is not proof. */
  reviewedBy?: 'ATTORNEY';
}

export interface FactualClaimGateResult {
  status: 'PASS' | 'BLOCKED';
  unsupportedClaims: number;
  unverifiedClaims: number;
  contradictoryClaims: number;
  checkedClaims: number;
  issues: string[];
  claims: Array<FactualClaimRecord & { supportVerified: boolean; issues: string[] }>;
}

export interface FactualClaimGateInput {
  blocks: Array<{ id: string; text: string }>;
  sourceGrounding: SourceGrounding[];
  claims: FactualClaimRecord[];
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function splitClaims(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\r?\n+/).map((part) => part.trim()).filter(Boolean);
}

function generatedSentences(text: string): string[] {
  return splitClaims(text).filter((sentence) => sentence.length > 0);
}

function sourceCaseRanges(source: SourceGrounding): Array<{ start: number; end: number }> {
  if (source.segments?.length) {
    return source.segments
      .filter((segment) => segment.role === 'CASE_DOCUMENT')
      .map((segment) => ({ start: segment.startOffset, end: segment.endOffset }));
  }
  return [{ start: 0, end: source.sourceText.length }];
}

function sourceSentences(source: SourceGrounding): FactualClaimSourceSpan[] {
  const result: FactualClaimSourceSpan[] = [];
  for (const range of sourceCaseRanges(source)) {
    const region = source.sourceText.slice(range.start, range.end);
    const pattern = /[^.!?;\r\n]+[.!?;]?/gu;
    for (const match of region.matchAll(pattern)) {
      const raw = match[0];
      const leading = raw.length - raw.trimStart().length;
      const value = raw.trim();
      if (!value) continue;
      const startOffset = range.start + (match.index || 0) + leading;
      result.push({
        sourceId: source.sourceId,
        startOffset,
        endOffset: startOffset + value.length,
        text: value,
      });
    }
  }
  return result;
}

function classifyClaim(sentence: string): FactualClaimClassification {
  if (/(?:la actora|el actor|parte actora|demandante).{0,100}(?:alega|afirma|sostiene|manifiesta|refiere)|seg[uú]n\s+(?:la\s+)?demanda/i.test(sentence)) return 'OPPOSING_ALLEGATION';
  if (/(?:se admite|se niega|se reconoce|reconoci[oó]|reconoce|es cierto|no es cierto|negamos|admitimos|postura del demandado)/i.test(sentence)) return 'CLIENT_POSTURE';
  if (/\b(?:art[ií]culo|jurisprudencia|tesis|precedente|criterio jur[ií]dico|constituci[oó]n|ley federal|c[oó]digo)\b/i.test(sentence)) return 'LEGAL_ARGUMENT';
  if (/\b(?:solicito|solicitamos|pido|se sirva|por lo expuesto|empl[aá]cese|adm[ií]tase|protesto|petitorio|se absuelva|se condene)\b/i.test(sentence)) return 'PROCEDURAL';
  return 'SOURCE_FACT';
}

function numericTokens(value: string): string[] {
  return value.match(/\b\d+(?:(?:[.,:/-])\d+)*\b/gu) || [];
}

function numericSkeleton(value: string): string {
  return normalize(value.replace(/\b\d+(?:(?:[.,:/-])\d+)*\b/gu, ' valor '));
}

function hasFactualScalarContext(value: string): boolean {
  return /\b(?:hora|horas|fecha|d[ií]a|mes|a[nñ]o|a[nñ]os|semana|semanas|quincena|salario|sueldo|pesos|cantidad|duraci[oó]n|antig[uü]edad|kil[oó]metros|metros|por ciento)\b|[$%]|\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(value);
}

function exactSourceSpan(sentence: string, sources: SourceGrounding[]): FactualClaimSourceSpan | undefined {
  for (const source of sources) {
    for (const range of sourceCaseRanges(source)) {
      const startOffset = source.sourceText.indexOf(sentence, range.start);
      if (startOffset >= range.start && startOffset + sentence.length <= range.end) {
        return { sourceId: source.sourceId, startOffset, endOffset: startOffset + sentence.length, text: sentence };
      }
    }
  }
  return undefined;
}

function contradictorySourceSpan(sentence: string, sources: SourceGrounding[]): FactualClaimSourceSpan | undefined {
  const claimNumbers = numericTokens(sentence);
  if (claimNumbers.length === 0 || !hasFactualScalarContext(sentence)) return undefined;
  for (const source of sources) {
    for (const candidate of sourceSentences(source)) {
      const sourceNumbers = numericTokens(candidate.text);
      if (sourceNumbers.length === 0 || sourceNumbers.join('|') === claimNumbers.join('|')) continue;
      if (numericSkeleton(candidate.text) === numericSkeleton(sentence)
        && hasFactualScalarContext(candidate.text)) return candidate;
    }
  }
  return undefined;
}

/** Creates one conservative, deterministic record for every generated sentence. */
export function buildDeterministicFactualClaimAudit(
  blocks: Array<{ id: string; text: string }>,
  sourceGrounding: SourceGrounding[],
  existingRecords: FactualClaimRecord[] = [],
): FactualClaimRecord[] {
  const records: FactualClaimRecord[] = [];
  for (const block of blocks) {
    for (const sentence of generatedSentences(block.text)) {
      const attorneyReviewed = existingRecords.find((record) => record.blockId === block.id
        && record.reviewedBy === 'ATTORNEY'
        && normalize(record.claim) === normalize(sentence));
      if (attorneyReviewed) {
        records.push(attorneyReviewed);
        continue;
      }
      const conflictSpan = contradictorySourceSpan(sentence, sourceGrounding);
      if (conflictSpan) {
        records.push({
          blockId: block.id,
          claim: sentence,
          status: 'CONTRADICTORY',
          classification: 'SOURCE_CONFLICT',
          sourceSpans: [conflictSpan],
        });
        continue;
      }

      const span = exactSourceSpan(sentence, sourceGrounding);
      const source = span ? sourceGrounding.find((candidate) => candidate.sourceId === span.sourceId) : undefined;
      const classification = source?.container.documentFamily === 'DEMANDA'
        ? 'OPPOSING_ALLEGATION'
        : classifyClaim(sentence);
      let status: FactualClaimStatus = 'UNVERIFIED';
      if (span && source?.container.documentFamily === 'DEMANDA'
        && classification === 'OPPOSING_ALLEGATION'
        && /\b(?:alega|afirma|sostiene|manifiesta|refiere|seg[uú]n)\b/i.test(sentence)) {
        status = 'OPPOSING_PARTY_ALLEGATION';
      } else if (span && source?.container.documentFamily
        && source.container.documentFamily !== 'UNKNOWN'
        && source.container.documentFamily !== 'DEMANDA'
        && classification === 'SOURCE_FACT') {
        status = 'SOURCE_SUPPORTED';
      }

      records.push({
        blockId: block.id,
        claim: sentence,
        status,
        classification,
        sourceSpans: span ? [span] : [],
      });
    }
  }
  return records;
}

/** Rebuilds per-sentence audit records immediately before the quality gate. */
export function populateDeterministicFactualClaimAudit(document: Pick<UniversalLegalDocument, 'sections' | 'generationMetadata'>): FactualClaimRecord[] {
  const generatedBlocks = document.sections.flatMap((section) => section.content
    .filter((block) => block.generatedBy === 'AI' && block.text.trim())
    .map((block) => ({ id: block.id, text: block.text })));
  const records = buildDeterministicFactualClaimAudit(
    generatedBlocks,
    document.generationMetadata.sourceGrounding || [],
    document.generationMetadata.factualClaims || [],
  );
  document.generationMetadata.factualClaims = records;
  return records;
}

function validSpan(span: FactualClaimSourceSpan, groundings: SourceGrounding[]): SourceGrounding | null {
  const grounding = groundings.find((source) => source.sourceId === span.sourceId);
  if (!grounding || !Number.isInteger(span.startOffset) || !Number.isInteger(span.endOffset)
    || span.startOffset < 0 || span.endOffset <= span.startOffset || span.endOffset > grounding.sourceText.length
    || grounding.sourceText.slice(span.startOffset, span.endOffset) !== span.text) return null;
  // A legal citation or precedent embedded in an uploaded source cannot become a case fact.
  const authorityOnly = grounding.segments?.some((segment) => segment.role !== 'CASE_DOCUMENT'
    && span.startOffset >= segment.startOffset && span.endOffset <= segment.endOffset);
  return authorityOnly ? null : grounding;
}

/** Fail closed: model-provided labels alone never establish factual support. */
export function evaluateFactualClaimGate(input: FactualClaimGateInput): FactualClaimGateResult {
  const issues: string[] = [];
  const records: FactualClaimGateResult['claims'] = [];
  const unconsumed = [...input.claims];
  let unsupportedClaims = 0;
  let unverifiedClaims = 0;
  let contradictoryClaims = 0;
  let checkedClaims = 0;

  for (const block of input.blocks) {
    for (const sentence of splitClaims(block.text)) {
      checkedClaims += 1;
      const index = unconsumed.findIndex((record) => record.blockId === block.id && normalize(record.claim) === normalize(sentence));
      if (index < 0) {
        unverifiedClaims += 1;
        issues.push(`CLAIM_AUDIT_MISSING:${block.id}`);
        continue;
      }
      const record = unconsumed.splice(index, 1)[0]!;
      const claimIssues: string[] = [];
      if (record.status === 'UNSUPPORTED_FACTUAL_ASSERTION') {
        unsupportedClaims += 1;
        claimIssues.push(`UNSUPPORTED_FACTUAL_ASSERTION:${block.id}`);
      } else if (record.status === 'CONTRADICTORY') {
        contradictoryClaims += 1;
        claimIssues.push(`SOURCE_CONTRADICTION:${block.id}`);
      } else if (record.status === 'UNVERIFIED') {
        unverifiedClaims += 1;
        claimIssues.push(`CLAIM_UNVERIFIED:${block.id}`);
      } else if (record.status === 'LEGAL_ARGUMENT') {
        // The drafting model cannot self-certify that a sentence contains no factual assertion.
        if (record.reviewedBy !== 'ATTORNEY') {
          unverifiedClaims += 1;
          claimIssues.push(`LEGAL_ARGUMENT_REVIEW_REQUIRED:${block.id}`);
        }
      } else {
        const sources = record.sourceSpans.map((span) => validSpan(span, input.sourceGrounding));
        if (record.sourceSpans.length === 0 || sources.some((source) => source === null)) {
          unverifiedClaims += 1;
          claimIssues.push(`SOURCE_SPAN_INVALID:${block.id}`);
        } else if (record.status === 'SOURCE_SUPPORTED') {
          if (sources.some((source) => source?.container.documentFamily === 'DEMANDA')) {
            unsupportedClaims += 1;
            claimIssues.push(`OPPOSING_ALLEGATION_AS_FACT:${block.id}`);
          } else if (record.sourceSpans.length !== 1 || normalize(record.claim) !== normalize(record.sourceSpans[0]!.text)) {
            unverifiedClaims += 1;
            claimIssues.push(`SOURCE_ENTAILMENT_UNVERIFIED:${block.id}`);
          }
        } else if (record.status === 'OPPOSING_PARTY_ALLEGATION') {
          if (!/\b(?:alega|afirma|sostiene|seg[uú]n|manifiesta)\b/i.test(record.claim)
            || record.sourceSpans.length !== 1 || normalize(record.claim) !== normalize(record.sourceSpans[0]!.text)) {
            unverifiedClaims += 1;
            claimIssues.push(`OPPOSING_ALLEGATION_UNVERIFIED:${block.id}`);
          }
        } else if (record.reviewedBy !== 'ATTORNEY') {
          unverifiedClaims += 1;
          claimIssues.push(`DERIVATION_REVIEW_REQUIRED:${block.id}`);
        }
      }
      records.push({ ...record, supportVerified: claimIssues.length === 0, issues: claimIssues });
      issues.push(...claimIssues);
    }
  }

  if (unconsumed.length > 0) issues.push('ORPHAN_CLAIM_AUDIT_RECORD');
  return {
    status: issues.length === 0 ? 'PASS' : 'BLOCKED',
    unsupportedClaims,
    unverifiedClaims,
    contradictoryClaims,
    checkedClaims,
    issues: [...new Set(issues)],
    claims: records,
  };
}
