import { createHash, randomUUID } from 'crypto';
import type { CaseAnalysis } from './caseAnalysis';
import type { CoverageMatrix, DocumentCoverageItem } from './coverageMatrix';
import type {
  ContentBlock,
  DocumentNode,
  UniversalLegalDocument,
} from './types';
import type { GenerationTask } from './generationTasks';
import type { BlockQualityEvaluation } from './semanticEvaluator';
import type { QualityGateResult } from './qualityGate';
import type { IssueTokenUsage } from './issueDraftResult';
import type { SourceProvenance } from './case-extraction/types';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import type { LegalResearchTrace } from './legal-research/researchTrace';
import type { DerivedIssueReadiness } from './legal-research/types';
import { sanitizeTraceValue, stripTransientAuditTrace } from './generationTraceSanitizer';
import type { DocumentAssemblyResult, DocumentAssemblyTraceMetadata } from './documentAssemblyTypes';
import type { ExportManifest } from './exportArtifactTypes';

export type GenerationOrigin =
  | 'AI_GENERATED_LEGAL_CONTENT'
  | 'LOCAL_PLACEHOLDER'
  | 'DETERMINISTIC_FALLBACK'
  | 'USER'
  | 'SOURCE_DIRECT';

export type GeneratedBy = 'AI' | 'DETERMINISTIC' | 'USER' | 'FALLBACK' | 'SOURCE_DIRECT';
export type ProviderActuallyUsed = 'NVIDIA' | 'GEMINI' | 'GROQ' | 'LOCAL' | 'NONE';
export type GenerationRoutingResolutionSource =
  | 'EXPLICIT_UI'
  | 'EXPLICIT_TAXONOMY'
  | 'EXPLICIT_LABEL'
  | 'NEW_WRITING_INTAKE'
  | 'CURRENT_DOCUMENT'
  | 'INFERRED_REQUEST'
  | 'SAFE_FALLBACK';

export type CoverageTraceStatusReason =
  | 'VALID_SUBSTANTIVE_BLOCK'
  | 'VALID_STRUCTURAL_BLOCK'
  | 'PLACEHOLDER_NOT_COVERAGE'
  | 'LOCAL_FALLBACK_NOT_COVERAGE'
  | 'EMPTY_OUTPUT_NOT_COVERAGE'
  | 'SEMANTIC_SCORE_BELOW_THRESHOLD'
  | 'NO_GENERATED_BLOCK';

export interface GenerationTraceOptions {
  enabled?: boolean;
  outputDir?: string;
  writeMarkdown?: boolean;
  now?: () => Date;
  monotonicNow?: () => number;
}

export interface CaseAnalysisSnapshot {
  parties?: unknown;
  facts?: unknown;
  claims?: unknown;
  claimResponses?: unknown;
  evidence?: unknown;
  authorities?: unknown;
  arguments?: unknown;
  missingData?: unknown;
  provenance?: unknown;
  [key: string]: unknown;
}

export interface DocumentPlanSnapshot {
  sections: Array<{
    id: string;
    type?: string;
    title?: string;
    order?: number;
    visibility?: unknown;
    required?: boolean;
    optional?: boolean;
    seeds?: unknown;
    expectedCoverage?: string[];
    plannedGeneration?: boolean;
  }>;
}

export interface CoverageTraceItem {
  id: string;
  type?: string;
  sourceEntityType?: string;
  sourceEntityIds?: string[];
  claimIds?: string[];
  factIds?: string[];
  evidenceMentionIds?: string[];
  evidenceOfferIds?: string[];
  argumentIds?: string[];
  authorityMentionIds?: string[];
  conflictIds?: string[];
  missingDataIds?: string[];
  legalIssueIds?: string[];
  scope?: string;
  satisfactionPolicy?: string;
  blocking?: boolean;
  sectionIds?: string[];
  requirement?: string;
  relatedSourceIds?: string[];
  statusBefore?: string;
  taskIds: string[];
  draftBlockIds: string[];
  statusAfter?: string;
  evaluationScore?: number;
  reason?: CoverageTraceStatusReason | string;
}

export interface CoverageTraceSnapshot {
  documentId?: string;
  documentType?: string;
  items: CoverageTraceItem[];
  summary?: Record<string, unknown>;
}

