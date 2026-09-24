import type { AuthorityCandidate, LegalAuthority, VerifiedAuthority } from './types';

export function normalizeLegalAuthority(candidate: AuthorityCandidate, verified?: VerifiedAuthority): LegalAuthority {
  if (verified) {
    return {
      id: verified.id,
      title: verified.title || verified.identity.canonicalCitation,
      type: verified.identity.authorityType,
      reference: verified.identity.canonicalCitation,
      bindingStatus: verified.jurisdictionValidity.bindingCharacter === 'BINDING_WHEN_APPLICABLE' ? 'BINDING' : verified.jurisdictionValidity.bindingCharacter === 'PERSUASIVE' ? 'PERSUASIVE' : verified.jurisdictionValidity.bindingCharacter === 'NON_BINDING' ? 'NON_BINDING' : 'UNKNOWN',
      validityStatus: verified.temporalValidity.status === 'REPEALED' || verified.temporalValidity.status === 'SUPERSEDED' ? 'STALE' : 'CURRENT',
      sourceUrl: verified.source.sourceUrl,
      officialSourceUrl: verified.officialUrl || verified.source.sourceUrl,
      provider: verified.provider,
      verificationStatus: 'VERIFIED',
    };
  }

  const stale = candidate.temporalStatus === 'REPEALED' || candidate.temporalStatus === 'SUPERSEDED';
  return {
    id: candidate.id,
    title: candidate.title || candidate.observedCitation,
    type: candidate.authorityType,
    reference: candidate.canonicalCitationCandidate || candidate.observedCitation,
    bindingStatus: 'UNKNOWN',
    validityStatus: stale ? 'STALE' : 'UNKNOWN',
    sourceUrl: candidate.sourceUrl || '',
    officialSourceUrl: candidate.sourceTier === 'OFFICIAL_PRIMARY' ? candidate.sourceUrl : undefined,
    provider: candidate.provider || 'LLM',
    verificationStatus: stale
      ? 'STALE'
      : candidate.sourceTier === 'SECONDARY_SUPPORT' || candidate.provider === 'CORPUS_IURIS'
        ? 'REQUIRES_OFFICIAL_CONFIRMATION'
        : 'UNVERIFIED',
  };
}
