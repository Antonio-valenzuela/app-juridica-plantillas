import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { validateUploadBuffer } from '@/lib/security/uploadValidation';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { analyzeUploadedDocument, type AnalyzeResult } from '@/lib/upload-analysis/analyze';
import { buildUploadAnalysisCacheConfig, getUploadAnalysisCacheKey, readUploadAnalysisCache, sha256Buffer, writeUploadAnalysisCache } from '@/lib/upload-analysis/cache';
import {
  completeUploadAnalysisJob,
  createUploadAnalysisJob,
  findActiveUploadAnalysisJob,
  failUploadAnalysisJob,
  isUploadAnalysisJobActive,
  updateUploadAnalysisJob,
} from '@/lib/upload-analysis/jobs';
import type { UploadAnalysisPhase } from '@/lib/upload-analysis/types';

export type { AnalyzeResult } from '@/lib/upload-analysis/analyze';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = Number(process.env.UPLOAD_MAX_PAGES) || 100;

function ownerKey(context: { organizationId: string; userId: string }): string {
  return `${context.organizationId}:${context.userId}`;
}

function mapProgressPhase(phase: string): UploadAnalysisPhase {
  switch (phase) {
    case 'NATIVE_EXTRACTION': return 'EXTRAYENDO_TEXTO';
    case 'OCR': return 'OCR';
    case 'NORMALIZATION': return 'ANALIZANDO';
    case 'QUALITY_VALIDATION': return 'VALIDANDO';
    default: return 'RECIBIDO';
  }
}

function jsonError(message: string, status: number, errorCode?: string) {
  return NextResponse.json({ ok: false, ...(errorCode ? { errorCode } : {}), error: message, message }, { status });
}

type ValidatedUpload = { file: File; fileName: string; mimeType: string; ext: string; buffer: Buffer };
type UploadReadResult = { error: Response } | ValidatedUpload;

