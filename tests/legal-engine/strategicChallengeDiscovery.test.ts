import { describe, expect, it } from 'vitest';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';
import type { DecisionReasoningItem } from '@/lib/legal-engine/case-extraction/types';
import type { ResearchPlanScopeInput } from '@/lib/legal-engine/legal-research/plan';
import {
  buildStrategicChallengeResearchPlan,
  buildStrategicLegalResearchPlan,
} from '@/lib/legal-engine/legal-research/plan';
import {
  createStrategicChallengeCandidate,
  createControlledStrategicChallengeAnalyzer,
  runControlledStrategicChallengeResearch,
  type StrategicChallengeProposal,
} from '@/lib/legal-engine/legal-strategy/strategicChallenge';
import {
  runRealStrategicChallengeAnalyzer,
  type StrategicChallengeAnalyzerCompletion,
} from '@/lib/legal-engine/legal-strategy/realStrategicChallengeAnalyzer';
import { createFixtureOfficialAdapter } from '@/lib/legal-engine/legal-research/adapters/fixtureOfficial';
import type { LegalRegimeResolution } from '@/lib/legal-engine/legal-research/types';

const scope: ResearchPlanScopeInput = {
  scope: 'FEDERAL',
  matter: 'CONTROLLED_MATTER',
  procedure: 'CONTROLLED_PROCEDURE',
  temporalCutoff: '2026-09-13',
  temporalPrecision: 'DAY',
  sourceAdapters: ['FIXTURE_OFFICIAL'],
  sourceTiers: ['OFFICIAL_PRIMARY'],
};

const reasoningFixture: DecisionReasoningItem = {
  id: 'reasoning-real-probe',
  proposition: 'El órgano jurisdiccional sostiene una conclusión delimitada para la decisión.',
  reasoningType: 'DECISION_REASONING',
  courtAttribution: 'RESOLUTOR',
  referenceNumber: 'V',
  provenance: [{
    ...createSourceProvenance({
      sourceId: 'real-decision-source',
      page: 12,
      elementIndex: 4,
      excerpt: 'El órgano jurisdiccional sostiene una conclusión delimitada para la decisión.',
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    }),
    candidateId: 'reasoning-candidate-1',
  }],
  challengedByArgumentIds: [],
};

const controlledProposal: StrategicChallengeProposal = {
  thesis: 'La conclusión judicial podría presentar un problema jurídico específico que requiere contraste.',
  legalQuestion: '¿Qué regla verificable permite determinar si esa conclusión está jurídicamente justificada?',
  propositionToEstablish: 'Debe establecerse una regla verificable para evaluar la justificación de la conclusión.',
  researchGaps: ['Falta verificar el estándar aplicable y sus límites.'],
};

const regime: LegalRegimeResolution = {
  id: 'controlled-regime',
  status: 'RESOLVED',
  scope: 'FEDERAL',
  matter: { code: 'CONTROLLED_MATTER', displayName: 'Controlled matter' },
  procedure: { code: 'CONTROLLED_PROCEDURE', displayName: 'Controlled procedure' },
  relevantDate: '2026-09-13',
  temporalPrecision: 'DAY',
  fieldEvidence: [],
  unresolvedFields: [],
  resolutionHash: 'controlled-regime-hash',
};

function authorityRecord(label: string, proposition: string) {
  return {
    authorityType: 'JURISPRUDENCE' as const,
    citation: `Controlled authority ${label}`,
    canonicalCitation: `Controlled authority ${label}`,
    sourceUrl: `https://fixture.invalid/${label}`,
    sourceDomain: 'fixture.invalid',
    issuingAuthority: 'Controlled Court',
    jurisdiction: 'FEDERAL',
    matter: 'CONTROLLED_MATTER',
    procedure: 'CONTROLLED_PROCEDURE',
    locator: `fixture-${label}`,
    proposition,
    content: `Controlled content ${label}`,
  };
}

function candidateInput(proposal: StrategicChallengeProposal = controlledProposal) {
  return {
    reasoning: reasoningFixture,
    proposal,
    allowlistedFactIds: [],
    allowlistedArgumentIds: [],
    sourceFactIds: [],
    sourceArgumentIds: [],
    authorityTypes: ['JURISPRUDENCE'] as const,
    adverseAuthorityRequired: true,
    scope,
  };
}

