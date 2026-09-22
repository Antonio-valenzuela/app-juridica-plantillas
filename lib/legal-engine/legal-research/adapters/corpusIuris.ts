import { stableResearchId } from '../canonical';
import type {
  AuthorityCandidate,
  AuthorityType,
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

export type CorpusIurisFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface CorpusIurisRecord {
  id?: string;
  tipo?: string;
  type?: string;
  titulo?: string;
  title?: string;
  referencia?: string;
  citation?: string;
  fragmento?: string;
  snippet?: string;
  texto?: string;
  text?: string;
  contenido?: string;
  content?: string;
  url?: string;
  enlace?: string;
  fuente_oficial?: string;
  official_url?: string;
  vigencia?: {
    estado?: string;
    fecha_ultima_reforma?: string;
    verificado_al?: string;
    fuente_oficial?: string;
    como_citar?: string;
    [key: string]: unknown;
  } | unknown;
  fuerza?: {
    es_jurisprudencia_obligatoria?: boolean;
    como_citar?: string;
    [key: string]: unknown;
  } | unknown;
  locator?: string;
  identificador?: string;
  identifier?: string;
}

export interface CorpusIurisAdapterConfig {
  searchUrl?: string;
  documentUrl?: string;
  fetch?: CorpusIurisFetch;
  timeoutMs?: number;
  token?: string;
  clock?: ResearchClock;
}

const DEFAULT_SEARCH_URL = 'https://corpusiuris.mx/api/agent/v1/search';
const DEFAULT_DOCUMENT_URL = 'https://corpusiuris.mx/api/agent/v1/documento';
const DEFAULT_USER_AGENT = 'corpus-iuris-mcp/1.0.0 (+https://corpusiuris.mx/agentes)';
const MAX_RESPONSE_BYTES = 2_000_000;

function authorityTypeFor(record: CorpusIurisRecord, fallback: AuthorityType): AuthorityType {
  const fuerza = record.fuerza as { es_jurisprudencia_obligatoria?: boolean } | undefined;
  if (typeof fuerza?.es_jurisprudencia_obligatoria === 'boolean') {
    return fuerza.es_jurisprudencia_obligatoria ? 'JURISPRUDENCE' : 'THESIS';
  }
  const value = record.tipo || record.type;
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('constituc')) return 'CONSTITUTION';
  if (normalized.includes('codigo')) return 'CODE';
  if (normalized.includes('reglament')) return 'REGULATION';
  if (normalized.includes('acuerdo')) return 'OFFICIAL_AGREEMENT';
  if (normalized.includes('jurisprudenc')) return 'JURISPRUDENCE';
  if (normalized.includes('tesis')) return 'THESIS';
  if (normalized.includes('precedent')) return 'PRECEDENT';
  if (normalized.includes('ley')) return 'STATUTE';
  return fallback;
}

function textField(record: CorpusIurisRecord, ...keys: Array<keyof CorpusIurisRecord>): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function sourceUrlFor(record: CorpusIurisRecord): string | undefined {
  const vigencia = record.vigencia as { fuente_oficial?: string } | undefined;
  if (vigencia?.fuente_oficial && typeof vigencia.fuente_oficial === 'string' && vigencia.fuente_oficial.trim()) {
    return vigencia.fuente_oficial.trim();
  }
  return textField(record, 'url', 'enlace', 'fuente_oficial', 'official_url');
}

function sourceDomain(sourceUrl?: string): string | undefined {
  if (!sourceUrl) return undefined;
  try { return new URL(sourceUrl).hostname; } catch { return undefined; }
}

function remoteIdFor(record: CorpusIurisRecord): string | undefined {
  return textField(record, 'id', 'identificador', 'identifier', 'locator');
}

function requestedSources(types: AuthorityType[]): string {
  const sources = new Set<string>();
  for (const type of types) {
    if (['CONSTITUTION', 'STATUTE', 'CODE', 'REGULATION', 'OFFICIAL_AGREEMENT', 'OTHER_OFFICIAL_SOURCE'].includes(type)) sources.add('leyes');
    if (['JURISPRUDENCE', 'THESIS'].includes(type)) sources.add('tesis');
    if (type === 'PRECEDENT') sources.add('precedentes');
  }
  return [...sources].join(',') || 'leyes,tesis';
}

