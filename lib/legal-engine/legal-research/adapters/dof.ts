/**
 * @file dof.ts
 *
 * Adaptador oficial para el Diario Oficial de la Federación (DOF) y SIDOF.
 * Basado en los contratos, endpoints y estrategias de resiliencia documentados
 * en LegalIA (packages/dofjson):
 * - Primario: SIDOF REST API (https://sidof.segob.gob.mx/dof/sidof)
 * - Fallback: dof.gob.mx (sin www por restricción de certificado SSL documentada en LegalIA)
 * - User-Agent: Mozilla/5.0 (compatible; DOF-JSON-Client/1.0)
 */

import { createHash } from 'node:crypto';
import { sha256ResearchValue, stableResearchId } from '../canonical';
import type {
  AuthorityCandidate,
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

export const DOF_OFFICIAL_DOMAINS = [
  'dof.gob.mx',
  'sidof.segob.gob.mx',
  'segob.gob.mx',
] as const;

export interface DofAdapterConfig {
  sidofBaseUrl?: string;
  dofWebBaseUrl?: string;
  alertsUrl?: string;
  /** Compatibility-only path for existing callers that explicitly need the historical date contract. */
  legacyNotesByDate?: boolean;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  clock?: ResearchClock;
}

const DEFAULT_SIDOF_BASE = 'https://sidof.segob.gob.mx/dof/sidof';
const DEFAULT_DOFWEB_BASE = 'https://dof.gob.mx'; // NUNCA www.dof.gob.mx (SSL hostname mismatch documentado en LegalIA)
const DEFAULT_ALERTS_PATH = '/alertas/obtieneAlertasPublicas';
const USER_AGENT = 'Mozilla/5.0 (compatible; DOF-JSON-Client/1.0)';

interface SidofNota {
  codNota?: number | string;
  titulo?: string;
  seccion?: string;
  organo?: string;
  fecha?: string;
  pagina?: number;
  url?: string;
  cadenaContenido?: string;
  id?: number | string;
  tipoAlerta?: string;
  textoBusqueda?: string;
  descripcion?: string;
  codEstatus?: number;
  buscarEn?: string;
}

function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function createDofAdapter(config: DofAdapterConfig = {}): LegalResearchProvider {
  const fetcher = config.fetch || fetch;
  const clock = config.clock || (() => new Date());
  const timeoutMs = config.timeoutMs || 15000;
  const sidofBase = (config.sidofBaseUrl || DEFAULT_SIDOF_BASE).replace(/\/+$/, '');
  const dofWebBase = (config.dofWebBaseUrl || DEFAULT_DOFWEB_BASE).replace(/\/+$/, '');
  const alertsUrl = config.alertsUrl || `${sidofBase}${DEFAULT_ALERTS_PATH}`;
  const byCandidateId = new Map<string, { candidate: AuthorityCandidate; nota: SidofNota }>();

  const getJson = async (url: string): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`DOF_HTTP_${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  const postJson = async (url: string, body: unknown): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`DOF_HTTP_${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    id: 'DOF',
    version: '1.0.0',
    supportedAuthorityTypes: [
      'CONSTITUTION',
      'STATUTE',
      'CODE',
      'REGULATION',
      'OFFICIAL_AGREEMENT',
      'OTHER_OFFICIAL_SOURCE',
    ],

    async search(input: LegalResearchSearchInput): Promise<ProviderSearchResult> {
      if (input.regime.status === 'LEGAL_REGIME_UNRESOLVED') {
        return { status: 'FAIL', candidates: [], errorCode: 'LEGAL_REGIME_UNRESOLVED', reasons: ['LEGAL_REGIME_UNRESOLVED'] };
      }

      // Si el régimen o query especifica fecha relevante, consultar la edición del DOF de esa fecha
      const targetDate = input.regime.relevantDate ? new Date(input.regime.relevantDate) : clock();
      const dateStr = formatDate(targetDate);
      const candidates: AuthorityCandidate[] = [];

      try {
        if (!config.legacyNotesByDate) {
          const payload = await postJson(alertsUrl, {}) as Record<string, unknown>;
          const alerts = Array.isArray(payload?.alertas) ? payload.alertas : [];
          for (const raw of alerts as SidofNota[]) {
            const title = raw.descripcion || raw.textoBusqueda || '';
            const identifier = raw.id ? String(raw.id) : title;
            const candidate: AuthorityCandidate = {
              id: stableResearchId('candidate', { adapterId: 'DOF_ALERTS', requestId: input.request.id, identifier }),
              requestId: input.request.id,
              provider: 'DOF',
              identifier,
              title,
              authorityType: 'OFFICIAL_AGREEMENT',
              observedCitation: `Alerta pública DOF: ${title}`,
              canonicalCitationCandidate: `SIDOF alerta pública - ${title}`,
              sourceUrl: alertsUrl,
              sourceDomain: 'sidof.segob.gob.mx',
              sourceTier: 'OFFICIAL_PRIMARY',
              issuingAuthority: 'Diario Oficial de la Federación',
              jurisdiction: 'FEDERAL',
              retrievedAt: clock().toISOString(),
              metadataStatus: title ? 'COMPLETE' : 'PARTIAL',
              candidateStatus: 'DISCOVERED',
            };
            byCandidateId.set(candidate.id, { candidate, nota: raw });
            candidates.push(candidate);
          }
          return {
            status: candidates.length > 0 ? 'PASS' : 'PARTIAL',
            candidates,
            reasons: candidates.length > 0 ? [] : ['DOF_NO_PUBLIC_ALERTS_MATCHES'],
          };
        }

        const payload = await getJson(`${sidofBase}/notas/${dateStr}`) as Record<string, unknown>;
        const notasRaw = Array.isArray(payload?.Notas) ? payload.Notas : Array.isArray(payload) ? payload : [];
        const queryTerms = input.query.explicitTerms.map((t) => t.toLowerCase());

        for (const raw of notasRaw as SidofNota[]) {
          const titulo = raw.titulo || '';
          const codNota = raw.codNota ? String(raw.codNota) : undefined;
          const matchesTerm = queryTerms.length === 0 || queryTerms.some((term) => titulo.toLowerCase().includes(term));
          if (!matchesTerm && notasRaw.length > 5) continue;

          const sourceUrl = `${dofWebBase}/nota_detalle.php?codigo=${codNota || ''}`;
          const candidate: AuthorityCandidate = {
            id: stableResearchId('candidate', {
              adapterId: 'DOF',
              requestId: input.request.id,
              codNota: codNota || titulo,
              date: dateStr,
            }),
            requestId: input.request.id,
            provider: 'DOF',
            identifier: codNota,
            title: titulo,
            authorityType: 'OFFICIAL_AGREEMENT',
            observedCitation: `Publicación DOF de fecha ${dateStr}: ${titulo}`,
            canonicalCitationCandidate: `DOF ${dateStr} - ${titulo}`,
            sourceUrl,
            sourceDomain: 'dof.gob.mx',
            sourceTier: 'OFFICIAL_PRIMARY',
            issuingAuthority: raw.organo || 'Diario Oficial de la Federación',
            jurisdiction: 'FEDERAL',
            publicationDate: dateStr,
            retrievedAt: clock().toISOString(),
            metadataStatus: codNota ? 'COMPLETE' : 'PARTIAL',
            candidateStatus: 'DISCOVERED',
          };

          byCandidateId.set(candidate.id, { candidate, nota: raw });
          candidates.push(candidate);
        }

        return {
          status: candidates.length > 0 ? 'PASS' : 'PARTIAL',
          candidates,
          reasons: candidates.length > 0 ? [] : ['DOF_NO_MATCHES_ON_DATE'],
        };
      } catch (err) {
        const code = err instanceof Error ? err.message : 'DOF_SEARCH_ERROR';
        return { status: 'FAIL', candidates: [], errorCode: code, reasons: [code] };
      }
    },

    async retrieve(input: LegalResearchRetrieveInput): Promise<ProviderRetrieveResult> {
      const entry = byCandidateId.get(input.candidateId);
      if (!entry || entry.candidate.requestId !== input.requestId) {
        return { status: 'FAIL', errorCode: 'NOT_FOUND', reasons: ['NOT_FOUND'] };
      }

      const { candidate, nota } = entry;
      let textContent = nota.cadenaContenido || nota.titulo || '';

      // Si tenemos codNota, intentar traer el detalle completo de la nota
      if (nota.codNota) {
        try {
          const detail = await getJson(`${sidofBase}/notas/nota/${nota.codNota}`) as Record<string, unknown>;
          const rawNota = Array.isArray(detail?.Nota) ? detail.Nota[0] : (detail?.Nota || detail);
          const notaDetail = rawNota as SidofNota;
          if (notaDetail?.cadenaContenido) {
            textContent = notaDetail.cadenaContenido;
          }
        } catch {
          // Continuar con el contenido del resumen si falla el detalle
        }
      }

      const sourceHash = createHash('sha256').update(textContent).digest('hex');
      const excerptHash = await sha256ResearchValue({ content: textContent.slice(0, 500) });

      const evidence: OfficialSourceEvidence = {
        sourceUrl: candidate.sourceUrl || `${dofWebBase}/nota_detalle.php?codigo=${nota.codNota || ''}`,
        sourceDomain: 'dof.gob.mx',
        sourceTier: 'OFFICIAL_PRIMARY',
        retrievedAt: clock().toISOString(),
        locator: `Edición DOF ${nota.fecha || candidate.publicationDate || ''}`,
        sourceHash,
        excerptHash,
      };

      const proposition: SupportedProposition = {
        text: textContent.slice(0, 2000),
        supportLevel: 'DIRECT',
        sourceLocator: evidence.locator,
        limitations: [],
      };

      return {
        status: 'PASS',
        candidate: {
          ...candidate,
          candidateStatus: 'RETRIEVED',
          evidenceHash: sourceHash,
        },
        evidence,
        proposition,
        reasons: [],
      };
    },
  };
}
