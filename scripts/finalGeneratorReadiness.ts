export interface FinalGeneratorReadinessInput {
  exportAllowed: boolean;
  docxPresent: boolean;
  pdfPresent: boolean;
  actualPdfPages: number | null;
  minimumPages: number;
  substantiveWords: number;
  minimumSubstantiveWords: number;
  professionalQualityGate: 'PASS' | 'REVIEW_REQUIRED' | 'FAIL';
  criticalCheckIds: string[];
  factualUnsupportedClaims: number | null;
  unverifiedFactualClaims: number | null;
  unsupportedLegalAuthorities: number | null;
  factsTotal: number;
  factsWithResponse: number;
  claimsTotal: number;
  claimsWithResponse: number;
  providerBackedTasks: number;
}

export interface FinalGeneratorReadinessResult {
  ready: boolean;
  blockers: string[];
}

export function countIssueGenerationAttemptRecords(trace: unknown): number | null {
  if (!trace || typeof trace !== 'object') return null;
  const attempts = (trace as { issueGenerationAttempts?: unknown }).issueGenerationAttempts;
  return Array.isArray(attempts) ? attempts.length : null;
}

export function assessFinalGeneratorReadiness(_input: FinalGeneratorReadinessInput): FinalGeneratorReadinessResult {
  const input = _input;
  const blockers: string[] = [];
  const blockingChecks = new Set([
    'FACTUAL_CLAIM_AUDIT_MISSING',
    'UNSUPPORTED_FACTUAL_CLAIM',
    'FACTUAL_CLAIM_UNVERIFIED',
    'MISAPPLIED_AUTHORITY',
    'AUTHORITY_VERIFICATION_FAILED',
    'CONTRADICTORY_POSITION',
    'UNSUPPORTED_EVIDENCE',
    'facts_without_response',
    'claims_without_response',
    'DUPLICATE_FACT_RESPONSE',
    'PDF_TEXT_EXTRACTION_FAILED',
    'PDF_PAGE_TEXT_COUNT_MISMATCH',
    'DOCX_TEXT_EXTRACTION_FAILED',
  ]);
  const add = (blocker: string) => {
    if (!blockers.includes(blocker)) blockers.push(blocker);
  };

  if (!input.exportAllowed) add('DRAFT_EXPORT_BLOCKED');
  if (!input.docxPresent) add('DOCX_NOT_EXPORTED');
  if (!input.pdfPresent) add('PDF_NOT_EXPORTED');
  if (input.actualPdfPages === null) add('PAGE_METRICS_UNAVAILABLE');
  else if (input.actualPdfPages < input.minimumPages) add('PAGE_TARGET_NOT_MET');
  if (input.substantiveWords < input.minimumSubstantiveWords) add('SUBSTANTIVE_CONTENT_TOO_SHORT');
  if (input.professionalQualityGate === 'FAIL') add('PROFESSIONAL_QUALITY_GATE_FAILED');
  if (input.factualUnsupportedClaims === null || input.unverifiedFactualClaims === null) {
    add('FACTUAL_AUDIT_UNAVAILABLE');
  } else {
    if (input.factualUnsupportedClaims > 0) add('UNSUPPORTED_FACTUAL_CLAIMS');
    if (input.unverifiedFactualClaims > 0) add('UNVERIFIED_FACTUAL_CLAIMS');
  }
  if (input.unsupportedLegalAuthorities === null) add('AUTHORITY_AUDIT_UNAVAILABLE');
  else if (input.unsupportedLegalAuthorities > 0) add('UNSUPPORTED_LEGAL_AUTHORITIES');
  if (input.factsWithResponse < input.factsTotal) add('FACT_RESPONSES_INCOMPLETE');
  if (input.claimsWithResponse < input.claimsTotal) add('CLAIM_RESPONSES_INCOMPLETE');
  if (input.providerBackedTasks < 1) add('NO_PROVIDER_BACKED_TASKS');
  input.criticalCheckIds.filter((id) => blockingChecks.has(id)).forEach(add);

  return { ready: blockers.length === 0, blockers };
}
