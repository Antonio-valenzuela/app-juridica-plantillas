import type { ContentBlock } from './types';
import type { GenerationTask } from './generationTasks';
import type { BlockQualityEvaluation } from './semanticEvaluator';
import type { LegalIssueType } from './legalIssueMatrix';
import { stableResearchId } from './legal-research/canonical';

export type IssueDraftContract = 'ARGUMENTATIVE' | 'DESCRIPTIVE';

export type IssueDraftModelArrayField =
  | 'factualDevelopment'
  | 'evidentiaryDevelopment'
  | 'legalDevelopment'
  | 'sourceEntityIds'
  | 'authorityMentionIds'
  | 'unresolvedRequirements';

export interface IssueDraftFieldRequirement {
  required: boolean;
  nonEmpty: boolean;
}

export type IssueDraftContractRequirements = Record<IssueDraftModelArrayField, IssueDraftFieldRequirement>;

export interface IssueDraftContractContext {
  hasLinkedEvidence?: boolean;
  hasLinkedLegalSupport?: boolean;
}

const requiredField = (nonEmpty = false): IssueDraftFieldRequirement => ({ required: true, nonEmpty });
const optionalField = (nonEmpty = false): IssueDraftFieldRequirement => ({ required: false, nonEmpty });

export function getIssueDraftContractRequirements(
  contract: IssueDraftContract,
  context: IssueDraftContractContext = {},
): IssueDraftContractRequirements {
  if (contract === 'ARGUMENTATIVE') {
    return {
      factualDevelopment: requiredField(),
      evidentiaryDevelopment: requiredField(),
      legalDevelopment: requiredField(),
      sourceEntityIds: requiredField(),
      authorityMentionIds: requiredField(),
      unresolvedRequirements: requiredField(),
    };
  }

  const hasLinkedEvidence = context.hasLinkedEvidence === true;
  const hasLinkedLegalSupport = context.hasLinkedLegalSupport === true;
  return {
    factualDevelopment: requiredField(true),
    evidentiaryDevelopment: hasLinkedEvidence ? requiredField(true) : optionalField(),
    legalDevelopment: hasLinkedLegalSupport ? requiredField(true) : optionalField(),
    sourceEntityIds: requiredField(true),
    authorityMentionIds: requiredField(),
    unresolvedRequirements: requiredField(),
  };
}

export interface IssueTokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimated?: boolean;
}

export interface IssueDraftResult {
  legalIssueId: string;
  coverageItemIds: string[];
  issueType: LegalIssueType;
  thesis: string;
  factualDevelopment: string[];
  evidentiaryDevelopment: string[];
  legalDevelopment: string[];
  counterPosition?: string;
  application: string;
  conclusion: string;
  draftContract?: IssueDraftContract;
  sourceEntityIds: string[];
  authorityMentionIds: string[];
  verifiedAuthorityIds?: string[];
  researchHash?: string;
  unresolvedRequirements: string[];
  generationMetadata: {
    promptVersion: string;
    contextHash: string;
    providerRequested: string;
    providerActuallyUsed: string;
    model?: string | null;
    attemptCount: number;
    usage?: IssueTokenUsage;
  };
}

interface IssueDraftReferenceModelOutput {
  sourceEntityIds: string[];
  authorityMentionIds: string[];
  verifiedAuthorityIds?: string[];
  researchHash?: string;
  unresolvedRequirements: string[];
}

interface IssueDraftArgumentativeModelOutput extends IssueDraftReferenceModelOutput {
  factualDevelopment: string[];
  evidentiaryDevelopment: string[];
  legalDevelopment: string[];
}

export interface ArgumentativeIssueDraftModelOutput extends IssueDraftArgumentativeModelOutput {
  thesis: string;
  counterPosition?: string;
  application: string;
  conclusion: string;
}

export interface DescriptiveIssueDraftModelOutput extends IssueDraftReferenceModelOutput {
  factualDevelopment: string[];
  evidentiaryDevelopment?: string[];
  legalDevelopment?: string[];
}

export type IssueDraftModelOutput = ArgumentativeIssueDraftModelOutput | DescriptiveIssueDraftModelOutput;

export interface IssueDraftModelValidation {
  valid: boolean;
  output?: IssueDraftModelOutput;
  errors: string[];
}