describe('StrategicChallengeCandidate foundation', () => {
  it('creates a research-required hypothesis linked to source-backed reasoning', () => {
    const reasoningBefore = JSON.stringify(reasoningFixture);
    const candidate = createStrategicChallengeCandidate(candidateInput());

    expect(candidate).toMatchObject({
      decisionReasoningId: reasoningFixture.id,
      origin: 'MODEL_PROPOSED_SYSTEM_VALIDATED',
      status: 'RESEARCH_REQUIRED',
      researchNeeded: true,
      clientPositionRequired: true,
      sourceFactIds: [],
      sourceArgumentIds: [],
      provenance: reasoningFixture.provenance,
    });
    expect(candidate).not.toHaveProperty('verifiedAuthorityIds');
    expect(candidate).not.toHaveProperty('clientAdopted');
    expect(JSON.stringify(reasoningFixture)).toBe(reasoningBefore);
  });

  it('rejects system relations that are not explicitly allowlisted', () => {
    expect(() => createStrategicChallengeCandidate({
      ...candidateInput(),
      sourceFactIds: ['fact-not-allowed'],
    })).toThrow('UNALLOWLISTED_SOURCE_FACT');

    expect(() => createStrategicChallengeCandidate({
      ...candidateInput(),
      sourceArgumentIds: ['argument-not-allowed'],
    })).toThrow('UNALLOWLISTED_SOURCE_ARGUMENT');
  });

  it('rejects unsafe reasoning provenance and generic hypotheses', () => {
    expect(() => createStrategicChallengeCandidate({
      ...candidateInput(),
      reasoning: { ...reasoningFixture, provenance: [] },
    })).toThrow('MISSING_REASONING_PROVENANCE');

    expect(() => createStrategicChallengeCandidate(candidateInput({
      ...controlledProposal,
      thesis: 'Hay un error.',
    }))).toThrow('NON_SPECIFIC_CHALLENGE_THESIS');
  });

  it('rejects analyzer fields that attempt to set system-owned state or authority relations', () => {
    expect(() => createStrategicChallengeCandidate(candidateInput({
      ...controlledProposal,
      status: 'SUPPORTED',
      verifiedAuthorityIds: ['authority-invented'],
      legalIssueId: 'issue-invented',
      clientAdopted: true,
    } as StrategicChallengeProposal & Record<string, unknown>))).toThrow('MODEL_OWNED_FIELD_FORBIDDEN');

    expect(() => createStrategicChallengeCandidate(candidateInput({
      ...controlledProposal,
      clientPositionRequired: false,
    } as StrategicChallengeProposal & Record<string, unknown>))).toThrow('MODEL_OWNED_FIELD_FORBIDDEN');
  });

  it('uses deterministic identity for equivalent proposals and separates distinct hypotheses', () => {
    const first = createStrategicChallengeCandidate(candidateInput());
    const equivalent = createStrategicChallengeCandidate(candidateInput({
      ...controlledProposal,
      thesis: `  ${controlledProposal.thesis.replace(/\s+/g, ' ')}  `,
      legalQuestion: ` ${controlledProposal.legalQuestion} `,
      propositionToEstablish: ` ${controlledProposal.propositionToEstablish} `,
    }));
    const different = createStrategicChallengeCandidate(candidateInput({
      ...controlledProposal,
      propositionToEstablish: 'Otra proposición verificable y distinta debe contrastarse para el mismo razonamiento.',
    }));

    expect(first.id).toBe(equivalent.id);
    expect(first.id).not.toBe(different.id);
  });
});

