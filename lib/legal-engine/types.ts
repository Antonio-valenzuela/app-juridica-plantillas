import { markDocumentAsDraft } from './documentLifecycle';
import type { DocumentLifecycleMetadata } from './documentLifecycle';
import type { SourceDocumentTypeValue } from './sourceDocumentTypes';
import type { GenerationTrace } from './generationTrace';

export type ContentLayer = 'SOURCE_FACT' | 'COURT_REASONING' | 'USER_POSITION' | 'AI_ANALYSIS' | 'GENERATED_ARGUMENT';
export type TrustLevel = 'VERIFIED' | 'UNVERIFIED' | 'AI_INFERENCE' | 'PENDING';

export type ProvenanceKind =
  | 'SOURCE_DOCUMENT'
  | 'SOURCE_EXTRACTED'
  | 'LAWYER_INPUT'
  | 'LAWYER_CONFIRMED'
  | 'INFERRED'
  | 'TEMPLATE_STRUCTURE'
  | 'AI_GENERATED'
  | 'USER_EDITED';

export type FactPosition =
  | 'ADMIT'
  | 'DENY'
  | 'PARTIAL'
  | 'NOT_KNOWN'
  | 'UNDEFINED'
  | 'ACCEPT'
  | 'OPPOSE'
  | 'IGNORE_PERSONAL_KNOWLEDGE'
  | 'REQUIRE_LAWYER_INPUT'
  | 'UNDETERMINED';

export type LawyerFactPosition = 'ADMIT' | 'DENY' | 'PARTIAL' | 'NOT_KNOWN' | 'UNDEFINED';
export type LawyerClaimPosition = 'ACCEPT' | 'OPPOSE' | 'PARTIAL' | 'UNDEFINED';

export interface ProceduralIdentity {
  matter: string;
  jurisdiction: string;
  procedure: string;
  sourceDocumentType: SourceDocumentTypeValue;
  /** Autoridad vinculada al acto o asunto de origen. */
  sourceAuthority?: string;
  /** Órgano jurisdiccional que dictó la resolución que se recurre. */
  organoResolucionRecurrida?: string;
  /** Órgano competente para resolver el medio de impugnación. */
  autoridadDestinataria?: string;
  /** Órgano por cuyo conducto se presenta, cuando la estrategia lo exige. */
  organoPresentacion?: string;
  representedParty: string;
  proceduralPosition: string;
  targetDocument: string;
  objective: string;
}

export interface DocumentRoutingMetadata {
  selectedDocumentType?: string;
  sourceDocumentType: SourceDocumentTypeValue;
  resolvedStrategy: string;
  resolvedTemplate: string;
  templateSource: 'CANONICAL_ID' | 'EXPLICIT_LABEL' | 'INFERRED_ID' | 'SAFE_FALLBACK';
  fallbackUsed: boolean;
  outputFilename: string;
}

export interface AnalyzedFact {
  id: string;
  number: string;
  text: string;
  documentId?: string;
  page?: number;
  confidence: number;
  sourceFact?: string;
  lawyerPosition?: LawyerFactPosition;
  lawyerObservation?: string;
  generatedResponse?: string;
  supportingSources?: SourceReference[];
  position?: FactPosition;
  proposedPosture?: 'ADMIT' | 'DENY' | 'PARTIALLY_ADMIT' | 'UNKNOWN';
  proposedResponse?: string;
  response?: string;
  support?: string[];
  sourceReference?: SourceReference;
  manualResponse?: string;
  provenance?: ProvenanceKind;
  isManuallyEdited?: boolean;
  actor?: string;
  date?: string;
  contestedStatus?: 'CONTESTED' | 'UNCONTESTED' | 'UNKNOWN';
  relatedEvidenceIds?: string[];
}

export interface AnalyzedClaim {
  id: string;
  number: string;
  text: string;
  sourceClaim?: string;
  lawyerPosition?: LawyerClaimPosition;
  lawyerObservation?: string;
  generatedResponse?: string;
  supportingSources?: SourceReference[];
  position: FactPosition;
  response?: string;
  support?: string[];
  sourceReference?: SourceReference;
  provenance?: ProvenanceKind;
}

export type WritingIntakeFieldType = 'text' | 'textarea' | 'date' | 'select' | 'document';

export interface WritingIntakeField {
  id: string;
  label: string;
  type: WritingIntakeFieldType;
  required: boolean;
  relevant: boolean;
  value?: string;
  provenance?: ProvenanceKind;
  options?: string[];
  reason?: string;
}

export type GenerationReadinessStatus = 'READY' | 'READY_WITH_PENDING' | 'BLOCKED';

