import type { CaseAnalysis } from './caseAnalysis';
import type { UniversalLegalDocument } from './types';

export type LegalAdmissionReason = 'UNCONFIRMED_EVIDENCE' | 'ABSOLUTE_EVIDENCE_VALUATION'
  | 'UNVERIFIED_LEGAL_ASSERTION' | 'UNSUPPORTED_PROOF_RULE' | 'UNSUPPORTED_PETITION';

function normalized(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').replace(/[.;:]+$/g, '').trim();
}

/** Exact confirmed descriptions, not guessed evidence types or documents. */
export function confirmedEvidenceDescriptions(analysis?: CaseAnalysis, instruction?: string): string[] {
  const descriptions = (analysis?.evidence || []).filter(item => item.confirmed === true)
    .map(item => item.description).filter(Boolean);
  const rich = analysis?.richCaseAnalysis;
  for (const offer of rich?.evidenceOffers || []) {
    if (offer.status !== 'CLIENT_CONFIRMED') continue;
    const mention = rich?.evidenceMentions.find(item => item.id === offer.evidenceMentionId);
    if (mention?.description && mention.provenance.length && offer.provenance.length) descriptions.push(mention.description);
  }
  // This explicit labelled client instruction is also used by the captured fixture.
  // Other mentions in an instruction, allegations or provider text are NOT confirmation.
  for (const match of (instruction || '').matchAll(/(?:^|[\n.])\s*Prueba ofrecida por (?:el )?cliente:\s*([^\n.]+)[.]?/gi)) {
    descriptions.push(match[1].trim());
  }
  return [...new Set(descriptions)];
}

/**
 * Admission BEFORE materialization for legacy text without an issue-scoped
 * verified proposition contract. It does not certify facts/authorities or resolve
 * Coverage. A rejected candidate stays in the raw trace, never becomes legal prose.
 * Deliberately conservative: a matching evidence title cannot license additional
 * authorship, authenticity, witnesses or probative effects invented around it.
 */