export interface IssueDraftMaterializationMetadata {
  issueType: LegalIssueType;
  draftContract?: IssueDraftContract;
  fieldRequirements?: IssueDraftContractRequirements;
  promptVersion: string;
  contextHash: string;
  providerRequested: string;
  providerActuallyUsed: string;
  model?: string | null;
  attemptCount: number;
  usage?: IssueTokenUsage;
}

export type IssueDraftValidationStatus =
  | 'INVALID_FATAL'
  | 'INVALID_RETRYABLE'
  | 'VALID_NON_FINAL'
  | 'VALID_ACCEPTED';

export interface IssueDraftValidationInput {
  expectedLegalIssueId: string;
  issueType: LegalIssueType;
  draftContract?: IssueDraftContract;
  allowedCoverageItemIds: string[];
  allowedSourceEntityIds: string[];
  allowedAuthorityMentionIds: string[];
  allowedVerifiedAuthorityIds?: string[];
  allowedAuthorityCitations?: Array<{ id: string; citationText: string }>;
  allowedVerifiedAuthorityCitations?: Array<{ id: string; citationText: string }>;
  expectedResearchHash?: string;
  researchUnlocked?: boolean;
  contextHash: string;
  promptVersion: string;
  authorityVerificationStatuses?: Record<string, string>;
  fieldRequirements?: IssueDraftContractRequirements;
}

export interface IssueDraftValidation {
  status: IssueDraftValidationStatus;
  result?: IssueDraftResult;
  errors: string[];
  warnings: string[];
}

export interface IssueGenerationAttempt {
  attempt: number;
  legalIssueId: string;
  taskId: string;
  coverageItemIds: string[];
  contextHash: string;
  promptVersion: string;
  status: string;
  providerRequested?: string;
  providerActuallyUsed?: string;
  model?: string | null;
  usage?: IssueTokenUsage;
}

export interface IssueGenerationOutcome {
  legalIssueId: string;
  taskId: string;
  order?: number;
  orderInParent?: number;
  status: 'ACCEPTED' | 'VALID_NON_FINAL' | 'FAILED' | 'BLOCKED' | 'FALLBACK';
  failureReason?: 'INSUFFICIENT' | 'VALIDATION' | 'SEMANTIC' | 'PROVIDER' | 'UNKNOWN' | 'ELIGIBILITY_BLOCKED';
  attempts: IssueGenerationAttempt[];
  result?: IssueDraftResult;
  validation?: IssueDraftValidation;
  evaluation?: unknown;
  block?: ContentBlock;
}

const REQUIRED_STRING_FIELDS = ['legalIssueId'] as const;
const REQUIRED_ARGUMENTATIVE_STRING_FIELDS = ['thesis', 'application', 'conclusion'] as const;
const MODEL_ARRAY_FIELDS = [
  'factualDevelopment',
  'evidentiaryDevelopment',
  'legalDevelopment',
  'sourceEntityIds',
  'authorityMentionIds',
  'unresolvedRequirements',
] as const satisfies readonly IssueDraftModelArrayField[];
const ALLOWED_REQUIREMENTS = new Set([
  'REQUIRES_LEGAL_RESEARCH',
  'MISSING_CLIENT_POSITION',
  'MISSING_EVIDENCE_LINK',
  'UNSUPPORTED_REQUIRED_ELEMENT',
]);
const PLACEHOLDER_PATTERN = /\[(?:DATO\s+PENDIENTE|PENDIENTE|TODO|TBD|FIXME)\b[^\]]*\]/i;
const CONCRETE_AUTHORITY_CITATION_PATTERN = /\b(?:art[íi]culo|art\.?|tesis|jurisprudencia|registro(?:\s+digital)?)\s+(?:[a-záéíóúñ0-9./-]+\s+)*\d+\b/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function addUnique(errors: string[], error: string): void {
  if (!errors.includes(error)) errors.push(error);
}

const COMMON_MODEL_OUTPUT_FIELDS = [
  'factualDevelopment',
  'evidentiaryDevelopment',
  'legalDevelopment',
  'sourceEntityIds',
  'authorityMentionIds',
  'verifiedAuthorityIds',
  'researchHash',
  'unresolvedRequirements',
];
const ARGUMENTATIVE_MODEL_OUTPUT_FIELDS = new Set([
  'thesis',
  'counterPosition',
  'application',
  'conclusion',
  ...COMMON_MODEL_OUTPUT_FIELDS,
]);
const DESCRIPTIVE_MODEL_OUTPUT_FIELDS = new Set(COMMON_MODEL_OUTPUT_FIELDS);

