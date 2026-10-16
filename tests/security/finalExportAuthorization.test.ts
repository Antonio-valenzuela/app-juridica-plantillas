import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireLawyerAccess: vi.fn(),
  documentBelongsToPrincipal: vi.fn(),
  checkRequestRateLimit: vi.fn(),
  prepareUniversalDocumentForExport: vi.fn(),
  exportUniversalToPdf: vi.fn(),
  exportUniversalToDocx: vi.fn(),
  desktopDraftRepository: vi.fn(),
  approvedTypes: new Set<string>(),
}));

vi.mock('@/lib/security/lawyerAuth', () => ({ requireLawyerAccess: mocks.requireLawyerAccess }));
vi.mock('@/lib/workspace/desktopDraftRepository', () => ({ desktopDraftRepository: mocks.desktopDraftRepository }));
vi.mock('@/lib/legal-engine/documentOwnership', () => ({ documentBelongsToPrincipal: mocks.documentBelongsToPrincipal }));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: mocks.checkRequestRateLimit }));
// El guard documental se simula siempre exitoso: así se demuestra que la
// autorización FINAL es independiente de que el documento pase sus gates.
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
// Simula, solo para estas pruebas, una aprobación jurídica registrada en el catálogo.
vi.mock('@/lib/catalog/legalCatalog', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/catalog/legalCatalog')>();
  return {
    ...original,
    canExportDocumentFinal: (id: string) => mocks.approvedTypes.has(id) || original.canExportDocumentFinal(id),
  };
});

import { POST as exportPdf } from '@/app/api/legal-engine/export/pdf/route';
import { POST as exportDocx } from '@/app/api/legal-engine/export/docx/route';
import { CANONICAL_DOCUMENT_TYPES, canExportDocumentFinal as realCanExport } from '@/lib/catalog/legalCatalog';
import { authorizeFinalExport } from '@/lib/legal-engine/finalExportAuthorization';

const passPendingType = CANONICAL_DOCUMENT_TYPES.find(entry => entry.functionalStatus === 'PASS' && entry.humanReview === 'PENDING')!.id;
const nonGenerableType = CANONICAL_DOCUMENT_TYPES.find(entry => entry.functionalStatus !== 'PASS')?.id;
const preparedDocument = { id: 'saved-1', title: 'Escrito sintético', generationMetadata: {} };
const handlers = [['pdf', exportPdf], ['docx', exportDocx]] as const;

function request(format: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/legal-engine/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', ...headers },
    body: JSON.stringify(body),
  });
}
const savedDocument = (documentType?: string, extra: Record<string, unknown> = {}) => ({ id: 'saved-1', title: 'Escrito sintético', ...(documentType ? { documentType } : {}), generationMetadata: {}, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.approvedTypes.clear();
  vi.stubEnv('NODE_ENV', 'production');
  mocks.desktopDraftRepository.mockReturnValue(null);
  mocks.requireLawyerAccess.mockResolvedValue({ ok: true, context: { organizationId: 'org-sintetica', userId: 'user-sintetico' } });
  mocks.documentBelongsToPrincipal.mockResolvedValue(true);
  mocks.checkRequestRateLimit.mockReturnValue({ ok: true, headers: {} });
  mocks.prepareUniversalDocumentForExport.mockResolvedValue({
    document: preparedDocument,
    report: { removedPrompts: [], removedCrypto: [], placeholdersFound: [] },
  });
  mocks.exportUniversalToPdf.mockResolvedValue(Buffer.from(`%PDF-${'x'.repeat(600)}`));
  mocks.exportUniversalToDocx.mockResolvedValue(Buffer.from(`PK${'x'.repeat(600)}`));
});

describe('authorizeFinalExport (catálogo)', () => {
  it('ningún tipo canónico está autorizado para FINAL mientras humanReview siga PENDING', () => {
    for (const entry of CANONICAL_DOCUMENT_TYPES) {
      expect(entry.humanReview, entry.id).toBe('PENDING');
      expect(authorizeFinalExport(entry.id).ok, entry.id).toBe(false);
    }
  });

  it('distingue la causa: PASS sin aprobación, sin certificar, sin tipo y tipo desconocido', () => {
    expect(authorizeFinalExport(passPendingType)).toMatchObject({ ok: false, reason: 'HUMAN_REVIEW_PENDING', errorCode: 'UNCERTIFIED_TYPE_FINAL_BLOCKED' });
    if (nonGenerableType) expect(authorizeFinalExport(nonGenerableType)).toMatchObject({ ok: false, reason: 'NOT_FUNCTIONALLY_CERTIFIED' });
    expect(authorizeFinalExport(undefined)).toMatchObject({ ok: false, reason: 'TYPE_REQUIRED' });
    expect(authorizeFinalExport('  ')).toMatchObject({ ok: false, reason: 'TYPE_REQUIRED' });
    expect(authorizeFinalExport({ toString: () => passPendingType })).toMatchObject({ ok: false, reason: 'TYPE_REQUIRED' });
    expect(authorizeFinalExport('tipo_que_no_existe_xyz')).toMatchObject({ ok: false, reason: 'TYPE_UNRECOGNIZED' });
  });

  it('el catálogo real no autoriza ningún tipo (el mock de aprobación no filtra al módulo real)', () => {
    expect(realCanExport(passPendingType)).toBe(false);
  });
});

