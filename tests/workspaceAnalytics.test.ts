import { describe, expect, it } from 'vitest';
import { buildAnalyticsDataset, type AnalyticsDraftProjection, type AnalyticsJobProjection } from '@/lib/workspace/analytics';

const now = new Date('2026-09-24T12:00:00.000Z');

function draft(input: Partial<AnalyticsDraftProjection> & Pick<AnalyticsDraftProjection, 'id'>): AnalyticsDraftProjection {
  return {
    id: input.id,
    documentType: input.documentType || 'apelacion_civil',
    matter: input.matter || 'Civil',
    status: input.status || 'DRAFT',
    createdAt: input.createdAt || '2026-09-23T12:00:00.000Z',
    updatedAt: input.updatedAt || input.createdAt || '2026-09-23T12:00:00.000Z',
    validationResults: input.validationResults || { isValid: true, errors: [], warnings: [] },
    generationMetadata: input.generationMetadata || {},
    structuredDoc: input.structuredDoc,
    sourceDocuments: input.sourceDocuments,
  };
}

function job(input: Partial<AnalyticsJobProjection> & Pick<AnalyticsJobProjection, 'id'>): AnalyticsJobProjection {
  return {
    id: input.id,
    documentId: input.documentId || null,
    status: input.status || 'completed',
    terminalStatus: input.terminalStatus || 'COMPLETED',
    errorCode: input.errorCode || null,
    warnings: input.warnings || [],
    createdAt: input.createdAt || '2026-09-23T12:00:00.000Z',
    updatedAt: input.updatedAt || input.createdAt || '2026-09-23T12:00:00.000Z',
    startedAt: input.startedAt || '2026-09-23T11:59:00.000Z',
  };
}

describe('workspace analytics aggregation', () => {
  it('deduplicates a LegalDraft and its GenerationJob into one generation', () => {
    const result = buildAnalyticsDataset({
      now,
      rangeDays: 30,
      drafts: [draft({ id: 'doc-1', generationMetadata: { persistence: { jobId: 'job-1', terminalStatus: 'COMPLETED' } } })],
      jobs: [job({ id: 'job-1', documentId: 'doc-1' })],
    });

    expect(result.totals.total).toBe(1);
    expect(result.totals.completed).toBe(1);
  });

  it('keeps NEEDS_REVIEW separate from FAILED and derives unmet extension safely', () => {
    const result = buildAnalyticsDataset({
      now,
      rangeDays: 30,
      drafts: [draft({
        id: 'doc-review',
        generationMetadata: {
          persistence: { jobId: 'job-review', terminalStatus: 'NEEDS_REVIEW' },
          generationExtension: { targetPages: 40, minPages: 40, maxPages: 44, actualPages: 27, extensionTargetUnmet: true },
        },
      })],
      jobs: [
        job({ id: 'job-review', documentId: 'doc-review', terminalStatus: 'NEEDS_REVIEW' }),
        job({ id: 'job-failed', terminalStatus: 'FAILED', status: 'failed', errorCode: 'PROVIDER_TIMEOUT' }),
      ],
    });

    expect(result.totals.total).toBe(2);
    expect(result.totals.needsReview).toBe(1);
    expect(result.totals.failed).toBe(1);
    expect(result.extension.unmet).toBe(1);
    expect(result.recent[0]).toMatchObject({ status: 'NEEDS_REVIEW', targetPages: 40, actualPages: 27, extensionTargetUnmet: true });
  });

  it('applies the selected period and never returns sensitive document content', () => {
    const result = buildAnalyticsDataset({
      now,
      rangeDays: 7,
      drafts: [
        draft({ id: 'inside', createdAt: '2026-09-23T12:00:00.000Z', title: 'should not be exposed' } as AnalyticsDraftProjection & { title?: string }),
        draft({ id: 'outside', createdAt: '2026-09-01T12:00:00.000Z' }),
      ],
      jobs: [],
    });

    expect(result.totals.total).toBe(1);
    expect(JSON.stringify(result)).not.toContain('should not be exposed');
    expect(JSON.stringify(result)).not.toMatch(/prompt|ocr completo|nombre de partes/i);
  });
});
