import { describe, expect, it } from 'vitest';
import {
  buildContestacionesWorkflowPayload,
  compactSourceDocumentsForGeneration,
} from '@/lib/legal-engine/generationRequest';
import {
  createUploadCacheKey,
  getCachedUploadAnalysis,
  rememberUploadAnalysis,
} from '@/lib/uploadAnalysisCache';

describe('regresión de runtime en Contestaciones', () => {
  it('compacta fuentes sin duplicar content/fileUrl y no duplica el análisis en workflow', () => {
    const source = {
      id: 'source-1',
      filename: 'expediente.pdf',
      fileUrl: 'blob:local-file',
      content: 'texto duplicado que no debe viajar',
      extractedText: 'texto fuente canónico',
      pages: [{ page: 1, text: 'texto fuente canónico', chars: 21 }],
      sourceValidated: true,
    } as any;

    const compact = compactSourceDocumentsForGeneration([source]);
    const workflow = buildContestacionesWorkflowPayload({
      mode: 'automatic',
    }, '2026-09-24T00:00:00.000Z');

    expect(compact[0]).toMatchObject({ id: 'source-1', pages: source.pages });
    expect(compact[0]).not.toHaveProperty('extractedText');
    expect(compact[0]).not.toHaveProperty('content');
    expect(compact[0]).not.toHaveProperty('fileUrl');
    expect(workflow).toEqual({
      flow: 'DOCUMENT_ANALYSIS',
      selection: { mode: 'automatic' },
      updatedAt: '2026-09-24T00:00:00.000Z',
    });
    expect(workflow).not.toHaveProperty('sourceDocuments');
    expect(workflow).not.toHaveProperty('analysis');
  });

  it('reutiliza el análisis del mismo archivo y evita una segunda extracción OCR', () => {
    const cache = new Map<string, { ok: true; extractedText: string }>();
    const file = { name: 'expediente.pdf', size: 3_999_739, lastModified: 1727100000000 };
    const response = { ok: true as const, extractedText: 'resultado OCR' };

    expect(getCachedUploadAnalysis(cache, file)).toBeUndefined();
    rememberUploadAnalysis(cache, file, response);
    expect(getCachedUploadAnalysis(cache, file)).toBe(response);
    expect(createUploadCacheKey(file)).toBe(createUploadCacheKey({ ...file }));
  });
});
