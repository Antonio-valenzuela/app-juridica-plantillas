/**
 * Canonical types for the layered case-analysis extraction pipeline.
 *
 * These types intentionally keep source assertions, client positions and
 * established facts separate.  Legacy CaseAnalysis is a projection target,
 * never the source of truth for this model.
 */

export type InferenceLevel = 'LITERAL' | 'NORMALIZED' | 'RELATION_INFERRED' | 'UNKNOWN';

export type ExtractionMethod =
  | 'HEADING'
  | 'NUMBERED_LIST'
  | 'BULLET_LIST'
  | 'TABLE'
  | 'PARAGRAPH'
  | 'PATTERN'
  | 'NORMALIZATION'
  | 'MANUAL_INPUT';

export type CandidateDecision = 'ACCEPTED' | 'MERGED' | 'REJECTED' | 'REQUIRES_REVIEW';

export type CandidateKind =
  | 'PARTY'
  | 'ASSERTION'
  | 'CLAIM'
  | 'FACT'
  | 'DOCUMENT'
  | 'EVIDENCE'
  | 'DATE'
  | 'AMOUNT'
  | 'ARGUMENT'
  | 'AUTHORITY'
  | 'DECISION_REASONING'
  | 'HOLDING';

export type PartyRole =
  | 'ACTOR'
  | 'DEMANDADO'
  | 'PROMOVENTE'
  | 'QUEJOSO'
  | 'TERCERO'
  | 'AUTORIDAD'
  | 'REPRESENTANTE'
  | 'AUTORIZADO'
  | 'APODERADO'
  | 'UNKNOWN';

export type SpeakerRole =
  | 'PARTE_ACTORA'
  | 'PARTE_DEMANDADA'
  | 'PROMOVENTE'
  | 'AUTORIDAD'
  | 'REPRESENTANTE'
  | 'TERCERO'
  | 'RESOLUTOR'
  | 'UNKNOWN';

export interface CandidateClassification {
  label: string;
  confidence: number;
  reason: string;
}

export interface SourceProvenance {
  sourceId: string;
  sourceType?: string;
  sourceName?: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  /** Stable identity of the segmented source candidate that produced this provenance. */
  candidateId?: string;
  excerptHash: string;
  excerpt?: string;
  speakerRole?: SpeakerRole;
  extractionMethod: ExtractionMethod;
  confidence: number;
  inferenceLevel: InferenceLevel;
}

export interface ExtractionCandidate {
  candidateId: string;
  kind: CandidateKind;
  rawText: string;
  provenance: SourceProvenance[];
  speakerRole?: SpeakerRole;
  classification?: CandidateClassification;
  normalized?: unknown;
  decision: CandidateDecision;
  decisionReason?: string;
}

export interface ExtractionStats {
  sourceUnitCount: number;
  candidatesDetected: number;
  candidatesAccepted: number;
  candidatesMerged: number;
  candidatesRejected: number;
  candidatesForReview: number;
  rejectionReasons: Record<string, number>;
  provenanceComplete: number;
  provenancePartial: number;
  provenanceMissing: number;
}

export interface SegmentationStats {
  candidatesDetected: number;
  splitCandidates: number;
  reviewCandidates: number;
  bySection: Record<string, number>;
}

export interface CaseParty {
  id: string;
  name?: string;
  role: PartyRole;
  aliases: string[];
  provenance: SourceProvenance[];
  confidence: number;
  confirmed: boolean;
}

export interface SourceAssertion {
  id: string;
  actorPartyId?: string;
  actorRole?: SpeakerRole;
  proposition: string;
  status: 'ALLEGED' | 'DENIED' | 'ADMITTED' | 'REPORTED' | 'UNKNOWN';
  provenance: SourceProvenance[];
}

export interface NormalizedDate {
  rawValue: string;
  normalizedValue?: string;
  precision: 'DAY' | 'MONTH' | 'YEAR' | 'UNKNOWN';
  provenance: SourceProvenance[];
}

export interface NormalizedAmount {
  rawValue: string;
  normalizedValue?: number;
  currency?: string;
  unit?: string;
  provenance: SourceProvenance[];
}

export type ProceduralEventType =
  | 'FILING'
  | 'RESOLUTION'
  | 'NOTIFICATION'
  | 'ORDER'
  | 'APPEAL'
  | 'HEARING'
  | 'SERVICE'
  | 'OTHER';

/**
 * A source-backed procedural event used for narrative sections such as
 * ANTECEDENTES.  It is descriptive evidence, not a legal issue or a client
 * position.
 */
export interface RichProceduralTimelineEvent {
  id: string;
  date: string;
  event: string;
  eventType: ProceduralEventType;
  provenance: SourceProvenance[];
  certainty: number;
}

export interface ClaimItem {
  id: string;
  claimantPartyId?: string;
  requestedRelief: string;
  factualBasisIds: string[];
  evidenceMentionIds: string[];
  amount?: NormalizedAmount;
  provenance: SourceProvenance[];
  status: 'SOURCE_MENTIONED' | 'SOURCE_ASSERTED' | 'NEEDS_REVIEW' | 'UNKNOWN';
}

