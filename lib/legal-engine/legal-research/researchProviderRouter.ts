import type { AuthorityCandidate } from './types';
import type {
  LegalResearchProvider,
  LegalResearchRetrieveInput,
  LegalResearchSearchInput,
  ProviderRetrieveResult,
  ProviderSearchResult,
} from './adapters/types';
import { createDefaultCorpusIurisAdapter, type CorpusIurisAdapterConfig } from './adapters/corpusIuris';
import { createFederalLegislationAdapter, type FederalLegislationAdapterConfig } from './adapters/federalLegislation';
import { createScjnAdapter, type ScjnAdapterConfig } from './adapters/scjn';
import { createDofAdapter, type DofAdapterConfig } from './adapters/dof';
import { createLexMxAdapter, type LexMxAdapterConfig } from './adapters/lexMx';

export interface ResearchProviderRouterConfig {
  discoveryProvider: LegalResearchProvider | LegalResearchProvider[];
  officialProviders: LegalResearchProvider[];
}

function normalize(value?: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchCandidate(discovered: AuthorityCandidate, official: AuthorityCandidate): boolean {
  const discoveredKeys = [discovered.identifier, discovered.canonicalCitationCandidate, discovered.observedCitation, discovered.sourceUrl]
    .map(normalize)
    .filter(Boolean);
  const officialKeys = [official.identifier, official.canonicalCitationCandidate, official.observedCitation, official.sourceUrl]
    .map(normalize)
    .filter(Boolean);
  return discoveredKeys.some((key) => officialKeys.some((candidateKey) => key === candidateKey));
}

export function createResearchProviderRouter(config: ResearchProviderRouterConfig): LegalResearchProvider {
  const discoveryProviders = Array.isArray(config.discoveryProvider)
    ? config.discoveryProvider
    : [config.discoveryProvider];
  const officialByDiscoveryId = new Map<string, AuthorityCandidate>();
  const providerByOfficialCandidateId = new Map<string, LegalResearchProvider>();
  const providerByDiscoveryCandidateId = new Map<string, LegalResearchProvider>();
  const requestByDiscoveryId = new Map<string, string>();

  return {
    id: 'RESEARCH_ROUTER',
    version: '1',
    supportedAuthorityTypes: Array.from(new Set(config.officialProviders.flatMap((provider) => provider.supportedAuthorityTypes))),
    async search(input: LegalResearchSearchInput): Promise<ProviderSearchResult> {
      // 1. Descubrimiento secundario (Corpus Iuris / lex-mx)
      const discoveryResults = await Promise.all(
        discoveryProviders.map(async (provider) => {
          try {
            return await provider.search(input);
          } catch (error) {
            return {
              status: 'FAIL',
              candidates: [],
              errorCode: 'DISCOVERY_ERROR',
              reasons: [error instanceof Error ? error.message : 'DISCOVERY_ERROR'],
            } satisfies ProviderSearchResult;
          }
        }),
      );

      const allDiscoveredCandidates: AuthorityCandidate[] = [];
      for (let i = 0; i < discoveryProviders.length; i++) {
        const provider = discoveryProviders[i];
        const res = discoveryResults[i];
        for (const candidate of res.candidates) {
          providerByDiscoveryCandidateId.set(candidate.id, provider);
          allDiscoveredCandidates.push(candidate);
        }
      }

      if (allDiscoveredCandidates.length === 0 && discoveryResults.every((r) => r.status === 'FAIL')) {
        return discoveryResults[0] || { status: 'FAIL', candidates: [], reasons: ['NO_DISCOVERY_CANDIDATES'] };
      }

      // 2. Verificación en fuentes oficiales primarias (Cámara de Diputados / SCJN / DOF)
      const officialEntries = config.officialProviders
        .filter((provider) => input.request.requestedAuthorityTypes.some((type) => provider.supportedAuthorityTypes.includes(type)));
      const officialSearches = await Promise.all(officialEntries.map(async (provider) => {
        try { return await provider.search(input); }
        catch (error) {
          return { status: 'FAIL', candidates: [], errorCode: 'OFFICIAL_ADAPTER_ERROR', reasons: [error instanceof Error ? error.message : 'OFFICIAL_ADAPTER_ERROR'] } satisfies ProviderSearchResult;
        }
      }));
      const officialCandidates = officialSearches.flatMap((result, index) => {
        const provider = officialEntries[index];
        result.candidates.forEach((candidate) => providerByOfficialCandidateId.set(candidate.id, provider));
        return result.candidates;
      });

      for (const candidate of allDiscoveredCandidates) {
        requestByDiscoveryId.set(candidate.id, input.request.id);
        const matched = officialCandidates.find((official) => matchCandidate(candidate, official));
        if (matched) officialByDiscoveryId.set(candidate.id, matched);
      }

      return {
        status: allDiscoveredCandidates.length > 0 ? 'PASS' : 'PARTIAL',
        candidates: allDiscoveredCandidates,
        reasons: allDiscoveredCandidates.length > 0 ? [] : ['NO_AUTHORITY_FOUND'],
      };
    },
    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const official = officialByDiscoveryId.get(input.candidateId);
      if (!official || requestByDiscoveryId.get(input.candidateId) !== input.requestId) {
        return { status: 'FAIL', errorCode: 'NON_OFFICIAL_ONLY', reasons: ['OFFICIAL_VERIFICATION_NOT_FOUND'] };
      }
      const officialProvider = providerByOfficialCandidateId.get(official.id)
        || config.officialProviders.find((provider) => provider.id === official.provider);
      if (!officialProvider) {
        return { status: 'FAIL', errorCode: 'NON_OFFICIAL_ONLY', reasons: ['OFFICIAL_VERIFICATION_NOT_FOUND'] };
      }
      try {
        const result = await officialProvider.retrieve({ candidateId: official.id, requestId: input.requestId });
        if (result.status !== 'PASS' || !result.candidate || !result.evidence) {
          return { status: 'FAIL', errorCode: result.errorCode || 'NON_OFFICIAL_ONLY', reasons: result.reasons.length ? result.reasons : ['OFFICIAL_VERIFICATION_NOT_FOUND'] };
        }
        return result;
      } catch (error) {
        return { status: 'FAIL', errorCode: 'OFFICIAL_ADAPTER_ERROR', reasons: [error instanceof Error ? error.message : 'OFFICIAL_ADAPTER_ERROR'] };
      }
    },
  };
}

export interface DefaultResearchProviderRouterConfig {
  corpus?: Omit<CorpusIurisAdapterConfig, 'token'>;
  lexMx?: LexMxAdapterConfig;
  federal?: FederalLegislationAdapterConfig;
  scjn?: ScjnAdapterConfig;
  dof?: DofAdapterConfig;
}

export function createDefaultResearchProviderRouter(config: DefaultResearchProviderRouterConfig = {}): LegalResearchProvider {
  const discoveryProviders: LegalResearchProvider[] = [
    createDefaultCorpusIurisAdapter(config.corpus),
    createLexMxAdapter(config.lexMx || {}),
  ];
  const officialProviders: LegalResearchProvider[] = [
    createFederalLegislationAdapter(config.federal || {}),
    createScjnAdapter(config.scjn || {}),
    createDofAdapter(config.dof || {}),
  ];
  return createResearchProviderRouter({ discoveryProvider: discoveryProviders, officialProviders });
}
