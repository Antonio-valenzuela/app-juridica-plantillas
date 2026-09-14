import {
  sha256ResearchValue,
  stableResearchId,
} from '../canonical';
import type {
  AuthorityCandidate,
  AuthorityType,
  OfficialSourceEvidence,
  ResearchClock,
  SupportedProposition,
} from '../types';
import type {
  LegalResearchProvider,
  LegalResearchRetrieveInput,
  LegalResearchSearchInput,
  ProviderRetrieveResult,
  ProviderSearchResult,
} from './types';

export interface FixtureAuthorityRecord {
  authorityType: AuthorityType;
  citation: string;
  canonicalCitation: string;
  sourceUrl: string;
  sourceDomain: string;
  issuingAuthority: string;
  jurisdiction: string;
  matter: string;
  procedure?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  locator?: string;
  proposition: string;
  content: string;
}

function regimeKey(input: LegalResearchSearchInput): string {
  const { regime } = input;
  return regime.scope === 'STATE' || regime.scope === 'LOCAL'
    ? `${regime.scope}:${regime.federativeEntity?.code || ''}`
    : regime.scope;
}

function candidateFor(
  record: FixtureAuthorityRecord,
  requestId: string,
  clock: ResearchClock,
): AuthorityCandidate {
  return {
    id: stableResearchId('candidate', {
      adapterId: 'FIXTURE_OFFICIAL',
      requestId,
      canonicalCitation: record.canonicalCitation,
      sourceUrl: record.sourceUrl,
      locator: record.locator,
    }),
    requestId,
    authorityType: record.authorityType,
    observedCitation: record.citation,
    canonicalCitationCandidate: record.canonicalCitation,
    sourceUrl: record.sourceUrl,
    sourceDomain: record.sourceDomain,
    sourceTier: 'OFFICIAL_PRIMARY',
    issuingAuthority: record.issuingAuthority,
    jurisdiction: record.jurisdiction,
    matter: record.matter,
    procedure: record.procedure,
    publicationDate: record.publicationDate,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    locator: record.locator,
    retrievedAt: clock().toISOString(),
    metadataStatus: 'COMPLETE',
    candidateStatus: 'DISCOVERED',
  };
}

export function createFixtureOfficialAdapter(
  records: FixtureAuthorityRecord[],
  clock: ResearchClock = () => new Date(),
): LegalResearchProvider {
  const recordsByCandidateId = new Map<string, FixtureAuthorityRecord>();
  return {
    id: 'FIXTURE_OFFICIAL',
    version: '1',
    supportedAuthorityTypes: Array.from(new Set(records.map((record) => record.authorityType))),
    async search(input: LegalResearchSearchInput): Promise<ProviderSearchResult> {
      if (input.regime.status === 'LEGAL_REGIME_UNRESOLVED') {
        return { status: 'FAIL', candidates: [], errorCode: 'LEGAL_REGIME_UNRESOLVED', reasons: ['LEGAL_REGIME_UNRESOLVED'] };
      }
      const key = regimeKey(input);
      const candidates = records
        .filter((record) => record.jurisdiction === key)
        .filter((record) => input.request.requestedAuthorityTypes.includes(record.authorityType))
        .map((record) => {
          const candidate = candidateFor(record, input.request.id, clock);
          recordsByCandidateId.set(candidate.id, record);
          return candidate;
        });
      return { status: 'PASS', candidates, reasons: [] };
    },
    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const record = recordsByCandidateId.get(input.candidateId);
      if (!record) return { status: 'FAIL', errorCode: 'NOT_FOUND', reasons: ['NOT_FOUND'] };
      const candidate = candidateFor(record, input.requestId, clock);
      if (candidate.id !== input.candidateId) {
        return { status: 'FAIL', errorCode: 'REQUEST_SCOPE_MISMATCH', reasons: ['REQUEST_SCOPE_MISMATCH'] };
      }
      const sourceHash = await sha256ResearchValue({ content: record.content });
      const excerptHash = await sha256ResearchValue({ proposition: record.proposition });
      const evidence: OfficialSourceEvidence = {
        sourceUrl: record.sourceUrl,
        sourceDomain: record.sourceDomain,
        sourceTier: 'OFFICIAL_PRIMARY',
        retrievedAt: clock().toISOString(),
        locator: record.locator,
        sourceHash,
        excerptHash,
        isFixture: true,
      };
      return {
        status: 'PASS',
        candidate: { ...candidate, candidateStatus: 'RETRIEVED', evidenceHash: sourceHash, evidenceExcerptHash: excerptHash },
        evidence,
        proposition: {
          text: record.proposition,
          supportLevel: 'DIRECT',
          sourceLocator: record.locator,
          limitations: ['El registro fixture es sintético y no sustituye una fuente oficial real.'],
        } satisfies SupportedProposition,
        reasons: [],
      };
    },
  };
}
