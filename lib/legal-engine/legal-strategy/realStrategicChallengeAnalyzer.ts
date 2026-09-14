import {
  generateNVIDIACompletion,
  type NVIDIACompletionOptions,
  type NVIDIACompletionResult,
} from '../../ai/providers/nvidia';
import { sanitizeAiError } from '../../ai/providers/types';
import type { DecisionReasoningItem } from '../case-extraction/types';
import {
  createStrategicChallengeCandidate,
  type StrategicChallengeCandidate,
  type StrategicChallengeProposal,
  validateStrategicChallengeProposal,
} from './strategicChallenge';
import {
  buildStrategicChallengeResearchPlan,
  type LegalResearchPlan,
  type ResearchPlanScopeInput,
} from '../legal-research/plan';
import type { AuthorityType } from '../legal-research/types';

export interface StrategicChallengeContextItem {
  id: string;
  text: string;
}

export interface RealStrategicChallengeAnalyzerInput {
  reasoning: DecisionReasoningItem;
  relevantSection?: string;
  relevantProcedure?: string;
  legalScope?: string;
  relatedFacts?: readonly StrategicChallengeContextItem[];
  relatedSourceArguments?: readonly StrategicChallengeContextItem[];
  allowlistedFactIds: readonly string[];
  allowlistedArgumentIds: readonly string[];
  authorityTypes: readonly AuthorityType[];
  adverseAuthorityRequired: boolean;
  scope?: ResearchPlanScopeInput;
  clientPositionRequired?: boolean;
}

export type StrategicChallengeAnalyzerCompletion = (
  options: NVIDIACompletionOptions,
) => Promise<NVIDIACompletionResult>;

export type AnalyzerAuditStatus = 'PASS' | 'FAIL';
export type CanonicalCandidateAuditStatus = 'CREATED' | 'REJECTED';
export type AnalyzerProbeOutcome =
  | 'PASS'
  | 'HTTP_TIMEOUT'
  | 'HTTP_NON_2XX'
  | 'PROVIDER_ERROR'
  | 'INVALID_JSON'
  | 'SCHEMA_REJECT'
  | 'SEMANTIC_REJECT'
  | 'NO_CANDIDATE';

export interface AnalyzerFailureMetrics {
  httpTimeout: number;
  httpNon2xx: number;
  invalidJson: number;
  schemaReject: number;
  semanticReject: number;
  noCandidate: number;
}

export interface StrategicChallengeProposalAudit {
  index: number;
  thesisChars: number;
  legalQuestionChars: number;
  propositionChars: number;
  researchGapsCount: number;
  sourceFactCount: number;
  sourceArgumentCount: number;
  forbiddenFields: string[];
  unknownFields: string[];
  schema: AnalyzerAuditStatus;
  allowlist: AnalyzerAuditStatus;
  semantic: AnalyzerAuditStatus;
  canonicalCandidate: CanonicalCandidateAuditStatus;
  errors: string[];
}

export interface RealStrategicChallengeAnalyzerAudit {
  requestId: string;
  provider: 'nvidia';
  model?: string;
  durationMs: number;
  httpStatus: number | 'NOT_EXPOSED_BY_TRANSPORT';
  rawChars: number;
  jsonParsed: boolean;
  responseShape: AnalyzerAuditStatus;
  rawCandidateCount: number;
  acceptedCandidateCount: number;
  finishReason?: string;
  isTruncated?: boolean;
  fallbackUsed: false;
  topLevelUnknownFields: string[];
  proposalAudits: StrategicChallengeProposalAudit[];
  outcome: AnalyzerProbeOutcome;
  failureMetrics: AnalyzerFailureMetrics;
  error?: string;
}

export interface RealStrategicChallengeAnalyzerResult {
  proposals: StrategicChallengeProposal[];
  candidates: StrategicChallengeCandidate[];
  plans: LegalResearchPlan[];
  rejected: StrategicChallengeProposalAudit[];
  audit: RealStrategicChallengeAnalyzerAudit;
}

const ALLOWED_PROPOSAL_FIELDS = new Set([
  'thesis',
  'legalQuestion',
  'propositionToEstablish',
  'researchGaps',
]);