describe.each(handlers)('ruta %s: autorización FINAL en servidor', (format, handler) => {
  it('bloquea FINAL de un documento GUARDADO de tipo PASS + humanReview PENDING aunque supere el guard', async () => {
    const response = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'FINAL' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, errorCode: 'UNCERTIFIED_TYPE_FINAL_BLOCKED', reason: 'HUMAN_REVIEW_PENDING' });
    expect(mocks.documentBelongsToPrincipal).toHaveBeenCalled();
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });

  it('el modo por defecto (sin exportMode) es FINAL y también queda bloqueado', async () => {
    const response = await handler(request(format, { document: savedDocument(passPendingType) }));
    expect(response.status).toBe(422);
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });

  it('no confía en flags del cliente: aprobaciones, estados o lifecycle forjados no relajan el bloqueo', async () => {
    const forged = savedDocument(passPendingType, {
      humanReview: 'APPROVED',
      functionalStatus: 'PASS',
      humanReviewApproved: true,
      qualityGate: { passed: true, canMarkAsFinal: true },
      generationMetadata: { exportMode: 'DRAFT', humanReview: 'APPROVED', lifecycle: { entityKind: 'FINAL_DOCUMENT' } },
    });
    const response = await handler(request(format, { document: forged, exportMode: 'FINAL', humanReview: 'APPROVED', approved: true, finalApproved: true }));
    expect(response.status).toBe(422);
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });

  it('allowReviewOverride no convierte una petición FINAL en autorizada', async () => {
    const response = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'FINAL', allowReviewOverride: true }));
    expect(response.status).toBe(422);
    expect(response.headers.get('X-Export-Mode')).toBeNull();
  });

  it('bloquea FINAL sin documentType o con un tipo desconocido (no hay vía de omisión)', async () => {
    for (const document of [savedDocument(), savedDocument('tipo_que_no_existe_xyz')]) {
      const response = await handler(request(format, { document, exportMode: 'FINAL' }));
      expect(response.status).toBe(422);
    }
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });

  it('bloquea FINAL de un tipo sin certificar', async () => {
    if (!nonGenerableType) return;
    const response = await handler(request(format, { document: savedDocument(nonGenerableType), exportMode: 'FINAL' }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'NOT_FUNCTIONALLY_CERTIFIED' });
  });

  it('documento NO guardado: FINAL nunca se admite (400/422) y no llega al exporter', async () => {
    const response = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'FINAL' }, { 'X-Unsaved-Draft-Export': 'true' }));
    expect([400, 422]).toContain(response.status);
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });

  it('no bloquea la descarga legítima de borradores (guardado y no guardado)', async () => {
    const saved = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'DRAFT' }));
    expect(saved.status).toBe(200);
    expect(saved.headers.get('X-Export-Mode')).toBe('DRAFT');
    const unsaved = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'DRAFT' }, { 'X-Unsaved-Draft-Export': 'true' }));
    expect(unsaved.status).toBe(200);
    expect(unsaved.headers.get('X-Export-Persistence')).toBe('UNSAVED_LOCAL_DRAFT');
  });

  it('solo una aprobación registrada en el catálogo habilita FINAL de un documento guardado', async () => {
    mocks.approvedTypes.add(passPendingType);
    const response = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'FINAL' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Export-Mode')).toBe('FINAL');
  });

  it('la autorización no sustituye el guard: un documento aprobado que no lo supere no se exporta', async () => {
    mocks.approvedTypes.add(passPendingType);
    mocks.prepareUniversalDocumentForExport.mockRejectedValueOnce(new Error('guard interno'));
    const response = await handler(request(format, { document: savedDocument(passPendingType), exportMode: 'FINAL' }));
    expect(response.status).toBe(500);
    expect(mocks.exportUniversalToPdf).not.toHaveBeenCalled();
    expect(mocks.exportUniversalToDocx).not.toHaveBeenCalled();
  });
});
