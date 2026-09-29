import { randomUUID } from 'node:crypto';
import type { UploadAnalysisJob, UploadAnalysisPhase } from './types';

const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 100;
const globalForUploadAnalysis = globalThis as unknown as { __LEX_UPLOAD_ANALYSIS_JOBS__?: Map<string, UploadAnalysisJob> };
if (!globalForUploadAnalysis.__LEX_UPLOAD_ANALYSIS_JOBS__) globalForUploadAnalysis.__LEX_UPLOAD_ANALYSIS_JOBS__ = new Map();
const JOBS = globalForUploadAnalysis.__LEX_UPLOAD_ANALYSIS_JOBS__;

function cleanupJobs(): void {
  const now = Date.now();
  for (const [id, job] of JOBS.entries()) {
    if (now - Date.parse(job.updatedAt) > JOB_TTL_MS) JOBS.delete(id);
  }
  if (JOBS.size > MAX_JOBS) {
    const oldest = Array.from(JOBS.values()).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    oldest.slice(0, JOBS.size - MAX_JOBS).forEach((job) => JOBS.delete(job.analysisJobId));
  }
}

export function createUploadAnalysisJob(input: { hash: string; configKey: string; totalPages?: number; cacheHit?: boolean; ownerKey?: string }): UploadAnalysisJob {
  cleanupJobs();
  const now = new Date().toISOString();
  const job: UploadAnalysisJob = {
    analysisJobId: randomUUID(),
    ownerKey: input.ownerKey || 'unknown',
    hash: input.hash,
    configKey: input.configKey,
    status: 'processing',
    phase: 'RECIBIDO',
    processedPages: 0,
    totalPages: input.totalPages || 0,
    ocrPages: 0,
    percentage: 0,
    warningsCount: 0,
    cacheHit: input.cacheHit === true,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    cancelRequested: false,
    metrics: null,
  };
  JOBS.set(job.analysisJobId, job);
  return job;
}

export function getUploadAnalysisJob(analysisJobId: string): UploadAnalysisJob | undefined {
  cleanupJobs();
  return JOBS.get(analysisJobId);
}

export function findActiveUploadAnalysisJob(hash: string, configKey: string, ownerKey?: string): UploadAnalysisJob | undefined {
  cleanupJobs();
  return Array.from(JOBS.values()).find((job) => job.hash === hash && job.configKey === configKey && job.status === 'processing' && (!ownerKey || job.ownerKey === ownerKey));
}

export function updateUploadAnalysisJob(
  analysisJobId: string,
  patch: Partial<Pick<UploadAnalysisJob, 'phase' | 'processedPages' | 'totalPages' | 'ocrPages' | 'percentage' | 'warningsCount' | 'metrics'>>,
): UploadAnalysisJob | undefined {
  const job = JOBS.get(analysisJobId);
  if (!job || job.status !== 'processing') return job;
  if (patch.phase !== undefined) job.phase = patch.phase;
  if (patch.totalPages !== undefined) job.totalPages = Math.max(0, Math.floor(patch.totalPages));
  if (patch.processedPages !== undefined) job.processedPages = Math.max(job.processedPages, Math.floor(patch.processedPages));
  if (patch.ocrPages !== undefined) job.ocrPages = Math.max(0, Math.floor(patch.ocrPages));
  if (patch.percentage !== undefined) job.percentage = Math.max(job.percentage, Math.min(99, Math.floor(patch.percentage)));
  if (patch.warningsCount !== undefined) job.warningsCount = Math.max(0, Math.floor(patch.warningsCount));
  if (patch.metrics !== undefined) job.metrics = patch.metrics;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function completeUploadAnalysisJob(
  analysisJobId: string,
  result: unknown,
  options?: { phase?: Extract<UploadAnalysisPhase, 'LISTO' | 'REQUIERE_ATENCION'>; warningsCount?: number; metrics?: Record<string, unknown> | null },
): UploadAnalysisJob | undefined {
  const job = JOBS.get(analysisJobId);
  if (!job || job.status !== 'processing') return job;
  job.status = 'completed';
  job.phase = options?.phase || 'LISTO';
  job.percentage = 100;
  job.processedPages = Math.max(job.processedPages, job.totalPages);
  job.warningsCount = options?.warningsCount ?? job.warningsCount;
  job.metrics = options?.metrics ?? job.metrics;
  job.result = result;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function failUploadAnalysisJob(analysisJobId: string, error: string): UploadAnalysisJob | undefined {
  const job = JOBS.get(analysisJobId);
  if (!job || job.status !== 'processing') return job;
  job.status = 'failed';
  job.phase = 'ERROR';
  job.percentage = 100;
  job.error = error;
  job.updatedAt = new Date().toISOString();
  return job;
}

export function cancelUploadAnalysisJob(analysisJobId: string): UploadAnalysisJob | undefined {
  const job = JOBS.get(analysisJobId);
  if (!job || job.status !== 'processing') return job;
  job.status = 'cancelled';
  job.phase = 'REQUIERE_ATENCION';
  job.cancelRequested = true;
  job.error = 'El análisis fue cancelado.';
  job.updatedAt = new Date().toISOString();
  return job;
}

export function isUploadAnalysisJobActive(analysisJobId: string): boolean {
  return JOBS.get(analysisJobId)?.status === 'processing';
}
