import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeCoverageItem,
  makeDocumentFixture,
  makeEmptyAssemblyResult,
  makeRichCaseAnalysisFixture,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import {
  decideDocumentAssemblyReadiness,
  validatePetitionCompatibility,
  type DocumentReadinessInput,
} from '@/lib/legal-engine/documentReadiness';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { reconcileDocumentCoverage } from '@/lib/legal-engine/documentCoverage';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';
import type { QualityGateResult } from '@/lib/legal-engine/qualityGate';
import type { SectionContract } from '@/lib/legal-engine/documentAssemblyTypes';

const factsSection = createDocumentNode({ id: 'sec-facts', title: 'HECHOS', type: 'facts', order: 0 });
const petitionSection = createDocumentNode({ id: 'sec-petition', title: 'PETITORIOS', type: 'petition', order: 1 });

const factsContract: SectionContract = {
  sectionId: factsSection.id,
  sectionPath: [factsSection.id],
  title: factsSection.title,
  type: factsSection.type,
  required: true,
  contentRole: 'FACT_RESPONSE',
  allowedCoverageCategories: ['FACT_RESPONSE', 'FACT'],
  deterministicAllowed: false,
  requiresAcceptedSubstantiveBlock: true,
};

function passingQualityGate(): QualityGateResult {
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
      totalSections: 1,
      emptySectionsCount: 0,
      wordCount: 12,
      characterCount: 80,
      pendingFieldsCount: 0,
      missingFieldsCount: 0,
      anonymizedFieldsCount: 0,
      unverifiedCitationsCount: 0,
      manuallyEditedSectionsCount: 0,
      sourceReferencesCount: 0,
      isProportional: true,
      incompatibleConceptsCount: 0,
      repeatedSectionsCount: 0,
      factsTotal: 1,
      factsWithResponse: 1,
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

function richIssueMatrix(sourceMode: LegalIssueMatrix['sourceMode'] = 'RICH'): LegalIssueMatrix {
  return {
    documentId: 'doc-fase6-fixture',
    documentType: 'fixture_document',
    sourceMode,
    issues: [],
    summary: { total: 0, required: 0, blocked: 0, readyForGeneration: 0, needsLegalResearch: 0, needsClientPosition: 0, unresolvedConflict: 0, unlinked: 0 },
  };
}

function cleanReadinessInput(): DocumentReadinessInput {
  const block = makeAcceptedBlock({ id: 'blk-facts', coverageItemIds: ['cov-facts'], legalIssueIds: ['issue-facts'], generationTaskId: 'task-facts', taskId: 'task-facts' });
  const assembly = assembleLegalDraft(makeAssemblyInput({
    document: makeDocumentFixture(),
    documentPlan: { sections: [factsSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [factsSection],
    candidateBlocks: [{ sectionId: factsSection.id, block }],
    generationTasks: [makeTask({ id: 'task-facts', sectionId: factsSection.id })],
    coverageMatrix: { items: [makeCoverageItem({ id: 'cov-facts', category: 'FACT_RESPONSE', targetSectionIds: [factsSection.id] })], summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 } },
    legalIssueMatrix: richIssueMatrix(),
  }));
  const coverageMatrix = { items: [makeCoverageItem({ id: 'cov-facts', category: 'FACT_RESPONSE', targetSectionIds: [factsSection.id] })], summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 } };
  return {
    document: makeDocumentFixture(),
    assembly,
    sectionContracts: [factsContract],
    coverageMatrix,
    coverage: reconcileDocumentCoverage({ coverageMatrix, assembly, sectionContracts: [factsContract] }),
    legalIssueMatrix: richIssueMatrix(),
    richCaseAnalysis: makeRichCaseAnalysisFixture(),
    baseQualityGate: passingQualityGate(),
    trace: assembly.trace,
  };
}

function petitionInput(): Pick<DocumentReadinessInput, 'assembly' | 'coverageMatrix' | 'legalIssueMatrix'> {
  const support = makeAcceptedBlock({ id: 'blk-support', coverageItemIds: ['cov-support'], generationTaskId: 'task-support', taskId: 'task-support' });
  const petition = makeAcceptedBlock({ id: 'blk-petition', text: 'Solicito una condena no respaldada por la defensa.', coverageItemIds: ['cov-petition'], generationTaskId: 'task-petition', taskId: 'task-petition' });
  const coverageMatrix = {
    items: [
      makeCoverageItem({ id: 'cov-support', category: 'FACT_RESPONSE', targetSectionIds: [factsSection.id], claimIds: ['claim-supported'] }),
      makeCoverageItem({ id: 'cov-petition', category: 'PETITION_SUPPORT', targetSectionIds: [petitionSection.id], claimIds: ['claim-unsupported'] }),
    ],
    summary: { total: 2, required: 2, pending: 2, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
  const assembly = assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [factsSection, petitionSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [factsSection, petitionSection],
    candidateBlocks: [
      { sectionId: factsSection.id, block: support },
      { sectionId: petitionSection.id, block: petition },
    ],
    generationTasks: [
      makeTask({ id: 'task-support', sectionId: factsSection.id, order: 0 }),
      makeTask({ id: 'task-petition', sectionId: petitionSection.id, order: 1 }),
    ],
    coverageMatrix,
  }));
  return { assembly, coverageMatrix, legalIssueMatrix: richIssueMatrix() };
}

describe('document readiness', () => {
  it('blocks a petition whose relief is stronger or different from supported Coverage', () => {
    const findings = validatePetitionCompatibility(petitionInput());
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNSUPPORTED_PETITION_RELIEF', severity: 'BLOCKER' }),
    ]));
  });

  it('maps clean rich assembly to READY without changing lifecycle', () => {
    const input = cleanReadinessInput();
    const result = decideDocumentAssemblyReadiness(input);
    expect(result).toBe('READY');
    expect(input.document.lifecycle?.readiness).not.toBe('READY_TO_EXPORT');
  });

  it('maps legacy compatibility without throwing', () => {
    const input: DocumentReadinessInput = {
      document: makeDocumentFixture(),
      assembly: makeEmptyAssemblyResult(),
      sectionContracts: [],
      coverageMatrix: { items: [], summary: { total: 0, required: 0, pending: 0, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 } },
      coverage: { items: [], requiredMissingIds: [], duplicatedIds: [], lostIds: [], allRequiredSatisfied: true },
      legalIssueMatrix: richIssueMatrix('LEGACY_FALLBACK'),
      baseQualityGate: passingQualityGate(),
      trace: makeEmptyAssemblyResult().trace,
    };
    expect(() => decideDocumentAssemblyReadiness(input)).not.toThrow();
    expect(decideDocumentAssemblyReadiness(input)).toBe('REQUIRES_REVIEW');
  });
});