const MODEL_FORBIDDEN_FIELDS = new Set([
  'sourceFactIds',
  'sourceArgumentIds',
  'status',
  'origin',
  'id',
  'decisionReasoningId',
  'clientAdopted',
  'clientPosition',
  'clientPositionRequired',
  'researchNeeded',
  'unresolvedRequirements',
  'scope',
  'authorityTypes',
  'adverseAuthorityRequired',
  'provenance',
  'verifiedAuthorityIds',
  'authorityIds',
  'legalIssueId',
  'coverageItemIds',
  'researchComplete',
]);

export const STRATEGIC_CHALLENGE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['thesis', 'legalQuestion', 'propositionToEstablish'],
        properties: {
          thesis: { type: 'string' },
          legalQuestion: { type: 'string' },
          propositionToEstablish: { type: 'string' },
          researchGaps: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

const MAX_CONTEXT_ITEMS = 8;
const MAX_CONTEXT_TEXT_CHARS = 1200;
const MAX_PROVENANCE_ITEMS = 3;
const MAX_PROVENANCE_EXCERPT_CHARS = 1200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function httpStatusFromError(error: unknown): number | undefined {
  if (!isRecord(error) || typeof error.httpStatus !== 'number') return undefined;
  return error.httpStatus;
}

function emptyFailureMetrics(): AnalyzerFailureMetrics {
  return { httpTimeout: 0, httpNon2xx: 0, invalidJson: 0, schemaReject: 0, semanticReject: 0, noCandidate: 0 };
}

function completionErrorOutcome(error: string | undefined, httpStatus: number | undefined): AnalyzerProbeOutcome {
  if (typeof httpStatus === 'number' && httpStatus >= 400) return 'HTTP_NON_2XX';
  if (/timeout|tiempo de espera|aborted|abort/i.test(error || '')) return 'HTTP_TIMEOUT';
  return 'PROVIDER_ERROR';
}

function cleanText(value: string | undefined, maxChars = MAX_CONTEXT_TEXT_CHARS): string {
  return (value || '').trim().replace(/\s+/g, ' ').slice(0, maxChars);
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' ? record[key] as string : undefined;
}

function stringArrayField(record: Record<string, unknown>, key: string): { value?: string[]; valid: boolean; count: number } {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return { valid: true, count: 0 };
  if (!Array.isArray(record[key])) return { valid: false, count: 0 };
  const value = record[key] as unknown[];
  const valid = value.every((entry) => typeof entry === 'string');
  return {
    value: valid ? value as string[] : undefined,
    valid,
    count: value.length,
  };
}

function proposalAudit(index: number, value: unknown): StrategicChallengeProposalAudit {
  if (!isRecord(value)) {
    return {
      index,
      thesisChars: 0,
      legalQuestionChars: 0,
      propositionChars: 0,
      researchGapsCount: 0,
      sourceFactCount: 0,
      sourceArgumentCount: 0,
      forbiddenFields: [],
      unknownFields: [],
      schema: 'FAIL',
      allowlist: 'FAIL',
      semantic: 'FAIL',
      canonicalCandidate: 'REJECTED',
      errors: ['PROPOSAL_NOT_OBJECT'],
    };
  }

  const keys = Object.keys(value);
  const forbiddenFields = keys.filter((key) => MODEL_FORBIDDEN_FIELDS.has(key)).sort();
  const unknownFields = keys.filter((key) => !ALLOWED_PROPOSAL_FIELDS.has(key) && !MODEL_FORBIDDEN_FIELDS.has(key)).sort();
  const researchGaps = stringArrayField(value, 'researchGaps');
  const sourceFacts = stringArrayField(value, 'sourceFactIds');
  const sourceArguments = stringArrayField(value, 'sourceArgumentIds');
  const thesis = stringField(value, 'thesis') || '';
  const legalQuestion = stringField(value, 'legalQuestion') || '';
  const proposition = stringField(value, 'propositionToEstablish') || '';
  const errors = [
    ...forbiddenFields.map((field) => `MODEL_OWNED_FIELD_FORBIDDEN:${field}`),
    ...unknownFields.map((field) => `UNKNOWN_PROPOSAL_FIELD:${field}`),
    ...(typeof value.thesis === 'string' ? [] : ['INVALID_FIELD_TYPE:thesis']),
    ...(typeof value.legalQuestion === 'string' ? [] : ['INVALID_FIELD_TYPE:legalQuestion']),
    ...(typeof value.propositionToEstablish === 'string' ? [] : ['INVALID_FIELD_TYPE:propositionToEstablish']),
    ...(researchGaps.valid ? [] : ['INVALID_FIELD_TYPE:researchGaps']),
  ];
  return {
    index,
    thesisChars: thesis.length,
    legalQuestionChars: legalQuestion.length,
    propositionChars: proposition.length,
    researchGapsCount: researchGaps.count,
    sourceFactCount: sourceFacts.count,
    sourceArgumentCount: sourceArguments.count,
    forbiddenFields,
    unknownFields,
    schema: errors.length === 0 ? 'PASS' : 'FAIL',
    allowlist: 'PASS',
    semantic: 'PASS',
    canonicalCandidate: 'REJECTED',
    errors,
  };
}

function proposalFromRecord(record: Record<string, unknown>): StrategicChallengeProposal {
  const researchGaps = stringArrayField(record, 'researchGaps');
  return {
    thesis: stringField(record, 'thesis') || '',
    legalQuestion: stringField(record, 'legalQuestion') || '',
    propositionToEstablish: stringField(record, 'propositionToEstablish') || '',
    ...(researchGaps.value ? { researchGaps: researchGaps.value } : {}),
  };
}

function allowlistedContext(
  items: readonly StrategicChallengeContextItem[] | undefined,
  allowlistedIds: readonly string[],
): StrategicChallengeContextItem[] {
  const allowlist = new Set(allowlistedIds);
  return (items || [])
    .filter((item) => allowlist.has(item.id))
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((item) => ({ id: item.id, text: cleanText(item.text) }));
}

export function buildStrategicChallengeAnalyzerPrompt(input: RealStrategicChallengeAnalyzerInput): string {
  const reasoning = input.reasoning;
  const provenance = reasoning.provenance.slice(0, MAX_PROVENANCE_ITEMS).map((entry) => ({
    sourceId: entry.sourceId,
    candidateId: entry.candidateId,
    page: entry.page,
    section: entry.section,
    excerptHash: entry.excerptHash,
    excerpt: cleanText(entry.excerpt, MAX_PROVENANCE_EXCERPT_CHARS),
    inferenceLevel: entry.inferenceLevel,
  }));
  const payload = {
    decisionReasoning: {
      id: reasoning.id,
      reasoningType: reasoning.reasoningType,
      courtAttribution: reasoning.courtAttribution,
      referenceNumber: reasoning.referenceNumber,
      proposition: reasoning.proposition,
      provenance,
    },
    context: {
      relevantSection: cleanText(input.relevantSection),
      procedure: cleanText(input.relevantProcedure),
      legalScope: cleanText(input.legalScope),
      explicitlyRelatedFacts: allowlistedContext(input.relatedFacts, input.allowlistedFactIds),
      explicitlyRelatedSourceArguments: allowlistedContext(input.relatedSourceArguments, input.allowlistedArgumentIds),
    },
    researchPolicy: {
      scope: input.scope || null,
      authorityTypes: uniqueSorted(input.authorityTypes),
      adverseAuthorityRequired: input.adverseAuthorityRequired,
      outputCount: '0..N',
    },
  };

  return [
    'Analiza únicamente el razonamiento judicial delimitado en INPUT.',
    'No recibes el PDF completo ni un corpus de investigación; no completes esos datos por inferencia.',
    'Propón 0..N hipótesis estratégicas. Cero hipótesis seguras es una respuesta válida.',
    'Devuelve exclusivamente JSON con esta forma: {"candidates":[{"thesis":"...","legalQuestion":"... ?","propositionToEstablish":"...","researchGaps":[]}]}',
    'No incluyas estado, origen, provenance, autoridades, legalIssueId, client position, verificación ni conclusiones definitivas.',
    'No relaciones hechos o argumentos por proximidad: usa sólo los IDs explícitamente relacionados presentes en INPUT.',
    `INPUT=${JSON.stringify(payload)}`,
  ].join('\n');
}

function parsePayload(raw: string): {
  jsonParsed: boolean;
  responseShape: AnalyzerAuditStatus;
  records: unknown[];
  topLevelUnknownFields: string[];
  error?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim()) as unknown;
  } catch (error) {
    return {
      jsonParsed: false,
      responseShape: 'FAIL',
      records: [],
      topLevelUnknownFields: [],
      error: sanitizeAiError(error),
    };
  }
  if (!isRecord(parsed)) {
    return {
      jsonParsed: true,
      responseShape: 'FAIL',
      records: [],
      topLevelUnknownFields: [],
      error: 'ANALYZER_RESPONSE_NOT_OBJECT',
    };
  }
  const topLevelUnknownFields = Object.keys(parsed).filter((key) => key !== 'candidates').sort();
  if (!Array.isArray(parsed.candidates)) {
    return {
      jsonParsed: true,
      responseShape: 'FAIL',
      records: [],
      topLevelUnknownFields,
      error: 'ANALYZER_CANDIDATES_NOT_ARRAY',
    };
  }
  return {
    jsonParsed: true,
    responseShape: topLevelUnknownFields.length === 0 ? 'PASS' : 'FAIL',
    records: parsed.candidates,
    topLevelUnknownFields,
    ...(topLevelUnknownFields.length > 0 ? { error: 'UNKNOWN_TOP_LEVEL_FIELD' } : {}),
  };
}