function modelOutputFieldsFor(contract: IssueDraftContract): Set<string> {
  return contract === 'DESCRIPTIVE' ? DESCRIPTIVE_MODEL_OUTPUT_FIELDS : ARGUMENTATIVE_MODEL_OUTPUT_FIELDS;
}

export function validateIssueDraftModelOutput(
  raw: unknown,
  draftContract: IssueDraftContract = 'ARGUMENTATIVE',
  fieldRequirements: IssueDraftContractRequirements = getIssueDraftContractRequirements(draftContract),
): IssueDraftModelValidation {
  const errors: string[] = [];
  if (!isRecord(raw)) return { valid: false, errors: ['RESULT_NOT_OBJECT'] };

  const allowedFields = modelOutputFieldsFor(draftContract);
  for (const field of Object.keys(raw)) {
    if (!allowedFields.has(field)) {
      addUnique(errors, draftContract === 'DESCRIPTIVE' && ARGUMENTATIVE_MODEL_OUTPUT_FIELDS.has(field)
        ? `FIELD_NOT_ALLOWED_FOR_CONTRACT:${field}`
        : `UNKNOWN_FIELD:${field}`);
    }
  }
  if (draftContract === 'ARGUMENTATIVE') {
    for (const field of REQUIRED_ARGUMENTATIVE_STRING_FIELDS) {
      if (typeof raw[field] !== 'string' || !raw[field].trim()) {
        addUnique(errors, `REQUIRED_FIELD_EMPTY:${field}`);
      }
    }
  }
  for (const field of MODEL_ARRAY_FIELDS) {
    const value = raw[field];
    const requirement = fieldRequirements[field];
    if (value === undefined) {
      if (requirement.required) addUnique(errors, `REQUIRED_ARRAY_INVALID:${field}`);
      continue;
    }
    if (!asStringArray(value)) {
      addUnique(errors, `REQUIRED_ARRAY_INVALID:${field}`);
      continue;
    }
    if (requirement.nonEmpty && value.every((item) => !item.trim())) {
      addUnique(errors, `REQUIRED_ARRAY_EMPTY:${field}`);
    }
  }
  if (draftContract === 'ARGUMENTATIVE' && raw.counterPosition !== undefined && typeof raw.counterPosition !== 'string') {
    addUnique(errors, 'OPTIONAL_FIELD_INVALID:counterPosition');
  }
  if (raw.verifiedAuthorityIds !== undefined && !asStringArray(raw.verifiedAuthorityIds)) {
    addUnique(errors, 'OPTIONAL_ARRAY_INVALID:verifiedAuthorityIds');
  }
  if (raw.researchHash !== undefined && typeof raw.researchHash !== 'string') {
    addUnique(errors, 'OPTIONAL_FIELD_INVALID:researchHash');
  }
  if (errors.length > 0) return { valid: false, errors };

  const common = {
    factualDevelopment: [...(raw.factualDevelopment as string[])],
    ...(asStringArray(raw.evidentiaryDevelopment) ? { evidentiaryDevelopment: [...raw.evidentiaryDevelopment] } : {}),
    ...(asStringArray(raw.legalDevelopment) ? { legalDevelopment: [...raw.legalDevelopment] } : {}),
    sourceEntityIds: [...(raw.sourceEntityIds as string[])],
    authorityMentionIds: [...(raw.authorityMentionIds as string[])],
    verifiedAuthorityIds: asStringArray(raw.verifiedAuthorityIds)
      ? [...raw.verifiedAuthorityIds]
      : undefined,
    researchHash: typeof raw.researchHash === 'string' ? raw.researchHash : undefined,
    unresolvedRequirements: [...(raw.unresolvedRequirements as string[])],
  };
  const output: IssueDraftModelOutput = draftContract === 'DESCRIPTIVE'
    ? common
    : {
        ...common,
        thesis: raw.thesis as string,
        counterPosition: typeof raw.counterPosition === 'string' ? raw.counterPosition : undefined,
        application: raw.application as string,
        conclusion: raw.conclusion as string,
      };
  return { valid: true, output, errors };
}

