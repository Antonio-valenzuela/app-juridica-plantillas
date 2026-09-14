import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import {
  makeAcceptedBlock,
  makeAssemblyInput,
  makeCoverageItem,
  makeRichCaseAnalysisFixture,
  makeTask,
} from '@/lib/legal-engine/documentAssemblyTypes';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { validateDocumentEvidence } from '@/lib/legal-engine/documentEvidence';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';
import type { SectionContract } from '@/lib/legal-engine/documentAssemblyTypes';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';

const evidenceSection = createDocumentNode({
  id: 'sec-evidence',
  title: 'PRUEBAS',
  type: 'evidence',
  order: 0,
});

const evidenceContract: SectionContract = {
  sectionId: 'sec-evidence',
  sectionPath: ['sec-evidence'],
  title: 'PRUEBAS',
  type: 'evidence',
  required: true,
  contentRole: 'EVIDENCE',
  allowedCoverageCategories: ['EVIDENCE', 'EVIDENCE_TREATMENT', 'EVIDENCE_OFFER'],
  deterministicAllowed: false,
  requiresAcceptedSubstantiveBlock: true,
};

function evidenceAnalysis(options: { offerStatus?: 'PARTY_OFFERED' | 'CLIENT_CONFIRMED' | 'NEEDS_REVIEW'; factId?: string } = {}): RichCaseAnalysis {
  const analysis = makeRichCaseAnalysisFixture();
  const factId = options.factId || 'fact-1';
  analysis.facts = [{
    id: factId,
    proposition: 'Hecho relacionado con la prueba.',
    participants: [],
    assertionStatus: 'SOURCE_ASSERTION',
    provenance: [],
    relatedDocumentIds: [],
  }];
  analysis.evidenceMentions = [{
    id: 'mention-1',
    description: 'Contrato fuente',
    relatedFactIds: [factId],
    relatedClaimIds: [],
    status: 'SOURCE_ATTACHED',
    provenance: [],
  }];
  analysis.evidenceOffers = [{
    id: 'offer-1',
    evidenceMentionId: 'mention-1',
    status: options.offerStatus || 'CLIENT_CONFIRMED',
    provenance: [],
  }];
  return analysis;
}

function validEvidenceInput(options: {
  evidenceIds?: string[];
  factId?: string;
  mentionedFactId?: string;
  offerStatus?: 'PARTY_OFFERED' | 'CLIENT_CONFIRMED' | 'NEEDS_REVIEW';
  category?: 'EVIDENCE_TREATMENT' | 'EVIDENCE_OFFER';
  text?: string;
} = {}) {
  const factId = options.factId || 'fact-1';
  const mentionedFactId = options.mentionedFactId || factId;
  const category = options.category || 'EVIDENCE_OFFER';
  const block = makeAcceptedBlock({
    id: 'blk-evidence',
    text: options.text || 'Se ofrece la prueba documental ligada al hecho.',
    factIds: [factId],
    evidenceIds: options.evidenceIds || (category === 'EVIDENCE_TREATMENT' ? ['mention-1'] : ['offer-1']),
    coverageItemIds: ['cov-evidence'],
    legalIssueIds: ['issue-1'],
    generationTaskId: 'task-evidence',
    taskId: 'task-evidence',
  });
  const assembly = assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [evidenceSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [evidenceSection],
    candidateBlocks: [{ sectionId: evidenceSection.id, block }],
    generationTasks: [makeTask({ id: 'task-evidence', sectionId: evidenceSection.id })],
    coverageMatrix: {
      items: [makeCoverageItem({
        id: 'cov-evidence',
         category,
        targetSectionIds: [evidenceSection.id],
        relatedFactIds: [factId],
        evidenceMentionIds: ['mention-1'],
         evidenceOfferIds: category === 'EVIDENCE_OFFER' ? ['offer-1'] : [],
      })],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    },
  }));
  return {
    assembly,
    richCaseAnalysis: evidenceAnalysis({ factId: mentionedFactId, offerStatus: options.offerStatus }),
    sectionContracts: [evidenceContract],
    coverageMatrix: {
      items: [makeCoverageItem({
        id: 'cov-evidence',
         category,
        targetSectionIds: [evidenceSection.id],
        relatedFactIds: [mentionedFactId],
        evidenceMentionIds: ['mention-1'],
         evidenceOfferIds: category === 'EVIDENCE_OFFER' ? ['offer-1'] : [],
      })],
      summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
    },
  };
}