describe('candidate-target research plan', () => {
  it('creates a strategic plan targeted to a challenge candidate without a legalIssueId', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);

    expect(plan.target).toEqual({
      kind: 'STRATEGIC_CHALLENGE_CANDIDATE',
      strategicChallengeCandidateId: candidate.id,
      decisionReasoningId: reasoningFixture.id,
    });
    expect(plan.legalIssueId).toBeUndefined();
    expect(plan.challengedReasoningIds).toEqual([]);
    expect(plan.purpose).toBe('STRATEGIC_ISSUE_RESEARCH');
    expect(plan.researchQuestions[0]).toMatchObject({
      propositionToEstablish: candidate.propositionToEstablish,
      adverseAuthorityRequired: true,
    });
    expect(plan.completenessCriteria.adverseAuthorityStatus).toBe('REQUIRED_NOT_CHECKED');
  });

  it('blocks a candidate plan when the source reasoning relation is empty', async () => {
    const plan = await buildStrategicChallengeResearchPlan({
      ...createStrategicChallengeCandidate(candidateInput()),
      id: 'candidate-without-reasoning',
      decisionReasoningId: '',
    });

    expect(plan.status).toBe('BLOCKED');
    expect(plan.blockers).toContain('BLOCKED_MISSING_EXPLICIT_RELATION');
  });

  it('preserves the existing legal-issue target and deterministic plan identity', async () => {
    const input = {
      legalIssueId: 'issue-existing-path',
      propositionToEstablish: 'La proposición existente requiere una regla verificable.',
      sourceFactIds: ['fact-2', 'fact-1'],
      sourceArgumentIds: ['argument-2', 'argument-1'],
      sourceClaimIds: [],
      challengedReasoningIds: [],
      authorityTypes: ['JURISPRUDENCE'] as const,
      adverseAuthorityRequired: true,
      scope,
    };
    const first = await buildStrategicLegalResearchPlan(input);
    const second = await buildStrategicLegalResearchPlan({
      ...input,
      sourceFactIds: ['fact-1', 'fact-2'],
      sourceArgumentIds: ['argument-1', 'argument-2'],
    });

    expect(first.target).toEqual({ kind: 'LEGAL_ISSUE', legalIssueId: input.legalIssueId });
    expect(first.legalIssueId).toBe(input.legalIssueId);
    expect(first.planHash).toBe(second.planHash);
  });
});

