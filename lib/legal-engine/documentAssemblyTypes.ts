import { createDocumentNode, createEmptyDocument } from './types';
import type {
  ContentBlock,
  DocumentNode,
  UniversalLegalDocument,
} from './types';
import type { DocumentPlanResult } from './documentPlan';
import type { DraftingPlan } from './pipeline';
import type { GenerationTask } from './generationTasks';
import type { CoverageCategory, CoverageMatrix, DocumentCoverageItem } from './coverageMatrix';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import type { RichCaseAnalysis } from './case-extraction/types';
import type { DocumentSemanticEvaluation, BlockQualityEvaluation } from './semanticEvaluator';
import type { QualityGateResult } from './qualityGate';
import type { GenerationTrace } from './generationTrace';
import { stableResearchId } from './legal-research/canonical';

export const DOCUMENT_ASSEMBLY_READINESS = [
  'READY',
  'INCOMPLETE',
  'BLOCKED',
  'REQUIRES_REVIEW',
  'INVALID',
] as const;

export type DocumentAssemblyReadiness = typeof DOCUMENT_ASSEMBLY_READINESS[number];
export type AssemblyStatus = 'ASSEMBLED' | 'BLOCKED';
export type AssemblyValidationStatus = 'NOT_VALIDATED' | 'VALID' | 'REQUIRES_REVIEW' | 'INVALID';
export type DocumentAssemblyCheckStatus = 'PASS' | 'FAIL' | 'REVIEW' | 'NOT_APPLICABLE';

export interface DocumentAssemblyFinding {
  code: string;
  severity: 'INFO' | 'WARNING' | 'REVIEW' | 'BLOCKER';
  message: string;
  reason: string;
  blockIds: readonly string[];
  legalIssueIds: readonly string[];
  coverageItemIds: readonly string[];
  sectionIds: readonly string[];
  evidenceIds?: readonly string[];
  authorityIds?: readonly string[];
}

export interface DocumentAssemblySection {
  sectionId: string;
  sectionPath: readonly string[];
  title: string;
  type: DocumentNode['type'];
  order: number;
  blockIds: readonly string[];
  blocks: readonly ContentBlock[];
}

export interface DocumentAssemblyTraceMetadata {
  assemblyId: string;
  inputFingerprint: string;
  outputFingerprint: string;
  generationId?: string;
  orderedSectionIds: readonly string[];
  orderedBlockIds: readonly string[];
  sourceDraftBlockIds: readonly string[];
  excludedDraftBlockIds: readonly string[];
  findingCodes: readonly string[];
  blockLinks: readonly {
    blockId: string;
    generationTaskId?: string;
    issueDraftResultHash?: string;
    legalIssueIds: readonly string[];
    coverageItemIds: readonly string[];
    strategicCandidateId?: string;
    decisionReasoningId?: string;
    strategicArgumentPlanId?: string;
  }[];
}

export interface CoverageReconciliationItem {
  coverageItemId: string;
  finalBlockIds: readonly string[];
  finalSectionIds: readonly string[];
  satisfied: boolean;
  reason: string;
  duplicated: boolean;
  lostDuringAssembly: boolean;
}

export interface CoverageReconciliation {
  items: readonly CoverageReconciliationItem[];
  requiredMissingIds: readonly string[];
  duplicatedIds: readonly string[];
  lostIds: readonly string[];
  allRequiredSatisfied: boolean;
  findings?: readonly DocumentAssemblyFinding[];
}

export interface SectionContract {
  sectionId: string;
  sectionPath: readonly string[];
  title: string;
  type: DocumentNode['type'];
  required: boolean;
  contentRole: 'FORMAL' | 'FACT_RESPONSE' | 'ISSUE_ARGUMENT' | 'EVIDENCE' | 'PETITION' | 'CLOSING' | 'CUSTOM';
  allowedCoverageCategories: readonly CoverageCategory[];
  deterministicAllowed: boolean;
  requiresAcceptedSubstantiveBlock: boolean;
}

export interface DocumentAssemblyInput {
  document: UniversalLegalDocument;
  documentPlan: DocumentPlanResult;
  draftingPlan?: DraftingPlan;
  candidateSections: readonly DocumentNode[];
  candidateBlocks: readonly {
    sectionId: string;
    block: ContentBlock;
  }[];
  generationTasks: readonly GenerationTask[];
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  richCaseAnalysis?: RichCaseAnalysis;
  baseSemanticEvaluation?: DocumentSemanticEvaluation;
  baseQualityGate?: QualityGateResult;
  generationTrace?: Pick<GenerationTrace, 'generationId' | 'issueGenerationAttempts' | 'draftBlocks'>;
}

