import type { DocumentCoverageItem } from './coverageMatrix';
import type { EvidenceMention, RichCaseAnalysis, SourceProvenance } from './case-extraction/types';

export interface EvidenceGroup {
  /** Canonical identity is an existing EvidenceMention id; no text-derived key is used. */
  id: string;
  evidenceMentionIds: string[];
  evidenceOfferIds: string[];
  coverageItemIds: string[];
  factIds: string[];
  documentItemIds: string[];
  provenance: SourceProvenance[];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function provenanceKey(entry: SourceProvenance): string {
  return JSON.stringify([
    entry.sourceId,
    entry.page,
    entry.section,
    entry.paragraphIndex,
    entry.elementIndex,
    entry.candidateId,
    entry.excerptHash,
  ]);
}

function mergeProvenance(entries: SourceProvenance[]): SourceProvenance[] {
  const byKey = new Map<string, SourceProvenance>();
  entries.forEach((entry) => byKey.set(provenanceKey(entry), { ...entry }));
  return [...byKey.values()];
}

function emptyGroup(id: string): EvidenceGroup {
  return {
    id,
    evidenceMentionIds: [],
    evidenceOfferIds: [],
    coverageItemIds: [],
    factIds: [],
    documentItemIds: [],
    provenance: [],
  };
}

function addCoverage(group: EvidenceGroup, item: DocumentCoverageItem, mentions: Map<string, EvidenceMention>): void {
  group.coverageItemIds = unique([...group.coverageItemIds, item.id]);
  group.evidenceMentionIds = unique([...group.evidenceMentionIds, ...(item.evidenceMentionIds || [])]);
  group.evidenceOfferIds = unique([...group.evidenceOfferIds, ...(item.evidenceOfferIds || [])]);
  group.factIds = unique([...group.factIds, ...(item.factIds || [])]);
  const documentItemIds = group.evidenceMentionIds
    .map((id) => mentions.get(id)?.documentItemId)
    .filter((id): id is string => Boolean(id));
  group.documentItemIds = unique([...group.documentItemIds, ...documentItemIds]);
  group.provenance = mergeProvenance([...group.provenance, ...(item.provenance || [])]);
}

/**
 * Builds conservative evidence groups from explicit structural identity only.
 *
 * A treatment coverage item establishes the mention-root. An offer can join
 * that root only when its single offer entity points to the same mention via
 * EvidenceOffer.evidenceMentionId and the coverage item repeats that identity.
 * Distinct mention ids never merge, even when their text/type looks similar.
 */
export function buildEvidenceGroups(
  rich: RichCaseAnalysis,
  evidenceCoverageItems: DocumentCoverageItem[],
): EvidenceGroup[] {
  const mentions = new Map(rich.evidenceMentions.map((mention) => [mention.id, mention]));
  const offers = new Map(rich.evidenceOffers.map((offer) => [offer.id, offer]));
  const groups = new Map<string, EvidenceGroup>();
  const treatmentItems = evidenceCoverageItems.filter((item) => item.category === 'EVIDENCE_TREATMENT');

  treatmentItems.forEach((item) => {
    const mentionIds = unique(item.evidenceMentionIds || []);
    const mentionId = mentionIds.length === 1 && mentions.has(mentionIds[0]) ? mentionIds[0] : undefined;
    const groupId = mentionId ? `evidence-group-${mentionId}` : `evidence-coverage-${item.id}`;
    const group = groups.get(groupId) || emptyGroup(groupId);
    addCoverage(group, item, mentions);
    groups.set(groupId, group);
  });

  evidenceCoverageItems
    .filter((item) => item.category === 'EVIDENCE_OFFER')
    .forEach((item) => {
      const offerIds = unique(item.evidenceOfferIds || []);
      const mentionIds = unique(item.evidenceMentionIds || []);
      const offer = offerIds.length === 1 ? offers.get(offerIds[0]) : undefined;
      const linkedMentionId = offer?.evidenceMentionId;
      const canAttach = Boolean(
        offer
        && linkedMentionId
        && mentionIds.length === 1
        && mentionIds[0] === linkedMentionId
        && mentions.has(linkedMentionId)
        && groups.has(`evidence-group-${linkedMentionId}`),
      );
      const groupId = canAttach ? `evidence-group-${linkedMentionId}` : `evidence-coverage-${item.id}`;
      const group = groups.get(groupId) || emptyGroup(groupId);
      addCoverage(group, item, mentions);
      groups.set(groupId, group);
    });

  return [...groups.values()];
}
