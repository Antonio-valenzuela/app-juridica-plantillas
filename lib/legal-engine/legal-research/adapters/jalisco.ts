import { createHash } from 'node:crypto';
import { stableResearchId } from '../canonical';
import { normalizeLegalAuthority } from '../legalAuthority';
import type { AuthorityCandidate } from '../types';
import type { LegalResearchProvider, LegalResearchSearchInput, ProviderRetrieveResult } from './types';
import type { OfficialExtractedDocument, OfficialFetch } from './officialJson';

export const JALISCO_CATALOG_URL = 'https://congresoweb.congresojal.gob.mx/BibliotecaVirtual/busquedasleyes/ListadoNvo.cfm';
export const JALISCO_PUBLICATION_SEARCH_URL = 'https://apiperiodico.jalisco.gob.mx/api/newspaper/public';
const hosts = ['congresoweb.congresojal.gob.mx', 'periodicooficial.jalisco.gob.mx', 'apiperiodico.jalisco.gob.mx'];
const hash = (body: Uint8Array | string) => createHash('sha256').update(body).digest('hex');
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface JaliscoAdapterConfig {
  fetch?: OfficialFetch;
  clock?: () => Date;
  timeoutMs?: number;
  searchUrl?: string;
  publicationSearchUrl?: string;
  extractText?: (bytes: Uint8Array, contentType: string, url: string) => Promise<OfficialExtractedDocument>;
}

export function isJaliscoRegime(input: LegalResearchSearchInput): boolean {
  return ['STATE', 'LOCAL'].includes(input.regime.scope) && input.regime.federativeEntity?.code === 'MX-JAL';
}

function allowedUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.includes(url.hostname) || (url.port && url.port !== '443')) throw new Error('JALISCO_DOMAIN_NOT_ALLOWED');
  return url.toString();
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
}

