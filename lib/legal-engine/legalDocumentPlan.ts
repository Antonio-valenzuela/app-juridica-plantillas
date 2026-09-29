import type { AnalyzedFact, LawyerFactPosition } from './types';
import type { DraftDepth } from './draftDepth';

export interface FactResponseRow {
  id: string;
  factId: string;
  factNumber: string;
  sourceText: string;
  sourceDocumentIds: string[];
  evidenceIds: string[];
  positionStatus: 'CONFIRMED' | 'PENDING';
  lawyerPosition?: Exclude<LawyerFactPosition, 'UNDEFINED'>;
  responseText?: string;
  attorneyInputGroupId?: string;
}

export interface AttorneyInputRequirement {
  id: string;
  type: 'FACT_POSITION';
  question: string;
  factIds: string[];
}

export interface FactResponseMatrix {
  rows: FactResponseRow[];
  attorneyInputRequirements: AttorneyInputRequirement[];
}

export interface LegalDocumentPlanSection {
  id: string;
  title?: string;
  coverageItemIds?: string[];
  requiredCoverageItemIds?: string[];
  legalIssueIds?: string[];
  authorityIds?: string[];
  factIds?: string[];
  evidenceIds?: string[];
}

export interface LegalDocumentPlanInput {
  documentId?: string;
  documentType: string;
  draftDepth: DraftDepth;
  sourceDocumentIds: readonly string[];
  sections: readonly LegalDocumentPlanSection[];
  factResponseMatrix: FactResponseMatrix;
  verifiedAuthorityIds: readonly string[];
}

export interface LegalDocumentPlan extends Omit<LegalDocumentPlanInput, 'sourceDocumentIds' | 'sections' | 'verifiedAuthorityIds'> {
  sourceDocumentIds: string[];
  sections: LegalDocumentPlanSection[];
  coverageItemIds: string[];
  legalIssueIds: string[];
  verifiedAuthorityIds: string[];
  unresolvedAuthorityIds: string[];
}

function uniqueIds(ids: readonly (string | undefined)[] = []): string[] {
  return Array.from(new Set(ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id))));
}

function hasConfirmedLawyerPosition(value: LawyerFactPosition | undefined): value is Exclude<LawyerFactPosition, 'UNDEFINED'> {
  return Boolean(value && value !== 'UNDEFINED');
}

export function buildFactResponseMatrix(facts: readonly AnalyzedFact[]): FactResponseMatrix {
  const rowsByFactId = new Map<string, FactResponseRow>();

  for (const fact of facts) {
    if (!fact.id || rowsByFactId.has(fact.id)) continue;
    const confirmed = hasConfirmedLawyerPosition(fact.lawyerPosition);
    rowsByFactId.set(fact.id, {
      id: `fact-response-${fact.id}`,
      factId: fact.id,
      factNumber: fact.number,
      sourceText: fact.sourceFact || fact.text,
      sourceDocumentIds: uniqueIds([fact.documentId, fact.sourceReference?.documentId]),
      evidenceIds: uniqueIds(fact.relatedEvidenceIds || []),
      positionStatus: confirmed ? 'CONFIRMED' : 'PENDING',
      ...(confirmed ? { lawyerPosition: fact.lawyerPosition as Exclude<LawyerFactPosition, 'UNDEFINED'> } : {}),
      ...(confirmed && fact.manualResponse?.trim() ? { responseText: fact.manualResponse.trim() } : {}),
      ...(!confirmed ? { attorneyInputGroupId: 'attorney-fact-position' } : {}),
    });
  }

  const rows = Array.from(rowsByFactId.values());
  const pendingFactIds = rows.filter((row) => row.positionStatus === 'PENDING').map((row) => row.factId);
  const attorneyInputRequirements: AttorneyInputRequirement[] = pendingFactIds.length > 0
    ? [{
      id: 'attorney-fact-position',
      type: 'FACT_POSITION',
      question: 'Confirme la postura del abogado para cada hecho listado en la matriz de respuesta fáctica.',
      factIds: pendingFactIds,
    }]
    : [];

  return { rows, attorneyInputRequirements };
}

export function buildLegalDocumentPlan(input: LegalDocumentPlanInput): LegalDocumentPlan {
  const sections = input.sections.map((section) => ({
    ...section,
    coverageItemIds: uniqueIds(section.coverageItemIds),
    requiredCoverageItemIds: uniqueIds(section.requiredCoverageItemIds),
    legalIssueIds: uniqueIds(section.legalIssueIds),
    authorityIds: uniqueIds(section.authorityIds),
    factIds: uniqueIds(section.factIds),
    evidenceIds: uniqueIds(section.evidenceIds),
  }));
  const verifiedAuthorityIds = uniqueIds(input.verifiedAuthorityIds);
  const mentionedAuthorityIds = uniqueIds(sections.flatMap((section) => section.authorityIds || []));

  return {
    documentId: input.documentId,
    documentType: input.documentType,
    draftDepth: input.draftDepth,
    sourceDocumentIds: uniqueIds(input.sourceDocumentIds),
    sections,
    factResponseMatrix: {
      rows: [...input.factResponseMatrix.rows],
      attorneyInputRequirements: [...input.factResponseMatrix.attorneyInputRequirements],
    },
    coverageItemIds: uniqueIds(sections.flatMap((section) => [
      ...(section.requiredCoverageItemIds || []),
      ...(section.coverageItemIds || []),
    ])),
    legalIssueIds: uniqueIds(sections.flatMap((section) => section.legalIssueIds || [])),
    verifiedAuthorityIds,
    unresolvedAuthorityIds: mentionedAuthorityIds.filter((id) => !verifiedAuthorityIds.includes(id)),
  };
}
