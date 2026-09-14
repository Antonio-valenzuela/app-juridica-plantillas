import type { CaseAnalysis } from './caseAnalysis';
import type { ProvenanceKind, UploadedSourceDocument } from './types';

export const CIVIL_MERCANTILE_RESPONSE_DOCUMENT_TYPES = [
  'contestacion_demanda_civil',
  'contestacion_demanda_mercantil',
  'contestacion_demanda_oral_civil',
  'contestacion_demanda_arrendamiento',
  'reconvencion_civil',
  'contestacion_reconvencion_civil',
  'reconvencion_mercantil',
  'contestacion_reconvencion_mercantil',
  'excepciones_mercantiles',
] as const;

export type CivilMercantileResponseDocumentType =
  (typeof CIVIL_MERCANTILE_RESPONSE_DOCUMENT_TYPES)[number];

export type ResponsePosture =
  | 'ADMITE'
  | 'NIEGA'
  | 'ADMITE_PARCIALMENTE'
  | 'DESCONOCE'
  | 'REQUIERE_POSTURA_ABOGADO';

export interface ResponseSourceRef {
  documentId?: string;
  page?: number;
  excerpt?: string;
  provenance: ProvenanceKind;
}

export interface ResponseFact {
  id: string;
  number: string;
  text: string;
  posture: ResponsePosture;
  response?: string;
  sources: ResponseSourceRef[];
}

export interface ResponseClaim {
  id: string;
  number: string;
  text: string;
  posture: ResponsePosture;
  response?: string;
  sources: ResponseSourceRef[];
}

export interface ResponseDefense {
  id: string;
  text: string;
  source?: ResponseSourceRef;
  requiresLawyerConfirmation: true;
}

export interface CivilMercantileResponseContext {
  documentType: CivilMercantileResponseDocumentType;
  matter: 'CIVIL' | 'MERCANTIL';
  sourceDocumentIds: string[];
  parties: {
    respondent?: string;
    claimant?: string;
  };
  facts: ResponseFact[];
  claims: ResponseClaim[];
  defenses: ResponseDefense[];
}

function postureForFact(fact: CaseAnalysis['facts'][number]): ResponsePosture {
  // `position` can be an analyst/model suggestion. Only an explicit lawyer
  // position is authoritative for a response posture.
  const position = fact.lawyerPosition;
  if (position === 'ADMIT') return 'ADMITE';
  if (position === 'DENY') return 'NIEGA';
  if (position === 'PARTIAL') return 'ADMITE_PARCIALMENTE';
  if (position === 'NOT_KNOWN') return 'DESCONOCE';
  return 'REQUIERE_POSTURA_ABOGADO';
}

function postureForClaim(claim: NonNullable<CaseAnalysis['claimResponses']>[number]): ResponsePosture {
  // A source/analysis position is not a pleading instruction by itself.
  const position = claim.lawyerPosition;
  if (position === 'ACCEPT') return 'ADMITE';
  if (position === 'OPPOSE') return 'NIEGA';
  if (position === 'PARTIAL') return 'ADMITE_PARCIALMENTE';
  return 'REQUIERE_POSTURA_ABOGADO';
}

function sourceRef(value: { documentId?: string; page?: number; textSnippet?: string } | undefined, provenance: ProvenanceKind): ResponseSourceRef | undefined {
  if (!value?.documentId && value?.page === undefined && !value?.textSnippet) return undefined;
  return {
    documentId: value.documentId,
    page: value.page,
    excerpt: value.textSnippet,
    provenance,
  };
}

export function isCivilMercantileResponseDocumentType(value: string): value is CivilMercantileResponseDocumentType {
  return (CIVIL_MERCANTILE_RESPONSE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function buildCivilMercantileResponseContext(
  documentType: CivilMercantileResponseDocumentType,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
): CivilMercantileResponseContext {
  const claims: NonNullable<CaseAnalysis['claimResponses']> = analysis.claimResponses?.length
    ? analysis.claimResponses
    : (analysis.claims || []).map((text, index) => ({
      id: `claim-${index + 1}`,
      number: String(index + 1),
      text,
      position: 'REQUIRE_LAWYER_INPUT' as const,
    })) as NonNullable<CaseAnalysis['claimResponses']>;
  const matter = documentType.includes('mercantil') ? 'MERCANTIL' : 'CIVIL';
  return {
    documentType,
    matter,
    sourceDocumentIds: sources.map((source) => source.id),
    parties: {
      respondent: analysis.parties.demandado,
      claimant: analysis.parties.actor,
    },
    facts: (analysis.facts || []).map((fact) => ({
      id: fact.id,
      number: fact.number,
      text: fact.text,
      posture: postureForFact(fact),
      response: fact.lawyerObservation || fact.manualResponse,
      sources: [sourceRef(fact.sourceReference, fact.provenance || 'SOURCE_EXTRACTED')].filter(
        (value): value is ResponseSourceRef => Boolean(value),
      ),
    })),
    claims: claims.map((claim) => ({
      id: claim.id,
      number: claim.number,
      text: claim.text,
      posture: postureForClaim(claim),
      response: claim.lawyerObservation || claim.response,
      sources: [sourceRef(claim.sourceReference, claim.provenance || 'SOURCE_EXTRACTED')].filter(
        (value): value is ResponseSourceRef => Boolean(value),
      ),
    })),
    defenses: (analysis.arguments || []).map((text, index) => ({
      id: `defense-${index + 1}`,
      text,
      requiresLawyerConfirmation: true,
    })),
  };
}
