import { describe, expect, it } from 'vitest';
import { createDefaultResearchProviderRouter } from '@/lib/legal-engine/legal-research/researchProviderRouter';
import type { LegalResearchSearchInput } from '@/lib/legal-engine/legal-research/adapters/types';
import { createJaliscoAdapter } from '@/lib/legal-engine/legal-research/adapters/jalisco';
import { verifyAuthorityCandidate } from '@/lib/legal-engine/legal-research/authorityVerification';

const input: LegalResearchSearchInput = {
  regime: { id: 'jal', status: 'RESOLVED', scope: 'STATE', federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' }, matter: { code: 'civil', displayName: 'Civil' }, relevantDate: '2026-10-02', temporalPrecision: 'DAY', fieldEvidence: [], unresolvedFields: [], resolutionHash: 'jal-hash' },
  request: { id: 'req-jal', legalIssueId: 'issue-jal', coverageItemIds: [], question: 'Código de Procedimientos Civiles del Estado de Jalisco', requestedAuthorityTypes: ['CODE'], sourceAuthorityMentionIds: [], contextHash: 'ctx', regimeResolutionId: 'jal', status: 'READY_FOR_RETRIEVAL', createdAt: '2026-10-02T00:00:00Z' },
  query: { requestId: 'req-jal', normalizedQuery: 'Código de Procedimientos Civiles del Estado de Jalisco', explicitTerms: ['Código de Procedimientos Civiles del Estado de Jalisco'], queryHash: 'query', regimeHash: 'jal-hash' },
};
const catalog = '<table><tr><td class="leyreg">Código de Procedimientos Civiles del Estado de Jalisco</td><td><a href="../legislacion/Codigos/cpc.doc">Word</a></td><td><a href="../legislacion/Codigos/cpc.pdf">PDF</a></td><td></td><td>05/09/2023</td><td>A.I. 9/2022</td></tr></table>';
const fetchCatalog = async () => new Response(catalog, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('Jalisco official research', () => {
  it('discovers institutional Jalisco legislation directly through the existing default router', async () => {
    const config = { federal: { fetch: fetchCatalog }, scjn: { fetch: fetchCatalog }, dof: { fetch: fetchCatalog }, corpus: { fetch: fetchCatalog }, lexMx: { catalog: [] }, jalisco: { fetch: fetchCatalog } };
    const found = await createDefaultResearchProviderRouter(config).search(input);
    expect(found.candidates.some(c => c.provider === 'STATE_OFFICIAL' && c.title === input.request.question)).toBe(true);
    expect(found.candidates.find(c => c.provider === 'STATE_OFFICIAL')?.normalizedAuthority?.verificationStatus).toBe('UNVERIFIED');
  });

  it('retrieves a snapshot with localized passage but does not verify institutional consolidation', async () => {
    const adapter = createJaliscoAdapter({ fetch: async url => String(url).includes('Listado') ? fetchCatalog() : String(url).includes('/api/') ? new Response('{"result":{"data":[]}}') : new Response('%PDF-test', { headers: { 'content-type': 'application/pdf' } }), extractText: async () => ({ text: 'Artículo 42. Los escritos deben presentarse firmados.', locator: 'artículo 42' }) });
    const candidate = (await adapter.search(input)).candidates[0];
    const result = await adapter.retrieve({ candidateId: candidate.id, requestId: input.request.id });
    expect(result.status).toBe('PASS');
    expect(result.candidate).toMatchObject({ metadataStatus: 'PARTIAL', jurisdiction: 'STATE:MX-JAL', candidateStatus: 'RETRIEVED', stateSource: { kind: 'INSTITUTIONAL_CONSOLIDATED', lastModificationDate: '2023-09-05', decreeNumber: 'A.I. 9/2022', publicationMatch: 'NOT_FOUND' } });
    expect(result.evidence?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.candidate?.normalizedAuthority?.provenance).toMatchObject({ origin: 'OFFICIAL_RETRIEVED', stage: 'RETRIEVED', sourceHash: result.evidence?.sourceHash, locator: 'artículo 42' });
    const verification = await verifyAuthorityCandidate({ ...result, request: input.request, regime: input.regime });
    expect(verification.verifiedAuthority).toBeUndefined();
    expect(verification.rejection?.reasons).toContain('INSUFFICIENT_METADATA');
    expect(result.candidate?.effectiveFrom).toBeUndefined();
  });

  it('rejects a secondary/blog URL before fetching it', async () => {
    const adapter = createJaliscoAdapter({ fetch: async () => new Response(catalog.replace('../legislacion/Codigos/cpc.pdf', 'https://blog.example/cpc.pdf')) });
    const result = await adapter.search(input);
    expect(result.candidates).toHaveLength(0);
  });

  it('rejects an off-domain redirect and never follows it', async () => {
    const urls: string[] = [];
    const adapter = createJaliscoAdapter({ fetch: async url => { urls.push(String(url)); return new Response(null, { status: 302, headers: { location: 'https://blog.example/cpc.pdf' } }); } });
    expect((await adapter.search(input)).errorCode).toBe('JALISCO_DOMAIN_NOT_ALLOWED');
    expect(urls).toHaveLength(1);
  });

  it('does not query Jalisco in a federal regime', async () => {
    const urls: string[] = [];
    const adapter = createJaliscoAdapter({ fetch: async url => { urls.push(String(url)); return fetchCatalog(); } });
    const result = await adapter.search({ ...input, regime: { ...input.regime, scope: 'FEDERAL' } });
    expect(result.candidates).toHaveLength(0); expect(urls).toHaveLength(0);
  });

  it('does not route federal requests to the Jalisco provider', async () => {
    const urls: string[] = [];
    const fetch = async (url: RequestInfo | URL) => { urls.push(String(url)); return fetchCatalog(); };
    const router = createDefaultResearchProviderRouter({ corpus: { fetch }, lexMx: { catalog: [] }, federal: { fetch }, scjn: { fetch }, dof: { fetch }, jalisco: { fetch } });
    await router.search({ ...input, regime: { ...input.regime, scope: 'FEDERAL' } });
    expect(urls.some(url => url.includes('congresojal'))).toBe(false);
  });

  it('prevents retrieval under a different research request', async () => {
    const adapter = createJaliscoAdapter({ fetch: fetchCatalog });
    const candidate = (await adapter.search(input)).candidates[0];
    expect((await adapter.retrieve({ candidateId: candidate.id, requestId: 'other' })).errorCode).toBe('REQUEST_SCOPE_MISMATCH');
  });

  it('decodes the actual Latin-1 catalog charset and preserves accents in URLs', async () => {
    const adapter = createJaliscoAdapter({ fetch: async () => new Response(Buffer.from(catalog, 'latin1'), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }) });
    expect((await adapter.search(input)).candidates[0]?.title).toBe('Código de Procedimientos Civiles del Estado de Jalisco');
  });

  it('does not invent a decree or date when the table cells are empty', async () => {
    const adapter = createJaliscoAdapter({ fetch: async () => new Response(catalog.replace('05/09/2023', '').replace('A.I. 9/2022', '')) });
    expect((await adapter.search(input)).candidates[0]?.stateSource).toMatchObject({ lastModificationDate: null, decreeNumber: null });
  });

  it('does not label a national code in the state catalog as Jalisco legislation', async () => {
    const national = 'Código Nacional de Procedimientos Penales';
    const adapter = createJaliscoAdapter({ fetch: async () => new Response(catalog.replace(input.request.question, national)) });
    expect((await adapter.search({ ...input, query: { ...input.query, normalizedQuery: national, explicitTerms: [national] } })).candidates).toHaveLength(0);
  });

  it('treats search hits without verified publication content as candidates, not MATCHED', async () => {
    const adapter = createJaliscoAdapter({ fetch: async url => String(url).includes('Listado') ? fetchCatalog() : String(url).includes('/api/') ? new Response('{"result":{"data":[{"title":"A.I. 9/2022"}]}}') : new Response('%PDF-test', { headers: { 'content-type': 'application/pdf' } }), extractText: async () => ({ text: 'Artículo 42. Texto de prueba.', locator: 'artículo 42' }) });
    const c = (await adapter.search(input)).candidates[0];
    const result = await adapter.retrieve({ candidateId: c.id, requestId: input.request.id });
    expect(result.candidate?.stateSource?.publicationMatch).toBe('CANDIDATE_FOUND');
    expect(result.candidate?.metadataStatus).toBe('PARTIAL');
    expect(result.candidate?.normalizedAuthority?.verificationStatus).toBe('UNVERIFIED');
  });
});
