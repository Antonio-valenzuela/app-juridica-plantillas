import type { LegalIssueItem } from '../legalIssueMatrix';
import {
  canonicalizeResearchValue,
  sha256ResearchValue,
  stableResearchId,
} from './canonical';
import type {
  AuthorityType,
  LegalRegimeResolution,
  LegalResearchRequest,
  ResearchVerificationRequest,
  NormalizedResearchQuery,
  ResearchClock,
} from './types';

export interface BuildLegalResearchRequestInput {
  issue: Pick<LegalIssueItem, 'id' | 'question' | 'coverageItemIds' | 'authorityMentionIds' | 'researchStatus'>;
  regime: LegalRegimeResolution;
  contextHash: string;
  requestedAuthorityTypes: AuthorityType[];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function shouldCreateResearchRequest(
  issue: Pick<LegalIssueItem, 'researchStatus'>,
): boolean {
  return issue.researchStatus !== 'NOT_REQUIRED';
}

export async function buildLegalResearchRequest(
  input: BuildLegalResearchRequestInput,
  clock: ResearchClock = () => new Date(),
): Promise<LegalResearchRequest> {
  if (!shouldCreateResearchRequest(input.issue)) throw new Error('RESEARCH_REQUEST_NOT_REQUIRED');
  const semantic = canonicalizeResearchValue({
    legalIssueId: input.issue.id,
    coverageItemIds: sortedUnique(input.issue.coverageItemIds),
    question: normalizedText(input.issue.question),
    regimeResolutionId: input.regime.id,
    regimeHash: input.regime.resolutionHash,
    relevantDate: input.regime.relevantDate,
    temporalPrecision: input.regime.temporalPrecision,
    requestedAuthorityTypes: sortedUnique(input.requestedAuthorityTypes),
    sourceAuthorityMentionIds: sortedUnique(input.issue.authorityMentionIds),
    contextHash: input.contextHash,
  });
  return {
    id: stableResearchId('request', semantic),
    legalIssueId: input.issue.id,
    coverageItemIds: sortedUnique(input.issue.coverageItemIds),
    question: normalizedText(input.issue.question),
    jurisdiction: input.regime.scope.toLowerCase(),
    matter: input.regime.matter?.code,
    procedure: input.regime.procedure?.code,
    relevantDate: input.regime.relevantDate,
    temporalPrecision: input.regime.temporalPrecision,
    requestedAuthorityTypes: [...new Set(input.requestedAuthorityTypes)].sort(),
    sourceAuthorityMentionIds: sortedUnique(input.issue.authorityMentionIds),
    contextHash: input.contextHash,
    regimeResolutionId: input.regime.id,
    status: input.regime.status === 'LEGAL_REGIME_UNRESOLVED' ? 'BLOCKED' : 'READY_FOR_RETRIEVAL',
    createdAt: clock().toISOString(),
  };
}

export async function normalizeResearchQuery(
  request: ResearchVerificationRequest,
  regime: LegalRegimeResolution,
): Promise<NormalizedResearchQuery> {
  const explicitTerms = [
    request.question,
    regime.country?.code,
    regime.scope,
    regime.federativeEntity?.code,
    regime.matter?.code,
    regime.procedure?.code,
    ...request.requestedAuthorityTypes,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizedText);
  const normalizedQuery = [...new Set(explicitTerms)].join(' ');
  return {
    requestId: request.id,
    normalizedQuery,
    queryHash: await sha256ResearchValue({
      normalizedQuery,
      regimeHash: regime.resolutionHash,
      relevantDate: request.relevantDate,
    }),
    explicitTerms: [...new Set(explicitTerms)],
    regimeHash: regime.resolutionHash,
    relevantDate: request.relevantDate,
  };
}

export function projectAbstractLegalQuery(query: string): string {
  return query
    .replace(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/g, '')
    .replace(/\b(?:expediente|exp\.|toca|amparo\s+directo|amparo\s+indirecto)\s*[:\-]?\s*[A-Z0-9\-\/\.]+/gi, '')
    .replace(/\b(?:domicilio|dirección|calle|colonia|c\.p\.)\s*[:\-]?\s*[^,\n]+/gi, '')
    .replace(/\d{1,8}\/\d{2,4}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