export interface TaskExecutionTrace {
  taskId: string;
  taskType?: string;
  sectionId: string;
  coverageItemIds: string[];
  legalIssueIds: string[];
  evidenceIds: string[];
  factIds: string[];
  claimIds: string[];
  contextPack?: unknown;
  providerRequested?: string;
  providerActuallyUsed?: ProviderActuallyUsed;
  model?: string | null;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokenBudget?: number;
  inputSizeBytes?: number;
  outputSizeBytes?: number;
  continuationCount: number;
  responseStatus: string;
  rawOutputHash?: string;
  normalizedOutput?: string;
  evaluation?: BlockQualityEvaluation;
  retryCount: number;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  origin?: GenerationOrigin;
  finalBlockId?: string;
  research?: IssueResearchGenerationTrace;
  error?: string;
}

export interface SectionWordAccountingLoss {
  lossId: string;
  stage: 'provider-validation' | 'semantic-review' | 'deduplication' | 'block-admission' | 'assembly' | 'export';
  reason: string;
  words: number;
  taskId?: string;
}

export interface SectionWordAccounting {
  sectionId: string;
  accountingSchemaVersion: 2;
  plannedWords: number;
  providerGeneratedWords: number;
  providerGeneratedChars: number;
  validatedWords: number;
  rejectedWords: number;
  dedupRemovedWords: number;
  materializedWords: number;
  admittedWords: number;
  assembledWords: number;
  exportedWords: number;
  losses: SectionWordAccountingLoss[];
}

export interface WordAccountingUpdate {
  sectionId: string;
  plannedWords?: number;
  providerGeneratedWords?: number;
  providerGeneratedChars?: number;
  validatedWords?: number;
  rejectedWords?: number;
  dedupRemovedWords?: number;
  materializedWords?: number;
  admittedWords?: number;
  assembledWords?: number;
  exportedWords?: number;
  reason?: string;
  lossStage?: SectionWordAccountingLoss['stage'];
  taskId?: string;
  mode?: 'ADD' | 'SET';
}

export interface IssueResearchGenerationTrace {
  requestId?: string;
  researchHash?: string;
  verifiedAuthorityIds: string[];
  researchReadiness?: DerivedIssueReadiness['researchReadiness'];
  effectiveEligibilityReason: string;
}

