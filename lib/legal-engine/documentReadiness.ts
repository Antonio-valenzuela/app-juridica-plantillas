import type { UniversalLegalDocument } from './types';
import type { CoverageMatrix } from './coverageMatrix';
import type { LegalIssueMatrix } from './legalIssueMatrix';
import type { RichCaseAnalysis } from './case-extraction/types';
import type { QualityGateResult } from './qualityGate';
import type {
  CoverageReconciliation,
  DocumentAssemblyCheck,
  DocumentAssemblyCheckSet,
  DocumentAssemblyFinding,
  DocumentAssemblyResult,
  DocumentAssemblyTraceMetadata,
  DocumentAssemblyReadiness,
  SectionContract,
} from './documentAssemblyTypes';

export interface DocumentPetitionCompatibilityInput {
  assembly: DocumentAssemblyResult;
  coverageMatrix?: CoverageMatrix;
  legalIssueMatrix?: LegalIssueMatrix;
  richCaseAnalysis?: RichCaseAnalysis;
}

export interface DocumentReadinessInput extends DocumentPetitionCompatibilityInput {
  document: UniversalLegalDocument;
  sectionContracts: readonly SectionContract[];
  coverage: CoverageReconciliation;
  baseQualityGate: QualityGateResult;
  trace?: DocumentAssemblyTraceMetadata;
  findings?: readonly DocumentAssemblyFinding[];
  checks?: DocumentAssemblyCheckSet;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))].sort();
}

function finding(
  code: string,
  severity: DocumentAssemblyFinding['severity'],
  message: string,
  options: Partial<Pick<DocumentAssemblyFinding, 'blockIds' | 'legalIssueIds' | 'coverageItemIds' | 'sectionIds'>> = {},
): DocumentAssemblyFinding {
  return {
    code,
    severity,
    message,
    reason: message,
    blockIds: options.blockIds || [],
    legalIssueIds: options.legalIssueIds || [],
    coverageItemIds: options.coverageItemIds || [],
    sectionIds: options.sectionIds || [],
  };
}

function blockSectionId(assembly: DocumentAssemblyResult, blockId: string): string | undefined {
  return assembly.sections.find((section) => section.blockIds.includes(blockId))?.sectionId;
}

export function validatePetitionCompatibility(input: DocumentPetitionCompatibilityInput): readonly DocumentAssemblyFinding[] {
  const matrixItems = input.coverageMatrix?.items || [];
  const supportedClaimIds = new Set<string>();
  for (const item of matrixItems) {
    const petitionItem = item.category === 'PETITION_SUPPORT'
      || item.targetSectionIds.some((sectionId) => input.assembly.sections.find((section) => section.sectionId === sectionId)?.type === 'petition');
    if (!petitionItem) {
      for (const claimId of [...(item.claimIds || []), ...(item.relatedClaimIds || [])]) supportedClaimIds.add(claimId);
    }
  }
  for (const issue of input.legalIssueMatrix?.issues || []) {
    for (const claimId of issue.claimIds) supportedClaimIds.add(claimId);
  }

  const findings: DocumentAssemblyFinding[] = [];
  for (const item of matrixItems) {
    const isPetitionItem = item.category === 'PETITION_SUPPORT'
      || item.targetSectionIds.some((sectionId) => input.assembly.sections.find((section) => section.sectionId === sectionId)?.type === 'petition');
    if (!isPetitionItem) continue;
    const requestedClaimIds = unique([...(item.claimIds || []), ...(item.relatedClaimIds || [])]);
    const unsupportedClaimIds = requestedClaimIds.filter((claimId) => !supportedClaimIds.has(claimId));
    const blockIds = input.assembly.orderedBlocks
      .filter((block) => block.coverageItemIds?.includes(item.id))
      .map((block) => block.id);
    if (unsupportedClaimIds.length > 0) {
      const sectionIds = unique(blockIds.map((blockId) => blockSectionId(input.assembly, blockId)).filter((id): id is string => Boolean(id)));
      findings.push(finding(
        'UNSUPPORTED_PETITION_RELIEF',
        'BLOCKER',
        `El petitorio ${item.id} solicita un relief sin soporte en la defensa, issue o Coverage: ${unsupportedClaimIds.join(', ')}.`,
        { blockIds, coverageItemIds: [item.id], sectionIds },
      ));
    }
  }
  return findings;
}

