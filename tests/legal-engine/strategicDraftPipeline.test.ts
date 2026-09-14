import { describe, expect, it } from 'vitest';
import { buildStrategicArgumentPlan } from '@/lib/legal-engine/legal-strategy/strategicArgumentPlan';
import {
  generateStrategicDraftForReview,
  evaluateStrategicDraft,
  type StrategicDraftCompletion,
} from '@/lib/legal-engine/legal-strategy/strategicDrafting';
import type { StrategicChallengeCandidate, StrategicChallengeReassessment } from '@/lib/legal-engine/legal-strategy/strategicChallenge';
import type { VerifiedAuthority } from '@/lib/legal-engine/legal-research/types';
import type { DecisionReasoningItem } from '@/lib/legal-engine/case-extraction/types';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { makeAssemblyInput } from '@/lib/legal-engine/documentAssemblyTypes';

const reasoning: DecisionReasoningItem = {
  id: 'reasoning-pipeline',
  proposition: 'El órgano jurisdiccional sostiene una conclusión delimitada para la decisión.',
  reasoningType: 'DECISION_REASONING',
  courtAttribution: 'RESOLUTOR',
  provenance: [{ sourceId: 'pdf', page: 19, excerpt: 'El órgano jurisdiccional sostiene una conclusión delimitada para la decisión.', excerptHash: 'excerpt-hash', extractionMethod: 'PARAGRAPH', confidence: 1, inferenceLevel: 'LITERAL' }],
  challengedByArgumentIds: [],
};

const candidate: StrategicChallengeCandidate = {
  id: 'candidate-pipeline', decisionReasoningId: reasoning.id,
  thesis: 'La conclusión judicial podría presentar un problema jurídico específico que requiere contraste.',
  legalQuestion: '¿Qué regla verificable permite determinar si esa conclusión está jurídicamente justificada?',
  propositionToEstablish: 'Debe establecerse una regla verificable para evaluar la justificación de la conclusión.',
  sourceFactIds: [], sourceArgumentIds: [], authorityTypes: ['JURISPRUDENCE'],
  adverseAuthorityRequired: true, researchNeeded: true, clientPositionRequired: true,
  origin: 'MODEL_PROPOSED_SYSTEM_VALIDATED', status: 'CLIENT_DECISION_REQUIRED',
  unresolvedRequirements: [], scope: { scope: 'FEDERAL', temporalCutoff: '2026-09-14', temporalPrecision: 'DAY', sourceAdapters: ['SCJN'], sourceTiers: ['OFFICIAL_PRIMARY'] }, provenance: reasoning.provenance,
};

const reassessment: StrategicChallengeReassessment = { status: 'CLIENT_DECISION_REQUIRED', substantiveOutcome: 'SUPPORTED', clientPositionAdopted: false, clientDecisionRequired: true, unresolvedRequirements: [] };

const authority: VerifiedAuthority = {
  id: 'verified-pipeline', identity: { canonicalCitation: 'Jurisprudencia controlada 1', authorityType: 'JURISPRUDENCE', issuingAuthority: 'SCJN', identityKey: 'jurisprudencia-controlada-1' },
  source: { sourceUrl: 'https://sjf2.scjn.gob.mx/detalle/1', sourceDomain: 'sjf2.scjn.gob.mx', sourceTier: 'OFFICIAL_PRIMARY', retrievedAt: '2026-09-14T00:00:00.000Z', locator: '1', sourceHash: 'hash-authority' },
  temporalValidity: { status: 'CURRENT_AND_APPLICABLE', checkedAt: '2026-09-14T00:00:00.000Z', basis: ['official'] },
  jurisdictionValidity: { status: 'APPLICABLE', scope: 'FEDERAL', bindingCharacter: 'BINDING_WHEN_APPLICABLE', basis: ['federal'] },
  proposition: { text: 'La regla controlada permite evaluar la justificación de la conclusión.', supportLevel: 'DIRECT', sourceLocator: '1', limitations: [] },
  verificationStatus: 'VERIFIED', supportsLegalIssueIds: [], sourceAuthorityMentionIds: [], verificationHash: 'verification-hash',
};

