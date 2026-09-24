import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { requireLawyerAccess, extractDocument, parseDocumentWithNemotron } = vi.hoisted(() => ({
  requireLawyerAccess: vi.fn(),
  extractDocument: vi.fn(),
  parseDocumentWithNemotron: vi.fn(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess }));
vi.mock('@/lib/pdf/documentExtractor', () => ({ extractDocument }));
vi.mock('@/lib/ai/nemotronParser', () => ({ parseDocumentWithNemotron }));

import { POST } from '@/app/api/templates/analyze-upload/route';

function unauthorized() {
  return {
    ok: false as const,
    response: new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED_IDENTITY' }), { status: 401 }),
  };
}

function authorized() {
  return {
    ok: true as const,
    context: { organizationId: 'org-a', userId: 'user-a', lawyerId: 'user-a', role: 'lawyer' },
  };
}

function makeUploadRequest() {
  const formData = new FormData();
  formData.append('file', new File([Buffer.from('contenido jurídico suficiente')], 'fixture.txt', { type: 'text/plain' }));
  return new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: formData });
}

function makeInvalidPdfRequest() {
  const formData = new FormData();
  formData.append('file', new File([Buffer.from('not-a-pdf')], 'fixture.pdf', { type: 'application/pdf' }));
  return new NextRequest('http://localhost/api/templates/analyze-upload', { method: 'POST', body: formData });
}

beforeEach(() => {
  vi.clearAllMocks();
  parseDocumentWithNemotron.mockResolvedValue({ ok: false, structuredDocument: null });
  extractDocument.mockResolvedValue({
    text: 'JUZGADO DEMANDA ACTOR DEMANDADO HECHOS DERECHO PUNTOS PETITORIOS '.repeat(4),
    pages: [{ page: 1, text: 'contenido', chars: 9 }],
    sourceValidated: true,
    sourceQualityStatus: 'READY',
    sourceValidationMethod: 'native',
    ocrProvider: null,
    ocrStatus: 'OCR_NOT_REQUIRED',
    qualityScore: { confidence: 90, qualityLabel: 'ALTA', status: 'READY', emptyPages: 0 },
    sourceQuality: { pageCount: 1, characterCount: 300, charactersPerPage: 300, emptyPageRatio: 0, extractionMethod: 'native', ocrUsed: false, confidence: 90 },
    extractionSteps: [],
    ocrUsed: false,
    pageCount: 1,
    textLength: 300,
    avgCharsPerPage: 300,
    warnings: [],
    status: 'READY',
  });
});

describe('POST /api/templates/analyze-upload authorization boundary', () => {
  it('rejects unauthorized upload before reading or processing the file', async () => {
    requireLawyerAccess.mockResolvedValue(unauthorized());

    const response = await POST(makeUploadRequest());

    expect(response.status).toBe(401);
    expect(extractDocument).not.toHaveBeenCalled();
    expect(parseDocumentWithNemotron).not.toHaveBeenCalled();
  });

  it('preserves authorized upload processing', async () => {
    requireLawyerAccess.mockResolvedValue(authorized());

    const response = await POST(makeUploadRequest());

    expect(response.status).toBe(200);
    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(parseDocumentWithNemotron).toHaveBeenCalledTimes(1);
  });

  it('rechaza firma inválida antes de extracción u OCR/AI', async () => {
    requireLawyerAccess.mockResolvedValue(authorized());

    const response = await POST(makeInvalidPdfRequest());

    expect(response.status).toBe(400);
    expect(extractDocument).not.toHaveBeenCalled();
    expect(parseDocumentWithNemotron).not.toHaveBeenCalled();
  });
});
