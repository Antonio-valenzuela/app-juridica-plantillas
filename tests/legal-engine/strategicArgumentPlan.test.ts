import { describe, expect, it } from 'vitest';
import { buildStrategicArgumentPlan } from '@/lib/legal-engine/legal-strategy/strategicArgumentPlan';
import type { StrategicChallengeCandidate } from '@/lib/legal-engine/legal-strategy/strategicChallenge';
import type { StrategicChallengeReassessment } from '@/lib/legal-engine/legal-strategy/strategicChallenge';
import type { VerifiedAuthority } from '@/lib/legal-engine/legal-research/types';

const candidate: StrategicChallengeCandidate = {
  id: 'candidate-1',
  decisionReasoningId: 'reasoning-1',
  thesis: 'La motivación judicial delimitó incorrectamente el alcance de la revisión.',
  legalQuestion: '¿La resolución aplicó el estándar jurídico correcto al resolver el agravio?',
  propositionToEstablish: 'La revisión debe examinar la regla jurídica expresamente cuestionada.',
  sourceFactIds: ['fact-1'],
  sourceArgumentIds: ['argument-1'],
  authorityTypes: ['STATUTE'],
  adverseAuthorityRequired: true,
  researchNeeded: true,
  clientPositionRequired: true,
  origin: 'MODEL_PROPOSED_SYSTEM_VALIDATED',
  status: 'CLIENT_DECISION_REQUIRED',
  unresolvedRequirements: [],
  scope: {
    scope: 'FEDERAL',
    temporalCutoff: '2024',
    temporalPrecision: 'YEAR',
    sourceAdapters: ['FEDERAL_LEGISLATION'],
    sourceTiers: ['OFFICIAL_PRIMARY'],
  },
  provenance: [],
};

const reassessment: StrategicChallengeReassessment = {
  status: 'CLIENT_DECISION_REQUIRED',
  substantiveOutcome: 'SUPPORTED',
  clientPositionAdopted: false,
  clientDecisionRequired: true,
  unresolvedRequirements: [],
};

const authority = {
  id: 'authority-1',
  identity: {
    canonicalCitation: 'Ley de Amparo',
    authorityType: 'STATUTE',
    issuingAuthority: 'Congreso de la Unión',
    identityKey: 'ley-amparo',
  },
  source: {
    sourceUrl: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LAmp.pdf',
    sourceDomain: 'www.diputados.gob.mx',
    sourceTier: 'OFFICIAL_PRIMARY',
    retrievedAt: '2026-09-13T00:00:00.000Z',
    sourceHash: 'hash',
  },
  temporalValidity: {
    status: 'CURRENT_AND_APPLICABLE',
    checkedAt: '2026-09-13T00:00:00.000Z',
    basis: ['official'],
  },
  jurisdictionValidity: {
    status: 'APPLICABLE',
    scope: 'FEDERAL',
    bindingCharacter: 'BINDING_WHEN_APPLICABLE',
    basis: ['federal'],
  },
  proposition: {
    text: 'La norma establece el marco aplicable.',
    supportLevel: 'DIRECT',
    limitations: [],
  },
  verificationStatus: 'VERIFIED',
  supportsLegalIssueIds: [],
  sourceAuthorityMentionIds: [],
  verificationHash: 'verification-hash',
} satisfies VerifiedAuthority;

describe('StrategicArgumentPlan', () => {
  it('creates a review draft without fabricating client adoption', () => {
    const plan = buildStrategicArgumentPlan({
      candidate,
      reassessment,
      supportingAuthorities: [authority],
      adverseAuthorities: [],
      application: 'La aplicación se limita a los hechos y argumentos expresamente vinculados.',
      researchHash: 'research-hash',
    });

    expect(plan.readiness).toBe('DRAFTABLE_FOR_REVIEW');
    expect(plan.clientAdoption).toBe('NOT_ADOPTED');
    expect(plan.clientPositionRequired).toBe(true);
    expect(plan.unresolvedRequirements).toContain('CLIENT_POSITION_REQUIRED');
    expect(plan.supportingAuthorities).toHaveLength(1);
  });

  it('rejects unsupported research instead of creating a plan', () => {
    expect(() => buildStrategicArgumentPlan({
      candidate,
      reassessment: { ...reassessment, substantiveOutcome: 'INSUFFICIENT' },
      supportingAuthorities: [],
      adverseAuthorities: [],
      application: 'Aplicación.',
      researchHash: 'research-hash',
    })).toThrow('STRATEGIC_ARGUMENT_PLAN_REQUIRES_SUPPORTED_RESEARCH');
  });

  it('rejects a plan without a verified supporting authority', () => {
    expect(() => buildStrategicArgumentPlan({
      candidate,
      reassessment,
      supportingAuthorities: [],
      adverseAuthorities: [],
      application: 'La aplicación se limita a los hechos y argumentos expresamente vinculados.',
      researchHash: 'research-hash',
    })).toThrow('STRATEGIC_ARGUMENT_PLAN_MISSING_VERIFIED_SUPPORT');
  });

  it('keeps client adoption fail-closed even if an untrusted runtime value attempts to override it', () => {
    expect(() => buildStrategicArgumentPlan({
      candidate,
      reassessment: { ...reassessment, clientPositionAdopted: true } as unknown as StrategicChallengeReassessment,
      supportingAuthorities: [authority],
      adverseAuthorities: [],
      application: 'La aplicación se limita a los hechos y argumentos expresamente vinculados.',
      researchHash: 'research-hash',
    })).toThrow('STRATEGIC_ARGUMENT_PLAN_CLIENT_ADOPTION_FORBIDDEN');
  });
});
