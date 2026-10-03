import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireLawyerAccess: vi.fn(),
  documentBelongsToPrincipal: vi.fn(),
  checkRequestRateLimit: vi.fn(),
  prepareUniversalDocumentForExport: vi.fn(),
  exportUniversalToPdf: vi.fn(),
  exportUniversalToDocx: vi.fn(),
  desktopDraftRepository: vi.fn(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: mocks.requireLawyerAccess }));
vi.mock('@/lib/workspace/desktopDraftRepository', () => ({ desktopDraftRepository: mocks.desktopDraftRepository }));
vi.mock('@/lib/legal-engine/documentOwnership', () => ({ documentBelongsToPrincipal: mocks.documentBelongsToPrincipal }));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: mocks.checkRequestRateLimit }));
vi.mock('@/lib/legal-engine/exportGuards', () => ({
  isExportGuardError: () => false,
  prepareUniversalDocumentForExport: mocks.prepareUniversalDocumentForExport,
}));
vi.mock('@/lib/legal-engine/exportPdfUniversal', () => ({ exportUniversalToPdf: mocks.exportUniversalToPdf }));
vi.mock('@/lib/legal-engine/exportDocxUniversal', () => ({ exportUniversalToDocx: mocks.exportUniversalToDocx }));
vi.mock('@/lib/legal-engine/outputFilename', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/legal-engine/outputFilename')>(),
  resolveDocumentOutputFilename: () => 'borrador-prueba.pdf',
}));

import { POST as exportPdf } from '@/app/api/legal-engine/export/pdf/route';
import { POST as exportDocx } from '@/app/api/legal-engine/export/docx/route';

const document = { id: 'draft-local-1', title: 'Borrador de prueba', generationMetadata: {} };
const preparedDocument = { ...document, generationMetadata: { auditTrace: undefined } };

