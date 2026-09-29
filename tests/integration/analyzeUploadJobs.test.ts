import { describe, expect, it } from 'vitest';
import {
  cancelUploadAnalysisJob,
  completeUploadAnalysisJob,
  createUploadAnalysisJob,
  findActiveUploadAnalysisJob,
  getUploadAnalysisJob,
  updateUploadAnalysisJob,
} from '@/lib/upload-analysis/jobs';

describe('analyze-upload background jobs', () => {
  it('reports real monotonic page progress and refuses late updates after completion', () => {
    const job = createUploadAnalysisJob({ hash: 'hash-a', configKey: 'config-a', totalPages: 44 });
    updateUploadAnalysisJob(job.analysisJobId, { phase: 'OCR', processedPages: 12, ocrPages: 44, percentage: 27 });
    updateUploadAnalysisJob(job.analysisJobId, { phase: 'OCR', processedPages: 9, percentage: 20 });
    const completed = completeUploadAnalysisJob(job.analysisJobId, { sourceValidated: true }, { metrics: { ocrPages: 44 } });
    const late = updateUploadAnalysisJob(job.analysisJobId, { phase: 'OCR', processedPages: 20, percentage: 50 });

    expect(completed?.status).toBe('completed');
    expect(completed?.processedPages).toBe(44);
    expect(completed?.percentage).toBe(100);
    expect(late?.phase).toBe('LISTO');
    expect(late?.percentage).toBe(100);
  });

  it('reuses an active job for the same hash/configuration and isolates other documents', () => {
    const first = createUploadAnalysisJob({ hash: 'hash-b', configKey: 'config-b', totalPages: 2 });
    expect(findActiveUploadAnalysisJob('hash-b', 'config-b')?.analysisJobId).toBe(first.analysisJobId);
    expect(findActiveUploadAnalysisJob('hash-b', 'other-config')).toBeUndefined();
    expect(findActiveUploadAnalysisJob('other-hash', 'config-b')).toBeUndefined();
  });

  it('cancels a processing job and ignores a later completion', () => {
    const job = createUploadAnalysisJob({ hash: 'hash-c', configKey: 'config-c' });
    const cancelled = cancelUploadAnalysisJob(job.analysisJobId);
    const late = completeUploadAnalysisJob(job.analysisJobId, { sourceValidated: true });

    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelRequested).toBe(true);
    expect(late?.status).toBe('cancelled');
    expect(getUploadAnalysisJob(job.analysisJobId)?.result).toBeNull();
  });
});