export interface DocumentAssemblyResult {
  documentId: string;
  documentType: string;
  document: UniversalLegalDocument;
  sections: readonly DocumentAssemblySection[];
  orderedBlocks: readonly ContentBlock[];
  sourceDraftBlockIds: readonly string[];
  excludedDraftBlockIds: readonly string[];
  linkedLegalIssueIds: readonly string[];
  linkedCoverageItemIds: readonly string[];
  assemblyStatus: AssemblyStatus;
  validationStatus: AssemblyValidationStatus;
  readiness: DocumentAssemblyReadiness;
  coverageReconciliation?: CoverageReconciliation;
  findings: readonly DocumentAssemblyFinding[];
  trace: DocumentAssemblyTraceMetadata;
}

export interface DocumentAssemblyCheck {
  checkId: string;
  status: DocumentAssemblyCheckStatus;
  findingCodes: readonly string[];
}

export interface DocumentAssemblyCheckSet {
  checks: readonly DocumentAssemblyCheck[];
  findings: readonly DocumentAssemblyFinding[];
  hasMaterialBlocker: boolean;
  hasInvalidity: boolean;
}

export interface DocumentAssemblyQualityGateResult {
  passed: boolean;
  canMarkAsReady: boolean;
  readiness: DocumentAssemblyReadiness;
  baseQualityGate: QualityGateResult;
  findings: readonly DocumentAssemblyFinding[];
  checks: readonly DocumentAssemblyCheck[];
}

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function defaultEvaluation(blockId: string, taskId = `task-${blockId}`): BlockQualityEvaluation {
  return {
    blockId,
    taskId,
    factualCoverage: 1,
    legalSupport: 1,
    evidenceLinkage: 1,
    issueResponsiveness: 1,
    argumentDepth: 1,
    specificity: 1,
    completeness: 1,
    repetitionPenalty: 0,
    unsupportedAssertionPenalty: 0,
    overallScore: 1,
    verdict: 'PASS',
    revisionMode: 'NONE',
    deficiencies: [],
    coveredCoverageItemIds: [],
    missingCoverageItemIds: [],
    hardFailReasons: [],
  };
}

function makeSection(id: string, title: string, order: number): DocumentNode {
  return createDocumentNode({
    id,
    title,
    type: 'argument',
    order,
    content: [],
    isGenerated: true,
    isManuallyEdited: false,
    variables: [],
    validationErrors: [],
    validationWarnings: [],
  });
}

export function makeDocumentFixture(overrides: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  const document = createEmptyDocument({
    id: 'doc-fase6-fixture',
    title: 'Documento FASE 6 fixture',
    documentType: 'fixture_document',
    documentTypeLabel: 'Fixture documental',
    matter: 'fixture',
    jurisdiction: 'federal',
    category: 'escrito',
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  });
  document.id = overrides.id || 'doc-fase6-fixture';
  document.createdAt = overrides.createdAt || FIXTURE_TIMESTAMP;
  document.updatedAt = overrides.updatedAt || FIXTURE_TIMESTAMP;
  return document;
}

export function makePlanFixture(overrides: Partial<DocumentPlanResult> = {}): DocumentPlanResult {
  const sections = overrides.sections || [
    makeSection('sec-hechos', 'HECHOS', 0),
    makeSection('sec-defensas', 'DEFENSAS', 10),
  ];
  return {
    sections,
    planSource: 'GENERATED',
    templateId: 'fixture-template',
    ...overrides,
  };
}

export function makeRichCaseAnalysisFixture(): RichCaseAnalysis {
  return {
    parties: [],
    assertions: [],
    claims: [],
    facts: [],
    documents: [],
    evidenceMentions: [],
    evidenceOffers: [],
    arguments: [],
    authorities: [],
    dates: [],
    amounts: [],
    proceduralTimeline: [],
    conflicts: [],
    missingData: [],
    sourcePosition: {} as RichCaseAnalysis['sourcePosition'],
    clientPosition: {} as RichCaseAnalysis['clientPosition'],
    extractionStats: {} as RichCaseAnalysis['extractionStats'],
    candidates: [],
  };
}

