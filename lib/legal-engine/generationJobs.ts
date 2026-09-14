/**
 * generationJobs.ts — JobStore asíncrono para generación por bloques
 *
 * Mantiene estado real de progreso X/Y por job.
 * Almacenamiento in-memory (suficiente para single-node; se limpia por TTL).
 * No requiere DB nueva. La barra representa trabajo REAL del servidor.
 */

import type { UniversalLegalDocument } from './types';

type CompletionDocument = UniversalLegalDocument & {
  documentAssemblyResult?: { readiness?: string };
  generationMetadata: UniversalLegalDocument['generationMetadata'] & { readiness?: string };
};

export type GenerationJobStatus = 'processing' | 'completed' | 'failed' | 'cancelled';

export interface GenerationJob {
  jobId: string;
  status: GenerationJobStatus;
  total: number;            // total bloques jurídicos
  completed: number;        // bloques terminados (preservados + IA con éxito/fallback)
  percentage: number;       // Math.round(completed/total*100)
  currentBlock: string | null;
  currentBlockIndex: number | null; // 1-based
  aiProvider: string | null; // último bloque
  stage: string;            // fase legible: Preparando, Analizando, Generando, Validando
  error: string | null;
  errorCode: string | null;
  errorMetadata: Record<string, unknown> | null;
  document: UniversalLegalDocument | null;
  documentId: string | null;
  documentReadiness: string | null;
  redirectUrl: string | null; // futura ruta si aplica
  fingerprint: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: number;
  log: string[];
}

const JOB_TTL_MS = 30 * 60 * 1000; // 30 min retención
const MAX_JOBS = 300;

// Robustez ante HMR/reload: Map global (no se pierde en hot-reload de Next.js dev)
// Si Redis estuviera disponible se usaría Redis; como no hay dependencia redis en package.json,
// se usa globalThis que es la infraestructura compartida YA EXISTENTE más robusta que Map local.
// No se agrega DB nueva ni se cambia pipeline/bloques.
const globalForJobs = globalThis as unknown as { __JR_JOBS_MAP__?: Map<string, GenerationJob> };
if (!globalForJobs.__JR_JOBS_MAP__) globalForJobs.__JR_JOBS_MAP__ = new Map<string, GenerationJob>();
const JOBS = globalForJobs.__JR_JOBS_MAP__;

function cleanup(): void {
  const now = Date.now();
  for (const [id, j] of JOBS.entries()) {
    // TTL sobre la ÚLTIMA ACTIVIDAD (updatedAt), no sobre startedAt:
    // un job processing con bloques lentos sigue actualizando updatedAt y NO se purga a mitad de ejecución.
    const lastActivity = Date.parse(j.updatedAt) || j.startedAt;
    if (now - lastActivity > JOB_TTL_MS) JOBS.delete(id);
  }
  if (JOBS.size > MAX_JOBS) {
    const sorted = Array.from(JOBS.entries()).sort((a,b)=>a[1].startedAt - b[1].startedAt);
    for (let i=0;i<sorted.length-MAX_JOBS;i++) JOBS.delete(sorted[i][0]);
  }
}