async function readAndValidateUpload(request: NextRequest): Promise<UploadReadResult> {
  const formData = await request.formData();
  if (formData.getAll('file').length > 1) return { error: jsonError('Solo se permite un archivo por solicitud.', 413, 'TOO_MANY_FILES') } as const;
  const file = formData.get('file') as File | null;
  if (!file) return { error: jsonError('No se recibió ningún archivo.', 400) } as const;
  if (file.size > MAX_FILE_SIZE_BYTES) return { error: jsonError('El archivo excede el tamaño máximo permitido de 15 MB.', 413) } as const;

  const fileName = file.name || 'archivo';
  const mimeType = file.type || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const supportedExts = ['pdf', 'docx', 'doc', 'txt', 'rtf', 'jpg', 'jpeg', 'png'];
  if (!supportedExts.includes(ext) && !mimeType.startsWith('image/') && !mimeType.includes('pdf')) {
    return { error: NextResponse.json({ ok: false, errorCode: 'UNSUPPORTED_FORMAT', error: `Formato no soportado: .${ext}. Los formatos aceptados son: .pdf, .docx, .doc, .rtf, .jpg, .jpeg, .png`, unsupported: true }, { status: 415 }) } as const;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadValidation = validateUploadBuffer({ buffer, fileName, mimeType, maxImagePixels: Number(process.env.UPLOAD_MAX_IMAGE_PIXELS) || 40_000_000 });
  if (!uploadValidation.ok) {
    const status = uploadValidation.errorCode === 'UPLOAD_IMAGE_TOO_LARGE' ? 413 : 400;
    return { error: jsonError(uploadValidation.message, status, uploadValidation.errorCode) } as const;
  }
  return { file, fileName, mimeType, ext, buffer } as const;
}

function responseFromCachedResult(value: AnalyzeResult, fileName: string, mimeType: string): AnalyzeResult {
  return {
    ...value,
    sourceFileName: fileName,
    mimeType,
    analysisMetrics: { ...value.analysisMetrics, documentAnalysisDurationMs: 0, cacheHit: true },
  };
}

async function runBackgroundAnalysis(input: {
  analysisJobId: string;
  config: ReturnType<typeof buildUploadAnalysisCacheConfig>;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  try {
    const result = await analyzeUploadedDocument({
      buffer: input.buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      onProgress: (progress) => {
        if (!isUploadAnalysisJobActive(input.analysisJobId)) return;
        updateUploadAnalysisJob(input.analysisJobId, {
          phase: mapProgressPhase(progress.phase),
          processedPages: progress.processedPages,
          totalPages: progress.totalPages,
          ocrPages: progress.ocrPages,
          percentage: progress.percentage,
        });
      },
    });
    if (!isUploadAnalysisJobActive(input.analysisJobId)) return;
    if (result.pages.length > MAX_PAGES) {
      failUploadAnalysisJob(input.analysisJobId, `El documento excede el máximo permitido de ${MAX_PAGES} páginas.`);
      return;
    }
    await writeUploadAnalysisCache(input.buffer, input.config, result);
    if (!isUploadAnalysisJobActive(input.analysisJobId)) return;
    completeUploadAnalysisJob(input.analysisJobId, result, {
      phase: result.sourceValidated && result.pipelineStatus === 'READY' ? 'LISTO' : 'REQUIERE_ATENCION',
      warningsCount: result.warnings.length,
      metrics: result.analysisMetrics,
    });
  } catch (error: any) {
    if (!isUploadAnalysisJobActive(input.analysisJobId)) return;
    failUploadAnalysisJob(input.analysisJobId, error?.message || 'No fue posible procesar el archivo.');
  }
}

async function processSyncUpload(buffer: Buffer, fileName: string, mimeType: string, config: ReturnType<typeof buildUploadAnalysisCacheConfig>): Promise<AnalyzeResult> {
  const cached = await readUploadAnalysisCache<AnalyzeResult>(buffer, config);
  if (cached.cacheHit && cached.value) return responseFromCachedResult(cached.value, fileName, mimeType);
  const result = await analyzeUploadedDocument({ buffer, fileName, mimeType });
  if (result.pages.length > MAX_PAGES) throw Object.assign(new Error(`El documento excede el máximo permitido de ${MAX_PAGES} páginas.`), { statusCode: 413, errorCode: 'UPLOAD_TOO_MANY_PAGES' });
  await writeUploadAnalysisCache(buffer, config, result);
  return result;
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  const access = await requireLawyerAccess(request);
  if (!access.ok) return access.response;
  const rateLimit = checkRequestRateLimit(request, 'upload', 10, ownerKey(access.context));
  if (!rateLimit.ok) {
    return new Response(JSON.stringify({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas cargas. Intenta de nuevo más tarde.' }), { status: 429, headers: { 'Content-Type': 'application/json', ...rateLimit.headers } });
  }

  try {
    const upload = await readAndValidateUpload(request);
    if ('error' in upload) return upload.error;
    const config = buildUploadAnalysisCacheConfig();
    const hash = await sha256Buffer(upload.buffer);
    const configKey = getUploadAnalysisCacheKey(hash, config);
    const cached = await readUploadAnalysisCache<AnalyzeResult>(upload.buffer, config);
    const requestedAsync = request.headers.get('x-analysis-mode') === 'async';

    if (requestedAsync) {
      if (cached.cacheHit && cached.value) {
        const job = createUploadAnalysisJob({ hash, configKey, totalPages: cached.value.pages.length, cacheHit: true, ownerKey: ownerKey(access.context) });
        const result = responseFromCachedResult(cached.value, upload.fileName, upload.mimeType);
        completeUploadAnalysisJob(job.analysisJobId, result, { phase: result.sourceValidated ? 'LISTO' : 'REQUIERE_ATENCION', warningsCount: result.warnings.length, metrics: result.analysisMetrics });
        return NextResponse.json({ ok: true, analysisJobId: job.analysisJobId, status: 'completed', cacheHit: true, result });
      }
      const existing = findActiveUploadAnalysisJob(hash, configKey, ownerKey(access.context));
      if (existing) return NextResponse.json({ ok: true, analysisJobId: existing.analysisJobId, status: existing.status, cacheHit: false }, { status: 202 });
      const job = createUploadAnalysisJob({ hash, configKey, cacheHit: false, ownerKey: ownerKey(access.context) });
      void runBackgroundAnalysis({ analysisJobId: job.analysisJobId, config, buffer: upload.buffer, fileName: upload.fileName, mimeType: upload.mimeType });
      return NextResponse.json({ ok: true, analysisJobId: job.analysisJobId, status: 'processing', cacheHit: false }, { status: 202 });
    }

    const result = cached.cacheHit && cached.value
      ? responseFromCachedResult(cached.value, upload.fileName, upload.mimeType)
      : await processSyncUpload(upload.buffer, upload.fileName, upload.mimeType, config);
    if (result.pages.length > MAX_PAGES) return jsonError(`El documento excede el máximo permitido de ${MAX_PAGES} páginas.`, 413, 'UPLOAD_TOO_MANY_PAGES');
    return NextResponse.json(result);
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    return apiErrorResponse({ requestId, status, errorCode: err?.errorCode || 'UPLOAD_PROCESSING_FAILED', message: status === 413 ? err.message : 'No fue posible procesar el archivo.', internalError: err });
  }
}
