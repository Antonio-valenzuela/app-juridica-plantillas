import type {
  BlockStyle,
  DocumentNode,
  UniversalLegalDocument,
} from './types';
import type {
  DocumentAssemblyQualityGateResult,
  DocumentAssemblyResult,
} from './documentAssemblyTypes';
import type { ExportValidationResult } from './exportGuards';

export type VerificationMode = 'RICH_ASSEMBLY' | 'COMPATIBILITY';

export interface RichVerifiedInput {
  verificationMode: 'RICH_ASSEMBLY';
  document: UniversalLegalDocument;
  assembly: DocumentAssemblyResult;
  assemblyGate: DocumentAssemblyQualityGateResult;
  exportValidation: ExportValidationResult;
}

export interface VerifiedCompatibilityInput {
  verificationMode: 'COMPATIBILITY';
  document: UniversalLegalDocument;
  compatibility: {
    status: 'COMPATIBLE';
    compatibilityStatus:
      | 'EXPLICIT_COMPATIBILITY'
      | 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
      | 'NO_SOURCE_REQUIRED';
    selectedDocumentType: string;
  };
  exportValidation: ExportValidationResult;
  lifecycleValid: true;
  requiredStructuralChecksPass: true;
  richEvidence?: never;
}

/** Task 7 may widen this union with an explicitly gated compatibility producer. */
export type VerifiedMaterializationInput = RichVerifiedInput | VerifiedCompatibilityInput;

export interface RenderProvenance {
  documentId: string;
  verificationMode: VerificationMode;
  sectionId?: string;
  parentSectionId?: string;
  blockId?: string;
  generationTaskId?: string;
  coverageItemIds: readonly string[];
  legalIssueIds: readonly string[];
  sourceDocumentIds: readonly string[];
  sourceRefs: readonly string[];
  manualEdit: boolean;
}

export interface RenderRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface RenderParagraph {
  id: string;
  text: string;
  runs: readonly RenderRun[];
  role: 'TITLE' | 'BODY' | 'LIST' | 'SIGNATURE' | 'HEADER' | 'FOOTER' | 'SPACER';
  style: BlockStyle;
  orderPath: readonly number[];
  keepNext: boolean;
  keepTogether: boolean;
  pageBreakBefore: boolean;
  provenance: RenderProvenance;
}

export interface RenderSection {
  id: string;
  parentId?: string;
  title: string;
  type: DocumentNode['type'];
  depth: number;
  orderPath: readonly number[];
  paragraphs: readonly RenderParagraph[];
}

export interface ExportRenderModel {
  schemaVersion: 'fase7-v1';
  documentId: string;
  documentType?: string;
  title: string;
  header: readonly RenderParagraph[];
  sections: readonly RenderSection[];
  footer: readonly RenderParagraph[];
  documentFingerprint: string;
  materializationFingerprint: string;
}
