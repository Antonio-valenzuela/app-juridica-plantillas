import type { CaseAnalysis } from '../caseAnalysis';
import type { CaseParty, EvidenceMention, FactItem, RichCaseAnalysis, SourceProvenance } from './types';

export interface LegacyProjectionResult {
  caseAnalysis: Partial<CaseAnalysis>;
  losses: string[];
}

function sourceReference(provenance: SourceProvenance | undefined) {
  return provenance
    ? { documentId: provenance.sourceId, page: provenance.page, paragraph: provenance.paragraphIndex, textSnippet: provenance.excerpt }
    : undefined;
}

function confidenceOf(provenance: SourceProvenance[]): number {
  return provenance.length > 0 ? Math.max(...provenance.map((item) => item.confidence)) : 0;
}

function projectParties(rich: RichCaseAnalysis, base: CaseAnalysis['parties'], losses: string[]): CaseAnalysis['parties'] {
  const parties = { ...base };
  const roleTargets: Array<[CaseParty['role'], 'actor' | 'quejoso' | 'demandado' | 'autoridadResponsable' | 'terceroInteresado']> = [
    ['ACTOR', 'actor'],
    ['QUEJOSO', 'quejoso'],
    ['DEMANDADO', 'demandado'],
    ['AUTORIDAD', 'autoridadResponsable'],
    ['TERCERO', 'terceroInteresado'],
  ];
  for (const [role, target] of roleTargets) {
    const matches = rich.parties.filter((party) => party.role === role && party.name);
    if (matches.length === 1) parties[target] = matches[0].name;
    if (matches.length > 1) losses.push(`Ambiguous party role ${role} omitted from scalar legacy parties`);
  }
  return parties;
}

function projectFact(fact: FactItem, index: number) {
  const excerpt = fact.provenance[0]?.excerpt;
  const sourceText = excerpt
    ?.replace(/^\s*(?:HECHO\s+)?(?:\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s*[.)\-:]\s*/i, '')
    .trim() || fact.proposition;
  const sourceNumber = excerpt?.match(/^\s*(?:HECHO\s+)?(\d+|[IVXLCDM]+|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s*[.)\-:]/i)?.[1];
  return {
    id: fact.id,
    number: sourceNumber || String(index + 1),
    text: sourceText,
    sourceFact: sourceText,
    documentId: fact.relatedDocumentIds[0],
    page: fact.provenance[0]?.page,
    confidence: confidenceOf(fact.provenance),
    lawyerPosition: 'UNDEFINED' as const,
    position: 'REQUIRE_LAWYER_INPUT' as const,
    contestedStatus: fact.assertionStatus === 'ESTABLISHED_FACT' ? 'UNCONTESTED' as const : 'UNKNOWN' as const,
    provenance: 'SOURCE_EXTRACTED' as const,
    sourceReference: sourceReference(fact.provenance[0]),
  };
}

function projectEvidence(rich: RichCaseAnalysis, mention: EvidenceMention, losses: string[]) {
  const document = rich.documents.find((item) => item.id === mention.documentItemId);
  const confirmedByClient = rich.evidenceOffers.some((offer) => offer.evidenceMentionId === mention.id && offer.status === 'CLIENT_CONFIRMED');
  if (!confirmedByClient) losses.push('EvidenceMention status cannot be represented as CLIENT_CONFIRMED in legacy evidence');
  return {
    id: mention.id,
    title: document?.title || mention.description,
    type: mention.type || document?.documentType || 'UNKNOWN',
    description: mention.description,
    page: mention.provenance[0]?.page,
    confirmed: confirmedByClient,
    relatedFactIds: [...mention.relatedFactIds],
    relatedClaimIds: [...mention.relatedClaimIds],
    provenance: 'SOURCE_EXTRACTED' as const,
    sourceReference: sourceReference(mention.provenance[0]),
  };
}

export function projectRichCaseAnalysis(rich: RichCaseAnalysis, base: CaseAnalysis): LegacyProjectionResult {
  const losses: string[] = [];
  const evidence = rich.evidenceMentions.map((mention) => projectEvidence(rich, mention, losses));
  const facts = rich.facts.map(projectFact);
  if (rich.facts.some((fact) => fact.assertionStatus === 'SOURCE_ASSERTION')) {
    losses.push('SourceAssertion remains a source assertion and cannot be represented as an established legacy fact');
  }

  const projected: Partial<CaseAnalysis> = {
    ...base,
    parties: projectParties(rich, base.parties, losses),
    claims: rich.claims.map((claim) => claim.requestedRelief),
    claimResponses: rich.claims.map((claim, index) => ({
      id: claim.id,
      number: String(index + 1),
      text: claim.requestedRelief,
      sourceClaim: claim.requestedRelief,
      lawyerPosition: 'UNDEFINED' as const,
      position: 'REQUIRE_LAWYER_INPUT' as const,
      provenance: 'SOURCE_EXTRACTED' as const,
      sourceReference: sourceReference(claim.provenance[0]),
    })),
    facts,
    evidence,
    arguments: rich.arguments.length > 0 ? rich.arguments.map((argument) => argument.proposition) : base.arguments,
    authorities: Array.from(new Set([...base.authorities, ...rich.authorities.map((authority) => authority.citationText)])),
    citations: base.citations,
    missingData: Array.from(new Set([...base.missingData, ...rich.missingData.map((item) => `[${item.field}] ${item.reason}`)])),
  };

  if (rich.clientPosition.status === 'UNKNOWN') losses.push('ClientPosition status remains UNKNOWN in legacy projection');
  return { caseAnalysis: projected, losses };
}
