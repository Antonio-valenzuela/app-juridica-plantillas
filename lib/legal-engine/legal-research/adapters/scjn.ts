/**
 * @file scjn.ts
 *
 * Adaptador oficial para la Suprema Corte de Justicia de la Nación (SCJN).
 * Basado en las fuentes oficiales integradas en LegalIA:
 * 1. Legislación: SCJN SCOW-API (https://legislacion.scjn.gob.mx/SCOW-API/api/SCOW/BusquedaFrase)
 * 2. Jurisprudencia / Tesis: Semanario Judicial de la Federación (SJF)
 */

import { createHash } from 'node:crypto';
import { sha256ResearchValue, stableResearchId } from '../canonical';
import { createOfficialJsonAdapter, type OfficialAdapterConfig } from './officialJson';
import type {
  AuthorityCandidate,
  AuthorityType,
  OfficialSourceEvidence,
  SupportedProposition,
} from '../types';
import type {
  LegalResearchProvider,
  LegalResearchRetrieveInput,
  LegalResearchSearchInput,
  ProviderRetrieveResult,
  ProviderSearchResult,
} from './types';

export const SCJN_SJF_OFFICIAL_DOMAINS = [
  'scjn.gob.mx',
  'www.scjn.gob.mx',
  'sjf2.scjn.gob.mx',
  'sjf.scjn.gob.mx',
  'sjfsemanal.scjn.gob.mx',
  'legislacion.scjn.gob.mx',
] as const;

export interface ScjnAdapterConfig extends Omit<OfficialAdapterConfig, 'searchUrl' | 'allowedDomains'> {
  searchUrl?: string;
  allowedDomains?: readonly string[];
  scowSearchUrl?: string;
}

const DEFAULT_SCOW_URL = 'https://legislacion.scjn.gob.mx/SCOW-API/api/SCOW/BusquedaFrase';
const SCOW_USER_AGENT = 'Mozilla/5.0 (compatible; LegalIA-scjn-crawler/1.0)';

const LEGISLATION_AUTHORITY_TYPES: readonly AuthorityType[] = [
  'CONSTITUTION',
  'STATUTE',
  'CODE',
  'REGULATION',
  'OFFICIAL_AGREEMENT',
  'OTHER_OFFICIAL_SOURCE',
];

const JURISPRUDENCE_AUTHORITY_TYPES: readonly AuthorityType[] = [
  'JURISPRUDENCE',
  'THESIS',
  'PRECEDENT',
];

interface ScowItem {
  idOrdenamiento?: string | number;
  ordenamiento?: string;
  vigencia?: string;
}

interface ScowResponse {
  codigo?: number;
  tamanio?: number;
  resultados?: ScowItem[];
}

