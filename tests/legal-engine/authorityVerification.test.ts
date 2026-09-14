import { describe, expect, it } from 'vitest';
import type { SourceAuthorityMention } from '@/lib/legal-engine/case-extraction/types';
import {
  verifyAuthorityCandidate,
  verifySourceCitedMention,
} from '@/lib/legal-engine/legal-research/authorityVerification';
import type {
  AuthorityCandidate,
  LegalRegimeResolution,
  LegalResearchRequest,
  OfficialSourceEvidence,
} from '@/lib/legal-engine/legal-research/types';

const fixedClock = () => new Date('2026-01-01T00:00:00.000Z');

const regime: LegalRegimeResolution = {
  id: 'regime-federal-1',
  status: 'RESOLVED',
  country: { code: 'MX', displayName: 'México' },
  scope: 'FEDERAL',
  matter: { code: 'civil', displayName: 'Civil' },
  procedure: { code: 'ordinario', displayName: 'Ordinario' },
  temporalPrecision: 'UNKNOWN',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'regime-hash-1',
};

const request: LegalResearchRequest = {
  id: 'request-1',
  legalIssueId: 'issue-1',
  coverageItemIds: ['coverage-1'],
  question: '¿Qué requisito debe revisarse?',
  jurisdiction: 'federal',
  matter: 'civil',
  procedure: 'ordinario',
  requestedAuthorityTypes: ['STATUTE'],
  sourceAuthorityMentionIds: ['mention-1'],
  contextHash: 'context-hash-1',
  regimeResolutionId: regime.id,
  status: 'READY_FOR_RETRIEVAL',
  createdAt: fixedClock().toISOString(),
};

const candidate: AuthorityCandidate = {
  id: 'candidate-1',
  requestId: request.id,
  sourceAuthorityMentionId: 'mention-1',
  authorityType: 'STATUTE',
  observedCitation: 'Artículo 14 de la Constitución',
  canonicalCitationCandidate: 'ARTICULO 14 DE LA CONSTITUCION',
  sourceUrl: 'https://fixture.official.test/federal/article-14',
  sourceDomain: 'fixture.official.test',
  sourceTier: 'OFFICIAL_PRIMARY',
  issuingAuthority: 'Autoridad federal fixture',
  jurisdiction: 'FEDERAL',
  matter: 'civil',
  procedure: 'ordinario',
  publicationDate: '2020-01-01',
  effectiveFrom: '2020-01-02',
  locator: 'fixture:article-14',
  retrievedAt: fixedClock().toISOString(),
  metadataStatus: 'COMPLETE',
  candidateStatus: 'RETRIEVED',
};

const evidence: OfficialSourceEvidence = {
  sourceUrl: candidate.sourceUrl!,
  sourceDomain: candidate.sourceDomain!,
  sourceTier: 'OFFICIAL_PRIMARY',
  retrievedAt: fixedClock().toISOString(),
  locator: candidate.locator,
  sourceHash: 'source-hash-1',
  excerptHash: 'excerpt-hash-1',
  isFixture: true,
};

function sourceCitedMention(citationText = candidate.observedCitation): SourceAuthorityMention {
  return {
    id: 'mention-1',
    authorityType: 'LAW',
    citationText,
    verificationStatus: 'SOURCE_CITED',
    provenance: [],
  };
}