function plan() {
  return buildStrategicArgumentPlan({
    candidate, reassessment, supportingAuthorities: [authority], adverseAuthorities: [],
    application: 'La aplicación se limita al razonamiento judicial delimitado y a la regla oficial verificada.',
    researchHash: 'research-hash',
  });
}

const validOutput = {
  draftText: 'La conclusión judicial delimitada debe contrastarse con la regla oficial verificada, que permite evaluar la justificación de la conclusión. El análisis se circunscribe al razonamiento identificado, explica la relación entre la premisa normativa y la conclusión, y deja la adopción procesal a revisión humana.',
  thesis: 'La conclusión judicial delimitada requiere contraste con una regla verificable.',
  application: 'La aplicación conecta el razonamiento judicial delimitado con la regla oficial verificada, sin añadir hechos ni relaciones de fuente.',
  conclusion: 'El bloque queda propuesto para revisión humana y no constituye adopción del cliente.',
  distinctionOrRebuttal: [],
  unresolvedRequirements: ['CLIENT_POSITION_REQUIRED'],
};

describe('strategic draft pipeline', () => {
  it('evaluates a substantive draft against the plan and verified authority', () => {
    const evaluation = evaluateStrategicDraft({ output: validOutput, plan: plan(), reasoning, supportingAuthorities: [authority], adverseAuthorities: [] });
    expect(evaluation.verdict).toBe('PASS');
    expect(evaluation.hardFailReasons).toEqual([]);
  });

  it('calls the real completion seam once and emits a VALID_NON_FINAL block', async () => {
    let calls = 0;
    const completion: StrategicDraftCompletion = async () => { calls += 1; return { text: JSON.stringify(validOutput), model: 'controlled-nvidia-model', finishReason: 'stop' }; };
    const result = await generateStrategicDraftForReview({
      plan: plan(), reasoning, sourceFacts: [], sourceArguments: [], supportingAuthorities: [authority], adverseAuthorities: [], sectionId: 'sec-defensas', completion,
    });
    expect(calls).toBe(1);
    expect(result.block.issueDraftValidationStatus).toBe('VALID_NON_FINAL');
    expect(result.block.strategicArgumentPlanId).toBe(result.plan.id);
    expect(result.block.verifiedAuthorityIds).toEqual([authority.id]);
    expect(result.block.coverageItemIds).toEqual([]);
  });

  it('does not emit a substantive block for a semantically unsafe draft', async () => {
    const completion: StrategicDraftCompletion = async () => ({ text: JSON.stringify({ ...validOutput, draftText: 'La ley es clara.' }), model: 'controlled-nvidia-model' });
    const result = await generateStrategicDraftForReview({ plan: plan(), reasoning, sourceFacts: [], sourceArguments: [], supportingAuthorities: [authority], adverseAuthorities: [], sectionId: 'sec-defensas', completion });
    expect(result.evaluation.verdict).toBe('FAIL');
    expect(result.block.issueDraftValidationStatus).toBe('INVALID_RETRYABLE');
  });

  it('materializes the review block in the canonical editor assembly with strategic trace links', async () => {
    const completion: StrategicDraftCompletion = async () => ({ text: JSON.stringify(validOutput), model: 'controlled-nvidia-model' });
    const generated = await generateStrategicDraftForReview({ plan: plan(), reasoning, sourceFacts: [], sourceArguments: [], supportingAuthorities: [authority], adverseAuthorities: [], sectionId: 'sec-defensas', completion });
    const assembled = assembleLegalDraft(makeAssemblyInput({
      candidateBlocks: [{ sectionId: 'sec-defensas', block: generated.block }],
      coverageMatrix: undefined,
    }));
    expect(assembled.orderedBlocks.map((block) => block.id)).toEqual([generated.block.id]);
    expect(assembled.readiness).toBe('INCOMPLETE');
    expect(assembled.trace.blockLinks[0]).toMatchObject({
      strategicCandidateId: generated.plan.candidateId,
      decisionReasoningId: generated.plan.decisionReasoningId,
      strategicArgumentPlanId: generated.plan.id,
    });
    expect(assembled.findings.map((finding) => finding.code)).toContain('VALID_NON_FINAL_BLOCK_ADMITTED');
  });
});