export function materializeIssueDraftResult(
  output: IssueDraftModelOutput,
  task: GenerationTask,
  metadata: IssueDraftMaterializationMetadata,
): IssueDraftResult {
  const legalIssueId = task.legalIssueIds?.[0] || task.issueId || task.targetIssueId;
  if (!legalIssueId) throw new Error('MISSING_CANONICAL_LEGAL_ISSUE_ID');
  const draftContract = metadata.draftContract || 'ARGUMENTATIVE';
  const fieldRequirements = metadata.fieldRequirements || getIssueDraftContractRequirements(draftContract);
  if (draftContract === 'ARGUMENTATIVE'
    && (!('thesis' in output) || !('application' in output) || !('conclusion' in output))) {
    throw new Error('MISSING_ARGUMENTATIVE_MODEL_FIELDS');
  }
  const canonicalArray = (field: IssueDraftModelArrayField): string[] => {
    const value = output[field];
    if (value === undefined) {
      if (fieldRequirements[field].required) throw new Error(`MISSING_REQUIRED_MODEL_FIELD:${field}`);
      return [];
    }
    return [...value];
  };
  return {
    ...output,
    thesis: draftContract === 'DESCRIPTIVE' ? '' : (output as ArgumentativeIssueDraftModelOutput).thesis,
    factualDevelopment: canonicalArray('factualDevelopment'),
    evidentiaryDevelopment: canonicalArray('evidentiaryDevelopment'),
    legalDevelopment: canonicalArray('legalDevelopment'),
    application: draftContract === 'DESCRIPTIVE' ? '' : (output as ArgumentativeIssueDraftModelOutput).application,
    conclusion: draftContract === 'DESCRIPTIVE' ? '' : (output as ArgumentativeIssueDraftModelOutput).conclusion,
    sourceEntityIds: canonicalArray('sourceEntityIds'),
    authorityMentionIds: canonicalArray('authorityMentionIds'),
    unresolvedRequirements: canonicalArray('unresolvedRequirements'),
    legalIssueId,
    coverageItemIds: [...(task.coverageItemIds || [])],
    issueType: metadata.issueType,
    draftContract,
    generationMetadata: {
      promptVersion: metadata.promptVersion,
      contextHash: metadata.contextHash,
      providerRequested: metadata.providerRequested,
      providerActuallyUsed: metadata.providerActuallyUsed,
      model: metadata.model ?? null,
      attemptCount: metadata.attemptCount,
      usage: metadata.usage,
    },
  };
}

function containsPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return PLACEHOLDER_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isRecord(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

function outOfScopeIds(values: string[], allowed: string[]): boolean {
  return values.some((value) => !allowed.includes(value));
}

function normalizeCitation(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function issueDraftText(raw: Record<string, unknown>): string {
  return [
    raw.thesis,
    ...(asStringArray(raw.factualDevelopment) ? raw.factualDevelopment : []),
    ...(asStringArray(raw.evidentiaryDevelopment) ? raw.evidentiaryDevelopment : []),
    ...(asStringArray(raw.legalDevelopment) ? raw.legalDevelopment : []),
    raw.counterPosition,
    raw.application,
    raw.conclusion,
  ].filter((value): value is string => typeof value === 'string').join('\n');
}

function authorityCitationErrors(
  raw: Record<string, unknown>,
  input: IssueDraftValidationInput,
): string[] {
  const errors: string[] = [];
  const text = normalizeCitation(issueDraftText(raw));
  const verifiedIds = asStringArray(raw.verifiedAuthorityIds) ? raw.verifiedAuthorityIds : [];
  const verifiedCitations = (input.allowedVerifiedAuthorityCitations || [])
    .filter((item) => item && typeof item.id === 'string' && typeof item.citationText === 'string')
    .map((item) => ({ ...item, citation: normalizeCitation(item.citationText) }))
    .filter((item) => item.citation.length > 0);
  const sourceCitations = (input.allowedAuthorityCitations || [])
    .filter((item) => item && typeof item.id === 'string' && typeof item.citationText === 'string')
    .map((item) => normalizeCitation(item.citationText))
    .filter(Boolean);
  const allowedCitations = [...sourceCitations, ...verifiedCitations.map((item) => item.citation)];

  for (const citation of verifiedCitations) {
    if (text.includes(citation.citation) && !verifiedIds.includes(citation.id)) {
      addUnique(errors, 'VERIFIED_AUTHORITY_ID_MISSING');
    }
  }

  const concreteCitations = text.match(CONCRETE_AUTHORITY_CITATION_PATTERN) || [];
  if (concreteCitations.some((citation) => {
    const normalized = normalizeCitation(citation);
    return !allowedCitations.some((allowed) => allowed.includes(normalized) || normalized.includes(allowed));
  })) {
    addUnique(errors, 'AUTHORITY_CITATION_OUT_OF_SCOPE');
  }
  return errors;
}

function normalizeUsage(value: unknown): IssueTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: IssueTokenUsage = {
    promptTokens: typeof value.promptTokens === 'number' ? value.promptTokens : null,
    completionTokens: typeof value.completionTokens === 'number' ? value.completionTokens : null,
    totalTokens: typeof value.totalTokens === 'number' ? value.totalTokens : null,
  };
  if (typeof value.estimated === 'boolean') usage.estimated = value.estimated;
  return usage;
}

function canonicalize(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const array = value.map((item) => canonicalize(item));
    const shouldSortIds = Boolean(key && /(?:Ids|IDs)$/.test(key) && array.every((item) => typeof item === 'string'));
    return shouldSortIds ? [...(array as string[])].sort() : array;
  }
  if (isRecord(value)) {
    return Object.keys(value).sort().reduce<Record<string, unknown>>((result, childKey) => {
      result[childKey] = canonicalize(value[childKey], childKey);
      return result;
    }, {});
  }
  return value;
}