export interface FactItem {
  id: string;
  proposition: string;
  date?: NormalizedDate;
  participants: string[];
  amount?: NormalizedAmount;
  location?: string;
  sourceRole?: SpeakerRole;
  assertionStatus: 'SOURCE_ASSERTION' | 'ESTABLISHED_FACT' | 'UNKNOWN';
  provenance: SourceProvenance[];
  relatedDocumentIds: string[];
}

export interface DocumentItem {
  id: string;
  title: string;
  documentType?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface EvidenceMention {
  id: string;
  documentItemId?: string;
  type?: string;
  description: string;
  relatedFactIds: string[];
  relatedClaimIds: string[];
  statedPurpose?: string;
  status: 'SOURCE_MENTIONED' | 'SOURCE_ATTACHED' | 'EXTRACTED' | 'POTENTIALLY_RELEVANT' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface EvidenceOffer {
  id: string;
  evidenceMentionId: string;
  status: 'PARTY_OFFERED' | 'CLIENT_CONFIRMED' | 'NEEDS_REVIEW';
  provenance: SourceProvenance[];
}

export interface ArgumentItem {
  id: string;
  speakerRole?: SpeakerRole;
  proposition: string;
  supportingFactIds: string[];
  citedAuthorityIds: string[];
  /** Explicit template/section links for petition support; never inferred. */
  petitionSectionIds?: string[];
  /** Explicit source challenge to a court reasoning item; never inferred by proximity. */
  challengedReasoningIds?: string[];
  provenance: SourceProvenance[];
}

export type DecisionReasoningType = 'DECISION_REASONING' | 'HOLDING';

/** Court-owned reasoning extracted from the source, not a client position. */
export interface DecisionReasoningItem {
  id: string;
  proposition: string;
  reasoningType: DecisionReasoningType;
  courtAttribution: 'RESOLUTOR';
  referenceNumber?: string;
  provenance: SourceProvenance[];
  /** Populated only by an explicit SourceArgument challenge relation. */
  challengedByArgumentIds: string[];
}

export interface SourceAuthorityMention {
  id: string;
  authorityType: 'ARTICLE' | 'LAW' | 'CODE' | 'THESIS' | 'JURISPRUDENCE' | 'PRECEDENT' | 'OTHER';
  citationText: string;
  verificationStatus: 'SOURCE_CITED' | 'LEGALLY_VERIFIED';
  provenance: SourceProvenance[];
}

export interface CaseConflict {
  conflictId: string;
  type: 'DATE' | 'AMOUNT' | 'IDENTITY' | 'ROLE' | 'OPPOSING_ASSERTION' | 'OTHER';
  itemIds: string[];
  sourceIds: string[];
  description: string;
  requiresReview: true;
}

export interface MissingDataItem {
  /** Stable rich identifier when the extractor materializes this item. */
  id?: string;
  field: string;
  reason: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  sectionAffected?: string;
  blocking: boolean;
  sourceSearched: string[];
  requiresClientInput: boolean;
}

export interface SourcePosition {
  status: 'KNOWN' | 'UNKNOWN';
  assertionIds: string[];
  provenance: SourceProvenance[];
}

export interface ClientPosition {
  status: 'CONFIRMED' | 'UNKNOWN';
  source: 'CLIENT_POSITION' | 'SOURCE_POSITION';
  propositionIds: string[];
  provenance: SourceProvenance[];
}

export interface PartyExtractionResult {
  parties: CaseParty[];
  reviewReasons: string[];
}

export interface ClaimExtractionContext {
  partyIdsByRole: Record<PartyRole, string[]>;
  factIds: string[];
  evidenceMentionIds: string[];
}

export interface EvidenceExtractionContext {
  factIdsByNumber: Record<string, string>;
  claimIds: string[];
}

export interface ArgumentExtractionContext {
  factIds: string[];
  authorityIds: string[];
  /** Authorities extracted from the same candidate stream; never infer by proximity. */
  authorityMentions?: Pick<SourceAuthorityMention, 'id' | 'provenance'>[];
}

export interface RichCaseAnalysis {
  parties: CaseParty[];
  assertions: SourceAssertion[];
  claims: ClaimItem[];
  facts: FactItem[];
  documents: DocumentItem[];
  evidenceMentions: EvidenceMention[];
  evidenceOffers: EvidenceOffer[];
  arguments: ArgumentItem[];
  decisionReasonings?: DecisionReasoningItem[];
  authorities: SourceAuthorityMention[];
  dates: NormalizedDate[];
  amounts: NormalizedAmount[];
  proceduralTimeline: RichProceduralTimelineEvent[];
  conflicts: CaseConflict[];
  missingData: MissingDataItem[];
  sourcePosition: SourcePosition;
  clientPosition: ClientPosition;
  extractionStats: ExtractionStats;
  candidates: ExtractionCandidate[];
}