export async function runRealStrategicChallengeAnalyzer(
  input: RealStrategicChallengeAnalyzerInput,
  options: { completion?: StrategicChallengeAnalyzerCompletion } = {},
): Promise<RealStrategicChallengeAnalyzerResult> {
  const completion = options.completion || generateNVIDIACompletion;
  const startMs = Date.now();
  const requestId = `strategic-analyzer-${input.reasoning.id}-${startMs}`;
  let completionResult: NVIDIACompletionResult | undefined;
  let completionError: string | undefined;
  let completionHttpStatus: number | undefined;
  try {
    completionResult = await completion({
      prompt: buildStrategicChallengeAnalyzerPrompt(input),
      systemPrompt: 'Eres un analizador de hipótesis estratégicas. Tu salida es propuesta no verificada y debe respetar estrictamente el JSON solicitado.',
      temperature: 0.2,
      maxTokens: 2048,
      outputSchema: STRATEGIC_CHALLENGE_OUTPUT_SCHEMA,
    });
  } catch (error) {
    completionError = sanitizeAiError(error);
    completionHttpStatus = httpStatusFromError(error);
  }

  if (!completionResult) {
    const outcome = completionErrorOutcome(completionError, completionHttpStatus);
    const failureMetrics = emptyFailureMetrics();
    if (outcome === 'HTTP_TIMEOUT') failureMetrics.httpTimeout = 1;
    if (outcome === 'HTTP_NON_2XX') failureMetrics.httpNon2xx = 1;
    return {
      proposals: [],
      candidates: [],
      plans: [],
      rejected: [],
      audit: {
        requestId,
        provider: 'nvidia',
        durationMs: Date.now() - startMs,
        httpStatus: completionHttpStatus ?? 'NOT_EXPOSED_BY_TRANSPORT',
        rawChars: 0,
        jsonParsed: false,
        responseShape: 'FAIL',
        rawCandidateCount: 0,
        acceptedCandidateCount: 0,
        fallbackUsed: false,
        topLevelUnknownFields: [],
        proposalAudits: [],
        outcome,
        failureMetrics,
        error: completionError || 'NVIDIA_COMPLETION_EMPTY',
      },
    };
  }

  const parsed = parsePayload(completionResult.text);
  const audits = parsed.records.map((record, index) => proposalAudit(index, record));
  const rejected: StrategicChallengeProposalAudit[] = [];
  const proposals: StrategicChallengeProposal[] = [];
  const candidates: StrategicChallengeCandidate[] = [];
  const plans: LegalResearchPlan[] = [];

  for (const [index, record] of parsed.records.entries()) {
    const audit = audits[index];
    if (!audit || audit.schema === 'FAIL' || parsed.responseShape === 'FAIL' || !isRecord(record)) {
      if (parsed.responseShape === 'FAIL' && audit && !audit.errors.includes('UNKNOWN_TOP_LEVEL_FIELD')) {
        audit.errors.push(...parsed.topLevelUnknownFields.map((field) => `UNKNOWN_TOP_LEVEL_FIELD:${field}`));
        audit.schema = 'FAIL';
      }
      rejected.push(audit || proposalAudit(index, record));
      continue;
    }

    const proposal = proposalFromRecord(record);
    const validationInput = {
      reasoning: input.reasoning,
      proposal,
      allowlistedFactIds: input.allowlistedFactIds,
      allowlistedArgumentIds: input.allowlistedArgumentIds,
      sourceFactIds: uniqueSorted(input.allowlistedFactIds),
      sourceArgumentIds: uniqueSorted(input.allowlistedArgumentIds),
      authorityTypes: input.authorityTypes,
      adverseAuthorityRequired: input.adverseAuthorityRequired,
      // The existing validator is fail-closed at runtime for an absent scope,
      // while the candidate constructor keeps its historical required type.
      scope: input.scope as ResearchPlanScopeInput,
      clientPositionRequired: input.clientPositionRequired,
    };
    const errors = validateStrategicChallengeProposal(validationInput);
    const allowlistErrors = errors.filter((error) => error.startsWith('UNALLOWLISTED_'));
    audit.allowlist = allowlistErrors.length === 0 ? 'PASS' : 'FAIL';
    audit.semantic = errors.length === 0 ? 'PASS' : 'FAIL';
    audit.errors.push(...errors);
    if (errors.length > 0) {
      rejected.push(audit);
      continue;
    }

    const candidate = createStrategicChallengeCandidate(validationInput);
    const plan = await buildStrategicChallengeResearchPlan({
      id: candidate.id,
      decisionReasoningId: candidate.decisionReasoningId,
      propositionToEstablish: candidate.propositionToEstablish,
      sourceFactIds: candidate.sourceFactIds,
      sourceArgumentIds: candidate.sourceArgumentIds,
      authorityTypes: candidate.authorityTypes,
      adverseAuthorityRequired: candidate.adverseAuthorityRequired,
      scope: candidate.scope,
    });
    audit.canonicalCandidate = 'CREATED';
    proposals.push(proposal);
    candidates.push(candidate);
    plans.push(plan);
  }

  const failureMetrics = emptyFailureMetrics();
  failureMetrics.invalidJson = parsed.jsonParsed ? 0 : 1;
  failureMetrics.schemaReject = audits.filter((audit) => audit.schema === 'FAIL').length
    + (parsed.jsonParsed && parsed.responseShape === 'FAIL' && audits.length === 0 ? 1 : 0);
  failureMetrics.semanticReject = audits.filter((audit) => audit.schema === 'PASS' && audit.semantic === 'FAIL').length;
  failureMetrics.noCandidate = candidates.length === 0 ? 1 : 0;
  const outcome: AnalyzerProbeOutcome = !parsed.jsonParsed
    ? 'INVALID_JSON'
    : failureMetrics.schemaReject > 0
      ? 'SCHEMA_REJECT'
      : failureMetrics.semanticReject > 0
        ? 'SEMANTIC_REJECT'
        : candidates.length === 0
          ? 'NO_CANDIDATE'
          : 'PASS';

  return {
    proposals,
    candidates,
    plans,
    rejected,
    audit: {
      requestId,
      provider: 'nvidia',
      model: completionResult.model,
      durationMs: Date.now() - startMs,
      httpStatus: completionResult.httpStatus ?? 'NOT_EXPOSED_BY_TRANSPORT',
      rawChars: completionResult.rawChars ?? completionResult.text.length,
      jsonParsed: parsed.jsonParsed,
      responseShape: parsed.responseShape,
      rawCandidateCount: parsed.records.length,
      acceptedCandidateCount: candidates.length,
      finishReason: completionResult.finishReason,
      isTruncated: completionResult.isTruncated,
      fallbackUsed: false,
      topLevelUnknownFields: parsed.topLevelUnknownFields,
      proposalAudits: audits,
      outcome,
      failureMetrics,
      ...(parsed.error ? { error: parsed.error } : {}),
    },
  };
}
