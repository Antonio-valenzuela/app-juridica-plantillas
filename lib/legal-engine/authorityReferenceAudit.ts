import { evaluateAuthorityVerificationGate, type AuthorityUse } from './authorityVerificationGate';
import type { VerifiedAuthority } from './legal-research/types';
import { countUnverifiedCitationMarkers, extractMaterialLegalCitations, normalizeLegalCitation } from './materialLegalCitations';

export interface AuthorityReferenceFinding {
  citationText: string;
  issues: string[];
}

export interface MarkedAuthorityReferencesResult {
  text: string;
  findings: AuthorityReferenceFinding[];
  unverifiedCitationCount: number;
}

/** Adds an inline review marker only when the existing official-authority gate cannot validate the cite. */
export function markUnverifiedAuthorityReferences(input: {
  text: string;
  blockId: string;
  authorityUses: readonly AuthorityUse[];
  verifiedAuthorities: readonly VerifiedAuthority[];
}): MarkedAuthorityReferencesResult {
  const references = extractMaterialLegalCitations(input.text);
  const findings: AuthorityReferenceFinding[] = [];
  const unverifiedReferences: typeof references = [];

  for (const reference of references) {
    const aliases = new Set(reference.aliases.map(normalizeLegalCitation));
    const matchingUses = input.authorityUses.filter((use) =>
      use.blockId === input.blockId && aliases.has(normalizeLegalCitation(use.citationText))
    );
    const candidates = matchingUses.length > 0 ? matchingUses : [undefined];
    const valid = candidates.some((use) => {
      const result = evaluateAuthorityVerificationGate({
        blocks: [{ id: input.blockId, text: reference.text }],
        uses: use ? [use] : [],
        verifiedAuthorities: [...input.verifiedAuthorities],
      });
      return result.status === 'PASS'
        && result.uses.length === 1
        && result.uses[0]?.verificationStatus === 'VERIFIED';
    });
    if (!valid) {
      const audit = evaluateAuthorityVerificationGate({
        blocks: [{ id: input.blockId, text: reference.text }],
        uses: matchingUses,
        verifiedAuthorities: [...input.verifiedAuthorities],
      });
      findings.push({ citationText: reference.text, issues: audit.issues });
      unverifiedReferences.push(reference);
    }
  }

  let markedText = input.text;
  for (const reference of [...unverifiedReferences].reverse()) {
    markedText = `${markedText.slice(0, reference.start)}[NO VERIFICADO: ${reference.text}]${markedText.slice(reference.end)}`;
  }

  return {
    text: markedText,
    findings,
    unverifiedCitationCount: findings.length + countUnverifiedCitationMarkers(input.text),
  };
}