export function hashIssueDraftResult(result: IssueDraftResult): string {
  const canonical = JSON.stringify(canonicalize(result));
  return stableResearchId('issue-draft', canonical);
}

export function validateIssueDraftResult(
  raw: unknown,
  input: IssueDraftValidationInput,
): IssueDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(raw)) {
    return { status: 'INVALID_FATAL', errors: ['RESULT_NOT_OBJECT'], warnings };
  }

  const draftContract: IssueDraftContract = input.draftContract
    || (raw.draftContract === 'DESCRIPTIVE' ? 'DESCRIPTIVE' : 'ARGUMENTATIVE');
  const fieldRequirements = input.fieldRequirements || getIssueDraftContractRequirements(draftContract);
  if (raw.draftContract !== undefined && raw.draftContract !== draftContract) {
    addUnique(errors, 'DRAFT_CONTRACT_MISMATCH');
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof raw[field] !== 'string' || !String(raw[field]).trim()) {
      addUnique(errors, `REQUIRED_FIELD_EMPTY:${field}`);
    }
  }
  if (draftContract === 'ARGUMENTATIVE') {
    for (const field of REQUIRED_ARGUMENTATIVE_STRING_FIELDS) {
      if (typeof raw[field] !== 'string' || !String(raw[field]).trim()) {
        addUnique(errors, `REQUIRED_FIELD_EMPTY:${field}`);
      }
    }
  } else {
    if (typeof raw.thesis === 'string' && raw.thesis.trim()) addUnique(errors, 'DESCRIPTIVE_ARGUMENT_FIELD_PRESENT:thesis');
    if (typeof raw.application === 'string' && raw.application.trim()) addUnique(errors, 'DESCRIPTIVE_ARGUMENT_FIELD_PRESENT:application');
    if (typeof raw.conclusion === 'string' && raw.conclusion.trim()) addUnique(errors, 'DESCRIPTIVE_ARGUMENT_FIELD_PRESENT:conclusion');
  }
  if (!asStringArray(raw.coverageItemIds)) addUnique(errors, 'REQUIRED_ARRAY_INVALID:coverageItemIds');
  for (const field of MODEL_ARRAY_FIELDS) {
    const value = raw[field];
    const requirement = fieldRequirements[field];
    if (value === undefined) {
      if (requirement.required) addUnique(errors, `REQUIRED_ARRAY_INVALID:${field}`);
      continue;
    }
    if (!asStringArray(value)) {
      addUnique(errors, `REQUIRED_ARRAY_INVALID:${field}`);
      continue;
    }
    if (requirement.nonEmpty && value.every((item) => !item.trim())) {
      addUnique(errors, `REQUIRED_ARRAY_EMPTY:${field}`);
    }
  }

  if (raw.legalIssueId !== input.expectedLegalIssueId) addUnique(errors, 'LEGAL_ISSUE_ID_OUT_OF_SCOPE');
  if (raw.issueType !== input.issueType) addUnique(errors, 'ISSUE_TYPE_MISMATCH');
  if (asStringArray(raw.coverageItemIds) && outOfScopeIds(raw.coverageItemIds, input.allowedCoverageItemIds)) {
    addUnique(errors, 'COVERAGE_ID_OUT_OF_SCOPE');
  }
  if (asStringArray(raw.sourceEntityIds) && outOfScopeIds(raw.sourceEntityIds, input.allowedSourceEntityIds)) {
    addUnique(errors, 'SOURCE_ENTITY_ID_OUT_OF_SCOPE');
  }
  if (asStringArray(raw.authorityMentionIds) && outOfScopeIds(raw.authorityMentionIds, input.allowedAuthorityMentionIds)) {
    addUnique(errors, 'AUTHORITY_MENTION_ID_OUT_OF_SCOPE');
  }
  if (raw.verifiedAuthorityIds !== undefined && !asStringArray(raw.verifiedAuthorityIds)) {
    addUnique(errors, 'VERIFIED_AUTHORITY_IDS_INVALID');
  }
  if (asStringArray(raw.verifiedAuthorityIds)
    && outOfScopeIds(raw.verifiedAuthorityIds, input.allowedVerifiedAuthorityIds || [])) {
    addUnique(errors, 'VERIFIED_AUTHORITY_ID_OUT_OF_SCOPE');
  }
  if (input.researchUnlocked
    && (typeof raw.researchHash !== 'string' || raw.researchHash !== input.expectedResearchHash)) {
    addUnique(errors, 'RESEARCH_HASH_MISMATCH');
  }

  const unresolvedRequirements = asStringArray(raw.unresolvedRequirements) ? raw.unresolvedRequirements : [];
  if (unresolvedRequirements.some((requirement) => !ALLOWED_REQUIREMENTS.has(requirement))) {
    addUnique(errors, 'UNKNOWN_REQUIREMENT_CODE');
  }
  if (containsPlaceholder(raw)) addUnique(errors, 'PLACEHOLDER_MARKER_PRESENT');

  const metadata = raw.generationMetadata;
  if (!isRecord(metadata)) {
    addUnique(errors, 'GENERATION_METADATA_INVALID');
  } else {
    if (metadata.promptVersion !== input.promptVersion) addUnique(errors, 'PROMPT_VERSION_MISMATCH');
    if (metadata.contextHash !== input.contextHash) addUnique(errors, 'CONTEXT_HASH_MISMATCH');
    if (typeof metadata.providerRequested !== 'string' || !metadata.providerRequested.trim()) {
      addUnique(errors, 'GENERATION_METADATA_INVALID');
    }
    if (typeof metadata.providerActuallyUsed !== 'string' || !metadata.providerActuallyUsed.trim()) {
      addUnique(errors, 'GENERATION_METADATA_INVALID');
    }
    if (typeof metadata.attemptCount !== 'number' || metadata.attemptCount < 1) {
      addUnique(errors, 'GENERATION_METADATA_INVALID');
    }
  }

  const legalDevelopment = asStringArray(raw.legalDevelopment) ? raw.legalDevelopment : [];
  const evidentiaryDevelopment = asStringArray(raw.evidentiaryDevelopment) ? raw.evidentiaryDevelopment : [];
  const requiresResearch = unresolvedRequirements.includes('REQUIRES_LEGAL_RESEARCH');
  if (draftContract === 'ARGUMENTATIVE' && legalDevelopment.length === 0 && !requiresResearch) {
    addUnique(errors, 'LEGAL_DEVELOPMENT_REQUIRED');
  }
  if (draftContract === 'DESCRIPTIVE' && fieldRequirements.evidentiaryDevelopment.nonEmpty
    && evidentiaryDevelopment.every((item) => !item.trim())) {
    addUnique(errors, 'REQUIRED_ARRAY_EMPTY:evidentiaryDevelopment');
  }
  for (const error of authorityCitationErrors(raw, input)) addUnique(errors, error);

  if (errors.length > 0) return { status: 'INVALID_FATAL', errors, warnings };

  const result: IssueDraftResult = {
    legalIssueId: raw.legalIssueId as string,
    coverageItemIds: [...(raw.coverageItemIds as string[])],
    issueType: raw.issueType as LegalIssueType,
    thesis: draftContract === 'DESCRIPTIVE' ? '' : raw.thesis as string,
    factualDevelopment: [...(raw.factualDevelopment as string[])],
    evidentiaryDevelopment,
    legalDevelopment: [...legalDevelopment],
    counterPosition: typeof raw.counterPosition === 'string' ? raw.counterPosition : undefined,
    application: draftContract === 'DESCRIPTIVE' ? '' : raw.application as string,
    conclusion: draftContract === 'DESCRIPTIVE' ? '' : raw.conclusion as string,
    draftContract,
    sourceEntityIds: [...(raw.sourceEntityIds as string[])],
    authorityMentionIds: [...(raw.authorityMentionIds as string[])],
    unresolvedRequirements: [...unresolvedRequirements],
    generationMetadata: {
      promptVersion: (metadata as Record<string, unknown>).promptVersion as string,
      contextHash: (metadata as Record<string, unknown>).contextHash as string,
      providerRequested: (metadata as Record<string, unknown>).providerRequested as string,
      providerActuallyUsed: (metadata as Record<string, unknown>).providerActuallyUsed as string,
      model: typeof (metadata as Record<string, unknown>).model === 'string'
        ? (metadata as Record<string, unknown>).model as string
        : null,
      attemptCount: (metadata as Record<string, unknown>).attemptCount as number,
      usage: normalizeUsage((metadata as Record<string, unknown>).usage),
    },
  };
  if (asStringArray(raw.verifiedAuthorityIds)) result.verifiedAuthorityIds = [...raw.verifiedAuthorityIds];
  if (typeof raw.researchHash === 'string') result.researchHash = raw.researchHash;

  if (requiresResearch || unresolvedRequirements.length > 0) {
    warnings.push('RESULT_IS_NON_FINAL');
    return { status: 'VALID_NON_FINAL', result, errors, warnings };
  }
  return { status: 'VALID_ACCEPTED', result, errors, warnings };
}

