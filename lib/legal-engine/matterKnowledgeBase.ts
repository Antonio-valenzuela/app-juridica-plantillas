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
}

export interface ArgumentSupport {
  argumentId: string;
  proposition: string;
  factRefs: string[];
  evidenceRefs: string[];
  authorityRefs: string[];
  requestedEffect?: string;
}

export function buildMatterKnowledgeBase(caseAnalysis: CaseAnalysis, verifiedAuthorities: readonly VerifiedAuthority[] = [], issueMatrix?: LegalIssueMatrix): MatterKnowledgeBase {
  const rich = caseAnalysis.richCaseAnalysis;
  const issues = issueMatrix?.issues || [];
  return {
    version: 'MATTER_KB_V1',
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
      return {
        argumentId: argument.id,
        proposition: argument.proposition,
        factRefs,
        evidenceRefs,
        authorityRefs: [...argument.citedAuthorityIds],
      };
    }),
  };
}
