import fs from 'node:fs';
import path from 'node:path';
import type { AuthorityCandidate, AuthorityType, LegalResearchRequest, LegalRegimeResolution, NormalizedResearchQuery, SupportedProposition } from '@/lib/legal-engine/legal-research/types';
import type { LexMxCatalogEntry } from '@/lib/legal-engine/legal-research/adapters/lexMx';
import type { LegalResearchSearchInput, ProviderSearchResult } from '@/lib/legal-engine/legal-research/adapters/types';
import { createCorpusIurisAdapter } from '@/lib/legal-engine/legal-research/adapters/corpusIuris';
import { createDofAdapter } from '@/lib/legal-engine/legal-research/adapters/dof';
import { createScjnAdapter } from '@/lib/legal-engine/legal-research/adapters/scjn';
import { normalizeResearchQuery } from '@/lib/legal-engine/legal-research/researchRequest';
import { resolveLegalRegime } from '@/lib/legal-engine/legal-research/regimeResolution';
import { stableResearchId } from '@/lib/legal-engine/legal-research/canonical';

export interface WorkspaceAuthorityResult {
  id: string;
  registroDigital?: string;
  rubro: string;
  tipo: AuthorityCandidate['authorityType'];
  materia?: string;
  epoca?: string;
  instancia?: string;
  snippet?: string;
  source?: AuthorityCandidate['provider'];
  officialUrl?: string;
  verificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'REQUIRES_OFFICIAL_CONFIRMATION' | 'UNKNOWN';
  retrievedAt: string;
}

export interface WorkspaceLibraryItem {
  id: string;
  title: string;
  abbreviation: string;
  lastReform?: string;
  source: 'LEX_MX';
  officialUrl: string;
  referenceUrl?: string;
}

export interface WorkspaceResearchInput extends LegalResearchSearchInput {
  request: LegalResearchRequest;
  query: NormalizedResearchQuery;
  regime: LegalRegimeResolution;
}

export function mapAuthorityCandidateToWorkspaceResult(
  candidate: AuthorityCandidate,
  proposition?: Pick<SupportedProposition, 'text'>,
): WorkspaceAuthorityResult {
  const verificationStatus = candidate.candidateStatus === 'RETRIEVED' && candidate.sourceTier === 'OFFICIAL_PRIMARY'
    ? 'VERIFIED'
    : candidate.sourceTier === 'SECONDARY_SUPPORT' || candidate.provider === 'CORPUS_IURIS'
      ? 'REQUIRES_OFFICIAL_CONFIRMATION'
      : candidate.candidateStatus === 'DISCOVERED'
        ? 'UNVERIFIED'
        : 'UNKNOWN';

  return {
    id: candidate.id,
    registroDigital: candidate.identifier || candidate.locator,
    rubro: candidate.canonicalCitationCandidate || candidate.observedCitation || candidate.title || 'Resultado jurídico',
    tipo: candidate.authorityType,
    materia: candidate.matter,
    snippet: proposition?.text,
    source: candidate.provider,
    officialUrl: candidate.normalizedAuthority?.officialSourceUrl || candidate.sourceUrl,
    verificationStatus,
    retrievedAt: candidate.retrievedAt,
  };
}

export function mapLexMxCatalogToWorkspaceLibraryItem(entry: LexMxCatalogEntry): WorkspaceLibraryItem {
  return {
    id: entry.slug,
    title: entry.titulo,
    abbreviation: entry.sigla,
    lastReform: entry.ultima_reforma,
    source: 'LEX_MX',
    officialUrl: entry.pdf_url,
    referenceUrl: entry.ref_url,
  };
}

