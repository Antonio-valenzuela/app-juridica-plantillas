import type { GenerationTraceContext } from '../generationTrace';
import { extractArguments, extractAuthorityMentions } from './arguments';
import { classifyCandidates } from './classification';
import { detectCaseConflicts } from './conflicts';
import { deduplicateRichItems } from './deduplication';
import { extractAssertions, extractAtomicFacts, isFactCandidate } from './facts';
import { extractDocumentsAndEvidence } from './evidence';
import { buildMissingData, deriveClientPosition, deriveSourcePosition } from './missingData';
import { normalizeAmountCandidate, normalizeDateCandidate } from './normalization';
import { extractClaims } from './claims';
import { extractParties } from './parties';
import { segmentCandidates } from './candidateSegmentation';
import { buildSourceUnits } from './sourceUnits';
import { extractProceduralTimeline } from './proceduralTimeline';
import { extractDecisionReasonings, linkArgumentsToDecisionReasonings } from './decisionReasoning';
import type { ExtractionCandidate, ExtractionStats, PartyRole, RichCaseAnalysis } from './types';
import type { RichEntity } from './deduplication';
import type { UploadedSourceDocument } from '../types';

export interface RichExtractionOptions {
  referenceText?: string;
  includeReferenceInAnalysis?: boolean;
  trace?: GenerationTraceContext;
}

const PARTY_ROLES: PartyRole[] = ['ACTOR', 'DEMANDADO', 'PROMOVENTE', 'QUEJOSO', 'TERCERO', 'AUTORIDAD', 'REPRESENTANTE', 'AUTORIZADO', 'APODERADO', 'UNKNOWN'];

function deduplicate<T>(items: T[]): T[] {
  return deduplicateRichItems(items as unknown as RichEntity[]).items as T[];
}

function statsFor(candidates: ExtractionCandidate[], sourceUnitCount: number): ExtractionStats {
  const counts = candidates.reduce((result, candidate) => {
    result[candidate.decision] += 1;
    return result;
  }, { ACCEPTED: 0, MERGED: 0, REJECTED: 0, REQUIRES_REVIEW: 0 } as Record<ExtractionCandidate['decision'], number>);
  const complete = candidates.filter((candidate) => candidate.provenance.length > 0 && candidate.provenance.every((item) => Boolean(item.sourceId && item.excerptHash))).length;
  const missing = candidates.filter((candidate) => candidate.provenance.length === 0).length;
  return {
    sourceUnitCount,
    candidatesDetected: candidates.length,
    candidatesAccepted: counts.ACCEPTED,
    candidatesMerged: counts.MERGED,
    candidatesRejected: counts.REJECTED,
    candidatesForReview: counts.REQUIRES_REVIEW,
    rejectionReasons: candidates.filter((candidate) => candidate.decision === 'REJECTED' || candidate.decision === 'REQUIRES_REVIEW').reduce((result, candidate) => {
      const reason = candidate.decisionReason || 'REVIEW_REQUIRED';
      result[reason] = (result[reason] || 0) + 1;
      return result;
    }, {} as Record<string, number>),
    provenanceComplete: complete,
    provenancePartial: candidates.filter((candidate) => candidate.provenance.length > 0 && candidate.provenance.some((item) => !item.excerptHash)).length,
    provenanceMissing: missing,
  };
}

export function extractRichCaseAnalysis(
  sources: UploadedSourceDocument[],
  options: RichExtractionOptions = {},
): RichCaseAnalysis {
  const referenceText = options.includeReferenceInAnalysis === false ? undefined : options.referenceText;
  const sourceUnits = buildSourceUnits(sources, { referenceText });
  const segmented = segmentCandidates(sourceUnits);
  const candidates = classifyCandidates(segmented.candidates);

  const partyResult = extractParties(candidates);
  const partyIdsByRole = PARTY_ROLES.reduce((result, role) => {
    result[role] = partyResult.parties.filter((party) => party.role === role).map((party) => party.id);
    return result;
  }, {} as Record<PartyRole, string[]>);
  const assertions = extractAssertions(candidates);
  const facts = deduplicate(extractAtomicFacts(candidates.filter(isFactCandidate)));
  const claimsResult = extractClaims(candidates.filter((candidate) => candidate.kind === 'CLAIM'), { partyIdsByRole, factIds: facts.map((fact) => fact.id), evidenceMentionIds: [] });
  const evidenceResult = extractDocumentsAndEvidence(candidates, { factIdsByNumber: Object.fromEntries(facts.map((fact, index) => [String(index + 1), fact.id])), claimIds: claimsResult.claims.map((claim) => claim.id) });
  const authorities = deduplicate(extractAuthorityMentions(candidates));
  const argumentsResult = extractArguments(candidates, {
    factIds: facts.map((fact) => fact.id),
    authorityIds: authorities.map((authority) => authority.id),
    authorityMentions: authorities,
  });
  const decisionReasonings = extractDecisionReasonings(candidates);
  const linkedReasonings = linkArgumentsToDecisionReasonings(
    deduplicate(argumentsResult.arguments),
    decisionReasonings,
  );
  const dates = candidates.filter((candidate) => candidate.kind === 'DATE').map(normalizeDateCandidate);
  const amounts = candidates.filter((candidate) => candidate.kind === 'AMOUNT').map(normalizeAmountCandidate);

  const provisional: RichCaseAnalysis = {
    parties: deduplicate(partyResult.parties),
    assertions: deduplicate(assertions),
    claims: deduplicate(claimsResult.claims),
    facts,
    documents: deduplicate(evidenceResult.documents),
    evidenceMentions: deduplicate(evidenceResult.evidenceMentions),
    evidenceOffers: deduplicate(evidenceResult.evidenceOffers),
    arguments: linkedReasonings.arguments,
    decisionReasonings: linkedReasonings.decisionReasonings,
    authorities: deduplicate(authorities),
    dates: deduplicate(dates),
    amounts: deduplicate(amounts),
    proceduralTimeline: extractProceduralTimeline(sourceUnits),
    conflicts: [],
    missingData: [],
    sourcePosition: { status: 'UNKNOWN', assertionIds: [], provenance: [] },
    clientPosition: { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] },
    extractionStats: statsFor(candidates, sourceUnits.length),
    candidates,
  };

  provisional.sourcePosition = deriveSourcePosition(provisional);
  provisional.clientPosition = deriveClientPosition(provisional);
  provisional.conflicts = detectCaseConflicts(provisional);
  provisional.missingData = buildMissingData(provisional).items;
  return provisional;
}