export function evaluateGeneratedLegalAdmission(input: {
  text: string;
  sectionType: string;
  document: UniversalLegalDocument;
  analysis?: CaseAnalysis;
  instruction?: string;
  legalIssueIds?: readonly string[];
}): { accepted: boolean; reasons: LegalAdmissionReason[]; pendingText: string; rejectedWords: number } {
  const { text, sectionType, document, analysis, instruction } = input;
  const reasons = new Set<LegalAdmissionReason>();
  const descriptions = confirmedEvidenceDescriptions(analysis, instruction);
  const statements = text.split(/\n+|(?<=[.!?])\s+/).map(value => value.trim()).filter(Boolean);
  const verifiedPropositions = new Set((analysis?.verifiedAuthorities || [])
    .filter(authority => authority.verificationStatus === 'VERIFIED'
      && authority.source.sourceTier === 'OFFICIAL_PRIMARY'
      && Boolean(authority.source.sourceUrl && authority.source.sourceHash && authority.source.locator)
      && authority.jurisdictionValidity.status === 'APPLICABLE'
      && ['CURRENT_AND_APPLICABLE', 'HISTORICALLY_APPLICABLE'].includes(authority.temporalValidity.status)
      && authority.proposition.supportLevel === 'DIRECT'
      && authority.supportsLegalIssueIds.some(id => input.legalIssueIds?.includes(id)))
    .map(authority => normalized(authority.proposition.text)));
  const unsupportedLegalText = statements.filter(statement => !verifiedPropositions.has(normalized(statement))).join('\n');
  const evidenceOffer = /\b(?:se ofrece|ofrecemos|ofrezco|ofrece formalmente|prueba testimonial|testimonial de|prueba pericial|pericial de|inspecci[oó]n judicial|confesional a cargo|documental consistente|se exhibe|se acompa[nñ]a|se anexa)\b/i;
  if (sectionType === 'evidence' || evidenceOffer.test(text)) {
    const allowable = new Set(descriptions.flatMap(description => [
      normalized(description), normalized(`Se ofrece ${description}`),
    ]));
    const unsupported = statements.some(statement => {
      if (/^(?:PRUEBAS|MEDIOS DE PRUEBA)[.:]?$/i.test(statement)) return false;
      if (/^\[(?:PENDIENTE|REQUIERE|DATO PENDIENTE)[^\]]*\]$/.test(statement)) return false;
      return !allowable.has(normalized(statement));
    });
    if (unsupported) reasons.add('UNCONFIRMED_EVIDENCE');
  }
  if (/valor probatorio pleno|(?:demuestra|acredita|prueba).{0,35}(?:indubitable|inequ[ií]voc|incuestionable)|[uú]nica conclusi[oó]n jur[ií]dica|desvirt[uú]a por completo/i.test(text)) {
    reasons.add('ABSOLUTE_EVIDENCE_VALUATION');
  }
  if (/\[NO VERIFICADO[^\]]*\][^.!?\n]*(?:establece|dispone|ordena|exige|prev[eé]|determina|conforme|aplicable|debe)/i.test(text)
    || /(?:ley|art[ií]culo|jurisprudencia|norma|c[oó]digo)[^.!?\n]{0,100}\b(?:establece|dispone|ordena|exige|prev[eé]|determina)\b/i.test(unsupportedLegalText)) {
    reasons.add('UNVERIFIED_LEGAL_ASSERTION');
  }
  if (/carga (?:de la prueba|probatoria)|inversi[oó]n de (?:la )?carga|presunci[oó]n (?:legal|de|a favor)|valor probatorio (?:pleno|vinculante)|(?:corresponde|incumbe) (?:a [^.!?\n]{1,80})?(?:probar|acreditar)|(?:debe|deber[aá]) (?:probar|acreditar)/i.test(unsupportedLegalText)) {
    reasons.add('UNSUPPORTED_PROOF_RULE');
  }
  if (sectionType === 'petition' || /se solicita|solicito|se condene|se absuelva|se revoque|se declare|puntos petitorios/i.test(text)) {
    const requests = document.generationMetadata.requestContract?.requests.map(item => item.text) || [];
    for (const challenge of analysis?.richCaseAnalysis?.draftingProjection?.challenges || []) {
      if (challenge.clientPosition && challenge.requestedEffect) requests.push(challenge.requestedEffect.text);
    }
    const effects = /costas?|conden[a-záéíóú]*|sanci[oó]n[a-záéíóú]*|nulidad[a-záéíóú]*|absolu[a-záéíóú]*|sobrese[a-záéíóú]*|revoc[a-záéíóú]*|modifi[a-záéíóú]*|sentencia favorable|desestim[a-záéíóú]*/i;
    const requested = new Set(requests.map(request => normalized(request).replace(/^se solicita\s+/, '')));
    for (const statement of statements.filter(value => effects.test(value))) {
      // A proceeding name, the adversary's claims or an unconfirmed free-form
      // instruction cannot authorize a new dispositive effect.
      if (!requested.has(normalized(statement).replace(/^se solicita\s+/, ''))) reasons.add('UNSUPPORTED_PETITION');
    }
  }
  const codes = [...reasons];
  const sourceEvidence = sectionType === 'evidence' && descriptions.length
    ? `\n\nDescripción aportada por el cliente (sin certificar autenticidad ni valor probatorio):\n${descriptions.join('\n')}` : '';
  return {
    accepted: codes.length === 0,
    reasons: codes,
    pendingText: `[PENDIENTE DE DESARROLLO / CONFIRMACIÓN DEL ABOGADO / FUNDAMENTACIÓN: candidato no admitido; ${codes.join(', ')}]${sourceEvidence}`,
    rejectedWords: codes.length ? (text.match(/[\p{L}\p{N}]+/gu) || []).length : 0,
  };
}
