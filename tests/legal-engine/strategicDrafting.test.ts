import { describe, expect, it } from 'vitest';
import { buildStrategicDraftPrompt, parseStrategicDraftModelOutput } from '../../lib/legal-engine/legal-strategy/strategicDrafting';

const valid = {
  draftText: 'A'.repeat(140),
  thesis: 'La tesis estratégica se limita al razonamiento identificado.',
  application: 'La aplicación conecta únicamente los hechos permitidos con la cuestión jurídica.',
  conclusion: 'La consecuencia propuesta queda sujeta a revisión humana.',
  distinctionOrRebuttal: ['La autoridad adverse conserva una limitación expresamente documentada.'],
  unresolvedRequirements: ['CLIENT_POSITION_REQUIRED'],
};

describe('strategic drafting contract', () => {
  it('builds a strict JSON-only prompt without model-owned source relations', () => {
    const prompt = buildStrategicDraftPrompt({
      plan: {
        id: 'plan-1', decisionReasoningId: 'reasoning-1', candidateId: 'candidate-1',
        thesis: 'tesis', legalQuestion: '¿pregunta?', propositionToEstablish: 'proposición',
        sourceFactIds: ['fact-1'], sourceArgumentIds: ['argument-1'], supportingAuthorities: [],
        adverseAuthorities: [], distinctionOrRebuttal: [], application: 'aplicación',
        unresolvedRequirements: ['CLIENT_POSITION_REQUIRED'], clientPositionRequired: true,
        clientAdoption: 'NOT_ADOPTED', readiness: 'DRAFTABLE_FOR_REVIEW', researchHash: 'hash-1',
      },
      reasoning: { id: 'reasoning-1', proposition: 'proposición', reasoningType: 'DECISION_REASONING', courtAttribution: 'RESOLUTOR' },
      sourceFacts: [{ id: 'fact-1', proposition: 'hecho' }],
      sourceArguments: [{ id: 'argument-1', proposition: 'argumento' }],
      supportingAuthorities: [], adverseAuthorities: [],
    });
    expect(prompt).toContain('exactamente un objeto JSON válido');
    expect(prompt).toContain('"draftText"');
    expect(prompt).not.toContain('sourceFactIds del modelo');
  });

  it('accepts the canonical output and rejects prose or unknown fields', () => {
    expect(parseStrategicDraftModelOutput(JSON.stringify(valid)).draftText).toHaveLength(140);
    expect(() => parseStrategicDraftModelOutput('prose')).toThrow('STRATEGIC_DRAFT_INVALID_JSON');
    expect(() => parseStrategicDraftModelOutput(JSON.stringify({ ...valid, inventedAuthority: 'x' })))
      .toThrow('STRATEGIC_DRAFT_UNKNOWN_OR_MISSING_FIELD');
  });
});