function date(raw: string): string | null {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const value = `${m[3]}-${m[2]}-${m[1]}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Same search/retrieve contract as the federal adapters. Verification remains external. */
export function createJaliscoAdapter(config: JaliscoAdapterConfig = {}): LegalResearchProvider {
  const fetcher = config.fetch || fetch;
  const clock = config.clock || (() => new Date());
  const candidates = new Map<string, AuthorityCandidate>();
  async function download(raw: string) {
    let url = allowedUrl(raw);
    const signal = AbortSignal.timeout(config.timeoutMs || 30000);
    for (let i = 0; i < 4; i++) {
      const response = await fetcher(url, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('JALISCO_REDIRECT_WITHOUT_LOCATION');
        url = allowedUrl(new URL(location, url).toString()); continue;
      }
      if (!response.ok) throw new Error(`JALISCO_HTTP_${response.status}`);
      const effectiveUrl = allowedUrl(response.url || url);
      if (Number(response.headers.get('content-length') || 0) > 15 * 1024 * 1024) throw new Error('JALISCO_DOCUMENT_TOO_LARGE');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 15 * 1024 * 1024) throw new Error('JALISCO_DOCUMENT_TOO_LARGE');
      return { url: effectiveUrl, bytes, contentType: response.headers.get('content-type') || '' };
    }
    throw new Error('JALISCO_TOO_MANY_REDIRECTS');
  }
  return {
    id: 'STATE_OFFICIAL', version: '1', supportedAuthorityTypes: ['CODE', 'STATUTE', 'CONSTITUTION', 'REGULATION'],
    async search(input) {
      if (!isJaliscoRegime(input)) return { status: 'PARTIAL', candidates: [], reasons: ['JALISCO_REGIME_NOT_APPLICABLE'] };
      try {
        const source = await download(config.searchUrl || JALISCO_CATALOG_URL);
        const charset = /charset\s*=\s*["']?([^;\s"'>]+)/i.exec(source.contentType)?.[1] || /charset\s*=\s*["']?([^;\s"'>]+)/i.exec(new TextDecoder().decode(source.bytes.slice(0, 3000)))?.[1] || 'windows-1252';
        const html = new TextDecoder(charset).decode(source.bytes);
        const query = normalize([input.query.normalizedQuery, ...input.query.explicitTerms].join(' '));
        const found: AuthorityCandidate[] = [];
        for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
          const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
          if (cells.length < 6) continue;
          const title = text(cells[0]);
          if (!title || /\b(nacional|federal|anterior)\b/i.test(title) || !query.includes(normalize(title))) continue;
          const authorityType = /^c[oó]digo/i.test(title) ? 'CODE' : /^constituci[oó]n/i.test(title) ? 'CONSTITUTION' : /^reglamento/i.test(title) ? 'REGULATION' : 'STATUTE';
          if (!input.request.requestedAuthorityTypes.includes(authorityType)) continue;
          const href = [...row[1].matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)][0]?.[1];
          if (!href) continue;
          let url: string;
          try { url = allowedUrl(new URL(href.replace(/&amp;/g, '&'), source.url).toString()); } catch { continue; }
          const candidate: AuthorityCandidate = {
            id: stableResearchId('candidate', { provider: 'STATE_OFFICIAL', requestId: input.request.id, title, url }),
            requestId: input.request.id, provider: 'STATE_OFFICIAL', title, identifier: title, authorityType,
            observedCitation: title, canonicalCitationCandidate: title, sourceUrl: url, sourceDomain: new URL(url).hostname,
            sourceTier: 'OFFICIAL_PRIMARY', issuingAuthority: 'Congreso del Estado de Jalisco', jurisdiction: 'STATE:MX-JAL',
            matter: input.regime.matter?.code, procedure: input.regime.procedure?.code,
            retrievedAt: clock().toISOString(), metadataStatus: 'PARTIAL', candidateStatus: 'DISCOVERED',
            stateSource: { kind: 'INSTITUTIONAL_CONSOLIDATED', catalogUrl: source.url, catalogHash: hash(source.bytes), lastModificationDate: date(text(cells[4])), decreeNumber: text(cells[5]) || null, officialPublicationUrl: null, publicationMatch: 'NOT_CHECKED', reviewReasons: ['OFFICIAL_PUBLICATION_NOT_VERIFIED', 'TEMPORAL_REGIME_NOT_VERIFIED'] },
          };
          candidate.normalizedAuthority = normalizeLegalAuthority(candidate);
          candidates.set(candidate.id, candidate); found.push(candidate);
        }
        return { status: found.length ? 'PASS' : 'PARTIAL', candidates: found, reasons: found.length ? [] : ['JALISCO_AUTHORITY_NOT_FOUND'] };
      } catch (error) { const code = error instanceof Error ? error.message : 'JALISCO_RETRIEVAL_ERROR'; return { status: 'FAIL', candidates: [], errorCode: code, reasons: [code] }; }
    },
    async retrieve(input): Promise<ProviderRetrieveResult> {
      const existing = candidates.get(input.candidateId);
      if (!existing || existing.requestId !== input.requestId) return { status: 'FAIL', errorCode: 'REQUEST_SCOPE_MISMATCH', reasons: ['REQUEST_SCOPE_MISMATCH'] };
      try {
        const source = await download(existing.sourceUrl!);
        if (!Buffer.from(source.bytes.slice(0, 5)).equals(Buffer.from('%PDF-'))) throw new Error('JALISCO_EXPECTED_PDF');
        const extracted = config.extractText ? await config.extractText(source.bytes, source.contentType, source.url) : { text: (await (await import('../../../pdf/pdfExtractor')).extractPdfTextServer(Buffer.from(source.bytes))).text };
        if (!extracted.text.trim()) throw new Error('JALISCO_EMPTY_DOCUMENT');
        const stateSource = { ...existing.stateSource!, excerpt: extracted.text.slice(0, 5000) };
        if (stateSource.decreeNumber) {
          try {
            const queryUrl = new URL(config.publicationSearchUrl || JALISCO_PUBLICATION_SEARCH_URL);
            queryUrl.searchParams.set('fecha', ''); queryUrl.searchParams.set('search', stateSource.decreeNumber);
            queryUrl.searchParams.set('page', '1'); queryUrl.searchParams.set('perPage', '10');
            const publication = await download(queryUrl.toString());
            stateSource.publicationSearchUrl = publication.url; stateSource.publicationSearchHash = hash(publication.bytes);
            const result = JSON.parse(new TextDecoder().decode(publication.bytes));
            if (!Array.isArray(result.result?.data)) throw new Error('JALISCO_PUBLICATION_SCHEMA_UNSUPPORTED');
            // A search hit is not proof of identity, effective date or article text.
            stateSource.publicationMatch = result.result.data.length ? 'CANDIDATE_FOUND' : 'NOT_FOUND';
          } catch { stateSource.publicationMatch = 'UNAVAILABLE'; }
        }
        const sourceHash = hash(source.bytes), excerptHash = hash(stateSource.excerpt);
        const candidate: AuthorityCandidate = { ...existing, sourceUrl: source.url, sourceDomain: new URL(source.url).hostname, retrievedAt: clock().toISOString(), candidateStatus: 'RETRIEVED', locator: extracted.locator, evidenceHash: sourceHash, evidenceExcerptHash: excerptHash, stateSource };
        candidate.normalizedAuthority = normalizeLegalAuthority(candidate);
        if (candidate.normalizedAuthority.provenance) Object.assign(candidate.normalizedAuthority.provenance, { sourceHash, locator: candidate.locator });
        return { status: 'PASS', candidate, evidence: { sourceUrl: source.url, sourceDomain: candidate.sourceDomain!, sourceTier: 'OFFICIAL_PRIMARY', retrievedAt: candidate.retrievedAt, sourceHash, excerptHash, locator: candidate.locator }, proposition: { text: stateSource.excerpt, sourceLocator: candidate.locator, supportLevel: extracted.locator ? 'LIMITED' : 'CONTEXT_ONLY', limitations: stateSource.reviewReasons }, reasons: stateSource.reviewReasons };
      } catch (error) { const code = error instanceof Error ? error.message : 'JALISCO_RETRIEVAL_ERROR'; return { status: 'FAIL', errorCode: code, reasons: [code] }; }
    },
  };
}
