import { describe, expect, it, vi } from 'vitest';
import {
  makeEmptyAssemblyResult,
  type DocumentAssemblyCheckSet,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { runDocumentAssemblyQualityGate } from '@/lib/legal-engine/documentAssemblyQualityGate';
import type { QualityGateResult } from '@/lib/legal-engine/qualityGate';

function baseQualityGate(): QualityGateResult {
  return {
    passed: true,
    canMarkAsFinal: true,
    qualityScore: 100,
    criticalErrors: [],
    warnings: [],
    suggestions: [],
    missingFields: [],
    anonymizedFields: [],
    metrics: {
      totalSections: 0,
      emptySectionsCount: 0,
      wordCount: 0,
      characterCount: 0,
      pendingFieldsCount: 0,
      missingFieldsCount: 0,
      anonymizedFieldsCount: 0,
      unverifiedCitationsCount: 0,
      manuallyEditedSectionsCount: 0,
      sourceReferencesCount: 0,
      isProportional: true,
      incompatibleConceptsCount: 0,
      repeatedSectionsCount: 0,
      factsTotal: 0,
      factsWithResponse: 0,
      claimsTotal: 0,
      claimsWithResponse: 0,
      contradictoryPositionCount: 0,
      duplicateFactResponseCount: 0,
      unsupportedFactualClaimCount: 0,
      unsupportedEvidenceCount: 0,
      inappropriateSectionCount: 0,
      voiceInconsistencyCount: 0,
      proceduralMismatchCount: 0,
    },
  };
}

function cleanChecks(): DocumentAssemblyCheckSet {
  return {
    checks: [{ checkId: 'STRUCTURAL_COMPLETENESS', status: 'PASS', findingCodes: [] }],
    findings: [],
    hasMaterialBlocker: false,
    hasInvalidity: false,
  };
}

function gateInput(overrides: Partial<Parameters<typeof runDocumentAssemblyQualityGate>[0]> = {}) {
  const assembly = makeEmptyAssemblyResult();
  return {
    assembly,
    baseQualityGate: baseQualityGate(),
    checks: cleanChecks(),
    coverage: { items: [], requiredMissingIds: [], duplicatedIds: [], lostIds: [], allRequiredSatisfied: true },
    trace: assembly.trace,
    readiness: 'READY' as const,
    ...overrides,
  };
}

describe('document assembly QualityGate', () => {
  it('fails on any material cross-block blocker even when block semantic scores pass', () => {
    const result = runDocumentAssemblyQualityGate(gateInput({
      checks: {
        checks: [{ checkId: 'CROSS_BLOCK_CONSISTENCY', status: 'FAIL', findingCodes: ['CONTRADICTORY_FACTS'] }],
        findings: [{ code: 'CONTRADICTORY_FACTS', severity: 'BLOCKER', message: 'Contradicción material.', reason: 'Contradicción material.', blockIds: ['blk-1', 'blk-2'], legalIssueIds: ['issue-1'], coverageItemIds: ['cov-1'], sectionIds: ['sec-1'] }],
        hasMaterialBlocker: true,
        hasInvalidity: false,
      },
      readiness: 'BLOCKED',
    }));
    expect(result.passed).toBe(false);
    expect(result.canMarkAsReady).toBe(false);
    expect(result.readiness).toBe('BLOCKED');
  });

  it('does not call a provider for deterministic assembly', () => {
    const provider = vi.fn();
    const result = runDocumentAssemblyQualityGate(gateInput({ provider }));
    expect(provider).not.toHaveBeenCalled();
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'DETERMINISTIC_ASSEMBLY', status: 'PASS' }),
    ]));
  });

  it('blocks a broken trace and does not copy research bundle bodies', () => {
    const input = gateInput({
      trace: { ...makeEmptyAssemblyResult().trace, outputFingerprint: '', findingCodes: ['TRACE_INTEGRITY_FAILED'] },
      checks: {
        checks: [{ checkId: 'TRACE_INTEGRITY', status: 'FAIL', findingCodes: ['TRACE_INTEGRITY_FAILED'] }],
        findings: [{ code: 'TRACE_INTEGRITY_FAILED', severity: 'BLOCKER', message: 'Traza rota.', reason: 'Traza rota.', blockIds: [], legalIssueIds: [], coverageItemIds: [], sectionIds: [] }],
        hasMaterialBlocker: true,
        hasInvalidity: true,
      },
      readiness: 'INVALID',
      researchBundle: { body: 'full research bundle body' },
    });
    const result = runDocumentAssemblyQualityGate(input);
    expect(result.readiness).toBe('INVALID');
    expect(JSON.stringify(result)).not.toContain('full research bundle body');
  });
});