export function makeCoverageItem(overrides: Partial<DocumentCoverageItem> = {}): DocumentCoverageItem {
  return {
    id: 'cov-fixture',
    category: 'FACT_RESPONSE',
    description: 'Fixture Coverage item',
    required: true,
    status: 'pending',
    targetSectionIds: ['sec-hechos'],
    scope: 'SUBSTANTIVE',
    satisfactionPolicy: 'REQUIRES_SEMANTIC_RESPONSE',
    blocking: true,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    id: 'task-fixture',
    documentId: 'doc-fase6-fixture',
    sectionId: 'sec-hechos',
    sectionTitle: 'HECHOS',
    complexity: 'SHORT',
    tokenBudget: 800,
    status: 'completed',
    order: 0,
    orderInParent: 0,
    ...overrides,
  };
}

export function makeAcceptedBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  const id = overrides.id || 'blk-accepted';
  const generationTaskId = overrides.generationTaskId || overrides.taskId || `task-${id}`;
  return {
    id,
    layer: 'GENERATED_ARGUMENT',
    trust: 'VERIFIED',
    text: 'Contenido jurídico aceptado de fixture.',
    generationRequirement: 'AI_REQUIRED',
    generationStatus: 'generated',
    issueDraftValidationStatus: 'VALID_ACCEPTED',
    semanticEvaluation: defaultEvaluation(id, generationTaskId),
    taskId: generationTaskId,
    generationTaskId,
    legalIssueIds: ['issue-fixture'],
    coverageItemIds: ['cov-fixture'],
    generatedBy: 'AI',
    ...overrides,
  };
}

export function makeNonFinalBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return makeAcceptedBlock({
    id: 'blk-non-final',
    issueDraftValidationStatus: 'VALID_NON_FINAL',
    ...overrides,
  });
}

export function makeFormalBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'blk-formal',
    layer: 'GENERATED_ARGUMENT',
    text: 'Por lo expuesto, solicito se provea conforme a derecho.',
    generationRequirement: 'DETERMINISTIC',
    generationStatus: 'generated',
    generatedBy: 'DETERMINISTIC',
    coverageItemIds: ['cov-formal'],
    ...overrides,
  };
}

export function makeManualBlock(overrides: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: 'blk-manual',
    layer: 'USER_POSITION',
    text: 'Texto manual preservado por la persona usuaria.',
    generationRequirement: 'PRESERVED_HUMAN',
    generationStatus: 'generated',
    generatedBy: 'USER',
    isManuallyEdited: true,
    ...overrides,
  };
}

export function makeAssemblyInput(overrides: Partial<DocumentAssemblyInput> = {}): DocumentAssemblyInput {
  const document = overrides.document || makeDocumentFixture();
  const documentPlan = overrides.documentPlan || makePlanFixture();
  return {
    document,
    documentPlan,
    candidateSections: overrides.candidateSections || documentPlan.sections,
    candidateBlocks: overrides.candidateBlocks || [],
    generationTasks: overrides.generationTasks || [],
    coverageMatrix: overrides.coverageMatrix || {
      documentId: document.id,
      documentType: document.documentType,
      items: [makeCoverageItem()],
      summary: {
        total: 1,
        required: 1,
        pending: 1,
        generated: 0,
        covered: 0,
        unsupported: 0,
        weak: 0,
        notApplicable: 0,
      },
    },
    legalIssueMatrix: overrides.legalIssueMatrix,
    richCaseAnalysis: overrides.richCaseAnalysis,
    baseSemanticEvaluation: overrides.baseSemanticEvaluation,
    baseQualityGate: overrides.baseQualityGate,
    generationTrace: overrides.generationTrace,
    draftingPlan: overrides.draftingPlan,
    ...overrides,
  };
}

export function makeEmptyAssemblyResult(): DocumentAssemblyResult {
  const document = makeDocumentFixture();
  const emptyFingerprint = stableResearchId('assembly', {
    documentId: document.id,
    documentType: document.documentType,
    orderedSectionIds: [],
    orderedBlockIds: [],
  });
  return {
    documentId: document.id,
    documentType: document.documentType,
    document,
    sections: [],
    orderedBlocks: [],
    sourceDraftBlockIds: [],
    excludedDraftBlockIds: [],
    linkedLegalIssueIds: [],
    linkedCoverageItemIds: [],
    assemblyStatus: 'ASSEMBLED',
    validationStatus: 'NOT_VALIDATED',
    readiness: 'INCOMPLETE',
    findings: [],
    trace: {
      assemblyId: emptyFingerprint,
      inputFingerprint: emptyFingerprint,
      outputFingerprint: emptyFingerprint,
      orderedSectionIds: [],
      orderedBlockIds: [],
      sourceDraftBlockIds: [],
      excludedDraftBlockIds: [],
      findingCodes: [],
      blockLinks: [],
    },
  };
}