describe('authority verification', () => {
  it('keeps SOURCE_CITED unchanged and creates a separate verified object after exact match', async () => {
    const mention = sourceCitedMention();
    const before = structuredClone(mention);
    const result = await verifySourceCitedMention({
      mention,
      candidate,
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: ['No determina la consecuencia del caso.'] },
    }, fixedClock);

    expect(mention).toEqual(before);
    expect(result.verifiedAuthority?.sourceAuthorityMentionIds).toEqual([mention.id]);
    expect(result.verifiedAuthority?.verificationStatus).toBe('VERIFIED');
    expect(result.verifiedAuthority?.source.sourceUrl).toBe(evidence.sourceUrl);
  });

  it('rejects an incompatible official identity as MISMATCH', async () => {
    const result = await verifySourceCitedMention({
      mention: sourceCitedMention('Artículo 14'),
      candidate: { ...candidate, canonicalCitationCandidate: 'ARTICULO 16' },
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('MISMATCH');
  });

  it('does not verify a candidate without primary official evidence', async () => {
    const result = await verifyAuthorityCandidate({
      candidate: { ...candidate, sourceTier: 'SECONDARY_SUPPORT' },
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('NON_OFFICIAL_ONLY');
  });

  it('gives official primary evidence priority over a secondary candidate', async () => {
    const result = await verifyAuthorityCandidate({
      candidate: { ...candidate, sourceTier: 'SECONDARY_SUPPORT' },
      evidence: { ...evidence, sourceTier: 'OFFICIAL_PRIMARY' },
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('NON_OFFICIAL_ONLY');
  });

  it('preserves source URL, retrievedAt, and source hash in the verified object', async () => {
    const result = await verifyAuthorityCandidate({
      candidate,
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority?.source.sourceUrl).toBe(evidence.sourceUrl);
    expect(result.verifiedAuthority?.source.retrievedAt).toBe(evidence.retrievedAt);
    expect(result.verifiedAuthority?.source.sourceHash).toBe(evidence.sourceHash);
  });

  it('rejects a federal candidate for a resolved state regime', async () => {
    const stateRegime: LegalRegimeResolution = {
      ...regime,
      id: 'regime-state-1',
      scope: 'STATE',
      federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' },
    };
    const result = await verifyAuthorityCandidate({
      candidate,
      evidence,
      request,
      regime: stateRegime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('WRONG_JURISDICTION');
  });

  it('rejects a current authority that was not applicable at the relevant date', async () => {
    const datedRegime: LegalRegimeResolution = {
      ...regime,
      id: 'regime-dated-1',
      relevantDate: '2018',
      temporalPrecision: 'YEAR',
    };
    const result = await verifyAuthorityCandidate({
      candidate,
      evidence,
      request: { ...request, relevantDate: '2018', temporalPrecision: 'YEAR' },
      regime: datedRegime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('OUTDATED');
  });

  it('keeps a thesis distinct from jurisprudence', async () => {
    const thesisCandidate: AuthorityCandidate = {
      ...candidate,
      id: 'candidate-thesis-1',
      authorityType: 'THESIS',
      observedCitation: 'Tesis fixture sobre requisito',
      canonicalCitationCandidate: 'TESIS FIXTURE SOBRE REQUISITO',
    };
    const thesisEvidence: OfficialSourceEvidence = {
      ...evidence,
      sourceUrl: 'https://fixture.official.test/federal/thesis-1',
      locator: 'fixture:thesis-1',
    };
    const result = await verifyAuthorityCandidate({
      candidate: thesisCandidate,
      evidence: thesisEvidence,
      request: { ...request, requestedAuthorityTypes: ['THESIS'] },
      regime,
      proposition: { text: 'La tesis aporta contexto.', supportLevel: 'DIRECT', limitations: ['No es jurisprudencia vinculante.'] },
    }, fixedClock);

    expect(result.verifiedAuthority?.identity.authorityType).toBe('THESIS');
    expect(result.verifiedAuthority?.jurisdictionValidity.bindingCharacter).not.toBe('BINDING_WHEN_APPLICABLE');
  });

  it('rejects explicitly repealed candidates', async () => {
    const result = await verifyAuthorityCandidate({
      candidate: { ...candidate, temporalStatus: 'REPEALED' },
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('OUTDATED');
  });

  it('accepts a limited proposition only when its limitation is explicit', async () => {
    const result = await verifyAuthorityCandidate({
      candidate,
      evidence,
      request,
      regime,
      proposition: {
        text: 'La disposición aporta contexto sobre el requisito.',
        supportLevel: 'LIMITED',
        sourceLocator: evidence.locator,
        limitations: ['No establece por sí sola la consecuencia procesal.'],
      },
    }, fixedClock);

    expect(result.verifiedAuthority?.proposition.supportLevel).toBe('LIMITED');
    expect(result.verifiedAuthority?.proposition.limitations).toHaveLength(1);
  });

  it('rejects an authority candidate belonging to another research request', async () => {
    const result = await verifyAuthorityCandidate({
      candidate: { ...candidate, requestId: 'request-other' },
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('MISMATCH');
  });

  it('returns NOT_FOUND when retrieval produced no candidate', async () => {
    const result = await verifyAuthorityCandidate({ request, regime });

    expect(result.verifiedAuthority).toBeUndefined();
    expect(result.rejection?.reasons).toContain('NOT_FOUND');
  });

  it('does not invent a citation when retrieval has only an observed citation', async () => {
    const result = await verifyAuthorityCandidate({
      candidate: { ...candidate, canonicalCitationCandidate: undefined, observedCitation: 'Cita observada fixture' },
      evidence,
      request,
      regime,
      proposition: { text: 'El requisito debe acreditarse.', supportLevel: 'DIRECT', limitations: [] },
    }, fixedClock);

    expect(result.verifiedAuthority?.identity.canonicalCitation).toBe('Cita observada fixture');
  });
});
