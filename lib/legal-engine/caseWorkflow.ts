import type {
  AnalyzedFact,
  AnalyzedClaim,
  CaseWorkflow,
  CaseWorkflowSelection,
  GenerationMode,
  LawyerClaimPosition,
  LawyerFactPosition,
  UploadedSourceDocument,
  UniversalLegalDocument,
} from './types';
import type { CaseAnalysis } from './caseAnalysis';

export interface CaseWorkflowInput {
  sourceDocuments?: UploadedSourceDocument[];
  analysis: Partial<CaseAnalysis> & { facts?: AnalyzedFact[] };
  generationMode: GenerationMode;
  templateId?: string;
  referenceDocumentId?: string;
  structuredDoc?: UniversalLegalDocument;
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, numeric));
}

export function chooseGenerationSource(input: CaseWorkflowSelection): CaseWorkflowSelection {
  if (input.mode === 'personal_template') {
    if (!input.templateId?.trim()) throw new Error('PERSONAL_TEMPLATE_ID_REQUIRED');
    return { mode: input.mode, templateId: input.templateId.trim(), referenceDocumentId: undefined };
  }

  if (input.mode === 'reference_document') {
    if (!input.referenceDocumentId?.trim()) throw new Error('REFERENCE_DOCUMENT_ID_REQUIRED');
    return { mode: input.mode, templateId: undefined, referenceDocumentId: input.referenceDocumentId.trim() };
  }

  return { mode: 'automatic', templateId: undefined, referenceDocumentId: undefined };
}

function normalizeFacts(facts: AnalyzedFact[] | undefined): AnalyzedFact[] {
  return (facts || []).map((fact, index) => ({
    ...fact,
    id: fact.id?.trim() || `fact-${index + 1}`,
    number: fact.number?.trim() || String(index + 1),
    text: fact.text?.trim() || '',
    confidence: clampConfidence(fact.confidence),
    sourceFact: fact.sourceFact?.trim() || fact.text?.trim() || '',
    lawyerPosition: fact.lawyerPosition || (fact.position === 'ADMIT' || fact.proposedPosture === 'ADMIT'
      ? 'ADMIT'
      : fact.position === 'DENY' || fact.proposedPosture === 'DENY'
        ? 'DENY'
        : fact.position === 'PARTIAL' || fact.proposedPosture === 'PARTIALLY_ADMIT'
          ? 'PARTIAL'
          : fact.position === 'IGNORE_PERSONAL_KNOWLEDGE'
            ? 'NOT_KNOWN'
            : 'UNDEFINED') as LawyerFactPosition,
    // Alias legado: se conserva para no romper el editor ni integraciones previas.
    position: fact.position || (fact.lawyerPosition && fact.lawyerPosition !== 'UNDEFINED' ? fact.lawyerPosition : 'REQUIRE_LAWYER_INPUT'),
    lawyerObservation: fact.lawyerObservation?.trim() || fact.manualResponse?.trim() || undefined,
    response: fact.generatedResponse?.trim() || fact.response?.trim() || fact.manualResponse?.trim() || '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
    support: Array.isArray(fact.support) ? fact.support : [],
    sourceReference: fact.sourceReference || {
      documentId: fact.documentId || 'fuente-no-identificada',
      page: fact.page,
      textSnippet: (fact.sourceFact || fact.text || '').slice(0, 240),
    },
    provenance: fact.provenance || (fact.lawyerPosition && fact.lawyerPosition !== 'UNDEFINED' ? 'LAWYER_CONFIRMED' : 'SOURCE_EXTRACTED'),
  }));
}

function normalizeClaims(claims: AnalyzedClaim[] | undefined): AnalyzedClaim[] {
  return (claims || []).map((claim, index) => {
    const lawyerPosition = claim.lawyerPosition || (
      claim.position === 'ACCEPT' || claim.position === 'OPPOSE' || claim.position === 'PARTIAL'
        ? claim.position
        : 'UNDEFINED'
    ) as LawyerClaimPosition;
    return {
      ...claim,
      id: claim.id?.trim() || `claim-${index + 1}`,
      number: claim.number?.trim() || String(index + 1),
      text: claim.text?.trim() || '',
      sourceClaim: claim.sourceClaim?.trim() || claim.text?.trim() || '',
      lawyerPosition,
      position: claim.position || lawyerPosition,
      lawyerObservation: claim.lawyerObservation?.trim() || undefined,
      generatedResponse: claim.generatedResponse?.trim() || undefined,
      response: claim.generatedResponse?.trim() || claim.response?.trim() || '[REQUIERE DEFINIR POSTURA DEL ABOGADO]',
      support: Array.isArray(claim.support) ? claim.support : [],
      supportingSources: Array.isArray(claim.supportingSources) ? claim.supportingSources : [],
      provenance: claim.provenance || (lawyerPosition !== 'UNDEFINED' ? 'LAWYER_CONFIRMED' : 'SOURCE_EXTRACTED'),
    };
  });
}

export function buildCaseWorkflow(input: CaseWorkflowInput): CaseWorkflow {
  const selection = chooseGenerationSource({
    mode: input.generationMode,
    templateId: input.templateId,
    referenceDocumentId: input.referenceDocumentId,
  });

  const analysis = {
    ...input.analysis,
    facts: normalizeFacts(input.analysis.facts),
    claimResponses: normalizeClaims(input.analysis.claimResponses),
    missingData: Array.isArray(input.analysis.missingData) ? input.analysis.missingData : [],
  } as CaseAnalysis;

  return {
    sourceDocuments: input.sourceDocuments || [],
    analysis,
    selection,
    structuredDoc: input.structuredDoc,
    updatedAt: new Date().toISOString(),
  };
}
