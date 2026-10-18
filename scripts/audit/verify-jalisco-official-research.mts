import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createResearchProviderRouter } from '../../lib/legal-engine/legal-research/researchProviderRouter';
import { createJaliscoAdapter } from '../../lib/legal-engine/legal-research/adapters/jalisco';
import { verifyAuthorityCandidate } from '../../lib/legal-engine/legal-research/authorityVerification';
import { buildLegalResearchBundle } from '../../lib/legal-engine/legal-research/researchBundle';
import { extractPdfTextServer } from '../../lib/pdf/pdfExtractor';
import type { LegalResearchSearchInput } from '../../lib/legal-engine/legal-research/adapters/types';

const root = path.resolve('audit/jalisco-official-research');
await mkdir(root, { recursive: true });
const dir = path.join(root, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(dir, { recursive: false });
const snapshots: object[] = [];
const persist = (name: string, value: unknown) => writeFile(path.join(dir, name), JSON.stringify(value, null, 2));
const input: LegalResearchSearchInput = {
  regime: { id: 'real-jalisco-civil', status: 'RESOLVED', country: { code: 'MX', displayName: 'México' }, scope: 'STATE', federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' }, matter: { code: 'civil', displayName: 'Civil' }, procedure: { code: 'ordinario', displayName: 'Civil ordinario' }, relevantDate: '2026-10-02', temporalPrecision: 'DAY', fieldEvidence: [], unresolvedFields: [], resolutionHash: 'jalisco-real-verification-2026-10-02' },
  request: { id: 'real-jalisco-procedural-request', legalIssueId: 'real-jalisco-formal-promotion', coverageItemIds: [], question: 'Código de Procedimientos Civiles del Estado de Jalisco', requestedAuthorityTypes: ['CODE'], sourceAuthorityMentionIds: [], jurisdiction: 'STATE:MX-JAL', matter: 'civil', relevantDate: '2026-10-02', contextHash: 'source-retrieval-not-a-case', regimeResolutionId: 'real-jalisco-civil', status: 'READY_FOR_RETRIEVAL', createdAt: new Date().toISOString() },
  query: { requestId: 'real-jalisco-procedural-request', normalizedQuery: 'Código de Procedimientos Civiles del Estado de Jalisco', explicitTerms: ['Código de Procedimientos Civiles del Estado de Jalisco'], queryHash: 'real-jalisco-query', regimeHash: 'jalisco-real-verification-2026-10-02' },
};
const adapter = createJaliscoAdapter({
  fetch: async (url, init) => {
    const response = await fetch(url, init);
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const file = `snapshot-${snapshots.length + 1}${response.headers.get('content-type')?.includes('pdf') ? '.pdf' : '.bin'}`;
    await writeFile(path.join(dir, file), bytes);
    snapshots.push({ requestedUrl: String(url), effectiveUrl: response.url, status: response.status, retrievedAt: new Date().toISOString(), sha256, file, bytes: bytes.length, contentType: response.headers.get('content-type') });
    return response;
  },
  extractText: async bytes => {
    const document = await extractPdfTextServer(Buffer.from(bytes));
    await writeFile(path.join(dir, 'source-text.txt'), document.text);
    // Select only after extraction; no article number or proposition comes from memory.
    const passages = [...document.text.matchAll(/Art[ií]culo\s+(\d+)[ºo°.]?\s*[-.—]?([\s\S]*?)(?=Art[ií]culo\s+\d+|$)/gi)];
    const selected = passages.find(m => /\bescritos\b|\bpromociones\b/i.test(m[0]));
    if (!selected) return { text: document.text };
    await persist('selected-passage.json', { article: selected[1], locator: `artículo ${selected[1]}`, text: selected[0], selectionBasis: 'First extracted article mentioning escritos/promociones; pertinence and temporal regime still require review.' });
    return { text: selected[0], locator: `artículo ${selected[1]}` };
  },
});
// Exercise the existing router without requiring secondary service credentials.
const router = createResearchProviderRouter({ discoveryProvider: [], officialProviders: [adapter] });
try {
  await persist('input.json', input);
  const search = await router.search(input); await persist('search.json', search);
  if (!search.candidates.length) throw new Error(search.errorCode || 'JALISCO_AUTHORITY_NOT_FOUND');
  const candidate = search.candidates[0];
  const retrieved = await router.retrieve({ candidateId: candidate.id, requestId: input.request.id });
  await persist('retrieved.json', retrieved);
  if (retrieved.status !== 'PASS') throw new Error(retrieved.errorCode || 'JALISCO_RETRIEVAL_FAILED');
  const verification = await verifyAuthorityCandidate({ ...retrieved, request: input.request, regime: input.regime });
  await persist('verification.json', verification);
  const bundle = await buildLegalResearchBundle({ request: input.request as import('../../lib/legal-engine/legal-research/types').LegalResearchRequest, regime: input.regime, verifications: [verification] });
  await persist('research-bundle.json', bundle);
  const report = { run: path.basename(dir), state: verification.verifiedAuthority ? 'VERIFIED' : 'RETRIEVED_REVIEW_REQUIRED', authorityUse: verification.verifiedAuthority ? 'ELIGIBLE_FOR_EXISTING_AUTHORITY_USE_CHECKS' : 'BLOCKED_NO_VERIFIED_AUTHORITY', externalGenerationRuns: 0, candidateId: candidate.id, reasons: verification.rejection?.reasons || [], stateSource: retrieved.candidate?.stateSource, sourceHash: retrieved.evidence?.sourceHash, snapshots };
  await persist('report.json', report);
  console.log(JSON.stringify({ directory: dir, ...report }, null, 2));
} catch (error) { await persist('failure.json', { error: String(error), snapshots }); throw error; }
