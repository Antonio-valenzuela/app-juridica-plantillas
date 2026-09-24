import { prisma } from '@/lib/prisma';
import { stripTransientAuditTrace } from './legalDocumentSanitizer';
import { buildReviewRequest } from './reviewRequest';
import { stampDocumentVersions, upgradeDocumentVersions } from './documentVersioning';
import type { UniversalLegalDocument } from './types';

export interface GenerationArtifactSnapshot {
  draftRecordId?: string;
  documentId: string;
  jobId: string | null;
  documentType: string;
  status: string;
  terminalStatus: string | null;
  progress: number;
  checkpointDocument: UniversalLegalDocument;
  sectionDrafts: UniversalLegalDocument['sections'];
  documentState: Record<string, unknown>;
  pendingItems: Array<Record<string, unknown>>;
  verificationState: Record<string, unknown>;
  qualityState: Record<string, unknown>;
  readinessState: Record<string, unknown>;
  warnings: string[];
  sourceMetadata: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotInput {
  document: UniversalLegalDocument;
  jobId?: string | null;
  progress?: number;
  terminalStatus?: string | null;
  warnings?: string[];
}

interface PersistedDraftRecord {
  id?: string;
  structuredDoc?: unknown;
  generationMetadata?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function buildGenerationArtifactSnapshot(input: SnapshotInput): GenerationArtifactSnapshot {
  const sanitizedDocument = stampDocumentVersions(
    stripTransientAuditTrace(input.document as any) as Record<string, unknown>,
  ) as unknown as UniversalLegalDocument;
  const document = {
    ...sanitizedDocument,
    generationMetadata: {
      ...sanitizedDocument.generationMetadata,
      reviewRequest: buildReviewRequest(sanitizedDocument),
    },
  } as UniversalLegalDocument;
  const validation = record(document.validation);
  const generationMetadata = record(document.generationMetadata);
  const qualityGate = record((document as UniversalLegalDocument & { qualityGate?: unknown }).qualityGate);
  const readiness = text(generationMetadata.readiness) || text(generationMetadata.documentReadiness);
  const now = new Date().toISOString();

  return {
    documentId: document.id,
    jobId: input.jobId || null,
    documentType: document.documentType,
    status: document.status,
    terminalStatus: input.terminalStatus || null,
    progress: Math.max(0, Math.min(100, Math.round(input.progress ?? 0))),
    checkpointDocument: document,
    sectionDrafts: document.sections || [],
    documentState: {
      status: document.status,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      pipelineState: generationMetadata.pipelineState || null,
    },
    pendingItems: Array.isArray(validation.errors) ? validation.errors.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [],
    verificationState: {
      validation: document.validation || null,
      verification: generationMetadata.verification || null,
    },
    qualityState: {
      qualityGate: qualityGate,
      qualityScore: generationMetadata.qualityScore || null,
      qualityMetrics: generationMetadata.qualityMetrics || null,
    },
    readinessState: {
      readiness,
      documentReadiness: generationMetadata.documentReadiness || null,
    },
    warnings: Array.from(new Set(input.warnings || [])),
    sourceMetadata: (document.sourceDocuments || []).map((source) => ({
      id: source.id,
      filename: source.filename || source.name || null,
      pageCount: source.pages?.length || 0,
      sourceValidated: source.sourceValidated === true,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function findPersistedArtifact<T extends PersistedDraftRecord>(records: T[], documentId: string): T | undefined {
  return records.find((recordItem) => {
    const structuredDoc = record(recordItem.structuredDoc);
    const metadata = record(recordItem.generationMetadata);
    const persistence = record(metadata.persistence);
    return structuredDoc.id === documentId || persistence.documentId === documentId;
  });
}

export function hydrateGenerationArtifact(recordItem: PersistedDraftRecord | undefined): UniversalLegalDocument | null {
  const metadata = record(recordItem?.generationMetadata);
  const persistence = record(metadata.persistence);
  const structuredDocument = record(recordItem?.structuredDoc);
  const document = Object.keys(structuredDocument).length > 0
    ? structuredDocument
    : record(persistence.checkpointDocument);
  if (typeof document.id !== 'string' || !document.id.trim()) return null;

  return {
    ...upgradeDocumentVersions(document),
    generationMetadata: {
      ...record(document.generationMetadata),
      persistence: Object.keys(persistence).length > 0 ? persistence : undefined,
    },
  } as unknown as UniversalLegalDocument;
}

function persistenceMetadata(snapshot: GenerationArtifactSnapshot): Record<string, unknown> {
  return {
    documentId: snapshot.documentId,
    jobId: snapshot.jobId,
    documentType: snapshot.documentType,
    status: snapshot.status,
    terminalStatus: snapshot.terminalStatus,
    progress: snapshot.progress,
    checkpointDocument: snapshot.checkpointDocument,
    sectionDrafts: snapshot.sectionDrafts,
    documentState: snapshot.documentState,
    pendingItems: snapshot.pendingItems,
    verificationState: snapshot.verificationState,
    qualityState: snapshot.qualityState,
    readinessState: snapshot.readinessState,
    warnings: snapshot.warnings,
    sourceMetadata: snapshot.sourceMetadata,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

export async function saveGenerationArtifact(input: {
  organizationId: string;
  userId: string;
  draftRecordId?: string | null;
  document: UniversalLegalDocument;
  jobId?: string | null;
  progress?: number;
  terminalStatus?: string | null;
  warnings?: string[];
}): Promise<GenerationArtifactSnapshot> {
  const snapshot = buildGenerationArtifactSnapshot(input);
  const existing = input.draftRecordId
    ? { id: input.draftRecordId }
    : findPersistedArtifact(await prisma.legalDraft.findMany({
      where: { organizationId: input.organizationId },
      select: { id: true, structuredDoc: true, generationMetadata: true },
    }), snapshot.documentId);
  const metadata = {
    ...record(snapshot.checkpointDocument.generationMetadata),
    persistence: persistenceMetadata(snapshot),
  };
  const structuredDoc = snapshot.checkpointDocument as any;

  if (existing?.id) {
    await prisma.legalDraft.update({
      where: { id: existing.id },
      data: {
        title: snapshot.checkpointDocument.title,
        matter: snapshot.checkpointDocument.matter || null,
        jurisdiction: snapshot.checkpointDocument.jurisdiction || null,
        structuredDoc,
        sourceDocuments: snapshot.checkpointDocument.sourceDocuments as any,
        pendingMarkers: snapshot.pendingItems as any,
        pipelineState: snapshot.documentState.pipelineState as any,
        validationResults: snapshot.verificationState.validation as any,
        generationMetadata: metadata as any,
        status: snapshot.status === 'final' ? 'READY_FOR_PROFESSIONAL_REVIEW' : 'DRAFT',
      },
    });
    snapshot.draftRecordId = existing.id;
  } else {
    const created = await prisma.legalDraft.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        title: snapshot.checkpointDocument.title,
        documentType: snapshot.documentType,
        matter: snapshot.checkpointDocument.matter || null,
        jurisdiction: snapshot.checkpointDocument.jurisdiction || null,
        formData: { generationArtifact: true, documentId: snapshot.documentId },
        renderedText: '',
        pendingMarkers: snapshot.pendingItems as any,
        pipelineState: snapshot.documentState.pipelineState as any,
        validationResults: snapshot.verificationState.validation as any,
        structuredDoc,
        sourceDocuments: snapshot.checkpointDocument.sourceDocuments as any,
        generationMetadata: metadata as any,
        status: snapshot.status === 'final' ? 'READY_FOR_PROFESSIONAL_REVIEW' : 'DRAFT',
      },
    });
    snapshot.draftRecordId = created.id;
  }

  return snapshot;
}

export async function loadGenerationArtifact(organizationId: string, userIdOrDocumentId: string, maybeDocumentId?: string): Promise<UniversalLegalDocument | null> {
  const userId = maybeDocumentId ? userIdOrDocumentId : undefined;
  const documentId = maybeDocumentId || userIdOrDocumentId;
  const records = await prisma.legalDraft.findMany({
    where: { organizationId, ...(userId ? { userId } : {}) },
    select: { structuredDoc: true, generationMetadata: true },
  });
  const match = findPersistedArtifact(records, documentId);
  return hydrateGenerationArtifact(match);
}
