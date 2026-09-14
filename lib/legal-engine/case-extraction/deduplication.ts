import type {
  ArgumentItem,
  CaseParty,
  ClaimItem,
  DocumentItem,
  EvidenceMention,
  EvidenceOffer,
  FactItem,
  SourceAssertion,
  SourceAuthorityMention,
  SourceProvenance,
} from './types';

export type RichEntity =
  | CaseParty
  | SourceAssertion
  | ClaimItem
  | FactItem
  | DocumentItem
  | EvidenceMention
  | EvidenceOffer
  | ArgumentItem
  | SourceAuthorityMention;

export interface DeduplicationResult<T extends RichEntity = RichEntity> {
  items: T[];
  mergedCount: number;
  mergeReasons: string[];
}

function normalize(value: string | undefined): string {
  return (value || '')
    .toLocaleLowerCase('es-MX')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function provenanceKey(value: SourceProvenance): string {
  return [value.sourceId, value.page ?? '', value.elementIndex ?? '', value.excerptHash].join('|');
}

function mergeProvenance(left: SourceProvenance[], right: SourceProvenance[]): SourceProvenance[] {
  const merged = new Map<string, SourceProvenance>();
  [...left, ...right].forEach((item) => merged.set(provenanceKey(item), item));
  return Array.from(merged.values());
}

export function canonicalKeyForItem(item: RichEntity): string {
  const value = item as unknown as Record<string, unknown>;
  if ('rawValue' in value && 'normalizedValue' in value) {
    return `normalized|${normalize(String(value.rawValue))}|${String(value.normalizedValue)}|${String(value.precision || value.currency || value.unit || '')}`;
  }
  if ('role' in value && 'name' in value) return `party|${String(value.role)}|${normalize(String(value.name || ''))}`;
  if ('requestedRelief' in value) return `claim|${normalize(String(value.requestedRelief))}|${String(value.status)}`;
  if ('assertionStatus' in value) return `fact|${normalize(String(value.proposition))}|${String(value.assertionStatus)}`;
  if ('title' in value) return `document|${normalize(String(value.title))}|${normalize(String(value.documentType || ''))}|${String(value.status)}`;
  if ('description' in value) return `evidence|${normalize(String(value.description))}|${normalize(String(value.type || ''))}|${String(value.status)}`;
  if ('evidenceMentionId' in value) return `offer|${String(value.evidenceMentionId)}|${String(value.status)}`;
  if ('citationText' in value) return `authority|${normalize(String(value.citationText))}|${String(value.verificationStatus)}`;
  if ('status' in value && 'proposition' in value) return `assertion|${normalize(String(value.proposition))}|${String(value.status)}`;
  return `argument|${normalize(String(value.proposition || ''))}`;
}

function similarity(left: CaseParty, right: CaseParty): boolean {
  if (left.role !== right.role) return false;
  const leftTokens = normalize(left.name).split(/[^a-z0-9]+/).filter(Boolean);
  const rightTokens = normalize(right.name).split(/[^a-z0-9]+/).filter(Boolean);
  if (!leftTokens[0] || !rightTokens[0]) return false;
  return normalize(left.name) !== normalize(right.name) && leftTokens.some((token) => rightTokens.includes(token));
}

function unionStrings(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}

function mergeEntity(left: RichEntity, right: RichEntity): RichEntity {
  const merged: RichEntity = {
    ...left,
    provenance: mergeProvenance(left.provenance, right.provenance),
  } as RichEntity;
  const target = merged as unknown as Record<string, unknown>;
  const sourceLeft = left as unknown as Record<string, unknown>;
  const sourceRight = right as unknown as Record<string, unknown>;
  if ('aliases' in sourceLeft && 'aliases' in sourceRight) target.aliases = unionStrings(sourceLeft.aliases as string[], sourceRight.aliases as string[]);
  if ('confirmed' in sourceLeft && 'confirmed' in sourceRight) target.confirmed = Boolean(sourceLeft.confirmed) || Boolean(sourceRight.confirmed);
  if ('confidence' in sourceLeft && 'confidence' in sourceRight) target.confidence = Math.max(Number(sourceLeft.confidence), Number(sourceRight.confidence));
  if ('factualBasisIds' in sourceLeft && 'factualBasisIds' in sourceRight) target.factualBasisIds = unionStrings(sourceLeft.factualBasisIds as string[], sourceRight.factualBasisIds as string[]);
  if ('evidenceMentionIds' in sourceLeft && 'evidenceMentionIds' in sourceRight) target.evidenceMentionIds = unionStrings(sourceLeft.evidenceMentionIds as string[], sourceRight.evidenceMentionIds as string[]);
  if ('participants' in sourceLeft && 'participants' in sourceRight) target.participants = unionStrings(sourceLeft.participants as string[], sourceRight.participants as string[]);
  if ('relatedDocumentIds' in sourceLeft && 'relatedDocumentIds' in sourceRight) target.relatedDocumentIds = unionStrings(sourceLeft.relatedDocumentIds as string[], sourceRight.relatedDocumentIds as string[]);
  if ('relatedFactIds' in sourceLeft && 'relatedFactIds' in sourceRight) target.relatedFactIds = unionStrings(sourceLeft.relatedFactIds as string[], sourceRight.relatedFactIds as string[]);
  if ('relatedClaimIds' in sourceLeft && 'relatedClaimIds' in sourceRight) target.relatedClaimIds = unionStrings(sourceLeft.relatedClaimIds as string[], sourceRight.relatedClaimIds as string[]);
  if ('supportingFactIds' in sourceLeft && 'supportingFactIds' in sourceRight) target.supportingFactIds = unionStrings(sourceLeft.supportingFactIds as string[], sourceRight.supportingFactIds as string[]);
  if ('citedAuthorityIds' in sourceLeft && 'citedAuthorityIds' in sourceRight) target.citedAuthorityIds = unionStrings(sourceLeft.citedAuthorityIds as string[], sourceRight.citedAuthorityIds as string[]);
  return merged;
}

export function deduplicateRichItems<T extends RichEntity>(items: T[]): DeduplicationResult<T> {
  const output: T[] = [];
  const byKey = new Map<string, number>();
  const mergeReasons: string[] = [];
  let mergedCount = 0;

  for (const item of items) {
    if ('role' in item && 'name' in item) {
      if (output.some((existing) => 'role' in existing && 'name' in existing && similarity(existing as CaseParty, item as CaseParty))) {
        if (!mergeReasons.includes('IDENTITY_SIMILARITY_REQUIRES_REVIEW')) mergeReasons.push('IDENTITY_SIMILARITY_REQUIRES_REVIEW');
      }
    }
    const key = canonicalKeyForItem(item);
    const existingIndex = byKey.get(key);
    if (existingIndex === undefined) {
      byKey.set(key, output.length);
      output.push(item);
      continue;
    }
    output[existingIndex] = mergeEntity(output[existingIndex], item) as T;
    mergedCount += 1;
  }

  return { items: output, mergedCount, mergeReasons };
}