export interface IssueGenerationAttemptTrace {
  legalIssueId: string;
  taskId: string;
  attempt: number;
  coverageItemIds: string[];
  promptVersion: string;
  contextHash: string;
  providerRequested: string;
  providerActuallyUsed: string;
  model?: string | null;
  outcome: 'PROVIDER_SUCCESS' | 'VALIDATION_FAILED' | 'SEMANTIC_FAILED' | 'ACCEPTED' | 'FALLBACK' | 'BLOCKED';
  validationStatus?: string;
  resultHash?: string;
  evaluation?: unknown;
  usage: IssueTokenUsage;
  providerGeneratedWords?: number;
  providerGeneratedChars?: number;
  validatedWords?: number;
  rejectedWords?: number;
  lossReason?: string;
  research?: IssueResearchGenerationTrace;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface GenerationTaskTrace extends TaskExecutionTrace {
  plannedAt: string;
  objective?: string;
  targetWords?: number;
}

export interface CoverageTransitionTrace {
  coverageItemId: string;
  legalIssueIds?: string[];
  sourceEntityType?: string;
  sourceEntityIds?: string[];
  scope?: string;
  satisfactionPolicy?: string;
  blocking?: boolean;
  sectionIds?: string[];
  statusBefore?: string;
  statusAfter?: string;
  reason: CoverageTraceStatusReason | string;
  taskIds: string[];
  draftBlockIds: string[];
  evaluationScore?: number;
}

export interface AssemblyParagraphTrace {
  paragraphIndex: number;
  sectionId?: string;
  blockId?: string;
  generationTaskId?: string;
  coverageItemIds: string[];
  textHash: string;
  styleCategory?: string;
  rendered: boolean;
  omissionReason?: string;
}

export interface ExportTrace {
  status: 'success' | 'failed';
  format: 'docx' | 'unknown';
  byteLength?: number;
  bufferHash?: string;
  paragraphCount?: number;
  styleCounts?: Record<string, number>;
  error?: string;
}

export interface ExtractionTrace {
  sourceUnitCount: number;
  candidateCounts: Record<string, number>;
  decisions: Array<{
    candidateId: string;
    kind: string;
    decision: string;
    reason?: string;
    provenance: SourceProvenance[];
  }>;
  entityCounts: Record<string, number>;
  conflictIds: string[];
  missingDataFields: string[];
  projectionLosses: string[];
}

export interface GenerationTrace {
  schemaVersion: '1.0';
  generationId: string;
  startedAt: string;
  completedAt?: string;
  documentType: string;
  matter: string;
  requestedDocumentType?: string | null;
  resolvedDocumentType?: string | null;
  requestedMatter?: string | null;
  resolvedMatter?: string | null;
  requestedJurisdiction?: string | null;
  resolvedJurisdiction?: string | null;
  documentTypeResolutionSource?: GenerationRoutingResolutionSource;
  matterResolutionSource?: GenerationRoutingResolutionSource;
  jurisdictionResolutionSource?: GenerationRoutingResolutionSource;
  fallbackReason?: string | null;
  workflow?: string;
  providerRequested?: string;
  providerActuallyUsed?: ProviderActuallyUsed;
  model?: string | null;
  providerFallbackReason?: string | null;
  sourceIds: string[];
  operationalManual?: {
    manualVersion: string;
    manualHash: string;
    selectedRuleIds: string[];
    selectedPages: number[];
    selectedSections: string[];
    retrievals: Array<{ taskId: string; retrievalStage: string; selectedRuleIds: string[]; selectedPages: number[]; selectedRules?: Array<{ id: string; physicalPage: number; section: string; category?: string }>; categories?: string[]; contextCharacters?: number; discardedRulesByContextLimit: string[] }>;
    auditRuleIds: string[];
    auditFindings: import('../operational-manual/core').ManualFinding[];
  };
  caseAnalysisSnapshot?: CaseAnalysisSnapshot;
  documentPlanSnapshot?: DocumentPlanSnapshot;
  coverageMatrixBeforeGeneration?: CoverageTraceSnapshot;
  generationTasks: GenerationTaskTrace[];
  taskExecutions: TaskExecutionTrace[];
  issueGenerationAttempts: IssueGenerationAttemptTrace[];
  coverageTransitions: CoverageTransitionTrace[];
  coverageMatrixAfterGeneration?: CoverageTraceSnapshot;
  extraction?: ExtractionTrace;
  legalResearch?: LegalResearchTrace;
  semanticEvaluations: BlockQualityEvaluation[];
  draftBlocks: Array<{
    id: string;
    generationId?: string;
    generationTaskId?: string;
    coverageItemIds?: string[];
    generatedBy?: GeneratedBy;
    provider?: string;
    model?: string | null;
    fallbackStatus?: string;
    fallbackReason?: string | null;
    semanticScore?: number;
    genericityClass?: string;
    research?: IssueResearchGenerationTrace;
    sectionId?: string;
    wordCount: number;
    textHash: string;
  }>;
  qualityGateResult?: QualityGateResult;
  documentAssembly?: DocumentAssemblyTraceMetadata;
  assemblyMetadata: {
    paragraphs: AssemblyParagraphTrace[];
    plannedSectionIds: string[];
    generatedSectionIds: string[];
    renderedSectionIds: string[];
  };
  exportMetadata?: ExportTrace;
  exportManifest?: ExportManifest;
  wordAccounting: SectionWordAccounting[];
  warnings: string[];
  errors: string[];
}

export interface GenerationTraceContext {
  readonly generationId: string;
  readonly enabled: boolean;
  readonly trace: GenerationTrace;
  snapshotCaseAnalysis(value: CaseAnalysis | undefined): void;
  snapshotDocumentPlan(value: unknown): void;
  snapshotCoverageBefore(value: CoverageMatrix | undefined): void;
  snapshotCoverageAfter(value: CoverageMatrix | undefined): void;
  recordRoutingResolution(value: {
    requestedDocumentType?: string | null;
    resolvedDocumentType?: string | null;
    requestedMatter?: string | null;
    resolvedMatter?: string | null;
    requestedJurisdiction?: string | null;
    resolvedJurisdiction?: string | null;
    documentTypeResolutionSource?: GenerationRoutingResolutionSource;
    matterResolutionSource?: GenerationRoutingResolutionSource;
    jurisdictionResolutionSource?: GenerationRoutingResolutionSource;
    fallbackReason?: string | null;
  }): void;
  recordTaskPlanned(task: GenerationTask, contextPack?: unknown): void;
  recordTaskExecution(entry: TaskExecutionTrace): void;
  recordIssueGenerationAttempt(entry: IssueGenerationAttemptTrace): void;
  recordWordAccounting(entry: WordAccountingUpdate): void;
  recordCoverageTransition(entry: CoverageTransitionTrace): void;
  recordSemanticEvaluation(value: BlockQualityEvaluation): void;
  recordDraftBlock(block: ContentBlock, research?: IssueResearchGenerationTrace, sectionIdOverride?: string): void;
  recordQualityGate(result: QualityGateResult): void;
  recordDocumentAssembly(result: DocumentAssemblyResult): void;
  recordAssembly(entry: AssemblyParagraphTrace): void;
  recordExport(entry: ExportTrace): void;
  recordExportManifest(manifest: ExportManifest): void;
  recordExtraction(entry: ExtractionTrace): void;
  attachLegalResearchTrace(value: LegalResearchTrace): void;
  addWarning(message: string): void;
  addError(message: string): void;
  close(): GenerationTrace;
}

function snapshotCoverage(
  matrix: CoverageMatrix | undefined,
  previous?: CoverageTraceSnapshot,
  taskLinks: Map<string, string[]> = new Map(),
  legalIssueLinks: Map<string, string[]> = new Map(),
): CoverageTraceSnapshot | undefined {
  if (!matrix) return undefined;
  const previousById = new Map((previous?.items || []).map((item) => [item.id, item]));
  return sanitizeTraceValue({
    documentId: matrix.documentId,
    documentType: matrix.documentType,
    items: matrix.items.map((item: DocumentCoverageItem) => ({
      id: item.id,
      type: item.category,
      sourceEntityType: item.sourceEntityType,
      sourceEntityIds: item.sourceEntityIds,
      claimIds: item.claimIds,
      factIds: item.factIds,
      evidenceMentionIds: item.evidenceMentionIds,
      evidenceOfferIds: item.evidenceOfferIds,
      argumentIds: item.argumentIds,
      authorityMentionIds: item.authorityMentionIds,
      conflictIds: item.conflictIds,
      missingDataIds: item.missingDataIds,
      legalIssueIds: legalIssueLinks.get(item.id) || [],
      scope: item.scope,
      satisfactionPolicy: item.satisfactionPolicy,
      blocking: item.blocking,
      sectionIds: item.targetSectionIds,
      requirement: item.description,
      relatedSourceIds: item.sourceId ? [item.sourceId] : (item.sourceReferences || []).map((ref) => ref.documentId).filter(Boolean),
      statusBefore: previousById.get(item.id)?.statusAfter || item.status,
      taskIds: taskLinks.get(item.id) || [],
      draftBlockIds: Array.from(new Set([
        ...(previousById.get(item.id)?.draftBlockIds || []),
        ...(item.generatedBlockIds || []),
      ])),
      statusAfter: item.status,
      reason: item.metadata?.coverageStatusReason,
    })),
    summary: matrix.summary,
  }) as CoverageTraceSnapshot;
}

export function hashTraceText(text: string): string {
  if (typeof createHash !== 'function') {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(16, '0');
  }
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sourceIdsFromDocument(doc: UniversalLegalDocument): string[] {
  return (doc.sourceDocuments || [])
    .map((source) => String((source as { id?: string; documentId?: string; fileName?: string }).id || (source as { documentId?: string }).documentId || (source as { fileName?: string }).fileName || ''))
    .filter(Boolean);
}

function limitTraceValue(value: unknown, maxStringLength = 2000): unknown {
  const sanitized = sanitizeTraceValue(value);
  if (typeof sanitized === 'string') return sanitized.slice(0, maxStringLength);
  if (Array.isArray(sanitized)) return sanitized.map((item) => limitTraceValue(item, maxStringLength));
  if (sanitized && typeof sanitized === 'object') {
    return Object.fromEntries(Object.entries(sanitized as Record<string, unknown>).map(([key, child]) => [key, limitTraceValue(child, maxStringLength)]));
  }
  return sanitized;
}

function copyResearchTrace(value: IssueResearchGenerationTrace | undefined): IssueResearchGenerationTrace | undefined {
  if (!value) return undefined;
  return sanitizeTraceValue({
    requestId: value.requestId,
    researchHash: value.researchHash,
    verifiedAuthorityIds: [...value.verifiedAuthorityIds],
    researchReadiness: value.researchReadiness,
    effectiveEligibilityReason: value.effectiveEligibilityReason,
  }) as IssueResearchGenerationTrace;
}

function wordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

function sectionWordAccounting(trace: GenerationTrace, sectionId: string): SectionWordAccounting {
  const existing = trace.wordAccounting.find((entry) => entry.sectionId === sectionId);
  if (existing) return existing;
  const created: SectionWordAccounting = {
    sectionId,
    accountingSchemaVersion: 2,
    plannedWords: 0,
    providerGeneratedWords: 0,
    providerGeneratedChars: 0,
    validatedWords: 0,
    rejectedWords: 0,
    dedupRemovedWords: 0,
    materializedWords: 0,
    admittedWords: 0,
    assembledWords: 0,
    exportedWords: 0,
    losses: [],
  };
  trace.wordAccounting.push(created);
  return created;
}

function applyWordAccountingUpdate(trace: GenerationTrace, update: WordAccountingUpdate): void {
  const accounting = sectionWordAccounting(trace, update.sectionId);
  const mode = update.mode || 'ADD';
  const stages = [
    'plannedWords', 'providerGeneratedWords', 'providerGeneratedChars', 'validatedWords',
    'rejectedWords', 'dedupRemovedWords', 'materializedWords', 'admittedWords', 'assembledWords', 'exportedWords',
  ] as const;
  for (const stage of stages) {
    const value = update[stage];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    accounting[stage] = mode === 'SET' ? Math.max(0, value) : accounting[stage] + Math.max(0, value);
  }
  if (update.reason && update.lossStage && (update.rejectedWords || update.dedupRemovedWords)) {
    const words = Math.max(0, update.dedupRemovedWords || update.rejectedWords || 0);
    accounting.losses.push({
      lossId: `${update.sectionId}:${accounting.losses.length + 1}`,
      stage: update.lossStage,
      reason: update.reason,
      words,
      ...(update.taskId ? { taskId: update.taskId } : {}),
    });
  }
}

export function recordExportWordCounts(trace: GenerationTrace, manifest: ExportManifest): void {
  for (const section of manifest.sectionWordCounts || []) {
    const accounting = sectionWordAccounting(trace, section.sectionId);
    const exportLoss = Math.max(0, accounting.assembledWords - section.wordCount);
    const exportReason = manifest.omittedBlockIds.length > 0
      ? `EXPORT_OMITTED_BLOCKS:${manifest.omittedBlockIds.join(',')}`
      : 'EXPORT_WORD_COUNT_MISMATCH';
    const alreadyRecorded = accounting.losses.some((loss) => (
      loss.stage === 'export' && loss.reason === exportReason && loss.words === exportLoss
    ));
    applyWordAccountingUpdate(trace, {
      sectionId: section.sectionId,
      exportedWords: section.wordCount,
      mode: 'SET',
      ...(exportLoss > 0 && !alreadyRecorded ? {
        rejectedWords: exportLoss,
        reason: exportReason,
        lossStage: 'export',
      } : {}),
    });
  }
}

function createTrace(input: { generationId: string; doc: UniversalLegalDocument; now: () => Date; providerRequested?: string }): GenerationTrace {
  return {
    schemaVersion: '1.0',
    generationId: input.generationId,
    startedAt: input.now().toISOString(),
    documentType: input.doc.documentTypeLabel || input.doc.documentType || '',
    matter: input.doc.matter || '',
    workflow: input.doc.flow || input.doc.generationMetadata.generationMode,
    providerRequested: input.providerRequested,
    sourceIds: sourceIdsFromDocument(input.doc),
    generationTasks: [],
    taskExecutions: [],
    issueGenerationAttempts: [],
    coverageTransitions: [],
    semanticEvaluations: [],
    draftBlocks: [],
    wordAccounting: [],
    warnings: [],
    errors: [],
    assemblyMetadata: {
      paragraphs: [],
      plannedSectionIds: [],
      generatedSectionIds: [],
      renderedSectionIds: [],
    },
  };
}

export function createGenerationTraceContext(input: {
  generationId?: string;
  doc: UniversalLegalDocument;
  providerRequested?: string;
  options?: GenerationTraceOptions;
}): GenerationTraceContext {
  const options = input.options || {};
  const enabled = options.enabled ?? (process.env.NODE_ENV === 'development' || process.env.GENERATION_TRACE_ENABLED === 'true');
  const now = options.now || (() => new Date());
  const monotonicNow = options.monotonicNow || (() => Date.now());
  const generationId = input.generationId || randomUUID();
  const trace = createTrace({ generationId, doc: input.doc, now, providerRequested: input.providerRequested });
  let closed = false;
  const taskStartedAt = new Map<string, number>();

  const buildTaskLinks = (): Map<string, string[]> => {
    const links = new Map<string, string[]>();
    for (const entry of trace.taskExecutions) {
      for (const coverageItemId of entry.coverageItemIds || []) {
        links.set(coverageItemId, Array.from(new Set([...(links.get(coverageItemId) || []), entry.taskId])));
      }
    }
    return links;
  };

  const buildLegalIssueLinks = (matrix: LegalIssueMatrix | undefined): Map<string, string[]> => {
    const links = new Map<string, string[]>();
    for (const issue of matrix?.issues || []) {
      for (const coverageItemId of issue.coverageItemIds) {
        links.set(coverageItemId, Array.from(new Set([...(links.get(coverageItemId) || []), issue.id])));
      }
    }
    return links;
  };

  const context: GenerationTraceContext = {
    generationId,
    enabled,
    trace,
    snapshotCaseAnalysis(value) {
      if (!enabled || !value) return;
      trace.caseAnalysisSnapshot = sanitizeTraceValue(value) as CaseAnalysisSnapshot;
    },
    snapshotDocumentPlan(value) {
      if (!enabled || !value) return;
      const candidate = value as { sections?: DocumentNode[] };
      trace.documentPlanSnapshot = sanitizeTraceValue({
        sections: (candidate.sections || []).map((section) => ({
          id: section.id,
          type: section.type,
          title: section.title,
          order: section.order,
          visibility: (section as DocumentNode & { visible?: boolean }).visible,
          required: (section as DocumentNode & { required?: boolean }).required,
          optional: (section as DocumentNode & { optional?: boolean }).optional,
          seeds: (section as DocumentNode & { seeds?: unknown }).seeds,
          expectedCoverage: (section as DocumentNode & { expectedCoverage?: string[] }).expectedCoverage,
          plannedGeneration: (section as DocumentNode & { isGenerated?: boolean }).isGenerated,
        })),
      }) as DocumentPlanSnapshot;
      trace.assemblyMetadata.plannedSectionIds = trace.documentPlanSnapshot.sections.map((section) => section.id);
    },
    snapshotCoverageBefore(value) {
      if (!enabled) return;
      trace.coverageMatrixBeforeGeneration = snapshotCoverage(value, undefined, new Map(), buildLegalIssueLinks(input.doc.legalIssueMatrix));
    },
    snapshotCoverageAfter(value) {
      if (!enabled) return;
      trace.coverageMatrixAfterGeneration = snapshotCoverage(value, trace.coverageMatrixBeforeGeneration, buildTaskLinks(), buildLegalIssueLinks(input.doc.legalIssueMatrix));
    },
    recordRoutingResolution(value) {
      if (!enabled) return;
      Object.assign(trace, sanitizeTraceValue(value));
    },
    recordTaskPlanned(task, contextPack) {
      if (!enabled) return;
      const startedAt = now().toISOString();
      const existing = trace.generationTasks.find((entry) => entry.taskId === task.id);
      if (existing) {
        existing.contextPack = limitTraceValue(contextPack);
        existing.tokenBudget = task.tokenBudget;
        existing.objective = task.objective;
        return;
      }
      taskStartedAt.set(task.id, monotonicNow());
      const taskTrace: GenerationTaskTrace = {
        taskId: task.id,
        taskType: task.taskType || task.type,
        sectionId: task.sectionId,
        coverageItemIds: task.coverageItemIds || [],
        legalIssueIds: task.legalIssueIds || (task.targetIssueId ? [task.targetIssueId] : []),
        evidenceIds: task.evidenceIds || [],
        factIds: task.factIds || [],
        claimIds: task.claimIds || [],
        contextPack: limitTraceValue(contextPack),
        providerRequested: trace.providerRequested,
        model: null,
        startedAt,
        plannedAt: startedAt,
        tokenBudget: task.tokenBudget,
        continuationCount: 0,
        responseStatus: 'planned',
        retryCount: 0,
        fallbackUsed: false,
        objective: task.objective,
        targetWords: task.targetWords,
      };
      trace.generationTasks.push(taskTrace);
      if (typeof task.targetWords === 'number' && task.targetWords > 0) {
        applyWordAccountingUpdate(trace, { sectionId: task.sectionId, plannedWords: task.targetWords });
      }
    },
    recordTaskExecution(entry) {
      if (!enabled) return;
      const started = taskStartedAt.get(entry.taskId);
      trace.taskExecutions.push({
        ...entry,
        research: copyResearchTrace(entry.research),
        durationMs: entry.durationMs ?? (started === undefined ? undefined : Math.max(0, monotonicNow() - started)),
        contextPack: limitTraceValue(entry.contextPack),
        normalizedOutput: entry.normalizedOutput ? String(limitTraceValue(entry.normalizedOutput, 4000)) : undefined,
        error: entry.error ? String(sanitizeTraceValue(entry.error)) : undefined,
      });
      const planned = trace.generationTasks.find((task) => task.taskId === entry.taskId);
      if (planned) Object.assign(planned, entry);
    },
    recordIssueGenerationAttempt(entry) {
      if (!enabled) return;
      trace.issueGenerationAttempts.push(sanitizeTraceValue({
        ...entry,
        coverageItemIds: [...entry.coverageItemIds],
        contextHash: entry.contextHash,
        promptVersion: entry.promptVersion,
        research: copyResearchTrace(entry.research),
        usage: {
          promptTokens: entry.usage?.promptTokens ?? null,
          completionTokens: entry.usage?.completionTokens ?? null,
          totalTokens: entry.usage?.totalTokens ?? null,
          ...(entry.usage?.estimated === undefined ? {} : { estimated: entry.usage.estimated }),
        },
        evaluation: entry.evaluation === undefined ? undefined : limitTraceValue(entry.evaluation),
      }) as IssueGenerationAttemptTrace);
      const sectionId = trace.generationTasks.find((task) => task.taskId === entry.taskId)?.sectionId;
      if (sectionId) {
        applyWordAccountingUpdate(trace, {
          sectionId,
          providerGeneratedWords: entry.providerGeneratedWords || 0,
          providerGeneratedChars: entry.providerGeneratedChars || 0,
          validatedWords: entry.validatedWords || 0,
          rejectedWords: entry.rejectedWords || 0,
          ...(entry.lossReason ? {
            reason: entry.lossReason,
            lossStage: entry.outcome === 'SEMANTIC_FAILED' ? 'semantic-review' : 'provider-validation',
          } : {}),
          taskId: entry.taskId,
        });
      }
    },
    recordWordAccounting(entry) {
      if (!enabled) return;
      applyWordAccountingUpdate(trace, entry);
    },
    recordCoverageTransition(entry) {
      if (!enabled) return;
      trace.coverageTransitions.push(sanitizeTraceValue(entry) as CoverageTransitionTrace);
    },
    recordSemanticEvaluation(value) {
      if (!enabled) return;
      trace.semanticEvaluations.push(sanitizeTraceValue(value) as BlockQualityEvaluation);
    },
    recordDraftBlock(block, research, sectionIdOverride) {
      if (!enabled) return;
      const taskId = block.generationTaskId || block.taskId;
      const sectionId = sectionIdOverride || trace.generationTasks.find((task) => task.taskId === taskId)?.sectionId;
      const blockWords = wordCount(block.text || '');
      const existed = trace.draftBlocks.some((entry) => entry.id === block.id);
      const draftBlock = {
        id: block.id,
        generationId: block.generationId,
        generationTaskId: block.generationTaskId || block.taskId,
        coverageItemIds: block.coverageItemIds,
        generatedBy: block.generatedBy,
        provider: block.provider,
        model: block.model,
        fallbackStatus: block.fallbackStatus,
        fallbackReason: block.fallbackReason,
        semanticScore: block.semanticScore,
        genericityClass: block.genericityClass,
        sectionId,
        wordCount: blockWords,
        research: copyResearchTrace(research),
        textHash: hashTraceText(block.text || ''),
      };
      const existing = trace.draftBlocks.find((entry) => entry.id === block.id);
      if (existing) Object.assign(existing, draftBlock);
      else trace.draftBlocks.push(draftBlock);
      if (sectionId && !existed) applyWordAccountingUpdate(trace, {
        sectionId,
        materializedWords: blockWords,
        admittedWords: blockWords,
        taskId,
      });
    },
    recordQualityGate(result) {
      if (!enabled) return;
      trace.qualityGateResult = sanitizeTraceValue(result) as QualityGateResult;
    },
    recordDocumentAssembly(result) {
      if (!enabled) return;
      for (const section of result.sections) {
        applyWordAccountingUpdate(trace, {
          sectionId: section.sectionId,
          assembledWords: section.blocks.reduce((total, block) => total + wordCount(block.text || ''), 0),
          mode: 'SET',
        });
      }
      for (const blockId of result.excludedDraftBlockIds) {
        const block = trace.draftBlocks.find((entry) => entry.id === blockId);
        if (!block?.sectionId || !block.wordCount) continue;
        const finding = result.findings.find((candidate) => candidate.blockIds.includes(blockId));
        const reason = finding?.code || 'ASSEMBLY_EXCLUDED';
        const duplicate = /DUPLICAT/i.test(reason);
        applyWordAccountingUpdate(trace, {
          sectionId: block.sectionId,
          rejectedWords: block.wordCount,
          ...(duplicate ? { dedupRemovedWords: block.wordCount } : {}),
          reason,
          lossStage: duplicate ? 'deduplication' : 'assembly',
          taskId: trace.generationTasks.find((task) => task.taskId === block.generationTaskId)?.taskId,
        });
      }
      trace.documentAssembly = sanitizeTraceValue({
        ...result.trace,
        generationId: trace.generationId,
        orderedSectionIds: [...result.trace.orderedSectionIds],
        orderedBlockIds: [...result.trace.orderedBlockIds],
        sourceDraftBlockIds: [...result.trace.sourceDraftBlockIds],
        excludedDraftBlockIds: [...result.trace.excludedDraftBlockIds],
        findingCodes: [...result.trace.findingCodes],
        blockLinks: result.trace.blockLinks.map((link) => ({
          ...link,
          legalIssueIds: [...link.legalIssueIds],
          coverageItemIds: [...link.coverageItemIds],
        })),
      }) as DocumentAssemblyTraceMetadata;
    },
    recordAssembly(entry) {
      if (!enabled) return;
      trace.assemblyMetadata.paragraphs.push(sanitizeTraceValue(entry) as AssemblyParagraphTrace);
      if (entry.sectionId && entry.rendered && !trace.assemblyMetadata.renderedSectionIds.includes(entry.sectionId)) {
        trace.assemblyMetadata.renderedSectionIds.push(entry.sectionId);
      }
    },
    recordExport(entry) {
      if (!enabled) return;
      trace.exportMetadata = sanitizeTraceValue(entry) as ExportTrace;
    },
    recordExportManifest(manifest) {
      if (!enabled) return;
      trace.exportManifest = sanitizeTraceValue({
        ...manifest,
        renderedBlockIds: [...manifest.renderedBlockIds],
        omittedBlockIds: [...manifest.omittedBlockIds],
        traceStatus: 'RECORDED',
      }) as ExportManifest;
      recordExportWordCounts(trace, manifest);
    },
    recordExtraction(entry) {
      if (!enabled) return;
      trace.extraction = sanitizeTraceValue(entry) as ExtractionTrace;
    },
    attachLegalResearchTrace(value) {
      if (!enabled) return;
      trace.legalResearch = sanitizeTraceValue(value) as LegalResearchTrace;
    },
    addWarning(message) {
      if (!enabled) return;
      trace.warnings.push(String(sanitizeTraceValue(message)));
    },
    addError(message) {
      if (!enabled) return;
      trace.errors.push(String(sanitizeTraceValue(message)));
    },
    close() {
      if (!closed) {
        trace.completedAt = now().toISOString();
        closed = true;
      }
      return sanitizeTraceValue(trace) as GenerationTrace;
    },
  };
  return context;
}

export { sanitizeTraceValue, stripTransientAuditTrace };
