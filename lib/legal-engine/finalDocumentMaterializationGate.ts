import { readDocumentExportReadiness } from './documentLifecycle';
import type {
  DocumentAssemblyQualityGateResult,
  DocumentAssemblyResult,
} from './documentAssemblyTypes';
import type { ExportValidationResult } from './exportGuards';
import type { UniversalLegalDocument } from './types';
import { getSourceOutputCompatibilityPolicy } from './sourceOutputCompatibility';
import type {
  RichVerifiedInput,
  VerifiedCompatibilityInput,
} from './finalDocumentMaterializationTypes';

export type { RichVerifiedInput, VerifiedCompatibilityInput } from './finalDocumentMaterializationTypes';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
  documentAssemblyQualityGate?: DocumentAssemblyQualityGateResult;
};

type CompatibilityMetadata = NonNullable<UniversalLegalDocument['generationMetadata']['sourceOutputCompatibility']>;

export class FinalDocumentMaterializationGateError extends Error {
  readonly code = 'FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED';

  constructor(readonly reasons: readonly string[]) {
    super(`El documento no cumple la evidencia requerida para materialización final: ${reasons.join('; ')}`);
    this.name = 'FinalDocumentMaterializationGateError';
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function traceIsIntact(assembly: DocumentAssemblyResult): boolean {
  const trace = assembly.trace;
  if (!trace || typeof trace !== 'object') return false;
  if (!isNonEmptyString(trace.assemblyId)
    || !isNonEmptyString(trace.inputFingerprint)
    || !isNonEmptyString(trace.outputFingerprint)) {
    return false;
  }
  if (!Array.isArray(assembly.orderedBlocks)
    || !Array.isArray(trace.orderedBlockIds)
    || !Array.isArray(trace.blockLinks)) {
    return false;
  }

  const orderedBlockIds = assembly.orderedBlocks.map((block) => block?.id);
  if (!orderedBlockIds.every(isNonEmptyString) || !sameIds(trace.orderedBlockIds, orderedBlockIds)) {
    return false;
  }

  const linkedBlockIds = trace.blockLinks.map((link) => link?.blockId);
  if (!linkedBlockIds.every(isNonEmptyString)) return false;
  const orderedBlockSet = new Set(orderedBlockIds);
  const linkedBlockSet = new Set(linkedBlockIds);
  return linkedBlockIds.length === orderedBlockIds.length
    && linkedBlockSet.size === orderedBlockSet.size
    && [...orderedBlockSet].every((blockId) => linkedBlockSet.has(blockId));
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function structuralChecksPass(document: UniversalLegalDocument): boolean {
  if (!Array.isArray(document.sections) || document.sections.length === 0) return false;
  const blocks = document.sections.flatMap((section) => Array.isArray(section.content) ? section.content : []);
  return blocks.length > 0
    && blocks.every((block) => typeof block?.id === 'string'
      && block.id.trim().length > 0
      && typeof block.text === 'string')
    && blocks.some((block) => block.text.trim().length > 0);
}

function compatibilityMetadataMatches(
  metadata: CompatibilityMetadata | undefined,
  policy: ReturnType<typeof getSourceOutputCompatibilityPolicy>,
): boolean {
  if (!metadata) return policy.status === 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
    || policy.status === 'NO_SOURCE_REQUIRED';
  return metadata.status === 'COMPATIBLE'
    && metadata.compatibilityStatus === policy.status
    && metadata.selectedDocumentType.trim().toLowerCase() === policy.selectedDocumentType.trim().toLowerCase();
}

function compatibilityEvidenceReasons(document: AssemblyAttachedDocument): string[] {
  const reasons: string[] = [];
  if (hasOwn(document, 'documentAssemblyResult') || hasOwn(document, 'documentAssemblyQualityGate')) {
    reasons.push('assembly evidence must use the RICH_ASSEMBLY gate');
  }
  if (document.legalIssueMatrix?.sourceMode === 'LEGACY_FALLBACK') {
    reasons.push('LEGACY_FALLBACK cannot enter compatibility materialization');
  }
  if (document.legalIssueMatrix?.sourceMode === 'RICH' || document.coverageMatrix || document.caseAnalysis?.richCaseAnalysis) {
    reasons.push('rich FASE 6 evidence cannot be downgraded to compatibility');
  }
  return reasons;
}

function invalidEvidenceFindings(
  assembly: DocumentAssemblyResult,
  assemblyGate: DocumentAssemblyQualityGateResult,
): string[] {
  const reasons: string[] = [];
  const findings = [
    ...(Array.isArray(assembly.findings) ? assembly.findings : []),
    ...(Array.isArray(assemblyGate.findings) ? assemblyGate.findings : []),
  ];
  for (const finding of findings) {
    if (finding?.severity === 'BLOCKER' || finding?.severity === 'REVIEW'
      || /INVALID|SCHEMA|TRACE_INTEGRITY_FAILED/.test(String(finding?.code || ''))) {
      reasons.push(`invalid finding: ${String(finding?.code || 'UNKNOWN')}`);
    }
  }

  const checks = Array.isArray(assemblyGate.checks) ? assemblyGate.checks : [];
  if (checks.some((check) => check?.status === 'FAIL' || check?.status === 'REVIEW')) {
    reasons.push('assembly QualityGate checks are not all passing');
  }
  return reasons;
}

export function verifyFinalDocumentExportability(input: {
  document: UniversalLegalDocument;
  exportValidation: ExportValidationResult;
}): RichVerifiedInput {
  const reasons: string[] = [];
  const document = input?.document as AssemblyAttachedDocument | undefined;
  const assembly = document?.documentAssemblyResult;
  const assemblyGate = document?.documentAssemblyQualityGate;
  const exportValidation = input?.exportValidation;

  if (!document || !assembly || !assemblyGate) {
    reasons.push('missing FASE 6 assembly evidence');
  }
  if (assembly) {
    if (assembly.documentId !== document.id || assembly.document?.id !== document.id) {
      reasons.push('assembly document identity does not match the export document');
    }
    if (assembly.documentType !== document.documentType) {
      reasons.push('assembly document type does not match the export document');
    }
    if (assembly.readiness !== 'READY') reasons.push(`assembly readiness is ${assembly.readiness}`);
    if (assembly.validationStatus !== 'VALID') reasons.push(`assembly validation status is ${assembly.validationStatus}`);
    if (assembly.assemblyStatus !== 'ASSEMBLED') reasons.push(`assembly status is ${assembly.assemblyStatus}`);
    if (!traceIsIntact(assembly)) reasons.push('assembly trace or block links are not intact');
  }
  if (assemblyGate) {
    if (assemblyGate.passed !== true) reasons.push('assembly QualityGate did not pass');
    if (assemblyGate.canMarkAsReady !== true) reasons.push('assembly QualityGate cannot mark the document ready');
    if (assemblyGate.readiness !== 'READY') reasons.push(`assembly QualityGate readiness is ${assemblyGate.readiness}`);
    if (assembly) reasons.push(...invalidEvidenceFindings(assembly, assemblyGate));
  }
  if (!exportValidation || exportValidation.ok !== true) reasons.push('export guard did not pass');

  const lifecycleReadiness = readDocumentExportReadiness(document);
  if (lifecycleReadiness !== 'READY_TO_EXPORT' && lifecycleReadiness !== 'FINAL_DOCUMENT') {
    reasons.push(`document lifecycle is not exportable: ${lifecycleReadiness || 'UNKNOWN'}`);
  }

  if (reasons.length > 0) throw new FinalDocumentMaterializationGateError([...new Set(reasons)]);

  if (!document || !assembly || !assemblyGate || !exportValidation) {
    throw new FinalDocumentMaterializationGateError(['missing FASE 6 assembly evidence']);
  }

  return {
    verificationMode: 'RICH_ASSEMBLY',
    document,
    assembly,
    assemblyGate,
    exportValidation,
  };
}

/**
 * Verifies the explicit, non-rich compatibility envelope used by legacy-safe
 * universal exports. This path never creates or claims FASE 6 evidence.
 */
export function verifyCompatibilityMaterialization(input: {
  document: UniversalLegalDocument;
  exportValidation: ExportValidationResult;
}): VerifiedCompatibilityInput {
  const reasons: string[] = [];
  const document = input?.document as AssemblyAttachedDocument | undefined;
  const exportValidation = input?.exportValidation;

  if (!document || typeof document !== 'object' || !Array.isArray(document.sections)) {
    reasons.push('compatibility input is not a UniversalLegalDocument');
  }

  let policy: ReturnType<typeof getSourceOutputCompatibilityPolicy> | undefined;
  let compatibilityStatus: VerifiedCompatibilityInput['compatibility']['compatibilityStatus'] | undefined;
  if (!document?.documentType || typeof document.documentType !== 'string') {
    reasons.push('compatibility input requires an explicit document type');
  } else {
    try {
      policy = getSourceOutputCompatibilityPolicy(document.documentType);
      if (policy.status !== 'EXPLICIT_COMPATIBILITY'
        && policy.status !== 'ACCEPTS_ANY_SOURCE_INTENTIONALLY'
        && policy.status !== 'NO_SOURCE_REQUIRED') {
        reasons.push(`document type ${document.documentType} is not approved for compatibility`);
      } else {
        compatibilityStatus = policy.status;
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : 'document type has no compatibility policy');
    }
  }

  if (document) reasons.push(...compatibilityEvidenceReasons(document));
  if (!exportValidation || exportValidation.ok !== true) reasons.push('export guard did not pass');
  if (document && !structuralChecksPass(document)) reasons.push('required compatibility structural checks did not pass');

  const lifecycleReadiness = document ? readDocumentExportReadiness(document) : undefined;
  if (lifecycleReadiness !== 'READY_TO_EXPORT' && lifecycleReadiness !== 'FINAL_DOCUMENT') {
    reasons.push(`document lifecycle is not exportable: ${lifecycleReadiness || 'UNKNOWN'}`);
  }

  const metadata = document?.generationMetadata?.sourceOutputCompatibility;
  if (policy && !compatibilityMetadataMatches(metadata, policy)) {
    reasons.push('source/output compatibility metadata is absent, non-compatible, or does not match the approved policy');
  }
  const text = document?.sections
    ?.flatMap((section) => Array.isArray(section.content) ? section.content : [])
    .map((block) => block.text)
    .join('\n') || '';
  if (/\[(?:DATO\s+PENDIENTE|PENDIENTE|TODO|TBD)\]/i.test(text)) {
    reasons.push('compatibility input contains unresolved placeholders');
  }

  if (reasons.length > 0 || !document || !policy || !compatibilityStatus) {
    throw new FinalDocumentMaterializationGateError([...new Set(reasons.length > 0 ? reasons : ['compatibility policy unavailable'])]);
  }

  return {
    verificationMode: 'COMPATIBILITY',
    document,
    compatibility: {
      status: 'COMPATIBLE',
      compatibilityStatus,
      selectedDocumentType: policy.selectedDocumentType,
    },
    exportValidation,
    lifecycleValid: true,
    requiredStructuralChecksPass: true,
  };
}
