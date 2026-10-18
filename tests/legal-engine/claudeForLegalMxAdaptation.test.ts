import { describe, expect, it } from 'vitest';
import { buildLawyerStyleDirective } from '@/lib/legal-engine/pipeline';
import { applyStyleToSectionText } from '@/lib/legal-engine/styleEngine';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { buildMatterKnowledgeBase } from '@/lib/legal-engine/matterKnowledgeBase';
import { normalizeLegalAuthority } from '@/lib/legal-engine/legal-research/legalAuthority';
import { verifyAuthorityCandidate } from '@/lib/legal-engine/legal-research/authorityVerification';
import type { AuthorityCandidate, LegalRegimeResolution, LegalResearchRequest } from '@/lib/legal-engine/legal-research/types';
import { makeFixtureFCaseAnalysis } from '@/tests/fixtures/richCoverageFixtures';

describe('Mexico/Jalisco adaptation of legal practice patterns', () => {
  it.each(['identity', 'closing'])('does not append historical profile prose in the %s renderer', (sectionType) => {
    const current = 'Texto exclusivo del expediente actual.';
    expect(applyStyleToSectionText(sectionType, current, {
      ...DEFAULT_LAWYER_PROFILE,
      openingPatterns: ['HISTORICAL_CLIENT recibió $999999.'],
      closingPatterns: ['Condenar a HISTORICAL_CLIENT al pago.'],
    })).toBe(current);
  });
  it('keeps historical facts and remedies out of the practice style directive', () => {
    const text = buildLawyerStyleDirective({
      ...DEFAULT_LAWYER_PROFILE,
      lawyerName: 'HISTORICAL_CLIENT',
      recurringFormulas: ['El HISTORICAL_CLIENT pagó $999999 el 16/08/2025.'],
      preferredWayToContestFacts: ['Se niega el pago de HISTORICAL_CLIENT.'],
      preferredWayToContestBenefits: ['Se solicita absolución de HISTORICAL_CLIENT.'],
      preferredWayToWritePetition: ['Revocar la sentencia de HISTORICAL_CLIENT.'],
      preferredSectionOrdering: ['HISTORICAL_CLIENT'],
      preferredTone: 'directo_conciso',
    });
    expect(text).not.toContain('HISTORICAL_CLIENT');
    expect(text).not.toContain('999999');
    expect(text).toContain('directo_conciso');
    expect(text).toContain('completo_con_registro');
  });

  it('flags a theory relying on an unknown fact, absent evidence and unverified authority', () => {
    const analysis = makeFixtureFCaseAnalysis();
    analysis.richCaseAnalysis!.arguments = [{
      id: 'theory-unknown', proposition: 'El adeudo está acreditado.',
      supportingFactIds: ['fixture-f-fact-4', 'fact-not-in-file'],
      citedAuthorityIds: ['fixture-f-authority-1'], provenance: [],
    }];
    const kb = buildMatterKnowledgeBase(analysis);
    const support = kb.argumentSupports[0] as any;
    expect(support.reviewFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'THEORY_FACT_UNCONFIRMED', entityId: 'fixture-f-fact-4' }),
      expect.objectContaining({ code: 'THEORY_FACT_NOT_FOUND', entityId: 'fact-not-in-file' }),
      expect.objectContaining({ code: 'FACT_WITHOUT_EVIDENCE_LINK', entityId: 'fixture-f-fact-4' }),
      expect.objectContaining({ code: 'AUTHORITY_UNVERIFIED', entityId: 'fixture-f-authority-1' }),
    ]));
    expect(support.reviewStatus).toBe('REVIEW_REQUIRED');
    expect(analysis.richCaseAnalysis!.facts[3].assertionStatus).toBe('UNKNOWN');
    expect(kb.verifiedAuthorities).toEqual([]);
  });

  it('keeps notifications, party allegations and inferred dates distinct with their original spans', () => {
    const analysis = makeFixtureFCaseAnalysis();
    const p = analysis.richCaseAnalysis!.facts[0].provenance[0];
    analysis.richCaseAnalysis!.proceduralTimeline = [
      { id: 'notification', date: '2026-01-01', event: 'La parte dice haber sido notificada.', eventType: 'NOTIFICATION', certainty: 1, provenance: [{ ...p, page: 3, excerpt: 'La parte dice haber sido notificada.', speakerRole: 'PARTE_ACTORA' }] },
      { id: 'inferred', date: '2026-01-02', event: 'Fecha inferida.', eventType: 'ORDER', certainty: 1, provenance: [{ ...p, inferenceLevel: 'RELATION_INFERRED' }] },
    ];
    const chronology = (buildMatterKnowledgeBase(analysis) as any).chronology;
    expect(chronology).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'notification', dateKind: 'NOTIFICATION', dateOrigin: 'PARTY_ALLEGED', provenance: [expect.objectContaining({ page: 3, sourceId: 'fixture-f-source' })] }),
      expect.objectContaining({ id: 'inferred', dateOrigin: 'INFERRED' }),
    ]));
    expect(JSON.stringify(chronology)).not.toContain('CONFIRMED');
    expect(analysis.richCaseAnalysis!.proceduralTimeline[0].eventType).toBe('NOTIFICATION');
  });

  it('never upgrades a model citation or a user supplied official-looking URL', () => {
    const model = normalizeLegalAuthority(candidate({ sourceTier: 'UNKNOWN', provider: undefined, sourceUrl: undefined }));
    const user = normalizeLegalAuthority(candidate({ sourceTier: 'UNKNOWN', provider: undefined, sourceAuthorityMentionId: 'user-cite' }));
    expect(model.verificationStatus).toBe('UNVERIFIED');
    expect((model as any).provenance).toMatchObject({ level: 5, origin: 'MODEL_SUGGESTED', stage: 'SUGGESTED' });
    expect(user.verificationStatus).toBe('UNVERIFIED');
    expect((user as any).provenance).toMatchObject({ level: 4, origin: 'USER_PROVIDED' });
  });

  it('keeps retrieved Jalisco material pending until the existing verification contract passes', async () => {
    const c = candidate();
    const pending = normalizeLegalAuthority(c);
    expect(pending.verificationStatus).toBe('UNVERIFIED');
    expect((pending as any).provenance).toMatchObject({ level: 2, origin: 'OFFICIAL_RETRIEVED', stage: 'RETRIEVED' });
    const regime: LegalRegimeResolution = { id: 'mx-jal-regime', status: 'RESOLVED', country: { code: 'MX', displayName: 'México' }, scope: 'STATE', federativeEntity: { code: 'MX-JAL', displayName: 'Jalisco' }, temporalPrecision: 'DAY', relevantDate: '2026-01-01', fieldEvidence: [], unresolvedFields: [], resolutionHash: 'regime-hash' };
    const request: LegalResearchRequest = { id: 'research-jal', legalIssueId: 'issue-jal', coverageItemIds: [], question: 'Proposición sintética para probar el contrato, no texto de una norma real.', requestedAuthorityTypes: ['CODE'], sourceAuthorityMentionIds: [], contextHash: 'request-hash', regimeResolutionId: regime.id, status: 'VERIFICATION_PENDING', createdAt: '2026-01-01T00:00:00Z' };
    const result = await verifyAuthorityCandidate({ candidate: c, regime, request,
      evidence: { sourceUrl: c.sourceUrl!, sourceDomain: c.sourceDomain!, sourceTier: 'OFFICIAL_PRIMARY', retrievedAt: c.retrievedAt, locator: 'synthetic-article', sourceHash: 'synthetic-source-hash', excerptHash: 'synthetic-excerpt-hash' },
      proposition: { text: 'Proposición de prueba sintética.', supportLevel: 'DIRECT', sourceLocator: 'synthetic-article', limitations: [] },
    }, () => new Date('2026-01-01T00:00:00Z'));
    expect(result.rejection).toBeUndefined();
    expect(result.verifiedAuthority).toBeDefined();
    const verified = normalizeLegalAuthority(c, result.verifiedAuthority);
    expect(verified.verificationStatus).toBe('VERIFIED');
    expect((verified as any).provenance).toMatchObject({ level: 1, stage: 'VERIFIED', sourceHash: 'synthetic-source-hash' });
  });
});

function candidate(overrides: Partial<AuthorityCandidate> = {}): AuthorityCandidate {
  return { id: 'candidate-jal', requestId: 'research-jal', provider: 'STATE_OFFICIAL', authorityType: 'CODE', observedCitation: 'Código sintético de prueba', sourceUrl: 'https://congresoweb.congresojal.gob.mx/BibliotecaVirtual/synthetic-test', sourceDomain: 'congresoweb.congresojal.gob.mx', sourceTier: 'OFFICIAL_PRIMARY', issuingAuthority: 'Congreso de Jalisco', jurisdiction: 'STATE:MX-JAL', effectiveFrom: '2020-01-01', temporalStatus: 'CURRENT', retrievedAt: '2026-01-01T00:00:00Z', metadataStatus: 'COMPLETE', candidateStatus: 'RETRIEVED', ...overrides };
}