function request(path: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  mocks.desktopDraftRepository.mockReturnValue(null);
  mocks.requireLawyerAccess.mockResolvedValue({
    ok: false,
    response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
  });
  mocks.documentBelongsToPrincipal.mockResolvedValue(true);
  mocks.checkRequestRateLimit.mockReturnValue({ ok: true, headers: {} });
  mocks.prepareUniversalDocumentForExport.mockResolvedValue({
    document: preparedDocument,
    report: { removedPrompts: [], removedCrypto: [], placeholdersFound: [] },
  });
  mocks.exportUniversalToPdf.mockResolvedValue(Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(600)]));
  mocks.exportUniversalToDocx.mockResolvedValue(Buffer.concat([Buffer.from('PK'), Buffer.alloc(600)]));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('exportación local de borrador no persistido', () => {
  it.each([['pdf', exportPdf], ['docx', exportDocx]] as const)('%s: caída del almacén tras guardar permite señalar fallback, no se confunde con propiedad denegada', async (format, handler) => {
    mocks.desktopDraftRepository.mockReturnValue({ ok: true, store: { list: vi.fn(async () => { throw new Error('store unavailable after save'); }) } });
    const response = await handler(request(`/api/legal-engine/export/${format}`, { document, exportMode: 'DRAFT' }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ errorCode: 'EXPORT_PERSISTENCE_UNAVAILABLE' });
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
  });
  it('DRAFT efímero autenticado no consulta el almacén caído; FINAL no se autoriza', async () => {
    const list = vi.fn(async () => { throw new Error('store unavailable'); });
    mocks.desktopDraftRepository.mockReturnValue({ ok: true, store: { list } });
    for (const [handler, format] of [[exportPdf, 'pdf'], [exportDocx, 'docx']] as const) {
      const response = await handler(request(`/api/legal-engine/export/${format}`, { document, exportMode: 'DRAFT' }, { 'X-Unsaved-Draft-Export': 'true' }));
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Export-Persistence')).toBe('UNSAVED_LOCAL_DRAFT');
    }
    expect(list).not.toHaveBeenCalled();
    expect((await exportPdf(request('/api/legal-engine/export/pdf', { document, exportMode: 'FINAL' }, { 'X-Unsaved-Draft-Export': 'true' }))).status).toBe(422);
  });
  it('DRAFT efímero no evita el rechazo de capacidad local inválida', async () => {
    mocks.desktopDraftRepository.mockReturnValue({ ok: false, response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 }) });
    expect((await exportPdf(request('/api/legal-engine/export/pdf', { document, exportMode: 'DRAFT' }, { 'X-Unsaved-Draft-Export': 'true' }))).status).toBe(401);
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
  });
  it('exporta PDF y DOCX DRAFT sin Prisma, únicamente desde el mismo origen loopback', async () => {
    const pdfResponse = await exportPdf(request('/api/legal-engine/export/pdf', {
      document,
      exportMode: 'DRAFT',
    }, { 'X-Unsaved-Draft-Export': 'true' }));
    const docxResponse = await exportDocx(request('/api/legal-engine/export/docx', {
      document,
      exportMode: 'DRAFT',
    }, { 'X-Unsaved-Draft-Export': 'true' }));

    expect(pdfResponse.status).toBe(200);
    expect(docxResponse.status).toBe(200);
    expect(pdfResponse.headers.get('X-Export-Persistence')).toBe('UNSAVED_LOCAL_DRAFT');
    expect(docxResponse.headers.get('X-Export-Persistence')).toBe('UNSAVED_LOCAL_DRAFT');
    expect(mocks.requireLawyerAccess).not.toHaveBeenCalled();
    expect(mocks.documentBelongsToPrincipal).not.toHaveBeenCalled();
    expect(mocks.prepareUniversalDocumentForExport).toHaveBeenNthCalledWith(
      1,
      document,
      { exportMode: 'DRAFT', unsavedDraft: true },
    );
    expect(mocks.prepareUniversalDocumentForExport).toHaveBeenNthCalledWith(
      2,
      document,
      { exportMode: 'DRAFT', unsavedDraft: true },
    );
  });

  it('rechaza el fallback explícito si el origen no coincide', async () => {
    const response = await exportPdf(request('/api/legal-engine/export/pdf', {
      document,
      exportMode: 'DRAFT',
    }, {
      'X-Unsaved-Draft-Export': 'true',
      Origin: 'https://sitio-ajeno.example',
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireLawyerAccess).not.toHaveBeenCalled();
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
  });

  it('rechaza incluso un origen remoto que coincide consigo mismo', async () => {
    const remoteRequest = new NextRequest('https://app.example/api/legal-engine/export/pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://app.example',
        'X-Unsaved-Draft-Export': 'true',
      },
      body: JSON.stringify({ document, exportMode: 'DRAFT' }),
    });
    const response = await exportPdf(remoteRequest);

    expect(response.status).toBe(403);
    expect(mocks.requireLawyerAccess).not.toHaveBeenCalled();
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
  });

  it('rechaza FINAL solicitado mediante la ruta efímera', async () => {
    const response = await exportDocx(request('/api/legal-engine/export/docx', {
      document,
      exportMode: 'FINAL',
    }, { 'X-Unsaved-Draft-Export': 'true' }));

    expect(response.status).toBe(400);
    expect(mocks.requireLawyerAccess).not.toHaveBeenCalled();
    expect(mocks.documentBelongsToPrincipal).not.toHaveBeenCalled();
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
  });

  it('conserva autenticación y propiedad para la exportación persistida normal', async () => {
    mocks.requireLawyerAccess.mockResolvedValue({
      ok: true,
      context: { organizationId: 'org-local', userId: 'lawyer-local' },
    });
    mocks.documentBelongsToPrincipal.mockResolvedValue(false);

    const response = await exportPdf(request('/api/legal-engine/export/pdf', {
      document,
      exportMode: 'DRAFT',
    }));

    expect(response.status).toBe(404);
    expect(mocks.requireLawyerAccess).toHaveBeenCalledOnce();
    expect(mocks.documentBelongsToPrincipal).toHaveBeenCalledOnce();
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
  });

  it('distingue una caída al verificar propiedad de un rechazo de propiedad', async () => {
    mocks.requireLawyerAccess.mockResolvedValue({
      ok: true,
      context: { organizationId: 'org-local', userId: 'lawyer-local' },
    });
    mocks.documentBelongsToPrincipal.mockRejectedValue(new Error('database unavailable'));

    const pdfResponse = await exportPdf(request('/api/legal-engine/export/pdf', { document, exportMode: 'DRAFT' }));
    const docxResponse = await exportDocx(request('/api/legal-engine/export/docx', { document, exportMode: 'DRAFT' }));

    expect(pdfResponse.status).toBe(503);
    expect(docxResponse.status).toBe(503);
    expect(await pdfResponse.json()).toMatchObject({ errorCode: 'EXPORT_PERSISTENCE_UNAVAILABLE' });
    expect(await docxResponse.json()).toMatchObject({ errorCode: 'EXPORT_PERSISTENCE_UNAVAILABLE' });
    expect(mocks.prepareUniversalDocumentForExport).not.toHaveBeenCalled();
  });
});