describe('controlled strategic challenge research', () => {
  it('accepts only analyzer fields and lets the system create the candidate', () => {
    const analyzer = createControlledStrategicChallengeAnalyzer(controlledProposal);
    const proposal = analyzer.propose({ reasoning: reasoningFixture });
    const candidate = createStrategicChallengeCandidate({
      ...candidateInput(proposal),
      clientPositionRequired: true,
    });

    expect(proposal).toEqual(controlledProposal);
    expect(candidate.status).toBe('RESEARCH_REQUIRED');
    expect(candidate.origin).toBe('MODEL_PROPOSED_SYSTEM_VALIDATED');
  });

  it('does not support a candidate from favorable evidence while adverse authority is unchecked', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);
    const result = await runControlledStrategicChallengeResearch({
      candidate,
      plan,
      regime,
      passes: [{
        polarity: 'SUPPORTING',
        provider: createFixtureOfficialAdapter([authorityRecord(
          'supporting',
          'La regla controlada permite evaluar la justificación de la conclusión.',
        )]),
      }],
    });

    expect(result.supportingVerified).toHaveLength(1);
    expect(result.requests.every((request) => request.legalIssueId === undefined)).toBe(true);
    expect(result.supportingVerified.every((authority) => authority.supportsLegalIssueIds.length === 0)).toBe(true);
    expect(result.reassessment.status).not.toBe('SUPPORTED');
    expect(result.reassessment.unresolvedRequirements).toContain('ADVERSE_AUTHORITY_CHECK_REQUIRED');
  });

  it('guards confirmation bias when supporting and adverse authorities are both verified', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);
    const result = await runControlledStrategicChallengeResearch({
      candidate,
      plan,
      regime,
      passes: [
        {
          polarity: 'SUPPORTING',
          provider: createFixtureOfficialAdapter([authorityRecord(
            'supporting',
            'La regla controlada permite evaluar la justificación de la conclusión.',
          )]),
        },
        {
          polarity: 'ADVERSE',
          provider: createFixtureOfficialAdapter([authorityRecord(
            'adverse',
            'La regla controlada limita la justificación de la conclusión en este contexto.',
          )]),
        },
      ],
    });

    expect(result.supportingVerified).toHaveLength(1);
    expect(result.adverseVerified).toHaveLength(1);
    expect(result.reassessment.status).not.toBe('SUPPORTED');
    expect(['LIMITED', 'CONTRADICTED']).toContain(result.reassessment.substantiveOutcome);
  });

  it('returns insufficient when required research produces no authority', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);
    const result = await runControlledStrategicChallengeResearch({
      candidate,
      plan,
      regime,
      passes: [
        { polarity: 'SUPPORTING', provider: createFixtureOfficialAdapter([]) },
        { polarity: 'ADVERSE', provider: createFixtureOfficialAdapter([]) },
      ],
    });

    expect(result.supportingVerified).toEqual([]);
    expect(result.adverseVerified).toEqual([]);
    expect(result.reassessment.substantiveOutcome).toBe('INSUFFICIENT');
    expect(result.reassessment.status).toBe('INSUFFICIENT');
  });

  it('requires client adoption after sufficient research without changing source position', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);
    const result = await runControlledStrategicChallengeResearch({
      candidate,
      plan,
      regime,
      passes: [
        {
          polarity: 'SUPPORTING',
          provider: createFixtureOfficialAdapter([authorityRecord(
            'supporting',
            'La regla controlada permite evaluar la justificación de la conclusión.',
          )]),
        },
        { polarity: 'ADVERSE', provider: createFixtureOfficialAdapter([]) },
      ],
    });

    expect(result.reassessment.substantiveOutcome).toBe('SUPPORTED');
    expect(result.reassessment.status).toBe('CLIENT_DECISION_REQUIRED');
    expect(result.reassessment.clientPositionAdopted).toBe(false);
  });

  it('records each supporting/adverse pass, discovered candidates, rejections, and no-result outcomes', async () => {
    const candidate = createStrategicChallengeCandidate(candidateInput());
    const plan = await buildStrategicChallengeResearchPlan(candidate);
    const result = await runControlledStrategicChallengeResearch({
      candidate,
      plan,
      regime,
      passes: [
        {
          polarity: 'SUPPORTING',
          provider: createFixtureOfficialAdapter([authorityRecord(
            'supporting',
            'La regla controlada permite evaluar la justificación de la conclusión.',
          )]),
        },
        { polarity: 'ADVERSE', provider: createFixtureOfficialAdapter([]) },
      ],
    });

    expect(result.passAudit).toHaveLength(2);
    expect(result.passAudit[0]).toMatchObject({
      polarity: 'SUPPORTING',
      searchStatus: 'PASS',
      discoveredCandidateCount: 1,
      verifiedAuthorityCount: 1,
      rejectedCandidateCount: 0,
      noResults: false,
    });
    expect(result.passAudit[1]).toMatchObject({
      polarity: 'ADVERSE',
      searchStatus: 'PASS',
      discoveredCandidateCount: 0,
      verifiedAuthorityCount: 0,
      rejectedCandidateCount: 0,
      noResults: true,
    });
  });
});

