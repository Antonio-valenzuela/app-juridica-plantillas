import type { UniversalLegalDocument, ValidationResult } from './types';
import { runQualityGateCheck, type QualityGateResult } from './qualityGate';
import { validateDocument } from './validator';

export interface VerificationContinuationResult {
  document: UniversalLegalDocument;
  qualityGate: QualityGateResult;
  validation: ValidationResult;
  regeneratedPages: false;
}

/**
 * Re-evaluates an already materialized document without entering generation.
 * It intentionally does not promote lifecycle readiness: export still needs
 * the explicit lawyer transition and the existing 422 source guard remains
 * outside this continuation path.
 */
export function runVerificationContinuation(
  input: UniversalLegalDocument,
  options: { referenceLength?: number } = {},
): VerificationContinuationResult {
  const document = {
    ...input,
    generationMetadata: { ...input.generationMetadata },
  } as UniversalLegalDocument;

  const validation = validateDocument(document);
  const qualityGate = runQualityGateCheck(document, {
    referenceLength: options.referenceLength || 0,
  });

  document.validation = validation;
  (document as UniversalLegalDocument & { qualityGate?: QualityGateResult }).qualityGate = qualityGate;
  (document.generationMetadata as any).qualityScore = qualityGate.qualityScore;
  (document.generationMetadata as any).qualityMetrics = qualityGate.metrics;

  if (!qualityGate.passed) {
    document.validation.isValid = false;
    document.validation.errors = [
      ...document.validation.errors,
      ...qualityGate.criticalErrors,
    ];
    document.status = 'draft';
    (document.generationMetadata as any).readiness = 'REVIEW_REQUIRED';
    document.generationMetadata.pipelineState = {
      ...document.generationMetadata.pipelineState,
      isComplete: false,
      hasErrors: true,
    };
  }

  return { document, qualityGate, validation, regeneratedPages: false };
}