export interface GenerationReadiness {
  status: GenerationReadinessStatus;
  missingEssential: string[];
  pending: string[];
}

export interface WritingIntake {
  flow: 'NEW_WRITING';
  sourceDocuments: UploadedSourceDocument[];
  request: string;
  matter: string;
  documentType: string;
  documentTypeLabel: string;
  jurisdiction?: string;
  representedParty?: string;
  counterparty?: string;
  authority?: string;
  objective?: string;
  requestedRelief?: string;
  caseNumber?: string;
  facts: AnalyzedFact[];
  evidence: Array<{
    id: string;
    type?: string;
    description: string;
    confirmed: boolean;
    provenance: ProvenanceKind;
    sourceReference?: SourceReference;
  }>;
  fields: WritingIntakeField[];
  pending: string[];
  readiness: GenerationReadiness;
}

export type GenerationMode = 'personal_template' | 'reference_document' | 'automatic';

export interface CaseWorkflowSelection {
  mode: GenerationMode;
  templateId?: string;
  referenceDocumentId?: string;
}

export interface SourceReference {
  documentId: string;
  page?: number;
  paragraph?: number;
  textSnippet?: string;
}

export interface BoundingBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export type DocumentBlockType =
  | 'header'
  | 'section-header'
  | 'text'
  | 'paragraph'
  | 'table'
  | 'page-footer'
  | 'page-header'
  | 'signature'
  | 'footnote'
  | 'title'
  | 'list-item'
  | 'caption'
  | string;

export interface DocumentBlock {
  id: string;
  documentId?: string;
  pageNumber: number;
  type: DocumentBlockType;
  text: string;
  bbox?: BoundingBox;
  confidence?: number;
  order: number;
  style?: BlockStyle;
  tableData?: {
    headers?: string[];
    rows?: string[][];
  };
}

export interface StructuredDocument {
  documentId?: string;
  lifecycle?: DocumentLifecycleMetadata;
  fileName?: string;
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    text: string;
    blocks: DocumentBlock[];
  }>;
  blocks: DocumentBlock[];
  parsedBy: 'nvidia-nemotron-parse' | 'native-extractor' | 'ocr';
  parsedAt: string;
}

export interface BlockStyle {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: string;
  textDecoration?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  indent?: string;
}

export interface ContentBlock {
  id: string;
  layer: ContentLayer;
  trust?: TrustLevel;
  trustLevel?: TrustLevel;
  text: string;
  style?: BlockStyle;
  sources?: SourceReference[];
  sourceRef?: any;
  provenance?: ProvenanceKind;
  isManuallyEdited?: boolean;
  variables?: string[];
  createdAt?: string;
  generationRequirement?: 'AI_REQUIRED' | 'DETERMINISTIC' | 'PRESERVED_HUMAN' | 'OPTIONAL';
  generationStatus?: 'pending' | 'drafting' | 'generated' | 'partial' | 'truncated' | 'failed';
  semanticEvaluation?: import('./semanticEvaluator').BlockQualityEvaluation;
  /** All task evaluations represented after safe exact duplicate consolidation. */
  semanticEvaluations?: import('./semanticEvaluator').BlockQualityEvaluation[];
  issueDraftValidationStatus?: 'INVALID_FATAL' | 'INVALID_RETRYABLE' | 'VALID_NON_FINAL' | 'VALID_ACCEPTED';
  issueDraftResultHash?: string;
  /** All canonical result hashes represented after safe exact duplicate consolidation. */
  issueDraftResultHashes?: string[];
  taskId?: string;
  coverageItemIds?: string[];
  factIds?: string[];
  evidenceIds?: string[];
  legalIssueIds?: string[];
  authorityIds?: string[];
  verifiedAuthorityIds?: string[];
  researchHash?: string;
  revisionOfBlockId?: string;
  revisionNumber?: number;
  generatedBy?: 'AI' | 'DETERMINISTIC' | 'USER' | 'FALLBACK' | 'SOURCE_DIRECT';
  provider?: string;
  model?: string | null;
  generationTaskId?: string;
  /** Task kind used for deterministic post-generation consolidation. */
  generationTaskType?: string;
  /** All source task IDs represented after safe duplicate consolidation. */
  generationTaskIds?: string[];
  generationId?: string;
  /** Strategic drafting linkage; never implies client adoption or finality. */
  strategicCandidateId?: string;
  decisionReasoningId?: string;
  strategicArgumentPlanId?: string;
  fallbackStatus?: string;
  fallbackReason?: string | null;
  semanticScore?: number;
  genericityClass?: string;
}