function renderIssueComponents(result: IssueDraftResult): string {
  if (result.draftContract === 'DESCRIPTIVE') {
    return [
      `DESARROLLO FÁCTICO:\n${result.factualDevelopment.join('\n')}`,
      `DESARROLLO PROBATORIO:\n${result.evidentiaryDevelopment.join('\n')}`,
      `DESARROLLO JURÍDICO:\n${result.legalDevelopment.join('\n')}`,
    ].filter((section) => !section.endsWith(':\n')).join('\n\n');
  }
  const sections = [
    `CUESTIÓN: ${result.thesis}`,
    `DESARROLLO FÁCTICO:\n${result.factualDevelopment.join('\n')}`,
    `DESARROLLO PROBATORIO:\n${result.evidentiaryDevelopment.join('\n')}`,
    `DESARROLLO JURÍDICO:\n${result.legalDevelopment.join('\n')}`,
    result.counterPosition ? `POSTURA CONTRARIA: ${result.counterPosition}` : '',
    `APLICACIÓN: ${result.application}`,
    `CONCLUSIÓN: ${result.conclusion}`,
  ];
  return sections.filter(Boolean).join('\n\n');
}

export function draftBlockFromIssueResult(
  result: IssueDraftResult,
  task: GenerationTask,
  evaluation: BlockQualityEvaluation,
  validationStatus: IssueDraftValidationStatus = 'VALID_ACCEPTED',
): ContentBlock {
  const resultHash = hashIssueDraftResult(result);
  const nonFinal = validationStatus === 'VALID_NON_FINAL';
  return {
    id: `blk-${task.id}`,
    layer: 'GENERATED_ARGUMENT',
    text: renderIssueComponents(result),
    generationTaskId: task.id,
    legalIssueIds: [result.legalIssueId],
    coverageItemIds: [...result.coverageItemIds],
    factIds: [...(task.factIds || [])],
    evidenceIds: [...(task.evidenceIds || [])],
    authorityIds: [...result.authorityMentionIds],
    verifiedAuthorityIds: result.verifiedAuthorityIds ? [...result.verifiedAuthorityIds] : undefined,
    researchHash: result.researchHash,
    issueDraftValidationStatus: validationStatus,
    issueDraftResultHash: resultHash,
    semanticEvaluation: evaluation,
    generationStatus: nonFinal ? 'partial' : 'generated',
    generationRequirement: 'AI_REQUIRED',
    generatedBy: 'AI',
    provider: result.generationMetadata.providerActuallyUsed,
    model: result.generationMetadata.model || null,
  };
}
