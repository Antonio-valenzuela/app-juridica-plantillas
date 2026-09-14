import type {
  AuthorityCandidate,
  AuthorityType,
  LegalRegimeResolution,
  ResearchVerificationRequest,
  NormalizedResearchQuery,
  OfficialSourceEvidence,
  SupportedProposition,
} from '../types';

export interface LegalResearchSearchInput {
  request: ResearchVerificationRequest;
  query: NormalizedResearchQuery;
  regime: LegalRegimeResolution;
}

export interface LegalResearchRetrieveInput {
  candidateId: string;
  requestId: string;
}

export interface ProviderSearchResult {
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  candidates: AuthorityCandidate[];
  errorCode?: string;
  reasons: string[];
}

export interface ProviderRetrieveResult {
  status: 'PASS' | 'FAIL';
  candidate?: AuthorityCandidate;
  evidence?: OfficialSourceEvidence;
  proposition?: SupportedProposition;
  errorCode?: string;
  reasons: string[];
}

export interface LegalResearchProvider {
  id: 'SCJN' | 'FEDERAL_LEGISLATION' | 'DOF' | 'STATE_OFFICIAL' | 'FIXTURE_OFFICIAL';
  version: string;
  supportedAuthorityTypes: AuthorityType[];
  search(input: LegalResearchSearchInput): Promise<ProviderSearchResult>;
  retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult>;
}
