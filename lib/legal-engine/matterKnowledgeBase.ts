import type { CaseAnalysis } from './caseAnalysis';
import type { FactItem, RichCaseAnalysis } from './case-extraction/types';
import type { VerifiedAuthority } from './legal-research/types';
import type { LegalIssueMatrix } from './legalIssueMatrix';

/** Read-only, in-memory projection used to scope each section's context. */
export interface MatterKnowledgeBase {
  version: 'MATTER_KB_V1';
  facts: FactItem[];
  parties: RichCaseAnalysis['parties'];
  claims: RichCaseAnalysis['claims'];
  evidenceIds: string[];
  sourceAuthorityIds: string[];
  verifiedAuthorities: VerifiedAuthority[];
  unresolvedIssueIds: string[];
  argumentSupports: ArgumentSupport[];
  chronology: Array<RichCaseAnalysis['proceduralTimeline'][number] & {
    dateKind: string;
    dateOrigin: 'INFERRED' | 'PARTY_ALLEGED' | 'SOURCE_REPORTED' | 'UNVERIFIED';
  }>;
}

export interface ArgumentSupport {
  argumentId: string;
  proposition: string;
  factRefs: string[];
  evidenceRefs: string[];
  authorityRefs: string[];
  requestedEffect?: string;
  reviewStatus?: 'REVIEW_REQUIRED' | 'SOURCE_BASED';
  reviewFindings?: Array<{ code: string; entityId: string }>;
}

export function buildMatterKnowledgeBase(caseAnalysis: CaseAnalysis, verifiedAuthorities: readonly VerifiedAuthority[] = [], issueMatrix?: LegalIssueMatrix): MatterKnowledgeBase {
  const rich = caseAnalysis.richCaseAnalysis;
  const issues = issueMatrix?.issues || [];
  return {
    version: 'MATTER_KB_V1',
    chronology: (rich?.proceduralTimeline || []).map((event) => ({
      ...event,
      dateKind: event.eventType === 'FILING' ? 'PRESENTATION' : event.eventType,
      dateOrigin: event.provenance.some((p) => p.inferenceLevel === 'RELATION_INFERRED') ? 'INFERRED'
        : event.provenance.some((p) => p.speakerRole?.startsWith('PARTE_')) ? 'PARTY_ALLEGED'
          : event.provenance.length && event.provenance.every((p) => !!p.excerpt && (p.inferenceLevel === 'LITERAL' || p.inferenceLevel === 'NORMALIZED')) ? 'SOURCE_REPORTED' : 'UNVERIFIED',
    })),
    facts: [...(rich?.facts || [])],
    parties: [...(rich?.parties || [])],
    claims: [...(rich?.claims || [])],
    evidenceIds: [
      ...(rich?.evidenceMentions || []).map((item) => item.id),
      ...(rich?.evidenceOffers || []).map((item) => item.id),
    ].sort(),
    sourceAuthorityIds: (rich?.authorities || []).map((item) => item.id).sort(),
    verifiedAuthorities: [...verifiedAuthorities],
    unresolvedIssueIds: issues.filter((issue) => issue.status !== 'READY_FOR_GENERATION' || issue.researchStatus === 'NEEDS_RESEARCH').map((issue) => issue.id).sort(),
    argumentSupports: (rich?.arguments || []).map((argument) => {
      const factRefs = [...argument.supportingFactIds];
      const evidenceRefs = (rich?.evidenceMentions || [])
        .filter((evidence) => evidence.relatedFactIds.some((factId) => factRefs.includes(factId)))
        .map((evidence) => evidence.id);
      const reviewFindings: Array<{ code: string; entityId: string }> = [];
      for (const id of factRefs) {
        const fact = rich?.facts.find((item) => item.id === id);
        if (!fact) reviewFindings.push({ code: 'THEORY_FACT_NOT_FOUND', entityId: id });
        else if (fact.assertionStatus !== 'ESTABLISHED_FACT') reviewFindings.push({ code: 'THEORY_FACT_UNCONFIRMED', entityId: id });
        if (!(rich?.evidenceMentions || []).some((e) => e.relatedFactIds.includes(id))) reviewFindings.push({ code: 'FACT_WITHOUT_EVIDENCE_LINK', entityId: id });
      }
      for (const id of argument.citedAuthorityIds) {
        if (!verifiedAuthorities.some((authority) => authority.id === id || authority.sourceAuthorityMentionIds.includes(id))) {
          reviewFindings.push({ code: 'AUTHORITY_UNVERIFIED', entityId: id });
        }
      }
      return {
        argumentId: argument.id,
        proposition: argument.proposition,
        factRefs,
        evidenceRefs,
        authorityRefs: [...argument.citedAuthorityIds],
        reviewFindings,
        reviewStatus: reviewFindings.length ? 'REVIEW_REQUIRED' : 'SOURCE_BASED',
      };
    }),
  };
}