function recordsFromPayload(payload: unknown): CorpusIurisRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is CorpusIurisRecord => Boolean(item && typeof item === 'object'));
  if (!payload || typeof payload !== 'object') throw new Error('CORPUS_IURIS_PARSE_FAILED');
  const root = payload as Record<string, unknown>;
  const bucketRecords = ['leyes', 'tesis', 'precedentes']
    .flatMap((key) => Array.isArray(root[key]) ? root[key] : [])
    .filter((item): item is CorpusIurisRecord => Boolean(item && typeof item === 'object'));
  if (bucketRecords.length > 0) return bucketRecords;
  for (const key of ['results', 'items', 'data', 'records']) {
    if (Array.isArray(root[key])) {
      return root[key].filter((item): item is CorpusIurisRecord => Boolean(item && typeof item === 'object'));
    }
  }
  if (['id', 'titulo', 'title', 'referencia', 'citation', 'fragmento', 'snippet', 'texto', 'text'].some((key) => key in root)) {
    return [root as CorpusIurisRecord];
  }
  throw new Error('CORPUS_IURIS_PARSE_FAILED');
}

function candidateFromRecord(
  record: CorpusIurisRecord,
  input: LegalResearchSearchInput,
  clock: ResearchClock,
): AuthorityCandidate {
  const sourceUrl = sourceUrlFor(record);
  const observedCitation = textField(record, 'referencia', 'citation', 'titulo', 'title') || `Corpus Iuris ${remoteIdFor(record) || 'resultado'}`;
  const authorityType = authorityTypeFor(record, input.request.requestedAuthorityTypes[0] || 'OTHER_OFFICIAL_SOURCE');
  return {
    id: stableResearchId('candidate', {
      adapterId: 'CORPUS_IURIS',
      requestId: input.request.id,
      remoteId: remoteIdFor(record),
      citation: observedCitation,
      sourceUrl,
    }),
    requestId: input.request.id,
    provider: 'CORPUS_IURIS',
    identifier: remoteIdFor(record),
    title: textField(record, 'titulo', 'title'),
    authorityType,
    observedCitation,
    canonicalCitationCandidate: observedCitation,
    sourceUrl,
    sourceDomain: sourceDomain(sourceUrl),
    sourceTier: 'SECONDARY_SUPPORT',
    issuingAuthority: 'Corpus Iuris',
    jurisdiction: input.regime.scope,
    matter: input.regime.matter?.code,
    procedure: input.regime.procedure?.code,
    locator: textField(record, 'locator', 'referencia', 'identificador', 'identifier', 'id'),
    retrievedAt: clock().toISOString(),
    metadataStatus: sourceUrl && observedCitation ? 'PARTIAL' : 'INSUFFICIENT',
    candidateStatus: 'DISCOVERED',
  };
}

function propositionFromRecord(record: CorpusIurisRecord, candidate: AuthorityCandidate): SupportedProposition | undefined {
  const text = textField(record, 'fragmento', 'snippet', 'texto', 'text', 'contenido', 'content');
  if (!text) return undefined;
  return {
    text,
    supportLevel: 'LIMITED',
    sourceLocator: candidate.locator,
    limitations: ['Resultado de descubrimiento secundario; requiere verificación en fuente oficial.'],
  };
}

function errorCodeFor(error: unknown, responseStatus?: number): string {
  if (responseStatus === 429) return 'CORPUS_IURIS_RATE_LIMITED';
  if (error instanceof Error && (error.name === 'AbortError' || /abort|timeout/i.test(error.message))) return 'CORPUS_IURIS_TIMEOUT';
  if (responseStatus && responseStatus >= 400) return `CORPUS_IURIS_HTTP_${responseStatus}`;
  if (error instanceof Error && error.message === 'CORPUS_IURIS_PARSE_FAILED') return error.message;
  return 'CORPUS_IURIS_HTTP_ERROR';
}

function responseFailure(code: string): ProviderSearchResult {
  return { status: 'FAIL', candidates: [], errorCode: code, reasons: [code] };
}