import { randomUUID as nodeRandomUUID } from 'crypto';
function genId(): string {
  try { return (globalThis as any).crypto?.randomUUID?.() || nodeRandomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
}
export function createGenerationJob(input: { fingerprint?: string | null; idempotencyKey?: string | null; total?: number; stage?: string }): GenerationJob {
  cleanup();
  const jobId = genId();
  const now = Date.now();
  const total = input.total ?? 0;
  const job: GenerationJob = {
    jobId,
    status: 'processing',
    total,
    completed: 0,
    percentage: 0,
    currentBlock: null,
    currentBlockIndex: null,
    aiProvider: null,
    stage: input.stage || 'Preparando documento…',
    error: null,
    errorCode: null,
    errorMetadata: null,
    document: null,
    documentId: null,
    documentReadiness: null,
    redirectUrl: null,
    fingerprint: input.fingerprint || null,
    idempotencyKey: input.idempotencyKey || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: now,
    log: [`[pipeline:job] Job ${jobId} creado`],
  };
  JOBS.set(jobId, job);
  return job;
}

export function getGenerationJob(jobId: string): GenerationJob | undefined {
  cleanup();
  return JOBS.get(jobId);
}

export function findActiveJobByFingerprint(fingerprint: string | null, idempotencyKey: string | null): GenerationJob | undefined {
  cleanup();
  for (const j of JOBS.values()) {
    if (j.status !== 'processing') continue;
    if (idempotencyKey && j.idempotencyKey === idempotencyKey) return j;
    if (fingerprint && j.fingerprint === fingerprint) return j;
  }
  return undefined;
}

export function updateJobProgress(jobId: string, patch: Partial<Pick<GenerationJob,'total'|'completed'|'currentBlock'|'currentBlockIndex'|'aiProvider'|'stage'|'percentage'>> & { logLine?: string }): GenerationJob | undefined {
  const job = JOBS.get(jobId);
  if (!job) return undefined;
  // Un job terminal no puede volver a processing ni recibir callbacks tardíos.
  // Esto evita que una carrera entre cancelación/fallo y el pipeline reabra la UI.
  if (job.status !== 'processing') return job;
  if (patch.total !== undefined) job.total = Math.max(0, Math.floor(patch.total));
  if (job.total > 0) job.completed = Math.min(job.completed, job.total);
  if (patch.completed !== undefined) {
    const requestedCompleted = Math.max(0, Math.floor(patch.completed));
    job.completed = Math.max(job.completed, requestedCompleted);
    if (job.total > 0) job.completed = Math.min(job.completed, job.total);
  }
  if (patch.currentBlock !== undefined) job.currentBlock = patch.currentBlock;
  if (patch.currentBlockIndex === null) {
    job.currentBlockIndex = null;
  } else if (typeof patch.currentBlockIndex === 'number') {
    const requestedIndex = Math.max(0, Math.floor(patch.currentBlockIndex));
    const monotonicIndex = Math.max(job.currentBlockIndex || 0, requestedIndex);
    job.currentBlockIndex = job.total > 0 ? Math.min(monotonicIndex, job.total) : monotonicIndex;
  }
  if (patch.aiProvider !== undefined) job.aiProvider = patch.aiProvider;
  if (patch.stage !== undefined) job.stage = patch.stage;
  // recalcular porcentaje por trabajo REAL (completed/total)
  if (job.total > 0) job.percentage = Math.min(100, Math.round((job.completed / job.total) * 100));
  else job.percentage = 0;
  if (patch.logLine) job.log.push(patch.logLine);
  job.updatedAt = new Date().toISOString();
  return job;
}

export function completeJob(
  jobId: string,
  doc: UniversalLegalDocument,
  options?: { documentReadiness?: string },
): GenerationJob | undefined {
  const job = JOBS.get(jobId);
  if (!job) return undefined;
  if (job.status !== 'processing') return job;

  const completionDoc = doc as CompletionDocument;
  const derivedReadiness = options?.documentReadiness
    || completionDoc.documentAssemblyResult?.readiness
    || completionDoc.generationMetadata?.readiness
    || (doc.status === 'draft' || !doc.generationMetadata?.pipelineState?.isComplete ? 'REQUIRES_REVIEW' : 'READY');

  job.status = 'completed';
  job.document = doc;
  job.documentId = doc.id;
  job.documentReadiness = derivedReadiness;
  job.redirectUrl = null; // el editor reutiliza doc.id en memoria; no hay ruta nueva
  job.completed = job.total > 0 ? job.total : job.completed;
  job.percentage = 100;

  if (derivedReadiness === 'READY') {
    job.stage = 'Documento generado y listo para revisión final';
  } else if (derivedReadiness === 'BLOCKED' || derivedReadiness === 'INVALID') {
    job.stage = 'Documento generado con bloqueos estructurales (requiere subsanación)';
  } else {
    job.stage = 'Documento generado en borrador (requiere revisión del abogado)';
  }

  job.updatedAt = new Date().toISOString();
  job.log.push(`[pipeline:job] ${job.completed}/${job.total} completado (readiness: ${derivedReadiness})`);
  job.log.push(`[pipeline:job] Documento generado: ${doc.id}`);
  return job;
}

export function failJob(
  jobId: string,
  error: string,
  errorCode?: string,
  errorMetadata?: Record<string, unknown>,
): GenerationJob | undefined {
  const job = JOBS.get(jobId);
  if (!job) return undefined;
  if (job.status !== 'processing') return job;
  job.status = 'failed';
  job.error = error;
  job.errorCode = errorCode || null;
  job.errorMetadata = errorMetadata || null;
  job.stage = 'Error';
  job.updatedAt = new Date().toISOString();
  job.log.push(`[pipeline:job] Fallido: ${error}`);
  return job;
}

export function cancelJob(jobId: string): GenerationJob | undefined {
  const job = JOBS.get(jobId);
  if (!job) return undefined;
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return job;
  job.status = 'cancelled';
  job.stage = 'Cancelado por el usuario';
  job.error = 'CANCELLED';
  job.updatedAt = new Date().toISOString();
  job.log.push(`[pipeline:job] Cancelado`);
  return job;
}

export function getAllJobs(): GenerationJob[] {
  cleanup();
  return Array.from(JOBS.values()).sort((a,b)=>b.startedAt - a.startedAt);
}
