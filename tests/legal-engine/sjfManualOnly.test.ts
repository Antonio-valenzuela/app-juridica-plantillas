/**
 * Lote 7 (pendiente 1): la jurisprudencia del Semanario Judicial de la Federación es SIEMPRE MANUAL_ONLY.
 * Nunca queda como VERIFIED_AUTHORITY, aunque venga en un bundle verificado. Datos sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { buildLegalResearchBundle } from '@/lib/legal-engine/legal-research/researchBundle';
import type { LegalRegimeResolution, LegalResearchRequest, VerifiedAuthority } from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');
const regime: LegalRegimeResolution = {
  id: 'regime-sjf-1', status: 'RESOLVED', country: { code: 'MX', displayName: 'México' }, scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' }, procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN', fieldEvidence: [], unresolvedFields: [], resolutionHash: 'regime-hash-sjf',
};
const request: LegalResearchRequest = {
  id: 'request-sjf', legalIssueId: 'issue-sjf', coverageItemIds: ['coverage-1'], question: 'Criterio aplicable',
  jurisdiction: 'federal', matter: 'civil', procedure: 'ordinario', requestedAuthorityTypes: ['JURISPRUDENCE'],
  sourceAuthorityMentionIds: [], contextHash: 'context-sjf', regimeResolutionId: regime.id, status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

/** Autoridad verificada de un dominio dado. El dominio SJF se trata como fuente oficial primaria. */
function authority(authorityType: VerifiedAuthority['identity']['authorityType'], sourceDomain: string): VerifiedAuthority {
  return {
    id: `authority-${authorityType}-${sourceDomain}`,
    identity: { canonicalCitation: 'Criterio sintético', authorityType, issuingAuthority: 'Órgano sintético', identityKey: `id-${authorityType}` },
    source: {
      sourceUrl: `https://${sourceDomain}/fixture`, sourceDomain, sourceTier: 'OFFICIAL_PRIMARY',
      retrievedAt: fixedClock().toISOString(), locator: 'fixture:1', sourceHash: 'sh', excerptHash: 'eh', isFixture: true,
    },
    temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: fixedClock().toISOString(), basis: ['fixture'] },
    jurisdictionValidity: { status: 'APPLICABLE', country: 'MX', scope: 'FEDERAL', matter: 'civil', procedure: 'ordinario', bindingCharacter: 'BINDING_WHEN_APPLICABLE', basis: ['fixture'] },
    proposition: { text: 'Proposición sintética.', supportLevel: 'DIRECT', sourceLocator: 'fixture:1', limitations: [] },
    verificationStatus: 'VERIFIED',
    supportsLegalIssueIds: [request.legalIssueId],
    sourceAuthorityMentionIds: [],
    verificationHash: `vh-${authorityType}-${sourceDomain}`,
  } as VerifiedAuthority;
}

describe('jurisprudencia del SJF: MANUAL_ONLY', () => {
  it('una jurisprudencia del SJF en el bundle no queda como autoridad verificada', async () => {
    const bundle = await buildLegalResearchBundle({
      request, regime, verifications: [authority('JURISPRUDENCE', 'sjf2.scjn.gob.mx')], unresolvedQuestions: [],
    });
    expect(bundle.verifiedAuthorities.some((item) => item.identity.authorityType === 'JURISPRUDENCE')).toBe(false);
    expect(bundle.researchStatus).not.toBe('VERIFIED_SUFFICIENT');
  });

  it('una jurisprudencia de otra fuente oficial sigue el flujo normal', async () => {
    const bundle = await buildLegalResearchBundle({
      request, regime, verifications: [authority('JURISPRUDENCE', 'fixture.official.test')], unresolvedQuestions: [],
    });
    expect(bundle.verifiedAuthorities.length).toBe(1);
  });

  it('un artículo del SJF no se ve afectado por la regla de jurisprudencia', async () => {
    const bundle = await buildLegalResearchBundle({
      request, regime, verifications: [authority('STATUTE', 'sjf2.scjn.gob.mx')], unresolvedQuestions: [],
    });
    expect(bundle.verifiedAuthorities.length).toBe(1);
  });
});