export async function buildWorkspaceResearchInput(
  rawQuery: string,
  requestedAuthorityTypes: AuthorityType[],
  relevantDate?: string,
): Promise<WorkspaceResearchInput> {
  const question = rawQuery.trim().replace(/\s+/g, ' ').slice(0, 300);
  const types = [...new Set(requestedAuthorityTypes)].sort();
  const identity = stableResearchId('workspace-research', { question, types, relevantDate });
  const regime = await resolveLegalRegime({
    legalContext: {
      country: { code: 'MX', displayName: 'México' },
      scope: 'FEDERAL',
      matter: types.some((type) => ['JURISPRUDENCE', 'THESIS', 'PRECEDENT'].includes(type))
        ? { code: 'jurisprudencia', displayName: 'Jurisprudencia' }
        : { code: 'legislacion', displayName: 'Legislación' },
      ...(relevantDate ? { relevantDate } : {}),
    },
  });
  const request: LegalResearchRequest = {
    id: identity,
    legalIssueId: identity,
    coverageItemIds: [],
    question,
    jurisdiction: 'federal',
    matter: regime.matter?.code,
    relevantDate,
    temporalPrecision: regime.temporalPrecision,
    requestedAuthorityTypes: types,
    sourceAuthorityMentionIds: [],
    contextHash: identity,
    regimeResolutionId: regime.id,
    status: 'READY_FOR_RETRIEVAL',
    createdAt: new Date().toISOString(),
  };
  const query = await normalizeResearchQuery(request, regime);
  return { request, query, regime };
}

export function filterWorkspaceLibrary(items: WorkspaceLibraryItem[], rawQuery: string): WorkspaceLibraryItem[] {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return items;
  return items.filter((item) => `${item.title} ${item.abbreviation}`.toLocaleLowerCase().includes(query));
}

export function loadWorkspaceLibrary(): WorkspaceLibraryItem[] {
  const catalogPath = path.resolve(process.cwd(), 'data/lex-mx/catalog.json');
  if (!fs.existsSync(catalogPath)) return [];
  try {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as LexMxCatalogEntry[];
    return Array.isArray(catalog) ? catalog.map(mapLexMxCatalogToWorkspaceLibraryItem) : [];
  } catch {
    return [];
  }
}

export async function searchWorkspaceJurisprudence(rawQuery: string): Promise<{
  status: ProviderSearchResult['status'];
  results: WorkspaceAuthorityResult[];
  sourceRepo: string;
  reasons: string[];
}> {
  const input = await buildWorkspaceResearchInput(rawQuery, ['JURISPRUDENCE', 'THESIS', 'PRECEDENT']);
  const corpus = createCorpusIurisAdapter();
  const corpusSearch = await corpus.search(input);
  let search = corpusSearch;
  let sourceRepo = 'Corpus Iuris MCP';
  let provider = corpus;
  let reasons = corpusSearch.reasons.map((reason) => reason === 'CORPUS_IURIS_HTTP_401' ? 'CORPUS_AUTH_REQUIRED' : reason);

  if (search.candidates.length === 0) {
    provider = createScjnAdapter();
    search = await provider.search(input);
    sourceRepo = 'Corpus Iuris MCP + LegalIA-derived SCJN adapter';
    reasons = [...new Set([...reasons, ...search.reasons])];
  }

  const results = await Promise.all(search.candidates.slice(0, 20).map(async (candidate) => {
    const detail = await provider.retrieve({ candidateId: candidate.id, requestId: input.request.id });
    return mapAuthorityCandidateToWorkspaceResult(detail.candidate || candidate, detail.proposition);
  }));

  return { status: search.status, results, sourceRepo, reasons };
}

export async function searchWorkspaceDof(rawQuery: string, date?: string): Promise<{
  status: ProviderSearchResult['status'];
  results: WorkspaceAuthorityResult[];
  reasons: string[];
}> {
  const input = await buildWorkspaceResearchInput(rawQuery, ['OFFICIAL_AGREEMENT'], date);
  const provider = createDofAdapter();
  const search = await provider.search(input);
  const results = await Promise.all(search.candidates.slice(0, 20).map(async (candidate) => {
    const detail = await provider.retrieve({ candidateId: candidate.id, requestId: input.request.id });
    return mapAuthorityCandidateToWorkspaceResult(detail.candidate || candidate, detail.proposition);
  }));
  return { status: search.status, results, reasons: search.reasons };
}
