import type { ArgumentAxis, CaseAnalysis } from './caseAnalysis';
import type { ProvenanceKind, UploadedSourceDocument } from './types';

export const CIVIL_MERCANTILE_EVIDENCE_ARGUMENT_DOCUMENT_TYPES = [
  'ofrecimiento_pruebas_civil',
  'objecion_pruebas_civil',
  'desahogo_vista_civil',
  'alegatos_civil',
  'ofrecimiento_pruebas_mercantil',
  'objecion_documentos_mercantil',
  'alegatos_mercantil',
] as const;

export type CivilMercantileEvidenceArgumentDocumentType =
  (typeof CIVIL_MERCANTILE_EVIDENCE_ARGUMENT_DOCUMENT_TYPES)[number];

export type EvidenceStatus =
  | 'CONFIRMED'
  | 'MISSING'
  | 'ANONYMIZED'
  | 'REQUIRES_LAWYER_CONFIRMATION';

export interface EvidenceArgumentSourceRef {
  documentId?: string;
  page?: number;
  excerpt?: string;
  provenance: ProvenanceKind;
}

export interface LegalEvidenceItem {
  id: string;
  type: string;
  description: string;
  purpose?: string;
  relatedFacts: string[];
  source?: EvidenceArgumentSourceRef;
  status: EvidenceStatus;
}

export interface LegalArgumentItem {
  id: string;
  title: string;
  issue: string;
  relatedFacts: string[];
  relatedEvidence: string[];
  rules: string[];
  reasoning: string;
  requestedConsequence: string;
  sources: EvidenceArgumentSourceRef[];
  status: EvidenceStatus;
}

export interface CivilMercantileEvidenceArgumentContext {
  documentType: CivilMercantileEvidenceArgumentDocumentType;
  matter: 'CIVIL' | 'MERCANTIL';
  sourceDocumentIds: string[];
  evidence: LegalEvidenceItem[];
  arguments: LegalArgumentItem[];
}

export function isCivilMercantileEvidenceArgumentDocumentType(
  value: string,
): value is CivilMercantileEvidenceArgumentDocumentType {
  return (CIVIL_MERCANTILE_EVIDENCE_ARGUMENT_DOCUMENT_TYPES as readonly string[]).includes(value);
}

function sourceRef(
  value: { documentId?: string; page?: number; textSnippet?: string; excerpt?: string } | undefined,
  provenance: ProvenanceKind,
): EvidenceArgumentSourceRef | undefined {
  if (!value?.documentId && value?.page === undefined && !value?.textSnippet && !value?.excerpt) return undefined;
  return {
    documentId: value.documentId,
    page: value.page,
    excerpt: value.textSnippet || value.excerpt,
    provenance,
  };
}

function evidenceStatus(
  item: CaseAnalysis['evidence'][number],
  anonymizedData: string[],
): EvidenceStatus {
  const corpus = `${item.type} ${item.description}`.toLocaleLowerCase('es-MX');
  if (anonymizedData.some((value) => corpus.includes(value.toLocaleLowerCase('es-MX')))) return 'ANONYMIZED';
  if (!item.description?.trim()) return 'MISSING';
  // A non-empty extraction is not a lawyer confirmation. The explicit
  // `confirmed` flag is the only authority for this context.
  return item.confirmed === true ? 'CONFIRMED' : 'REQUIRES_LAWYER_CONFIRMATION';
}

function argumentStatus(axis: ArgumentAxis): EvidenceStatus {
  if (!axis.title?.trim() || !axis.issue?.trim() || !axis.reasoning?.trim()) return 'MISSING';
  return axis.sources?.length > 0 ? 'CONFIRMED' : 'REQUIRES_LAWYER_CONFIRMATION';
}

export function buildCivilMercantileEvidenceArgumentContext(
  documentType: CivilMercantileEvidenceArgumentDocumentType,
  sources: UploadedSourceDocument[],
  analysis: CaseAnalysis,
): CivilMercantileEvidenceArgumentContext {
  return {
    documentType,
    matter: documentType.includes('mercantil') ? 'MERCANTIL' : 'CIVIL',
    sourceDocumentIds: sources.map((source) => source.id),
    evidence: (analysis.evidence || []).map((item, index) => {
      const provenance = item.provenance || 'SOURCE_EXTRACTED';
      return {
        id: item.id || `evidence-${index + 1}`,
        type: item.type || 'PRUEBA POR DEFINIR',
        description: item.description || '',
        ...(item.description?.trim() ? { description: item.description.trim() } : {}),
        relatedFacts: ((item as { relatedFacts?: string[] }).relatedFacts || []).filter((value) => typeof value === 'string' && value.trim()),
        ...(sourceRef(item.sourceReference, provenance) ? { source: sourceRef(item.sourceReference, provenance) } : {}),
        status: evidenceStatus(item, analysis.anonymizedData || []),
      };
    }),
    arguments: (analysis.argumentAxes || []).map((axis) => ({
      id: axis.id,
      title: axis.title,
      issue: axis.issue,
      relatedFacts: axis.facts || [],
      relatedEvidence: [],
      rules: axis.rules || [],
      reasoning: axis.reasoning,
      requestedConsequence: axis.requestedConsequence,
      sources: (axis.sources || []).map((value) => ({
        documentId: value.documentId,
        page: value.page,
        excerpt: value.excerpt,
        provenance: 'SOURCE_EXTRACTED' as const,
      })),
      status: argumentStatus(axis),
    })),
  };
}