export function createCorpusIurisAdapter(config: CorpusIurisAdapterConfig = {}): LegalResearchProvider {
  const fetcher = config.fetch || fetch;
  const clock = config.clock || (() => new Date());
  const timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs || 0) >= 1000 ? Number(config.timeoutMs) : 15000;
  const searchUrl = config.searchUrl || DEFAULT_SEARCH_URL;
  const documentUrl = config.documentUrl || DEFAULT_DOCUMENT_URL;
  const byCandidateId = new Map<string, { candidate: AuthorityCandidate; record: CorpusIurisRecord }>();

  const getJson = async (url: URL): Promise<unknown> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers({
      accept: 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
    });
    const effectiveToken = config.token?.trim() || process.env.CORPUS_IURIS_TOKEN?.trim() || process.env.CORPUS_IURIS_API_TOKEN?.trim();
    if (effectiveToken) headers.set('authorization', `Bearer ${effectiveToken}`);
    try {
      const response = await fetcher(url, { headers, signal: controller.signal });
      if (response.status === 429) throw Object.assign(new Error('CORPUS_IURIS_RATE_LIMITED'), { status: 429 });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let customMessage: string | undefined;
        try {
          const parsed = JSON.parse(errText);
          customMessage = parsed.mensaje_para_tu_usuario || parsed.detalle || parsed.error;
        } catch {}
        const code = `CORPUS_IURIS_HTTP_${response.status}`;
        throw Object.assign(new Error(customMessage || code), { status: response.status, code });
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error('CORPUS_IURIS_PARSE_FAILED');
      try { return JSON.parse(text); } catch { throw new Error('CORPUS_IURIS_PARSE_FAILED'); }
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
      throw Object.assign(new Error(errorCodeFor(error, status)), { code: errorCodeFor(error, status) });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return {
    id: 'CORPUS_IURIS',
    version: '1',
    supportedAuthorityTypes: ['CONSTITUTION', 'STATUTE', 'CODE', 'REGULATION', 'JURISPRUDENCE', 'THESIS', 'PRECEDENT', 'OFFICIAL_AGREEMENT', 'OTHER_OFFICIAL_SOURCE'],
    async search(input): Promise<ProviderSearchResult> {
      if (input.regime.status === 'LEGAL_REGIME_UNRESOLVED') return responseFailure('LEGAL_REGIME_UNRESOLVED');
      try {
        const url = new URL(searchUrl);
        url.searchParams.set('q', input.query.normalizedQuery.slice(0, 300));
        url.searchParams.set('fuentes', requestedSources(input.request.requestedAuthorityTypes));
        const records = recordsFromPayload(await getJson(url));
        const candidates = records.map((record) => {
          const candidate = candidateFromRecord(record, input, clock);
          byCandidateId.set(candidate.id, { candidate, record });
          return candidate;
        });
        return { status: candidates.length > 0 ? 'PASS' : 'PARTIAL', candidates, reasons: candidates.length > 0 ? [] : ['CORPUS_IURIS_NO_RESULTS'] };
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith('CORPUS_IURIS_') ? error.message : errorCodeFor(error);
        return responseFailure(code);
      }
    },
    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const entry = byCandidateId.get(input.candidateId);
      if (!entry || entry.candidate.requestId !== input.requestId) return { status: 'FAIL', errorCode: 'CORPUS_IURIS_NOT_FOUND', reasons: ['CORPUS_IURIS_NOT_FOUND'] };
      const remoteId = remoteIdFor(entry.record);
      if (!remoteId) return { status: 'FAIL', errorCode: 'CORPUS_IURIS_NOT_FOUND', reasons: ['CORPUS_IURIS_NOT_FOUND'] };
      try {
        const url = new URL(documentUrl);
        url.searchParams.set('tipo', entry.record.tipo || entry.record.type || 'ley');
        url.searchParams.set('id', remoteId);
        const payload = await getJson(url);
        const documentRecords = recordsFromPayload(payload);
        const record = documentRecords[0] || entry.record;
        const candidate = { ...entry.candidate, requestId: input.requestId, candidateStatus: 'RETRIEVED' as const };
        const proposition = propositionFromRecord(record, candidate);
        return { status: 'PASS', candidate, proposition, reasons: [] };
      } catch (error) {
        const code = error instanceof Error ? error.message : 'CORPUS_IURIS_HTTP_ERROR';
        return { status: 'FAIL', errorCode: code, reasons: [code] };
      }
    },
  };
}

export function createDefaultCorpusIurisAdapter(config: Omit<CorpusIurisAdapterConfig, 'token'> = {}): LegalResearchProvider {
  return createCorpusIurisAdapter({
    ...config,
    token: process.env.CORPUS_IURIS_TOKEN || process.env.CORPUS_IURIS_API_TOKEN,
  });
}

export const corpusIurisDefaults = {
  searchUrl: DEFAULT_SEARCH_URL,
  documentUrl: DEFAULT_DOCUMENT_URL,
};
