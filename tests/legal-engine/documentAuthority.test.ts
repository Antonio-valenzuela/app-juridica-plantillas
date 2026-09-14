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
import { validateDocumentAuthorities } from '@/lib/legal-engine/documentAuthority';
import type { RichCaseAnalysis } from '@/lib/legal-engine/case-extraction/types';
import type { LegalIssueMatrix } from '@/lib/legal-engine/legalIssueMatrix';

const argumentSection = createDocumentNode({
  id: 'sec-argument',
  title: 'AGRAVIOS',
  type: 'argument',
  order: 0,
});

function authorityAnalysis(options: { verificationStatus?: 'SOURCE_CITED' | 'LEGALLY_VERIFIED' } = {}): RichCaseAnalysis {
  const analysis = makeRichCaseAnalysisFixture();
  analysis.authorities = [{
    id: 'authority-1',
    authorityType: 'JURISPRUDENCE',
    citationText: 'Tesis autorizada 1/2026',
    verificationStatus: options.verificationStatus || 'SOURCE_CITED',
    provenance: [],
  }];
  return analysis;
}

function authorityIssueMatrix(): LegalIssueMatrix {
  return {
    documentId: 'doc-fase6-fixture',
    documentType: 'fixture_document',
    sourceMode: 'RICH',
    issues: [{
      id: 'issue-1',
      issueType: 'AUTHORITY_RESEARCH',
      question: '¿Cuál es el criterio aplicable?',
      source: {
        mode: 'RICH_COVERAGE',
        coverageItemId: 'cov-authority',
        coverageCategory: 'AUTHORITY_MENTION',
        sourceEntityIds: ['authority-1'],
      },
      coverageItemIds: ['cov-authority'],
      claimIds: [],
      factIds: [],
      evidenceMentionIds: [],
      evidenceOfferIds: [],
      argumentIds: [],
      authorityMentionIds: ['authority-1'],
      conflictIds: [],
      missingDataIds: [],
      clientPositionStatus: 'NOT_REQUIRED',
      required: true,
      blocking: true,
      status: 'READY_FOR_GENERATION',
      researchStatus: 'SOURCE_CITED_UNVERIFIED',
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
}

function authorityInput(options: {
  text?: string;
  authorityIds?: string[];
  verifiedAuthorityIds?: string[];
  legalIssueIds?: string[];
  verificationStatus?: 'SOURCE_CITED' | 'LEGALLY_VERIFIED';
} = {}) {
  const block = makeAcceptedBlock({
    id: 'blk-authority',
    text: options.text || 'Conforme a la Tesis autorizada 1/2026, el criterio resulta aplicable.',
    authorityIds: options.authorityIds || ['authority-1'],
    verifiedAuthorityIds: options.verifiedAuthorityIds || [],
    legalIssueIds: options.legalIssueIds || ['issue-1'],
    coverageItemIds: ['cov-authority'],
    generationTaskId: 'task-authority',
    taskId: 'task-authority',
  });
  const coverageMatrix = {
    items: [makeCoverageItem({
      id: 'cov-authority',
      category: 'AUTHORITY_MENTION',
      targetSectionIds: [argumentSection.id],
      authorityMentionIds: ['authority-1'],
      relatedAuthorityIds: ['authority-1'],
    })],
    summary: { total: 1, required: 1, pending: 1, generated: 0, covered: 0, unsupported: 0, weak: 0, notApplicable: 0 },
  };
  const assembly = assembleLegalDraft(makeAssemblyInput({
    documentPlan: { sections: [argumentSection], planSource: 'GENERATED', templateId: 'escrito_libre' },
    candidateSections: [argumentSection],
    candidateBlocks: [{ sectionId: argumentSection.id, block }],
    generationTasks: [makeTask({ id: 'task-authority', sectionId: argumentSection.id })],
    coverageMatrix,
    richCaseAnalysis: authorityAnalysis({ verificationStatus: options.verificationStatus }),
    legalIssueMatrix: authorityIssueMatrix(),
  }));
  return {
    assembly,
    richCaseAnalysis: authorityAnalysis({ verificationStatus: options.verificationStatus }),
    coverageMatrix,
    legalIssueMatrix: authorityIssueMatrix(),
  };
}

describe('document authority validation', () => {
  it('rejects a citation not present in the authorized authority graph', () => {
    const findings = validateDocumentAuthorities(authorityInput({
      text: 'Se invoca la Tesis inventada 99/2026 para sostener la pretensión.',
      authorityIds: [],
    }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'NEW_AUTHORITY_DURING_ASSEMBLY', severity: 'BLOCKER' }),
    ]));
  });

  it('does not treat SOURCE_CITED as LEGALLY_VERIFIED', () => {
    const findings = validateDocumentAuthorities(authorityInput({
      verifiedAuthorityIds: ['authority-1'],
      verificationStatus: 'SOURCE_CITED',
    }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNVERIFIED_AUTHORITY_USED_AS_VERIFIED', severity: 'BLOCKER' }),
    ]));
  });

  it('rejects an allowed authority linked to another issue', () => {
    const findings = validateDocumentAuthorities(authorityInput({ legalIssueIds: ['issue-2'] }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AUTHORITY_WRONG_ISSUE', severity: 'BLOCKER' }),
    ]));
  });
});
