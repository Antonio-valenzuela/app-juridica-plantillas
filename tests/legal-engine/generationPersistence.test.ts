import { describe, expect, it } from 'vitest';
import { buildGenerationArtifactSnapshot, findPersistedArtifact, hydrateGenerationArtifact } from '@/lib/legal-engine/generationPersistence';

const document = {
  id: 'doc-persisted-1',
  title: 'Recurso de apelación civil',
  documentType: 'apelacion_civil',
  status: 'draft',
  matter: 'Civil',
  jurisdiction: 'federal',
  sections: [{ id: 'section-1', title: 'PROEMIO', content: [] }],
  sourceDocuments: [{ id: 'source-1', filename: 'fuente.pdf', pages: [{ page: 4, text: 'fecha', chars: 5 }] }],
  validation: { isValid: false, errors: [{ checkId: 'pending', message: 'Revisión humana' }], warnings: [] },
  generationMetadata: { pipelineState: { isComplete: false, hasErrors: true } },
} as any;

describe('generation persistence', () => {
  it('builds a durable snapshot without changing the document identity', () => {
    const snapshot = buildGenerationArtifactSnapshot({
      document,
      jobId: 'job-1',
      progress: 100,
      terminalStatus: 'NEEDS_REVIEW',
      warnings: ['DOCUMENT_REQUIRES_REVIEW'],
    });

    expect(snapshot).toMatchObject({
      documentId: 'doc-persisted-1',
      jobId: 'job-1',
      terminalStatus: 'NEEDS_REVIEW',
      progress: 100,
      pendingItems: [{ checkId: 'pending', message: 'Revisión humana' }],
      sourceMetadata: [{ id: 'source-1', filename: 'fuente.pdf' }],
    });
    expect(snapshot.checkpointDocument.id).toBe(document.id);
    expect((snapshot.checkpointDocument.generationMetadata as any).reviewRequest).toMatchObject({
      documentId: 'doc-persisted-1',
      pendingItems: [],
    });
  });

  it('finds an artifact by documentId after the in-memory job is gone', () => {
    const records = [
      { structuredDoc: { id: 'other' }, generationMetadata: null },
      { structuredDoc: { id: 'doc-persisted-1' }, generationMetadata: { persistence: { documentId: 'doc-persisted-1' } } },
    ];

    expect(findPersistedArtifact(records, 'doc-persisted-1')).toBe(records[1]);
  });

  it('rehydrates the persisted lifecycle snapshot without changing document identity', () => {
    const hydrated = hydrateGenerationArtifact({
      structuredDoc: document,
      generationMetadata: {
        persistence: {
          documentId: 'doc-persisted-1',
          terminalStatus: 'NEEDS_REVIEW',
          progress: 100,
          pendingItems: [{ checkId: 'pending' }],
        },
      },
    });

    expect(hydrated?.id).toBe('doc-persisted-1');
    expect((hydrated?.generationMetadata as any).persistence).toMatchObject({
      documentId: 'doc-persisted-1',
      terminalStatus: 'NEEDS_REVIEW',
      progress: 100,
    });
  });
});