export interface DocumentVariable {
  id: string;
  name: string;
  value: string | null;
  description: string;
  isRequired: boolean;
  style?: BlockStyle;
}

export type SectionType = 'header' | 'identity' | 'background' | 'facts' | 'legal_grounds' | 'argument' | 'evidence' | 'petition' | 'closing' | 'signature' | 'annex' | 'custom';

export interface DocumentNode {
  id: string;
  type: SectionType;
  title: string;
  order: number;
  content: ContentBlock[];
  children?: DocumentNode[];
  isRepeatable: boolean;
  isEditable: boolean;
  isGenerated: boolean;
  isManuallyEdited: boolean;
  variables: string[];
  generationInstruction?: string;
  /** Coverage que explica por qué existe la sección. */
  coverageItemIds?: string[];
  /** Subconjunto requerido de coverageItemIds. */
  requiredCoverageItemIds?: string[];
  /** Explicación auditable basada en Coverage y entidades fuente. */
  coverageReason?: string;
  validationErrors: string[];
  validationWarnings: string[];
  style?: BlockStyle;
  /** Identidad documental (FASE 10): todas las secciones de UNA generación
   *  comparten el MISMO templateId; una sola identidad por documento. */
  _templateId?: string;
  /** Procedencia estructural formal:
   *  GENERATED = construido desde DocumentTemplate (fuente solo referencia)
   *  MACHOTE   = estructura provista deliberadamente por el abogado (machote)
   *  SOURCE    = bloque heredado del expediente (prohibido en escritos de parte) */
  _provenance?: 'GENERATED' | 'MACHOTE' | 'SOURCE';
  generation?: {
    provider: string | null;
    model: string | null;
    fallbackUsed: boolean;
    generationReason: string;
    finishReason?: string | null;
    isTruncated?: boolean;
    status?: 'pending' | 'drafting' | 'generated' | 'partial' | 'truncated' | 'failed';
  };
}

export interface DocumentParties {
  actor?: string;
  demandado?: string;
  terceroInteresado?: string;
  autoridadResponsable?: string;
  autoridadDestinataria?: string;
  quejoso?: string;
  representanteLegal?: string;
}

export interface CaseReferences {
  amparo?: string;
  expediente?: string;
  toca?: string;
  juzgado?: string;
  tribunal?: string;
}

export interface UploadedSourceDocument {
  id: string;
  lifecycle?: DocumentLifecycleMetadata;
  filename?: string;
  name?: string;
  type?: string;
  fileUrl?: string;
  content?: string;
  extractedText?: string;
  classification?: any;
  uploadDate?: string;
  uploadedAt?: string;
  pages?: DocumentPage[];
  sourceValidated?: boolean;
  sourceValidationMethod?: string;
  qualityScore?: DocumentQualityScore;
  warnings?: string[];
  fileSizeBytes?: number;
}

// Declared before AnalyzedFact.sourceReference's use at runtime only; TS types
// are intentionally structural and may refer to later declarations.

import type { CaseAnalysis } from './caseAnalysis';
import type { CaseContext } from './caseContext';

export interface CaseWorkflow {
  sourceDocuments: UploadedSourceDocument[];
  analysis: CaseAnalysis;
  selection: CaseWorkflowSelection;
  structuredDoc?: UniversalLegalDocument;
  flow?: 'DOCUMENT_ANALYSIS' | 'NEW_WRITING';
  intake?: WritingIntake;
  readiness?: GenerationReadiness;
  updatedAt: string;
}

export interface DocumentPage {
  page: number;
  text: string;
  chars: number;
  heading?: string;
  dataUrl?: string;
}

export interface DocumentQualityScore {
  confidence: number;
  qualityLabel: string;
  status: 'READY' | 'NEEDS_OCR' | 'LOW_QUALITY' | 'FAILED';
  ocrUsed?: boolean;
  emptyPages?: number;
}

export interface GeneratedSourceReference extends SourceReference {
  sourceType?: 'SOURCE_FACT' | 'COURT_REASONING' | 'USER_POSITION';
  score?: number;
}

export interface PipelineTraceStep {
  step: number;
  stage: string;
  query: string;
  references: GeneratedSourceReference[];
  note: string;
}

export interface ValidationIssue {
  checkId: string;
  message: string;
  sectionId?: string;
}

export interface ValidationCheck {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  evaluate: (doc: UniversalLegalDocument) => boolean;
}

export interface ValidationResult {
  isValid: boolean;
  canExport?: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  checks?: Array<{ id: string; label: string; status: 'pass' | 'fail' | 'warning' | 'pending'; message?: string }>;
}

