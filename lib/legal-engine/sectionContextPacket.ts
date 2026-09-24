import type { SourceProvenance, FactItem, EvidenceMention, EvidenceOffer, SourceAuthorityMention, ClientPosition } from './case-extraction/types';
import type { LegalResearchBundle, VerifiedAuthority } from './legal-research/types';
import type { IssueDraftResult, IssueGenerationOutcome } from './issueDraftResult';
import type { SectionSummary } from './documentState';
import type { ArgumentSupport } from './matterKnowledgeBase';

export type SectionContextStatus = 'READY' | 'BLOCKED';

export interface SectionContextLimits {
  maxContextCharacters: number;
  maxGroundedIssueOutputs: number;
  maxFacts: number;
  maxEvidence: number;
  maxAuthorities: number;
  maxResearch: number;
}

export interface SectionEvidenceMaterial {
  id: string;
  kind: 'MENTION' | 'OFFER';
  description: string;
  relatedFactIds: string[];
  status: EvidenceMention['status'] | EvidenceOffer['status'];
  provenance: SourceProvenance[];
}

export interface SectionAuthorityMaterial {
  id: string;
  citationText: string;
  verificationStatus: 'LEGALLY_VERIFIED';
  source: 'SOURCE_MENTION' | 'VERIFIED_RESEARCH';
  provenance: SourceProvenance[];
  proposition?: string;
  researchSource?: {
    sourceUrl: string;
    locator?: string;
    sourceHash: string;
    excerptHash?: string;
  };
}

export interface SectionResearchMaterial {
  legalIssueId: string;
  requestId: string;
  researchHash: string;
  verifiedAuthorityIds: string[];
  status: LegalResearchBundle['researchStatus'];
}

export interface SectionGroundedIssueOutput {
  taskId: string;
  legalIssueId: string;
  status: Extract<IssueGenerationOutcome['status'], 'ACCEPTED' | 'VALID_NON_FINAL'>;
  coverageItemIds: string[];
  sourceEntityIds: string[];
  authorityMentionIds: string[];
  verifiedAuthorityIds: string[];
  researchHash?: string;
  thesis?: string;
  factualDevelopment: string[];
  evidentiaryDevelopment: string[];
  legalDevelopment: string[];
  application?: string;
  conclusion?: string;
}

export interface SectionSourceManifest {
  accepted: {
    coverageItemIds: string[];
    factIds: string[];
    evidenceIds: string[];
    authorityIds: string[];
    researchIssueIds: string[];
    issueOutputTaskIds: string[];
  };
  excluded: Array<{
    kind: 'ISSUE_OUTPUT' | 'FACT' | 'EVIDENCE' | 'AUTHORITY' | 'RESEARCH' | 'CLIENT_POSITION';
    id: string;
    reason: string;
    status?: string;
  }>;
  provenance: SourceProvenance[];
  researchSources?: Array<{
    legalIssueId: string;
    requestId: string;
    researchHash: string;
    authorityId: string;
    sourceUrl: string;
    locator?: string;
    sourceHash: string;
    excerptHash?: string;
  }>;
}

export interface SectionContextPacket {
  version: 'SECTION_CONTEXT_V1';
  status: SectionContextStatus;
  section: { id: string; title: string; order: number; role: string };
  documentObjective: string;
  sectionObjective: string;
  requirements: string[];
  groundedIssueOutputs: SectionGroundedIssueOutput[];
  facts: FactItem[];
  evidence: SectionEvidenceMaterial[];
  verifiedAuthorities: SectionAuthorityMaterial[];
  research: SectionResearchMaterial[];
  argumentSupports?: ArgumentSupport[];
  clientPosition?: Pick<ClientPosition, 'status' | 'source' | 'propositionIds' | 'provenance'>;
  previousSectionSummaries: SectionSummary[];
  blockers: string[];
  sourceManifest: SectionSourceManifest;
  limits: SectionContextLimits;
  diagnostics: string[];
  contextHash: string;
}

export type SectionContextIssueOutputInput = IssueGenerationOutcome & { result?: IssueDraftResult };
