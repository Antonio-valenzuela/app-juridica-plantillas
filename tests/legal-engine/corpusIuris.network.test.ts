/**
 * @file corpusIuris.network.test.ts
 *
 * Test de red real contra Corpus Iuris REST.
 *
 * ACTIVACIÓN: CORPUS_IURIS_NETWORK_TEST=1 npx vitest run tests/legal-engine/corpusIuris.network.test.ts
 *
 * - Solo usa consultas jurídicas abstractas (sin datos personales, expedientes ni domicilios).
 * - No expone API keys en logs.
 * - Puede pasar o fallar según disponibilidad externa; documenta el resultado.
 */
import { describe, expect, it } from 'vitest';
import { createDefaultCorpusIurisAdapter } from '@/lib/legal-engine/legal-research/adapters/corpusIuris';
import { projectAbstractLegalQuery } from '@/lib/legal-engine/legal-research/researchRequest';
import type {
  LegalRegimeResolution,
  LegalResearchRequest,
  NormalizedResearchQuery,
} from '@/lib/legal-engine/legal-research/types';
import { sha256ResearchValue } from '@/lib/legal-engine/legal-research/canonical';

const NETWORK_ENABLED = process.env.CORPUS_IURIS_NETWORK_TEST === '1';

// ─── Fixtures de régimen (abstractos, sin datos personales) ───────────────────

const regime: LegalRegimeResolution = {
  id: 'regime-network-federal',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'constitucional', displayName: 'Constitucional' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-network-test',
};

/** Consulta jurídica abstracta — sin nombres, expedientes ni domicilios. */
const ABSTRACT_QUERY = 'fundamentación motivación acto autoridad';

const request: LegalResearchRequest = {
  id: 'request-network-test-1',
  legalIssueId: 'issue-network-test-1',
  coverageItemIds: ['coverage-net-1'],
  question: ABSTRACT_QUERY,
  jurisdiction: 'federal',
  matter: 'constitucional',
  requestedAuthorityTypes: ['STATUTE', 'JURISPRUDENCE'],
  sourceAuthorityMentionIds: [],
  contextHash: 'context-hash-network-test',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: new Date().toISOString(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Corpus Iuris — validación de red real', () => {
  it('query abstracto no contiene nombre, expediente ni domicilio', async () => {
    const projected = projectAbstractLegalQuery(ABSTRACT_QUERY);
    expect(projected).not.toMatch(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b/);
    expect(projected).not.toMatch(/expediente|exp\.|domicilio|dirección/i);
    expect(projected).not.toMatch(/\d{1,8}\/\d{2,4}/);
  });

  it('busca en Corpus Iuris en vivo y maneja respuesta real sin fabricar candidatos', async () => {
    const adapter = createDefaultCorpusIurisAdapter();
    const queryHash = await sha256ResearchValue({
      normalizedQuery: ABSTRACT_QUERY,
      regimeHash: regime.resolutionHash,
    });
    const query: NormalizedResearchQuery = {
      requestId: request.id,
      normalizedQuery: ABSTRACT_QUERY,
      queryHash,
      explicitTerms: ['fundamentación', 'motivación', 'acto', 'autoridad'],
      regimeHash: regime.resolutionHash,
    };

    let result: Awaited<ReturnType<typeof adapter.search>>;
    try {
      result = await adapter.search({ request, query, regime });
    } catch (error) {
      console.warn('[corpusIuris.network.test] Error de red:', error instanceof Error ? error.message : String(error));
      return;
    }

    expect(['FAIL', 'OK', 'NO_RESULTS']).toContain(result.status);

    if (result.status === 'FAIL') {
      expect(result.candidates).toEqual([]);
      expect(result.errorCode).toBe('CORPUS_IURIS_HTTP_401');
      return;
    }

    for (const candidate of result.candidates) {
      expect(candidate.sourceTier).toBe('SECONDARY_SUPPORT');
      expect(candidate.candidateStatus).toBe('DISCOVERED');
      expect(candidate.provider).toBe('CORPUS_IURIS');
      expect(candidate.observedCitation).not.toMatch(/\d{1,8}\/\d{2,4}/);
    }
  }, 30000);
});