export type PipelineStage = 'classify' | 'extract' | 'analyze' | 'structure' | 'identify_issues' | 'generate_sections' | 'review_coherence' | 'validate';

export interface PipelineStageResult {
  stage: PipelineStage;
  status: 'pending' | 'running' | 'complete' | 'error';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  data?: any;
}

export interface PipelineState {
  currentStage: PipelineStage | null;
  stages: Record<PipelineStage, PipelineStageResult>;
  isComplete: boolean;
  hasErrors: boolean;
  overallStatus?: 'idle' | 'running' | 'complete' | 'error';
}

export interface GenerationMetadata {
  pipelineState: PipelineState;
  modelVersion?: string;
  promptVersion?: string;
  tokensUsed?: number;
  generationTimeMs?: number;
  trace?: PipelineTraceStep[];
  aiUsed?: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiError?: string | null;
  generationMode?: GenerationMode;
  generationExtension?: import('./generationExtension').GenerationExtensionContract;
  selectedTemplateId?: string | null;
  referenceDocumentId?: string | null;
  referenceDocumentLifecycle?: DocumentLifecycleMetadata;
  provenance?: ProvenanceKind[];
  /** Identidad ÚNICA de esta generación (FASE 10): un documento → un plan →
   *  un template → un generationId. Todos los bloques generados le pertenecen. */
  generationId?: string;
  /** Trace transitorio de desarrollo/auditoría; se elimina antes de persistir. */
  auditTrace?: GenerationTrace;
  proceduralIdentity?: ProceduralIdentity;
  routing?: DocumentRoutingMetadata;
  /** Compatibilidad auditable entre la fuente cargada y la salida seleccionada. */
  sourceOutputCompatibility?: import('./sourceOutputCompatibility').SourceOutputCompatibilityResult;
  /** Preflight estructural que debe existir antes de cualquier exportación protegida. */
  preflight?: import('./documentPreflight').DocumentPreflightResult;
  sections?: Record<string, {
    provider: string | null;
    model: string | null;
    fallbackUsed: boolean;
    generationReason: string;
  }>;
}

export interface RequiredInput {
  id: string;
  label: string;
  description: string;
  type: 'text' | 'date' | 'boolean' | 'select' | 'document';
  options?: string[];
  required: boolean;
}

export interface ClassificationResult {
  documentType: string;
  documentTypeLabel: string;
  matter: string;
  jurisdiction: string;
  proceduralStage: string;
  authority?: string;
  objective: string;
  requiredInputs: RequiredInput[];
  confidence: number;
  isDynamic: boolean;
  sourceDocumentType?: string;
  representedParty?: string;
  proceduralPosition?: string;
  targetDocument?: string;
  proceduralObjective?: string;
}

export interface UniversalLegalDocument {
  id: string;
  lifecycle?: DocumentLifecycleMetadata;
  templateId?: string;
  title: string;
  documentType: string;
  documentTypeLabel: string;
  matter: string;
  jurisdiction: string;
  category: string;
  legalBasis: string[];
  parties: DocumentParties;
  caseRefs: CaseReferences;
  variables: Record<string, DocumentVariable>;
  sections: DocumentNode[];
  sourceDocuments: UploadedSourceDocument[];
  classification: ClassificationResult;
  validation: ValidationResult;
  generationMetadata: GenerationMetadata;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'generated' | 'reviewed' | 'final';
  // Style and document formatting preservation
  originalFormat?: 'pdf' | 'docx' | 'doc' | 'txt' | 'rtf' | 'custom';
  originalFileUrl?: string;
  defaultFontFamily?: string;
  defaultFontSize?: string;
  defaultLineHeight?: string;
  originalPageCount?: number;
  caseAnalysis?: CaseAnalysis;
  caseContext?: CaseContext;
  /** Campos ausentes en la fuente o aún no confirmados por el abogado. */
  missingFields?: string[];
  /** Campos que la fuente pública sustituyó deliberadamente. */
  anonymizedFields?: string[];
  proceduralIdentity?: ProceduralIdentity;
  flow?: 'DOCUMENT_ANALYSIS' | 'NEW_WRITING';
  intake?: WritingIntake;
  coverageMatrix?: import('./coverageMatrix').CoverageMatrix;
  legalIssueMatrix?: import('./legalIssueMatrix').LegalIssueMatrix;
  semanticEvaluation?: import('./semanticEvaluator').DocumentSemanticEvaluation;
}

