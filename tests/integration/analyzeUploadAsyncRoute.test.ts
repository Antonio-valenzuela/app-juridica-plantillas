import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

vi.mock('@/lib/security/lawyerAuth', () => ({
  requireLawyerAccess: vi.fn(async () => ({
    ok: true,
    context: { organizationId: 'org-test', userId: 'user-test', lawyerId: 'user-test', role: 'lawyer' },
  })),
}));

vi.mock('@/lib/security/uploadValidation', () => ({
  validateUploadBuffer: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/upload-analysis/analyze', () => ({
  analyzeUploadedDocument: vi.fn(async (input: any) => {
    input.onProgress?.({ phase: 'NATIVE_EXTRACTION', processedPages: 1, totalPages: 2, ocrPages: 0, percentage: 10 });
    input.onProgress?.({ phase: 'OCR', processedPages: 2, totalPages: 2, ocrPages: 2, percentage: 80 });
    return {
      ok: true,
      lifecycle: { entityKind: 'SOURCE_DOCUMENT', originClass: 'user', creationIntent: 'SOURCE_DOCUMENT' },
      extractedText: 'Texto extraído de prueba',
      needsOcr: true,
      sourceFileName: input.fileName,
      mimeType: input.mimeType,
      sourceValidated: true,
      sourceQualityStatus: 'READY',
      sourceValidationMethod: 'ocr',
      ocrProvider: 'tesseract',
      ocrStatus: 'OCR_COMPLETED',
      qualityScore: { confidence: 90, qualityLabel: 'Alta', pageCount: 2, textLength: 24, avgCharsPerPage: 12, status: 'READY', ocrUsed: true, emptyPages: 0 },
      sourceQuality: { pageCount: 2, characterCount: 24, charactersPerPage: 12, emptyPageRatio: 0, extractionMethod: 'ocr', ocrUsed: true, confidence: 90 },
      extractionSteps: [],
      pages: [{ page: 1, text: 'uno', chars: 3 }, { page: 2, text: 'dos', chars: 3 }],
      classification: { es_juridico: true, tipo_documento: 'Documento jurídico', confianza: 90, razon: 'test', secciones_detectadas: [] },
      analysis: { facts: [], missingData: [] },
      templateAnalysis: {},
      generationEligibility: 'eligible',
      structureJson: null,
      warnings: [],
      pipelineStatus: 'READY',
      analysisMetrics: { documentAnalysisDurationMs: 5, nativeExtractionDurationMs: 1, ocrPreparationDurationMs: 1, ocrDurationMs: 2, ocrPages: 2, totalPages: 2, cacheHit: false, extractionStatus: 'READY', concurrency: 2 },
    };
  }),
}));

import { POST } from '@/app/api/templates/analyze-upload/route';
import { GET } from '@/app/api/templates/analyze-upload/status/route';

describe('analyze-upload asynchronous route', () => {
  let cacheDir = '';

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'lex-upload-route-'));
    process.env.UPLOAD_ANALYSIS_CACHE_DIR = cacheDir;
  });

  afterEach(async () => {
    delete process.env.UPLOAD_ANALYSIS_CACHE_DIR;
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('returns immediately with a job and exposes real page progress/result', async () => {
    const form = new FormData();
    form.append('file', new File(['pdf-test-content'], 'apelacion.pdf', { type: 'application/pdf' }));
    const response = await POST(new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: form, headers: { 'x-analysis-mode': 'async' } }));
    expect(response.status).toBe(202);
    const accepted = await response.json();
    expect(accepted.analysisJobId).toBeTruthy();

    await new Promise((resolve) => setTimeout(resolve, 20));
    const status = await GET(new NextRequest(`http://localhost/api/templates/analyze-upload/status?jobId=${accepted.analysisJobId}`));
    const payload = await status.json();
    expect(status.status).toBe(200);
    expect(payload.status).toBe('completed');
    expect(payload.totalPages).toBe(2);
    expect(payload.ocrPages).toBe(2);
    expect(payload.result.sourceValidated).toBe(true);
  });

  it('deduplicates an active upload by hash and configuration', async () => {
    const formA = new FormData();
    formA.append('file', new File(['same-pdf'], 'uno.pdf', { type: 'application/pdf' }));
    const formB = new FormData();
    formB.append('file', new File(['same-pdf'], 'dos.pdf', { type: 'application/pdf' }));
    const [first, second] = await Promise.all([
      POST(new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: formA, headers: { 'x-analysis-mode': 'async' } })),
      POST(new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: formB, headers: { 'x-analysis-mode': 'async' } })),
    ]);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(secondBody.analysisJobId).toBe(firstBody.analysisJobId);
  });
});