function structuralFindings(input: DocumentReadinessInput): DocumentAssemblyFinding[] {
  const findings: DocumentAssemblyFinding[] = [];
  const seen = new Set<string>();
  for (const section of input.assembly.sections) {
    if (seen.has(section.sectionId)) {
      findings.push(finding('DUPLICATE_SECTION_ID', 'BLOCKER', `La sección ${section.sectionId} aparece más de una vez.`, { sectionIds: [section.sectionId] }));
    }
    seen.add(section.sectionId);
  }
  for (const contract of input.sectionContracts.filter((candidate) => candidate.required)) {
    if (!seen.has(contract.sectionId)) {
      findings.push(finding('MISSING_REQUIRED_SECTION', 'BLOCKER', `Falta la sección requerida ${contract.sectionId}.`, { sectionIds: [contract.sectionId] }));
    }
  }
  for (const contract of input.sectionContracts.filter((candidate) => candidate.required && candidate.requiresAcceptedSubstantiveBlock)) {
    const asmSection = input.assembly.sections.find((section) => section.sectionId === contract.sectionId);
    const hasAcceptedBlock = Boolean(asmSection && asmSection.blockIds && asmSection.blockIds.length > 0);
    if (!hasAcceptedBlock) {
      findings.push(finding(
        'EMPTY_REQUIRED_SUBSTANTIVE_SECTION',
        'BLOCKER',
        `La sección sustantiva obligatoria "${contract.title || contract.sectionId}" no contiene ningún bloque sustantivo aceptado.`,
        { sectionIds: [contract.sectionId] },
      ));
    }
  }
  const orderedIds = input.assembly.sections.map((section) => section.sectionId);
  const expectedIds = [...input.sectionContracts].sort((left, right) => left.sectionPath.join('.').localeCompare(right.sectionPath.join('.'))).map((section) => section.sectionId);
  if (expectedIds.length > 0 && orderedIds.some((id, index) => expectedIds[index] !== id)) {
    findings.push(finding('NON_CANONICAL_SECTION_ORDER', 'BLOCKER', 'Las secciones finales no conservan el orden contractual.', { sectionIds: orderedIds }));
  }
  return findings;
}

function traceIsValid(assembly: DocumentAssemblyResult, trace: DocumentAssemblyTraceMetadata | undefined): boolean {
  if (!trace || !trace.outputFingerprint) return false;
  const blockIds = assembly.orderedBlocks.map((block) => block.id);
  if (trace.orderedBlockIds.join('|') !== blockIds.join('|')) return false;
  const finalIds = new Set(blockIds);
  return trace.blockLinks.every((link) => finalIds.has(link.blockId))
    && trace.blockLinks.length === blockIds.length;
}

export function evaluateDocumentAssemblyChecks(input: DocumentReadinessInput): DocumentAssemblyCheckSet {
  const structural = structuralFindings(input);
  const petition = validatePetitionCompatibility(input);
  const coverage = [...(input.coverage.findings || [])];
  const traceFindings = traceIsValid(input.assembly, input.trace || input.assembly.trace)
    ? []
    : [finding('TRACE_INTEGRITY_FAILED', 'BLOCKER', 'La traza no reconstruye íntegramente el documento final.')];
  const baseFindings = input.baseQualityGate.passed
    ? []
    : [finding('BASE_DOCUMENT_GATE_FAILED', 'BLOCKER', 'El gate estructural base no aprobó el documento.')];
  const allFindings = [...structural, ...coverage, ...petition, ...traceFindings, ...baseFindings, ...(input.findings || [])];
  const byCodes = (values: readonly DocumentAssemblyFinding[]) => unique(values.map((entry) => entry.code));
  const checks: DocumentAssemblyCheck[] = [
    { checkId: 'STRUCTURAL_COMPLETENESS', status: structural.length ? 'FAIL' : 'PASS', findingCodes: byCodes(structural) },
    { checkId: 'COVERAGE_COMPLETENESS', status: coverage.length || !input.coverage.allRequiredSatisfied ? 'FAIL' : 'PASS', findingCodes: byCodes(coverage) },
    { checkId: 'PETITION_COMPATIBILITY', status: petition.length ? 'FAIL' : 'PASS', findingCodes: byCodes(petition) },
    { checkId: 'TRACE_INTEGRITY', status: traceFindings.length ? 'FAIL' : 'PASS', findingCodes: byCodes(traceFindings) },
    { checkId: 'BASE_DOCUMENT_GATE', status: baseFindings.length ? 'FAIL' : 'PASS', findingCodes: byCodes(baseFindings) },
    { checkId: 'FASE6_FINDINGS', status: (input.findings || []).some((entry) => entry.severity === 'BLOCKER') ? 'FAIL' : (input.findings || []).some((entry) => entry.severity === 'REVIEW' || entry.severity === 'WARNING') ? 'REVIEW' : 'PASS', findingCodes: byCodes(input.findings || []) },
  ];
  return {
    checks,
    findings: allFindings,
    hasMaterialBlocker: allFindings.some((entry) => entry.severity === 'BLOCKER'),
    hasInvalidity: allFindings.some((entry) => entry.code.includes('INVALID') || entry.code.includes('SCHEMA')),
  };
}

export function decideDocumentAssemblyReadiness(input: DocumentReadinessInput): DocumentAssemblyReadiness {
  const checks = input.checks || evaluateDocumentAssemblyChecks(input);
  if (input.legalIssueMatrix?.sourceMode !== 'RICH' || !input.richCaseAnalysis) return 'REQUIRES_REVIEW';
  if (checks.hasInvalidity) return 'INVALID';
  if (checks.hasMaterialBlocker) return 'BLOCKED';
  if (!input.coverage.allRequiredSatisfied || !input.baseQualityGate.passed || !traceIsValid(input.assembly, input.trace || input.assembly.trace)) return 'INCOMPLETE';
  if (checks.findings.some((entry) => entry.severity === 'REVIEW' || entry.severity === 'WARNING')) return 'REQUIRES_REVIEW';
  if (checks.checks.some((check) => check.status === 'REVIEW' || check.status === 'FAIL')) return 'REQUIRES_REVIEW';
  return 'READY';
}