describe('real strategic challenge analyzer contract', () => {
  function analyzerInput(overrides: Partial<Parameters<typeof runRealStrategicChallengeAnalyzer>[0]> = {}) {
    return {
      reasoning: reasoningFixture,
      allowlistedFactIds: [],
      allowlistedArgumentIds: [],
      authorityTypes: ['JURISPRUDENCE'] as const,
      adverseAuthorityRequired: true,
      scope,
      ...overrides,
    };
  }

  function completionWith(payload: unknown, capture?: { prompt?: string }): StrategicChallengeAnalyzerCompletion {
    return async (options) => {
      if (capture) capture.prompt = options.prompt;
      return {
        text: JSON.stringify(payload),
        model: 'controlled-nvidia-model',
        finishReason: 'stop',
        isTruncated: false,
      };
    };
  }

  it('accepts zero candidates as a valid safe result without fallback or research', async () => {
    const completion = completionWith({ candidates: [] });
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), { completion });

    expect(result.audit.jsonParsed).toBe(true);
    expect(result.audit.rawCandidateCount).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(result.plans).toEqual([]);
    expect(result.audit.fallbackUsed).toBe(false);
  });

  it('creates only a research-required candidate and candidate-target plan after strict validation', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({ candidates: [controlledProposal] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      origin: 'MODEL_PROPOSED_SYSTEM_VALIDATED',
      status: 'RESEARCH_REQUIRED',
      researchNeeded: true,
      clientPositionRequired: true,
    });
    expect(result.candidates[0]).not.toHaveProperty('verifiedAuthorityIds');
    expect(result.plans[0]?.target).toEqual({
      kind: 'STRATEGIC_CHALLENGE_CANDIDATE',
      strategicChallengeCandidateId: result.candidates[0].id,
      decisionReasoningId: reasoningFixture.id,
    });
    expect(result.plans[0]?.status).toBe('INCOMPLETE');
    expect(result.rejected).toEqual([]);
  });

  it('rejects unknown and model-owned fields before semantic materialization', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({
        candidates: [{
          ...controlledProposal,
          verifiedAuthorityIds: ['authority-invented'],
          status: 'SUPPORTED',
          unknownField: 'must-reject',
        }],
      }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.plans).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      schema: 'FAIL',
      canonicalCandidate: 'REJECTED',
    });
    expect(result.rejected[0]?.forbiddenFields).toEqual(['status', 'verifiedAuthorityIds']);
    expect(result.rejected[0]?.unknownFields).toContain('unknownField');
  });

  it('rejects model-owned source IDs while attaching only explicit system relations', async () => {
    const safe = await runRealStrategicChallengeAnalyzer(analyzerInput({
      allowlistedFactIds: ['fact-explicit'],
      allowlistedArgumentIds: ['argument-explicit'],
    }), {
      completion: completionWith({ candidates: [controlledProposal] }),
    });

    expect(safe.candidates[0]).toMatchObject({
      sourceFactIds: ['fact-explicit'],
      sourceArgumentIds: ['argument-explicit'],
    });

    const result = await runRealStrategicChallengeAnalyzer(analyzerInput({
      allowlistedFactIds: ['fact-explicit'],
      allowlistedArgumentIds: ['argument-explicit'],
    }), {
      completion: completionWith({
        candidates: [{
          ...controlledProposal,
          sourceFactIds: ['fact-explicit'],
          sourceArgumentIds: ['argument-explicit'],
        }],
      }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejected[0]).toMatchObject({
      schema: 'FAIL',
      canonicalCandidate: 'REJECTED',
    });
    expect(result.rejected[0]?.forbiddenFields).toEqual(['sourceArgumentIds', 'sourceFactIds']);
  });

  it('rejects generic or conclusive proposals through the existing semantic contract', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({
        candidates: [{
          ...controlledProposal,
          thesis: 'El tribunal violó la ley.',
          propositionToEstablish: 'Quedó demostrado que la decisión es definitivamente incorrecta.',
        }],
      }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.rejected[0]?.semantic).toBe('FAIL');
    expect(result.rejected[0]?.canonicalCandidate).toBe('REJECTED');
  });

  it('sends only bounded reasoning context and explicitly allowlisted related material', async () => {
    const capture: { prompt?: string } = {};
    await runRealStrategicChallengeAnalyzer(analyzerInput({
      relevantSection: 'Consideración V',
      relatedFacts: [{ id: 'fact-allowed', text: 'Hecho expresamente conectado.' }, { id: 'fact-nearby', text: 'No debe pasar.' }],
      relatedSourceArguments: [{ id: 'argument-allowed', text: 'Argumento expresamente conectado.' }],
      allowlistedFactIds: ['fact-allowed'],
      allowlistedArgumentIds: ['argument-allowed'],
    }), { completion: completionWith({ candidates: [] }, capture) });

    expect(capture.prompt).toContain(reasoningFixture.proposition);
    expect(capture.prompt).toContain('fact-allowed');
    expect(capture.prompt).toContain('argument-allowed');
    expect(capture.prompt).not.toContain('fact-nearby');
    expect(capture.prompt).not.toContain('PDF_COMPLETO_NO_PERMITIDO');
    expect(capture.prompt).toContain('0..N');
  });

  it('does not invoke the completion dependency more than once per analyzer run', async () => {
    let calls = 0;
    const completion: StrategicChallengeAnalyzerCompletion = async () => {
      calls += 1;
      return { text: JSON.stringify({ candidates: [] }), model: 'controlled', finishReason: 'stop' };
    };

    await runRealStrategicChallengeAnalyzer(analyzerInput(), { completion });
    expect(calls).toBe(1);
  });

  it('passes the exact strategic output schema to the completion transport', async () => {
    let outputSchema: Record<string, unknown> | undefined;
    const completion: StrategicChallengeAnalyzerCompletion = async (options) => {
      outputSchema = (options as unknown as { outputSchema?: Record<string, unknown> }).outputSchema;
      return { text: JSON.stringify({ candidates: [] }), model: 'controlled', finishReason: 'stop' };
    };

    await runRealStrategicChallengeAnalyzer(analyzerInput(), { completion });

    expect(outputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        candidates: {
          type: 'array',
          items: { type: 'object', additionalProperties: false },
        },
      },
      required: ['candidates'],
    });
  });

  it('keeps multiple valid candidates and rejects only invalid records', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({
        candidates: [
          controlledProposal,
          {
            ...controlledProposal,
            thesis: 'Hay un problema general con la resolución.',
          },
        ],
      }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.audit.rawCandidateCount).toBe(2);
    expect(result.audit.acceptedCandidateCount).toBe(1);
  });

  it('rejects fenced JSON and prose envelopes instead of repairing the response', async () => {
    for (const text of [
      `\`\`\`json\n${JSON.stringify({ candidates: [] })}\n\`\`\``,
      `Resultado:\n${JSON.stringify({ candidates: [] })}`,
    ]) {
      const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
        completion: async () => ({ text, model: 'controlled', finishReason: 'stop' }),
      });

      expect(result.audit.jsonParsed).toBe(false);
      expect(result.audit.responseShape).toBe('FAIL');
      expect(result.candidates).toEqual([]);
      expect(result.plans).toEqual([]);
    }
  });

  it('preserves a transport HTTP status when the completion fails before returning a result', async () => {
    const transportError = Object.assign(new Error('HTTP 400: structured output unsupported'), { httpStatus: 400 });
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: async () => { throw transportError; },
    });

    expect(result.audit.httpStatus).toBe(400);
    expect(result.candidates).toEqual([]);
    expect(result.plans).toEqual([]);
  });

  it('classifies a completion timeout separately from HTTP and semantic failures', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: async () => { throw new Error('Timeout de 30000ms alcanzado en la llamada a NVIDIA Build.'); },
    });

    expect(result.audit.requestId).toMatch(/^strategic-analyzer-/);
    expect(result.audit.failureMetrics).toMatchObject({ httpTimeout: 1, httpNon2xx: 0, invalidJson: 0, schemaReject: 0, semanticReject: 0, noCandidate: 0 });
    expect(result.audit.outcome).toBe('HTTP_TIMEOUT');
  });

  it('classifies invalid JSON and semantic rejection independently', async () => {
    const malformed = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: async () => ({ text: '{"candidates":[', model: 'controlled' }),
    });
    const semantic = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({ candidates: [{ ...controlledProposal, thesis: 'El tribunal violó la ley.' }] }),
    });

    expect(malformed.audit.failureMetrics.invalidJson).toBe(1);
    expect(malformed.audit.outcome).toBe('INVALID_JSON');
    expect(semantic.audit.failureMetrics.semanticReject).toBe(1);
    expect(semantic.audit.outcome).toBe('SEMANTIC_REJECT');
  });

  it('fails safe on malformed JSON and does not synthesize a proposal', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: async () => ({ text: '{"candidates":[{"thesis":"unterminated"}', model: 'controlled' }),
    });

    expect(result.audit.jsonParsed).toBe(false);
    expect(result.audit.responseShape).toBe('FAIL');
    expect(result.audit.rawCandidateCount).toBe(0);
    expect(result.candidates).toEqual([]);
    expect(result.plans).toEqual([]);
    expect(result.audit.fallbackUsed).toBe(false);
  });

  it('rejects unknown top-level fields instead of accepting an expanded response contract', async () => {
    const result = await runRealStrategicChallengeAnalyzer(analyzerInput(), {
      completion: completionWith({ candidates: [], explanation: 'not part of the contract' }),
    });

    expect(result.audit.jsonParsed).toBe(true);
    expect(result.audit.responseShape).toBe('FAIL');
    expect(result.audit.topLevelUnknownFields).toEqual(['explanation']);
    expect(result.candidates).toEqual([]);
    expect(result.plans).toEqual([]);
  });
});
