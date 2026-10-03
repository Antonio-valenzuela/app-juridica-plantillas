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
    // Marcar la cita no basta: si el mismo enunciado la afirma como regla
    // ("[NO VERIFICADO: tesis X] ... establece que ..."), la proposición
    // sigue leyéndose como derecho verificado. Se retira además la cláusula
    // que la afirma, y el dato pendiente se conserva.
    // Sólo se retira la ATRIBUCIÓN a la fuente no verificada ("…establece que
    // X"), que es lo que convierte la cita en proposición de derecho cierto.
    // Una afirmación sustantiva del abogado ("…regula los efectos aplicables")
    // se conserva para su revisión: marcarla no es borrarla.
    const tail = input.text.slice(reference.end);
    const stop = tail.search(/[.!?;\n]/);
    const clause = stop === -1 ? tail : tail.slice(0, stop);
    const assertsRule = /\b(?:establece|dispone|ordena|exige|prev[eé]|determina|regula|impone|obliga|se\s+conoce|se\s+entiende|se\s+contiene)\s+que\b/i.test(clause);
    markedText = assertsRule
      ? `${markedText.slice(0, reference.start)}[NO VERIFICADO: ${reference.text}] [PENDIENTE DE DESARROLLO / FUNDAMENTO NORMATIVO ESPECÍFICO PENDIENTE DE VERIFICAR: incorporar sólo después de verificar el texto vigente en fuente oficial]${stop === -1 ? '' : tail.slice(stop)}`
      : `${markedText.slice(0, reference.start)}[NO VERIFICADO: ${reference.text}]${tail}`;
  }

  return {
    text: markedText,
    findings,
    unverifiedCitationCount: findings.length + countUnverifiedCitationMarkers(input.text),
  };
}