export type {
  ClientPositionStatus,
  LegalIssueItem,
  LegalIssueMatrix,
  LegalIssueSource,
  LegalIssueStatus,
  LegalIssueType,
  LegalResearchStatus,
} from './legalIssueMatrix';

export function createEmptyDocument(initial: Partial<UniversalLegalDocument> = {}): UniversalLegalDocument {
  const document: UniversalLegalDocument = {
    id: crypto.randomUUID(),
    title: initial.title || 'Nuevo Documento',
    documentType: initial.documentType || 'escrito_libre',
    documentTypeLabel: initial.documentTypeLabel || 'Escrito Libre',
    matter: initial.matter || 'general',
    jurisdiction: initial.jurisdiction || 'federal',
    category: initial.category || 'escrito',
    legalBasis: initial.legalBasis || [],
    parties: initial.parties || {},
    caseRefs: initial.caseRefs || {},
    variables: initial.variables || {},
    sections: initial.sections || [],
    sourceDocuments: initial.sourceDocuments || [],
    classification: initial.classification || {
      documentType: initial.documentType || 'escrito_libre',
      documentTypeLabel: initial.documentTypeLabel || 'Escrito Libre',
      matter: initial.matter || 'general',
      jurisdiction: initial.jurisdiction || 'federal',
      proceduralStage: 'inicial',
      objective: 'Redacción jurídica formal',
      requiredInputs: [],
      confidence: 100,
      isDynamic: false,
    },
    validation: initial.validation || {
      isValid: true,
      errors: [],
      warnings: [],
    },
    generationMetadata: initial.generationMetadata || {
      pipelineState: {
        currentStage: null,
        stages: {
          classify: { stage: 'classify', status: 'pending' },
          extract: { stage: 'extract', status: 'pending' },
          analyze: { stage: 'analyze', status: 'pending' },
          structure: { stage: 'structure', status: 'pending' },
          identify_issues: { stage: 'identify_issues', status: 'pending' },
          generate_sections: { stage: 'generate_sections', status: 'pending' },
          review_coherence: { stage: 'review_coherence', status: 'pending' },
          validate: { stage: 'validate', status: 'pending' },
        },
        isComplete: false,
        hasErrors: false,
      },
      tokensUsed: 0,
      generationTimeMs: 0,
      trace: [],
    },
    createdAt: initial.createdAt || new Date().toISOString(),
    updatedAt: initial.updatedAt || new Date().toISOString(),
    status: initial.status || 'draft',
    originalFormat: initial.originalFormat || 'custom',
    defaultFontFamily: initial.defaultFontFamily || 'Times New Roman, Times, serif',
    defaultFontSize: initial.defaultFontSize || '12pt',
    defaultLineHeight: initial.defaultLineHeight || '1.6',
    originalPageCount: initial.originalPageCount,
  };

  return markDocumentAsDraft({ ...document }) as UniversalLegalDocument;
}

export function createDocumentNode(initial: Partial<DocumentNode> & { id: string; title: string }): DocumentNode {
  return {
    id: initial.id,
    type: initial.type || 'argument',
    title: initial.title,
    order: initial.order ?? 1,
    content: initial.content || [],
    children: initial.children,
    isRepeatable: initial.isRepeatable ?? false,
    isEditable: initial.isEditable ?? true,
    isGenerated: initial.isGenerated ?? false,
    isManuallyEdited: initial.isManuallyEdited ?? false,
    variables: initial.variables || [],
    generationInstruction: initial.generationInstruction,
    coverageItemIds: initial.coverageItemIds,
    requiredCoverageItemIds: initial.requiredCoverageItemIds,
    coverageReason: initial.coverageReason,
    validationErrors: initial.validationErrors || [],
    validationWarnings: initial.validationWarnings || [],
    style: initial.style,
    // Identidad documental y procedencia estructural (FASES 4/10)
    _templateId: initial._templateId,
    _provenance: initial._provenance,
  };
}

export interface CaseDocument {
  id: string;
  lifecycle?: DocumentLifecycleMetadata;
  name: string;
  type: string;
  documentType?: string;
  fileUrl?: string;
  pageCount: number;
  pages: Array<{ page: number; text: string; chars: number; ocrStatus: string; blocks?: DocumentBlock[] }>;
  structuredDocument?: StructuredDocument | null;
  role: string;
  status: 'READY' | 'NEEDS_MANUAL_REVIEW';
  uploadedAt: string;
}

export interface TemplateVersion {
  version: number;
  createdAt: string;
  title: string;
}

export type {
  CoverageCategory,
  CoverageItemStatus,
  DocumentCoverageItem,
  CoverageMatrix,
} from './coverageMatrix';
