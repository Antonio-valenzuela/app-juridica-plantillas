import type { StrategicArgumentPlan } from './strategicArgumentPlan';
import type { DecisionReasoningItem } from '../case-extraction/types';
import type { VerifiedAuthority } from '../legal-research/types';
import type { ContentBlock } from '../types';
import { generateNVIDIACompletion, type NVIDIACompletionOptions } from '../../ai/providers/nvidia';
import { stableResearchId } from '../legal-research/canonical';

export const STRATEGIC_DRAFT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['draftText', 'thesis', 'application', 'conclusion', 'distinctionOrRebuttal', 'unresolvedRequirements'],
  properties: {
    draftText: { type: 'string', minLength: 120 },
    thesis: { type: 'string', minLength: 20 },
    application: { type: 'string', minLength: 40 },
    conclusion: { type: 'string', minLength: 20 },
    distinctionOrRebuttal: { type: 'array', items: { type: 'string' } },
    unresolvedRequirements: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface StrategicDraftModelOutput {
  draftText: string;
  thesis: string;
  application: string;
  conclusion: string;
  distinctionOrRebuttal: string[];
  unresolvedRequirements: string[];
}

export interface StrategicDraftPromptInput {
  plan: StrategicArgumentPlan;
  reasoning: Pick<DecisionReasoningItem, 'id' | 'proposition' | 'reasoningType' | 'courtAttribution'>;
  sourceFacts: readonly { id: string; proposition: string }[];
  sourceArguments: readonly { id: string; proposition: string }[];
  supportingAuthorities: readonly VerifiedAuthority[];
  adverseAuthorities: readonly VerifiedAuthority[];
}

export interface StrategicDraftCompletionResult {
  text: string;
  model: string;
  finishReason?: string;
  isTruncated?: boolean;
}

export type StrategicDraftCompletion = (
  options: NVIDIACompletionOptions,
) => Promise<StrategicDraftCompletionResult>;

export interface StrategicDraftEvaluation {
  verdict: 'PASS' | 'WEAK' | 'FAIL';
  overallScore: number;
  reasoningGrounding: number;
  authorityGrounding: number;
  applicationGrounding: number;
  specificity: number;
  completeness: number;
  deficiencies: string[];
  hardFailReasons: string[];
}

export interface EvaluateStrategicDraftInput {
  output: StrategicDraftModelOutput;
  plan: StrategicArgumentPlan;
  reasoning: Pick<DecisionReasoningItem, 'proposition'>;
  supportingAuthorities: readonly VerifiedAuthority[];
  adverseAuthorities: readonly VerifiedAuthority[];
}

export interface GenerateStrategicDraftForReviewInput extends StrategicDraftPromptInput {
  sectionId: string;
  documentId?: string;
  generationId?: string;
  completion?: StrategicDraftCompletion;
}

export interface StrategicDraftForReviewResult {
  plan: StrategicArgumentPlan;
  output?: StrategicDraftModelOutput;
  evaluation: StrategicDraftEvaluation;
  block: ContentBlock;
  provider: string;
  model: string | null;
  finishReason?: string;
  parseError?: string;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function buildStrategicDraftPrompt(input: StrategicDraftPromptInput): string {
  return [
    'Redacta un argumento jurídico estratégico para revisión humana, usando únicamente el contexto verificado incluido abajo.',
    'Devuelve exactamente un objeto JSON válido, sin markdown, sin cercas de código y sin texto fuera del JSON.',
    'No inventes hechos, posturas del cliente, autoridades, citas, artículos, números de expediente ni relaciones de fuente.',
    'No afirmes que una autoridad adverse fue superada si el contexto sólo muestra una limitación.',
    'Si falta una decisión del cliente o un requisito, conserva la incertidumbre en unresolvedRequirements.',
    'El texto debe ser sustantivo, específico al razonamiento impugnado y no una plantilla genérica.',
    '',
    'Esquema exacto:',
    json(STRATEGIC_DRAFT_OUTPUT_SCHEMA),
    '',
    'Razonamiento judicial delimitado:',
    json(input.reasoning),
    'Plan estratégico del sistema:',
    json(input.plan),
    'Hechos fuente permitidos:',
    json(input.sourceFacts),
    'Argumentos fuente permitidos:',
    json(input.sourceArguments),
    'Autoridades oficiales verificadas supporting:',
    json(input.supportingAuthorities),
    'Autoridades oficiales verificadas adverse/limitantes:',
    json(input.adverseAuthorities),
  ].join('\n');
}

export function parseStrategicDraftModelOutput(raw: string): StrategicDraftModelOutput {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('STRATEGIC_DRAFT_INVALID_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('STRATEGIC_DRAFT_OUTPUT_NOT_OBJECT');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = Object.keys(STRATEGIC_DRAFT_OUTPUT_SCHEMA.properties).sort();
  if (keys.join('|') !== expected.join('|')) throw new Error('STRATEGIC_DRAFT_UNKNOWN_OR_MISSING_FIELD');
  const strings = ['draftText', 'thesis', 'application', 'conclusion'] as const;
  for (const field of strings) {
    if (typeof record[field] !== 'string' || record[field].trim().length < (field === 'draftText' ? 120 : 20)) {
      throw new Error(`STRATEGIC_DRAFT_INVALID_FIELD:${field}`);
    }
  }
  for (const field of ['distinctionOrRebuttal', 'unresolvedRequirements'] as const) {
    if (!Array.isArray(record[field]) || record[field].some((item) => typeof item !== 'string')) {
      throw new Error(`STRATEGIC_DRAFT_INVALID_FIELD:${field}`);
    }
  }
  return {
    draftText: record.draftText as string,
    thesis: record.thesis as string,
    application: record.application as string,
    conclusion: record.conclusion as string,
    distinctionOrRebuttal: [...(record.distinctionOrRebuttal as string[])],
    unresolvedRequirements: [...(record.unresolvedRequirements as string[])],
  };
}

function normalizedTokens(value: string): string[] {
  return Array.from(new Set(value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 6)));
}

function overlaps(text: string, source: string, minimum = 1): boolean {
  const target = new Set(normalizedTokens(text));
  return normalizedTokens(source).filter((token) => target.has(token)).length >= minimum;
}

export function evaluateStrategicDraft(input: EvaluateStrategicDraftInput): StrategicDraftEvaluation {
  const { output, plan, reasoning, supportingAuthorities, adverseAuthorities } = input;
  const fullText = `${output.draftText} ${output.thesis} ${output.application} ${output.conclusion}`;
  const deficiencies: string[] = [];
  const hardFailReasons: string[] = [];

  if (output.draftText.trim().length < 120) hardFailReasons.push('STRATEGIC_DRAFT_TOO_SHORT');
  const reasoningGrounding = overlaps(fullText, reasoning.proposition, 2) ? 1 : overlaps(fullText, reasoning.proposition) ? 0.55 : 0;
  if (reasoningGrounding === 0) hardFailReasons.push('STRATEGIC_REASONING_NOT_GROUNDED');

  const authorityGrounding = supportingAuthorities.length === 0
    ? 0
    : supportingAuthorities.some((authority) => overlaps(fullText, authority.proposition.text, 2)
      || overlaps(fullText, authority.identity.canonicalCitation)) ? 1 : 0;
  if (authorityGrounding === 0) hardFailReasons.push('STRATEGIC_AUTHORITY_NOT_GROUNDED');

  const applicationGrounding = output.application.trim().length >= 40 && overlaps(output.application, plan.propositionToEstablish)
    ? 1
    : output.application.trim().length >= 40 ? 0.65 : 0;
  if (applicationGrounding === 0) deficiencies.push('STRATEGIC_APPLICATION_MISSING');

  const specificity = overlaps(output.thesis, plan.thesis) && overlaps(fullText, plan.legalQuestion) ? 1 : overlaps(fullText, plan.thesis) ? 0.65 : 0;
  if (specificity === 0) deficiencies.push('STRATEGIC_SPECIFICITY_LOW');

  const unresolved = new Set([...plan.unresolvedRequirements, ...output.unresolvedRequirements]);
  const completeness = output.thesis.trim().length >= 20
    && output.application.trim().length >= 40
    && output.conclusion.trim().length >= 20
    && (plan.clientPositionRequired ? unresolved.has('CLIENT_POSITION_REQUIRED') : true)
    && (adverseAuthorities.length === 0 || output.distinctionOrRebuttal.length > 0)
    ? 1 : 0.5;
  if (plan.clientPositionRequired && !unresolved.has('CLIENT_POSITION_REQUIRED')) {
    hardFailReasons.push('CLIENT_POSITION_REQUIREMENT_DROPPED');
  }
  if (adverseAuthorities.length > 0 && output.distinctionOrRebuttal.length === 0) {
    deficiencies.push('ADVERSE_AUTHORITY_RESPONSE_MISSING');
  }

  const dimensions = [reasoningGrounding, authorityGrounding, applicationGrounding, specificity, completeness];
  const overallScore = dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length;
  const verdict = hardFailReasons.length > 0 ? 'FAIL' : overallScore >= 0.75 && deficiencies.length === 0 ? 'PASS' : 'WEAK';
  return { verdict, overallScore, reasoningGrounding, authorityGrounding, applicationGrounding, specificity, completeness, deficiencies: [...new Set(deficiencies)], hardFailReasons: [...new Set(hardFailReasons)] };
}

function evaluationForBlock(blockId: string, evaluation: StrategicDraftEvaluation): NonNullable<ContentBlock['semanticEvaluation']> {
  return {
    blockId,
    taskId: `strategic-task-${blockId}`,
    factualCoverage: evaluation.reasoningGrounding,
    legalSupport: evaluation.authorityGrounding,
    evidenceLinkage: 1,
    issueResponsiveness: evaluation.applicationGrounding,
    argumentDepth: evaluation.overallScore,
    specificity: evaluation.specificity,
    completeness: evaluation.completeness,
    repetitionPenalty: 0,
    unsupportedAssertionPenalty: evaluation.hardFailReasons.length > 0 ? 1 : 0,
    overallScore: evaluation.overallScore,
    verdict: evaluation.verdict,
    revisionMode: evaluation.verdict === 'PASS' ? 'NONE' : evaluation.verdict === 'FAIL' ? 'REWRITE' : 'EXPAND',
    deficiencies: evaluation.deficiencies,
    coveredCoverageItemIds: [],
    missingCoverageItemIds: [],
    hardFailReasons: evaluation.hardFailReasons,
  };
}

export async function generateStrategicDraftForReview(
  input: GenerateStrategicDraftForReviewInput,
): Promise<StrategicDraftForReviewResult> {
  const completion = input.completion || generateNVIDIACompletion;
  const options: NVIDIACompletionOptions = {
    prompt: buildStrategicDraftPrompt(input),
    temperature: 0.2,
    maxTokens: 2400,
    outputSchema: STRATEGIC_DRAFT_OUTPUT_SCHEMA as unknown as Record<string, unknown>,
  };
  let raw: StrategicDraftCompletionResult;
  try {
    raw = await completion(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'STRATEGIC_DRAFT_PROVIDER_ERROR';
    const blockId = stableResearchId('strategic-draft-block', { planId: input.plan.id, error: message });
    const evaluation: StrategicDraftEvaluation = {
      verdict: 'FAIL', overallScore: 0, reasoningGrounding: 0, authorityGrounding: 0, applicationGrounding: 0, specificity: 0, completeness: 0,
      deficiencies: [], hardFailReasons: ['STRATEGIC_DRAFT_PROVIDER_ERROR'],
    };
    return {
      plan: input.plan, evaluation, provider: 'nvidia', model: null, parseError: message,
      block: {
        id: blockId, layer: 'GENERATED_ARGUMENT', trust: 'AI_INFERENCE', text: '', provenance: 'AI_GENERATED', generationRequirement: 'AI_REQUIRED', generationStatus: 'failed',
        issueDraftValidationStatus: 'INVALID_RETRYABLE', semanticEvaluation: evaluationForBlock(blockId, evaluation), coverageItemIds: [], factIds: input.plan.sourceFactIds, legalIssueIds: [], verifiedAuthorityIds: input.supportingAuthorities.map((authority) => authority.id),
        researchHash: input.plan.researchHash, strategicCandidateId: input.plan.candidateId, decisionReasoningId: input.plan.decisionReasoningId, strategicArgumentPlanId: input.plan.id,
        generatedBy: 'AI', provider: 'nvidia', model: null, generationId: input.generationId,
      },
    };
  }

  let output: StrategicDraftModelOutput | undefined;
  let parseError: string | undefined;
  try {
    output = parseStrategicDraftModelOutput(raw.text);
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'STRATEGIC_DRAFT_INVALID_OUTPUT';
  }
  const evaluation = output
    ? evaluateStrategicDraft({ output, plan: input.plan, reasoning: input.reasoning, supportingAuthorities: input.supportingAuthorities, adverseAuthorities: input.adverseAuthorities })
    : {
      verdict: 'FAIL' as const, overallScore: 0, reasoningGrounding: 0, authorityGrounding: 0, applicationGrounding: 0, specificity: 0, completeness: 0,
      deficiencies: [], hardFailReasons: ['STRATEGIC_DRAFT_INVALID_OUTPUT'],
    };
  const blockId = stableResearchId('strategic-draft-block', { planId: input.plan.id, output: output || null, parseError });
  const block: ContentBlock = {
    id: blockId,
    layer: 'GENERATED_ARGUMENT',
    trust: 'AI_INFERENCE',
    text: output?.draftText || '',
    provenance: 'AI_GENERATED',
    generationRequirement: 'AI_REQUIRED',
    generationStatus: output ? 'generated' : 'failed',
    issueDraftValidationStatus: evaluation.verdict === 'FAIL' ? 'INVALID_RETRYABLE' : 'VALID_NON_FINAL',
    issueDraftResultHash: stableResearchId('strategic-draft-result', { planId: input.plan.id, output: output || null, evaluation }),
    semanticEvaluation: evaluationForBlock(blockId, evaluation),
    coverageItemIds: [],
    factIds: [...input.plan.sourceFactIds],
    legalIssueIds: [],
    verifiedAuthorityIds: input.supportingAuthorities.map((authority) => authority.id).sort(),
    researchHash: input.plan.researchHash,
    strategicCandidateId: input.plan.candidateId,
    decisionReasoningId: input.plan.decisionReasoningId,
    strategicArgumentPlanId: input.plan.id,
    generatedBy: 'AI', provider: 'nvidia', model: raw.model, generationId: input.generationId,
  };
  return { plan: input.plan, output, evaluation, block, provider: 'nvidia', model: raw.model, finishReason: raw.finishReason, parseError };
}
