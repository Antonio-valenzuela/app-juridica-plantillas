import type { CaseAnalysis } from './caseAnalysis';
import type { SectionDraft } from './sectionDraft';
import { buildMatterKnowledgeBase, type MatterKnowledgeBase } from './matterKnowledgeBase';
import type { LegalIssueMatrix } from './legalIssueMatrix';

export interface SectionSummary {
  sectionId: string;
  title: string;
  order: number;
  conclusion: string;
  usedFactIds: string[];
  usedEvidenceIds: string[];
  usedAuthorityIds: string[];
}

export interface DocumentState {
  version: 'DOCUMENT_STATE_V1';
  establishedFactIds: string[];
  disputedFactIds: string[];
  partyIds: string[];
  claimIds: string[];
  evidenceIdsUsed: string[];
  authorityIdsUsed: string[];
  argumentsAlreadyUsed: string[];
  previousConclusions: SectionSummary[];
  unresolvedIssueIds: string[];
  matterKnowledgeBase: MatterKnowledgeBase;
}

const unique = (values: readonly string[]): string[] => [...new Set(values.filter(Boolean))].sort();

export function createDocumentState(caseAnalysis: CaseAnalysis, issueMatrix?: LegalIssueMatrix): DocumentState {
  const rich = caseAnalysis.richCaseAnalysis;
  const matterKnowledgeBase = buildMatterKnowledgeBase(caseAnalysis, [], issueMatrix);
  return {
    version: 'DOCUMENT_STATE_V1',
    establishedFactIds: unique((rich?.facts || []).filter((fact) => fact.assertionStatus === 'ESTABLISHED_FACT').map((fact) => fact.id)),
    disputedFactIds: unique((rich?.facts || []).filter((fact) => fact.assertionStatus !== 'ESTABLISHED_FACT').map((fact) => fact.id)),
    partyIds: unique((rich?.parties || []).map((party) => party.id)),
    claimIds: unique((rich?.claims || []).map((claim) => claim.id)),
    evidenceIdsUsed: [],
    authorityIdsUsed: [],
    argumentsAlreadyUsed: [],
    previousConclusions: [],
    unresolvedIssueIds: [...matterKnowledgeBase.unresolvedIssueIds],
    matterKnowledgeBase,
  };
}

export function advanceDocumentState(state: DocumentState, input: { sectionId: string; title: string; order: number; text: string; draft?: SectionDraft }): DocumentState {
  const draft = input.draft;
  const summary: SectionSummary = {
    sectionId: input.sectionId,
    title: input.title,
    order: input.order,
    conclusion: input.text.trim().slice(-1600),
    usedFactIds: [...(draft?.factIds || [])],
    usedEvidenceIds: [...(draft?.evidenceIds || [])],
    usedAuthorityIds: [...(draft?.authorityIds || [])],
  };
  return {
    ...state,
    evidenceIdsUsed: unique([...state.evidenceIdsUsed, ...summary.usedEvidenceIds]),
    authorityIdsUsed: unique([...state.authorityIdsUsed, ...summary.usedAuthorityIds]),
    argumentsAlreadyUsed: unique([
      ...state.argumentsAlreadyUsed,
      ...state.matterKnowledgeBase.argumentSupports
        .filter((support) => support.proposition && input.text.toLocaleLowerCase().includes(support.proposition.toLocaleLowerCase().slice(0, 80)))
        .map((support) => support.argumentId),
    ]),
    previousConclusions: [...state.previousConclusions.filter((item) => item.sectionId !== summary.sectionId), summary].sort((left, right) => left.order - right.order),
  };
}