export function createScjnAdapter(config: ScjnAdapterConfig = {}): LegalResearchProvider {
  const fetcher = config.fetch || fetch;
  const clock = config.clock || (() => new Date());
  const timeoutMs = Number.isFinite(config.timeoutMs) && (config.timeoutMs || 0) >= 1000 ? Number(config.timeoutMs) : 15000;
  const allowedDomains = config.allowedDomains || SCJN_SJF_OFFICIAL_DOMAINS;
  const scowUrl = config.scowSearchUrl || DEFAULT_SCOW_URL;

  const sjfAdapter = createOfficialJsonAdapter({
    ...config,
    id: 'SCJN',
    supportedAuthorityTypes: [...JURISPRUDENCE_AUTHORITY_TYPES],
    searchUrl: config.searchUrl || 'https://sjfsemanal.scjn.gob.mx/',
    allowedDomains,
  });

  const scowCache = new Map<string, { candidate: AuthorityCandidate; item: ScowItem }>();

  return {
    id: 'SCJN',
    version: '2.0.0',
    supportedAuthorityTypes: [
      ...JURISPRUDENCE_AUTHORITY_TYPES,
      ...LEGISLATION_AUTHORITY_TYPES,
    ],
    async search(input: LegalResearchSearchInput): Promise<ProviderSearchResult> {
      const requestedTypes = input.request.requestedAuthorityTypes || [];
      const wantsLegislation = requestedTypes.some((t) => LEGISLATION_AUTHORITY_TYPES.includes(t));
      const wantsJurisprudence = requestedTypes.some((t) => JURISPRUDENCE_AUTHORITY_TYPES.includes(t));

      // Si pide legislación (o no pide jurisprudencia), consultar SCJN SCOW-API (LegalIA pattern)
      if (wantsLegislation || !wantsJurisprudence) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const bodyPayload = {
            q: input.query.normalizedQuery,
            tipoBusqueda: 1,
            tipoPublicacion: 1,
            ambitoF: '',
            categoriaF: '',
            vigenciaF: 'VIGENTE',
            entidadFederativaF: '',
            materiaF: '',
            municipioF: '',
            fechaPublicacionInicio: '',
            fechaPublicacionFin: '',
            numeroPagina: 1,
            tamanioPagina: 5,
            consultaArticulos: 0,
          };

          const response = await fetcher(scowUrl, {
            method: 'POST',
            headers: {
              'User-Agent': SCOW_USER_AGENT,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(config.headers || {}),
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal,
          });

          if (!response.ok) {
            // Si SCOW falla y también quería jurisprudencia, intentar SJF
            if (wantsJurisprudence) {
              return await sjfAdapter.search(input);
            }
            return {
              status: 'FAIL',
              candidates: [],
              errorCode: `SCJN_SCOW_HTTP_${response.status}`,
              reasons: [`SCJN_SCOW_HTTP_${response.status}`],
            };
          }

          const data = (await response.json()) as ScowResponse;
          const items = Array.isArray(data.resultados) ? data.resultados : [];

          if (items.length === 0) {
            if (wantsJurisprudence) {
              return await sjfAdapter.search(input);
            }
            return {
              status: 'PARTIAL',
              candidates: [],
              reasons: ['OFFICIAL_NOT_FOUND'],
            };
          }

          const fallbackAuthority = requestedTypes.find((t) => LEGISLATION_AUTHORITY_TYPES.includes(t)) || 'STATUTE';
          const candidates: AuthorityCandidate[] = items.map((item) => {
            const locator = String(item.idOrdenamiento || '');
            const title = String(item.ordenamiento || '').trim();
            const sourceUrl = `https://legislacion.scjn.gob.mx/SCOW/DetalleOrdenamiento?idOrdenamiento=${encodeURIComponent(locator)}`;

            const candidate: AuthorityCandidate = {
              id: stableResearchId('candidate', {
                adapterId: 'SCJN',
                requestId: input.request.id,
                source: sourceUrl,
                locator,
                citation: title,
              }),
              requestId: input.request.id,
              provider: 'SCJN',
              identifier: locator,
              title,
              authorityType: fallbackAuthority,
              observedCitation: title,
              canonicalCitationCandidate: title,
              sourceUrl,
              sourceDomain: 'legislacion.scjn.gob.mx',
              sourceTier: 'OFFICIAL_PRIMARY',
              issuingAuthority: 'Suprema Corte de Justicia de la Nación',
              jurisdiction: input.regime.scope || 'FEDERAL',
              matter: input.regime.matter?.code,
              locator,
              retrievedAt: clock().toISOString(),
              metadataStatus: 'COMPLETE',
              candidateStatus: 'DISCOVERED',
            };

            scowCache.set(candidate.id, { candidate, item });
            return candidate;
          });

          return {
            status: 'PASS',
            candidates,
            reasons: [],
          };
        } catch (error) {
          if (wantsJurisprudence) {
            return await sjfAdapter.search(input);
          }
          const reason = error instanceof Error ? error.message : 'OFFICIAL_HTTP_ERROR';
          return {
            status: 'FAIL',
            candidates: [],
            errorCode: reason,
            reasons: [reason],
          };
        } finally {
          clearTimeout(timeoutId);
        }
      }

      // Si únicamente busca jurisprudencia/tesis/precedentes, usar el adapter del SJF
      return sjfAdapter.search(input);
    },
    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const cached = scowCache.get(input.candidateId);
      if (cached && cached.candidate.requestId === input.requestId) {
        const { candidate, item } = cached;
        const text = item.ordenamiento || candidate.title || '';
        const sourceHash = createHash('sha256').update(text, 'utf8').digest('hex');
        const excerptHash = await sha256ResearchValue({ text, locator: candidate.locator });

        const evidence: OfficialSourceEvidence = {
          sourceUrl: candidate.sourceUrl || 'https://legislacion.scjn.gob.mx',
          sourceDomain: 'legislacion.scjn.gob.mx',
          sourceTier: 'OFFICIAL_PRIMARY',
          retrievedAt: candidate.retrievedAt,
          locator: candidate.locator,
          sourceHash,
          excerptHash,
        };

        const proposition: SupportedProposition = {
          text,
          supportLevel: 'DIRECT',
          sourceLocator: candidate.locator,
          limitations: [],
        };

        const mergedCandidate: AuthorityCandidate = {
          ...candidate,
          candidateStatus: 'RETRIEVED',
          evidenceHash: sourceHash,
          evidenceExcerptHash: excerptHash,
        };

        return {
          status: 'PASS',
          candidate: mergedCandidate,
          evidence,
          proposition,
          reasons: [],
        };
      }

      // Fallback a SJF si no estaba en cache de SCOW
      return sjfAdapter.retrieve(input);
    },
  };
}
