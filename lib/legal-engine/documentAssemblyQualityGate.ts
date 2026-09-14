import type { QualityGateResult } from './qualityGate';
import type {
  CoverageReconciliation,
  DocumentAssemblyCheck,
  DocumentAssemblyCheckSet,
  DocumentAssemblyFinding,
  DocumentAssemblyQualityGateResult,
  DocumentAssemblyResult,
  DocumentAssemblyTraceMetadata,
  DocumentAssemblyReadiness,
} from './documentAssemblyTypes';

export interface DocumentAssemblyQualityGateInput {
  assembly: DocumentAssemblyResult;
  baseQualityGate: QualityGateResult;
  checks: DocumentAssemblyCheckSet;
  coverage: CoverageReconciliation;
  trace: DocumentAssemblyTraceMetadata;
  readiness: DocumentAssemblyReadiness;
  provider?: unknown;
  researchBundle?: unknown;
}

function finding(code: string, message: string): DocumentAssemblyFinding {
  return {
    code,
    severity: 'BLOCKER',
    message,
    reason: message,
    blockIds: [],
    legalIssueIds: [],
    coverageItemIds: [],
    sectionIds: [],
  };
}

function deterministicCheck(input: DocumentAssemblyQualityGateInput): {
  check: DocumentAssemblyCheck;
  finding?: DocumentAssemblyFinding;
} {
  const orderedBlockIds = input.assembly.orderedBlocks.map((block) => block.id);
  const valid = input.trace.outputFingerprint.length > 0
    && input.trace.orderedBlockIds.join('|') === orderedBlockIds.join('|')
    && input.trace.blockLinks.length === orderedBlockIds.length;
  return valid
    ? { check: { checkId: 'DETERMINISTIC_ASSEMBLY', status: 'PASS', findingCodes: [] } }
    : {
      check: { checkId: 'DETERMINISTIC_ASSEMBLY', status: 'FAIL', findingCodes: ['TRACE_INTEGRITY_FAILED'] },
      finding: finding('TRACE_INTEGRITY_FAILED', 'La colocación o fingerprint de assembly no es íntegra.'),
    };
}

export function runDocumentAssemblyQualityGate(input: DocumentAssemblyQualityGateInput): DocumentAssemblyQualityGateResult {
  const deterministic = deterministicCheck(input);
  const findings = [
    ...input.checks.findings,
    ...(deterministic.finding ? [deterministic.finding] : []),
  ];
  const checks: readonly DocumentAssemblyCheck[] = [
    ...input.checks.checks.filter((check) => check.checkId !== 'DETERMINISTIC_ASSEMBLY'),
    deterministic.check,
  ];
  const hasMaterialBlocker = input.checks.hasMaterialBlocker
    || findings.some((entry) => entry.severity === 'BLOCKER');
  const hasInvalidity = input.checks.hasInvalidity || input.readiness === 'INVALID';
  const checksPass = checks.every((check) => check.status === 'PASS' || check.status === 'NOT_APPLICABLE');
  const passed = input.baseQualityGate.passed
    && input.baseQualityGate.canMarkAsFinal
    && !hasMaterialBlocker
    && !hasInvalidity
    && checksPass
    && input.coverage.allRequiredSatisfied
    && input.readiness === 'READY';

  return {
    passed,
    canMarkAsReady: passed && input.readiness === 'READY',
    readiness: input.readiness,
    baseQualityGate: input.baseQualityGate,
    findings,
    checks,
  };
}
