import type { VerifiedAuthority } from './legal-research/types';
import { extractMaterialLegalCitations, normalizeLegalCitation } from './materialLegalCitations';

export interface AuthorityUse {
  blockId: string;
  citationText: string;
  authorityId: string;
  issueId: string;
  proposition: string;
  application: string;
}

export interface AuthorityVerificationGateInput {
  blocks: Array<{ id: string; text: string }>;
  uses: AuthorityUse[];
  /** Must come from the existing official-source research pipeline, never the drafting model. */
  verifiedAuthorities: VerifiedAuthority[];
}

export interface AuthorityVerificationGateResult {
  status: 'PASS' | 'BLOCKED';
  verifiedAuthorityCount: number;
  appliedAuthorityCount: number;
  unsupportedLegalAuthorities: number;
  issues: string[];
  uses: Array<AuthorityUse & { verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'NOT_REQUIRED'; issues: string[] }>;
}

function normalize(value: string): string {
  return normalizeLegalCitation(value);
}

function citationIdentityMatchesAuthority(
  citation: ReturnType<typeof extractMaterialLegalCitations>[number],
  authority: VerifiedAuthority,
): boolean {
  const identity = normalize(`${authority.identity.canonicalCitation} ${authority.identifier || ''} ${authority.title || ''}`);
  if (citation.articleText && !identity.includes(normalize(citation.articleText))) return false;
  if (citation.statuteText) {
    const requiredTitleWords = normalize(citation.statuteText)
      .split(' ')
      .filter((word) => !['de', 'del', 'la', 'las', 'el', 'los', 'y'].includes(word));
    if (!requiredTitleWords.every((word) => identity.split(' ').includes(word))) return false;
  } else if (!citation.articleText && !citation.aliases.some((alias) => identity.includes(normalize(alias)))) {
    return false;
  }
  return true;
}

function officialEvidenceValid(authority: VerifiedAuthority): boolean {
  const source = authority.source;
  if (authority.verificationStatus !== 'VERIFIED' || source?.sourceTier !== 'OFFICIAL_PRIMARY'
    || source.isFixture || !source.sourceHash || !authority.verificationHash || !source.sourceUrl) return false;
  try {
    const url = new URL(source.sourceUrl);
    const host = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
    const declaredDomain = source.sourceDomain.toLocaleLowerCase().replace(/^www\./, '');
    return url.protocol === 'https:' && host === declaredDomain;
  } catch {
    return false;
  }
}

/** Validates links to already verified official research; it does not turn model citations into verified law. */
export function evaluateAuthorityVerificationGate(input: AuthorityVerificationGateInput): AuthorityVerificationGateResult {
  const issues: string[] = [];
  const useResults: AuthorityVerificationGateResult['uses'] = [];
  const consumed = new Set<number>();
  const verifiedIds = new Set<string>();
  const appliedIds = new Set<string>();
  let unsupportedLegalAuthorities = 0;

  for (const block of input.blocks) {
    for (const citationReference of extractMaterialLegalCitations(block.text)) {
      const citationAliases = new Set(citationReference.aliases.map(normalize));
      const useIndex = input.uses.findIndex((use, index) => !consumed.has(index)
        && use.blockId === block.id && citationAliases.has(normalize(use.citationText)));
      if (useIndex < 0) {
        issues.push(`AUTHORITY_USE_MISSING:${block.id}`);
        unsupportedLegalAuthorities += 1;
        continue;
      }
      consumed.add(useIndex);
      const use = input.uses[useIndex]!;
      const authority = input.verifiedAuthorities.find((item) => item.id === use.authorityId);
      const useIssues: string[] = [];
      if (!authority || !officialEvidenceValid(authority)) {
        useIssues.push(`AUTHORITY_OFFICIAL_SOURCE_INVALID:${block.id}`);
      } else {
        if (!authority.supportsLegalIssueIds.includes(use.issueId)) useIssues.push(`AUTHORITY_ISSUE_MISMATCH:${block.id}`);
        if (authority.temporalValidity.status !== 'CURRENT_AND_APPLICABLE'
          && authority.temporalValidity.status !== 'HISTORICALLY_APPLICABLE') useIssues.push(`AUTHORITY_VIGENCIA_UNVERIFIED:${block.id}`);
        if (authority.jurisdictionValidity.status !== 'APPLICABLE') useIssues.push(`AUTHORITY_JURISDICTION_UNVERIFIED:${block.id}`);
        if (authority.proposition.supportLevel !== 'DIRECT'
          || normalize(authority.proposition.text) !== normalize(use.proposition)) useIssues.push(`AUTHORITY_PROPOSITION_UNVERIFIED:${block.id}`);
        if (!use.application.trim()) useIssues.push(`AUTHORITY_APPLICATION_MISSING:${block.id}`);
        if (!citationIdentityMatchesAuthority(citationReference, authority)) {
          useIssues.push(`AUTHORITY_IDENTITY_MISMATCH:${block.id}`);
        }
      }
      if (useIssues.length > 0) unsupportedLegalAuthorities += 1;
      else {
        verifiedIds.add(use.authorityId);
        appliedIds.add(use.authorityId);
      }
      issues.push(...useIssues);
      useResults.push({ ...use, verificationStatus: useIssues.length === 0 ? 'VERIFIED' : 'UNVERIFIED', issues: useIssues });
    }
  }

  input.uses.forEach((use, index) => {
    if (!consumed.has(index)) {
      unsupportedLegalAuthorities += 1;
      issues.push(`ORPHAN_AUTHORITY_USE:${use.blockId}`);
      useResults.push({ ...use, verificationStatus: 'UNVERIFIED', issues: [`ORPHAN_AUTHORITY_USE:${use.blockId}`] });
    }
  });
  return {
    status: issues.length === 0 ? 'PASS' : 'BLOCKED',
    verifiedAuthorityCount: verifiedIds.size,
    appliedAuthorityCount: appliedIds.size,
    unsupportedLegalAuthorities,
    issues: [...new Set(issues)],
    uses: useResults,
  };
}
