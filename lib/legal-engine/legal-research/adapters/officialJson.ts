import { createHash } from 'node:crypto';
import { sha256ResearchValue, stableResearchId } from '../canonical';
import type { AuthorityCandidate, AuthorityType, OfficialSourceEvidence, SupportedProposition } from '../types';
import type {
  LegalResearchProvider,
  LegalResearchSearchInput,
  LegalResearchRetrieveInput,
  ProviderRetrieveResult,
  ProviderSearchResult,
} from './types';

export type OfficialFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OfficialRecord {
  id?: string;
  identifier?: string;
  citation?: string;
  title?: string;
  canonicalCitation?: string;
  url?: string;
  detailUrl?: string;
  locator?: string;
  authorityType?: AuthorityType;
  issuingAuthority?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  proposition?: string;
  text?: string;
  content?: string;
  matter?: string;
  procedure?: string;
  jurisdiction?: string;
}

export interface OfficialExtractedDocument {
  text: string;
  supportLevel?: SupportedProposition['supportLevel'];
  limitations?: string[];
  locator?: string;
  identifier?: string;
  title?: string;
  citation?: string;
  authorityType?: AuthorityType;
  issuingAuthority?: string;
  publicationDate?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface OfficialAdapterConfig {
  searchUrl: string;
  allowedDomains: readonly string[];
  fetch?: OfficialFetch;
  clock?: () => Date;
  headers?: HeadersInit;
  timeoutMs?: number;
  searchFormat?: 'AUTO' | 'JSON' | 'HTML';
  extractText?: (body: Uint8Array, contentType: string, url: string) => Promise<OfficialExtractedDocument>;
}

function allowed(raw: string, domains: readonly string[]): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && domains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function officialUrl(raw: string, domains: readonly string[]): string {
  if (!allowed(raw, domains)) throw new Error('OFFICIAL_DOMAIN_NOT_ALLOWED');
  return new URL(raw).toString();
}

function responseContentType(response: Response): string {
  return (response.headers.get('content-type') || '').toLowerCase();
}

function responseError(status: number): string {
  if (status === 404) return 'OFFICIAL_NOT_FOUND';
  if (status === 401 || status === 403) return 'OFFICIAL_ACCESS_BLOCKED';
  return 'OFFICIAL_HTTP_ERROR';
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
  return match ? decodeHtml(match[1].trim()) : undefined;
}

function field(html: string, name: string): string | undefined {
  const data = new RegExp(`<[^>]*data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i').exec(html);
  if (data) return stripHtml(data[1]);
  const meta = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i').exec(html);
  return meta ? decodeHtml(meta[1].trim()) : undefined;
}

function authorityType(value: string | undefined, fallback: AuthorityType): AuthorityType {
  const normalized = value?.trim().toUpperCase();
  const supported: AuthorityType[] = ['CONSTITUTION', 'STATUTE', 'CODE', 'REGULATION', 'JURISPRUDENCE', 'THESIS', 'PRECEDENT', 'OFFICIAL_AGREEMENT', 'OTHER_OFFICIAL_SOURCE'];
  return normalized && supported.includes(normalized as AuthorityType) ? normalized as AuthorityType : fallback;
}

function identifierFromUrl(raw: string): string | undefined {
  const parts = new URL(raw).pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? decodeURIComponent(last).replace(/\.pdf$/i, '') : undefined;
}

function parseHtmlRecords(
  html: string,
  baseUrl: string,
  input: LegalResearchSearchInput,
  providerId: 'SCJN' | 'FEDERAL_LEGISLATION',
  domains: readonly string[],
): OfficialRecord[] {
  const fallbackType = input.request.requestedAuthorityTypes[0] || (providerId === 'SCJN' ? 'THESIS' : 'STATUTE');
  const records: OfficialRecord[] = [];
  const anchors = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchors.exec(html))) {
    const attrs = `${match[1]} ${match[3]}`;
    const sourceUrl = officialUrl(new URL(decodeHtml(match[2]), baseUrl).toString(), domains);
    const anchorText = stripHtml(match[4]);
    const id = attribute(attrs, 'data-id') || attribute(attrs, 'data-registro-digital') || identifierFromUrl(sourceUrl);
    records.push({
      id,
      identifier: id,
      citation: attribute(attrs, 'data-citation') || attribute(attrs, 'data-title') || anchorText,
      title: attribute(attrs, 'data-title') || anchorText,
      canonicalCitation: attribute(attrs, 'data-citation') || attribute(attrs, 'data-title') || anchorText,
      url: sourceUrl,
      detailUrl: sourceUrl,
      locator: attribute(attrs, 'data-locator') || attribute(attrs, 'data-registro-digital') || id,
      authorityType: authorityType(attribute(attrs, 'data-authority-type'), fallbackType),
      issuingAuthority: attribute(attrs, 'data-issuing-authority') || (providerId === 'SCJN' ? 'Suprema Corte de Justicia de la Nación' : 'Cámara de Diputados'),
      publicationDate: attribute(attrs, 'data-publication-date'),
      effectiveFrom: attribute(attrs, 'data-effective-from'),
      effectiveTo: attribute(attrs, 'data-effective-to'),
      matter: attribute(attrs, 'data-matter'),
      procedure: attribute(attrs, 'data-procedure'),
      jurisdiction: attribute(attrs, 'data-jurisdiction') || input.regime.scope,
    });
  }
  if (records.length === 0) throw new Error('OFFICIAL_PARSE_FAILED');
  return records;
}

function listJson(value: unknown): OfficialRecord[] {
  if (Array.isArray(value)) return value as OfficialRecord[];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['results', 'items', 'data', 'records']) {
      if (Array.isArray(record[key])) return record[key] as OfficialRecord[];
    }
  }
  throw new Error('OFFICIAL_PARSE_FAILED');
}

function propositionText(record: OfficialRecord): string {
  return String(record.proposition || record.text || record.content || '').trim();
}

function makeCandidate(record: OfficialRecord, input: LegalResearchSearchInput, id: AuthorityCandidate['provider'] & string, clock: () => Date): AuthorityCandidate {
  const source = record.url || record.detailUrl;
  return {
    id: stableResearchId('candidate', { adapterId: id, requestId: input.request.id, source, locator: record.locator, citation: record.canonicalCitation || record.citation || record.title }),
    requestId: input.request.id,
    provider: id,
    identifier: record.identifier || record.locator || record.id,
    title: record.title || record.citation || record.canonicalCitation,
    authorityType: record.authorityType || input.request.requestedAuthorityTypes[0] || 'OTHER_OFFICIAL_SOURCE',
    observedCitation: record.citation || record.title || record.canonicalCitation || '',
    canonicalCitationCandidate: record.canonicalCitation || record.citation || record.title,
    sourceUrl: source,
    sourceDomain: source ? new URL(source).hostname : undefined,
    sourceTier: 'OFFICIAL_PRIMARY',
    issuingAuthority: record.issuingAuthority,
    jurisdiction: record.jurisdiction || input.regime.scope,
    matter: record.matter || input.regime.matter?.code,
    procedure: record.procedure || input.regime.procedure?.code,
    publicationDate: record.publicationDate,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    locator: record.locator || record.identifier || record.id,
    retrievedAt: clock().toISOString(),
    metadataStatus: source && record.citation && record.issuingAuthority ? 'COMPLETE' : 'PARTIAL',
    candidateStatus: 'DISCOVERED',
  };
}

export function createOfficialJsonAdapter(config: OfficialAdapterConfig & { id: 'SCJN' | 'FEDERAL_LEGISLATION'; supportedAuthorityTypes: AuthorityType[] }): LegalResearchProvider {
  const fetcher = config.fetch || fetch;
  const clock = config.clock || (() => new Date());
  const timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs || 0) >= 1000 ? Number(config.timeoutMs) : 15000;
  const byId = new Map<string, { candidate: AuthorityCandidate; record: OfficialRecord }>();

  const get = async (raw: string): Promise<{ response: Response; finalUrl: string }> => {
    let current = officialUrl(raw, config.allowedDomains);
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetcher(current, { headers: config.headers, signal: controller.signal, redirect: 'manual' });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw new Error(`OFFICIAL_TIMEOUT_${timeoutMs}MS`);
        throw new Error(error instanceof Error ? error.message : 'OFFICIAL_HTTP_ERROR');
      } finally {
        clearTimeout(timeoutId);
      }

      const responseUrl = response.url || current;
      if (!allowed(responseUrl, config.allowedDomains)) throw new Error('OFFICIAL_DOMAIN_NOT_ALLOWED');
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('OFFICIAL_REDIRECT_REJECTED');
        const next = new URL(location, current).toString();
        if (!allowed(next, config.allowedDomains)) throw new Error('OFFICIAL_REDIRECT_REJECTED');
        current = next;
        continue;
      }
      if (!response.ok) throw new Error(responseError(response.status));
      return { response, finalUrl: responseUrl };
    }
    throw new Error('OFFICIAL_REDIRECT_REJECTED');
  };

  const retrieveDocument = async (candidate: AuthorityCandidate, record: OfficialRecord): Promise<ProviderRetrieveResult> => {
    if (!candidate.sourceUrl) return { status: 'FAIL', errorCode: 'OFFICIAL_NOT_FOUND', reasons: ['OFFICIAL_NOT_FOUND'] };
    try {
      const { response, finalUrl } = await get(candidate.sourceUrl);
      const contentType = responseContentType(response);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error('OFFICIAL_PARSE_FAILED');
      let extracted: OfficialExtractedDocument;
      if (config.extractText) {
        extracted = await config.extractText(bytes, contentType, finalUrl);
      } else if (contentType.includes('pdf') || /\.pdf(?:$|\?)/i.test(finalUrl)) {
        const { extractPdfTextServer } = await import('@/lib/pdf/pdfExtractor');
        const parsed = await extractPdfTextServer(Buffer.from(bytes));
        extracted = {
          text: parsed.text,
          locator: candidate.locator,
          supportLevel: 'LIMITED',
          limitations: ['Se extrajo el documento oficial completo; falta localizar y validar el fragmento normativo pertinente.'],
        };
      } else {
        const body = new TextDecoder().decode(bytes);
        const identifier = field(body, 'registro-digital') || /registro\s+digital\s*[:#]?\s*(\d+)/i.exec(stripHtml(body))?.[1];
        const title = field(body, 'og:title') || field(body, 'title') || field(body, 'rubro');
        const type = field(body, 'tipo');
        const proposition = field(body, 'texto') || field(body, 'proposicion') || stripHtml(body);
        extracted = {
          text: proposition,
          identifier,
          locator: identifier || candidate.locator,
          title,
          citation: title,
          authorityType: authorityType(type, candidate.authorityType),
          issuingAuthority: field(body, 'organo') || field(body, 'issuing-authority'),
          publicationDate: field(body, 'publicacion') || field(body, 'publication-date'),
        };
      }
      const content = extracted.text.trim();
      if (!content) throw new Error('OFFICIAL_PARSE_FAILED');
      const requestedIdentifier = candidate.locator || record.identifier || record.id;
      if (extracted.identifier && requestedIdentifier && extracted.identifier !== requestedIdentifier) {
        throw new Error('OFFICIAL_VERIFICATION_FAILED');
      }
      const sourceHash = createHash('sha256').update(bytes).digest('hex');
      const excerptHash = await sha256ResearchValue({ text: content, locator: extracted.locator || candidate.locator });
      const mergedCandidate: AuthorityCandidate = {
        ...candidate,
        observedCitation: extracted.citation || extracted.title || candidate.observedCitation,
        canonicalCitationCandidate: extracted.citation || extracted.title || candidate.canonicalCitationCandidate,
        title: extracted.title || candidate.title,
        authorityType: extracted.authorityType || candidate.authorityType,
        issuingAuthority: extracted.issuingAuthority || candidate.issuingAuthority,
        publicationDate: extracted.publicationDate || candidate.publicationDate,
        effectiveFrom: extracted.effectiveFrom || candidate.effectiveFrom,
        effectiveTo: extracted.effectiveTo || candidate.effectiveTo,
        locator: extracted.locator || candidate.locator,
        retrievedAt: clock().toISOString(),
        evidenceHash: sourceHash,
        evidenceExcerptHash: excerptHash,
        metadataStatus: candidate.sourceUrl && (extracted.citation || extracted.title || candidate.observedCitation) && (extracted.issuingAuthority || candidate.issuingAuthority) ? 'COMPLETE' : 'PARTIAL',
        candidateStatus: 'RETRIEVED',
      };
      const evidence: OfficialSourceEvidence = {
        sourceUrl: finalUrl,
        sourceDomain: new URL(finalUrl).hostname,
        sourceTier: 'OFFICIAL_PRIMARY',
        retrievedAt: mergedCandidate.retrievedAt,
        locator: mergedCandidate.locator,
        sourceHash,
        excerptHash,
      };
      const proposition: SupportedProposition = {
        text: propositionText(record) || content,
        supportLevel: extracted.supportLevel || (propositionText(record) ? 'DIRECT' : 'LIMITED'),
        sourceLocator: mergedCandidate.locator,
        limitations: extracted.limitations || (propositionText(record) || extracted.supportLevel === 'DIRECT' ? [] : ['La fuente no expuso un fragmento jurídico localizado.']),
      };
      return { status: 'PASS', candidate: mergedCandidate, evidence, proposition, reasons: [] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'OFFICIAL_HTTP_ERROR';
      return { status: 'FAIL', errorCode: reason, reasons: [reason] };
    }
  };

  return {
    id: config.id,
    version: '2',
    supportedAuthorityTypes: config.supportedAuthorityTypes,
    async search(input): Promise<ProviderSearchResult> {
      if (input.regime.status === 'LEGAL_REGIME_UNRESOLVED') return { status: 'FAIL', candidates: [], errorCode: 'LEGAL_REGIME_UNRESOLVED', reasons: ['LEGAL_REGIME_UNRESOLVED'] };
      try {
        const searchUrl = new URL(config.searchUrl);
        const staticOfficialIndex = /\.pdf$/i.test(searchUrl.pathname)
          || /\/LeyesBiblio\/?$/i.test(searchUrl.pathname)
          || (searchUrl.hostname.toLowerCase() === 'sjfsemanal.scjn.gob.mx' && /\/?$/.test(searchUrl.pathname));
        if ((config.searchFormat || 'AUTO') === 'JSON' || !staticOfficialIndex) searchUrl.searchParams.set('q', input.query.normalizedQuery);
        const { response, finalUrl } = await get(searchUrl.toString());
        const contentType = responseContentType(response);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === 0) throw new Error('OFFICIAL_PARSE_FAILED');
        let records: OfficialRecord[];
        if (contentType.includes('pdf') || /\.pdf(?:$|\?)/i.test(finalUrl)) {
          const identifier = identifierFromUrl(finalUrl);
          records = [{
            id: identifier,
            identifier,
            citation: identifier || finalUrl,
            title: identifier || finalUrl,
            canonicalCitation: identifier || finalUrl,
            url: finalUrl,
            detailUrl: finalUrl,
            locator: identifier,
            authorityType: input.request.requestedAuthorityTypes[0] || 'STATUTE',
            issuingAuthority: config.id === 'SCJN' ? 'Suprema Corte de Justicia de la Nación' : 'Cámara de Diputados',
            jurisdiction: input.regime.scope,
          }];
        } else if ((config.searchFormat || 'AUTO') === 'JSON' || contentType.includes('json')) {
          try {
            records = listJson(JSON.parse(new TextDecoder().decode(bytes)));
          } catch {
            throw new Error('OFFICIAL_PARSE_FAILED');
          }
        } else {
          records = parseHtmlRecords(new TextDecoder().decode(bytes), finalUrl, input, config.id, config.allowedDomains);
        }
        const candidates = records
          .filter((record) => !record.authorityType || input.request.requestedAuthorityTypes.includes(record.authorityType))
          .map((record) => {
            const source = record.url || record.detailUrl;
            if (source) officialUrl(source, config.allowedDomains);
            const candidate = makeCandidate(record, input, config.id, clock);
            byId.set(candidate.id, { candidate, record });
            return candidate;
          });
        return { status: candidates.length > 0 ? 'PASS' : 'PARTIAL', candidates, reasons: candidates.length > 0 ? [] : ['OFFICIAL_NOT_FOUND'] };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'OFFICIAL_HTTP_ERROR';
        return { status: 'FAIL', candidates: [], errorCode: reason, reasons: [reason] };
      }
    },
    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const entry = byId.get(input.candidateId);
      if (!entry || entry.candidate.requestId !== input.requestId) return { status: 'FAIL', errorCode: 'OFFICIAL_NOT_FOUND', reasons: ['OFFICIAL_NOT_FOUND'] };
      return retrieveDocument(entry.candidate, entry.record);
    },
  };
}
