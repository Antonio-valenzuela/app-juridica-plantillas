import type { SourceGrounding } from './sourceGrounding';

export type FactualClaimStatus =
  | 'SOURCE_SUPPORTED'
  | 'OPPOSING_PARTY_ALLEGATION'
  | 'DERIVED_FROM_SUPPORTED_FACTS'
  | 'LEGAL_ARGUMENT'
  | 'UNSUPPORTED_FACTUAL_ASSERTION';

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
  sourceSpans: FactualClaimSourceSpan[];
  /** Derived propositions require a separate attorney review; a model label is not proof. */
  reviewedBy?: 'ATTORNEY';
}

export interface FactualClaimGateResult {
  status: 'PASS' | 'BLOCKED';
  unsupportedClaims: number;
  unverifiedClaims: number;
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
    checkedClaims,
    issues: [...new Set(issues)],
    claims: records,
  };
}