describe('document evidence consistency', () => {
  it('rejects mention used as offer', () => {
    const findings = validateDocumentEvidence(validEvidenceInput({ evidenceIds: ['mention-1'] }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EVIDENCE_MENTION_WITHOUT_OFFER', severity: 'BLOCKER' }),
    ]));
  });

  it('accepts a confirmed offer with explicit issue and section links', () => {
    expect(validateDocumentEvidence(validEvidenceInput())).toEqual([]);
  });

  it('accepts a mention-only treatment without interpreting the mention as an offer', () => {
    expect(validateDocumentEvidence(validEvidenceInput({
      category: 'EVIDENCE_TREATMENT',
      text: 'La fuente identifica un contrato documental relacionado con el hecho.',
    }))).toEqual([]);
  });

  it('rejects a historical party-offered evidence offer as a current document offer', () => {
    const findings = validateDocumentEvidence(validEvidenceInput({ offerStatus: 'PARTY_OFFERED' }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EVIDENCE_OFFER_NOT_AUTHORIZED', severity: 'BLOCKER' }),
    ]));
  });

  it('accepts explicit evidence-entity issue linkage when the mention has no fact relation', () => {
    const input = validEvidenceInput({ text: 'La prueba documental está vinculada expresamente a esta cuestión.' });
    input.richCaseAnalysis.evidenceMentions[0] = {
      ...input.richCaseAnalysis.evidenceMentions[0],
      relatedFactIds: [],
    };
    const legalIssueMatrix: LegalIssueMatrix = {
      documentId: 'doc-fase6-fixture',
      documentType: 'fixture_document',
      sourceMode: 'RICH',
      issues: [{
        id: 'issue-1',
        issueType: 'EVIDENCE_SUFFICIENCY',
        question: '¿Qué suficiencia puede evaluarse?',
        source: {
          mode: 'RICH_COVERAGE',
          coverageItemId: 'cov-evidence',
          coverageCategory: 'EVIDENCE_OFFER',
          sourceEntityType: 'EVIDENCE_OFFER',
          sourceEntityIds: ['offer-1'],
        },
        coverageItemIds: ['cov-evidence'],
        claimIds: [],
        factIds: [],
        evidenceMentionIds: ['mention-1'],
        evidenceOfferIds: ['offer-1'],
        argumentIds: [],
        authorityMentionIds: [],
        conflictIds: [],
        missingDataIds: [],
        clientPositionStatus: 'NOT_REQUIRED',
        required: true,
        blocking: false,
        status: 'READY_FOR_GENERATION',
        researchStatus: 'NOT_REQUIRED',
        provenance: [],
        relationStatus: 'EXPLICIT',
      }],
      summary: {
        total: 1,
        required: 1,
        blocked: 0,
        readyForGeneration: 1,
        needsLegalResearch: 0,
        needsClientPosition: 0,
        unresolvedConflict: 0,
        unlinked: 0,
      },
    };
    expect(validateDocumentEvidence({ ...input, legalIssueMatrix })).toEqual([]);
  });

  it('rejects evidence from another issue', () => {
    const findings = validateDocumentEvidence(validEvidenceInput({ factId: 'fact-2', mentionedFactId: 'fact-1' }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EVIDENCE_WRONG_ISSUE', severity: 'BLOCKER' }),
    ]));
  });
});
