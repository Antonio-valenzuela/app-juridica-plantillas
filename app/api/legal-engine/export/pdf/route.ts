import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { isExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';
import { documentBelongsToPrincipal } from '@/lib/legal-engine/documentOwnership';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { resolveExportMode } from '@/lib/legal-engine/exportModes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id')?.trim() || generateRequestId();
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;
  const rateLimit = checkRequestRateLimit(req, 'export:pdf', 20, `${auth.context.organizationId}:${auth.context.userId}`);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas exportaciones. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });

  try {
    const body = await req.json();
    // El payload legacy renderedSections no tiene contrato documental, provenance
    // ni lifecycle; jamás se convierte en HTML/PDF. Si viene acompañado por un
    // documento universal, se ignora y todo se deriva de ese documento.
    if (!body.document) {
      return NextResponse.json({
        ok: false,
        error: 'PDF_LEGACY_PAYLOAD_REJECTED',
        friendlyMessage: 'La exportación PDF requiere un UniversalLegalDocument; renderedSections es un payload legacy no exportable.',
      }, { status: 422 });
    }

    const inputDocument = body.document as UniversalLegalDocument;
    const exportMode = body.exportMode === undefined
      ? (body.allowReviewOverride === true ? 'DRAFT' : 'FINAL')
      : resolveExportMode(body.exportMode);
    if (!exportMode) {
      return NextResponse.json({ ok: false, errorCode: 'INVALID_EXPORT_MODE', message: 'El modo de exportación debe ser DRAFT o FINAL.' }, { status: 400 });
    }
    if (typeof inputDocument.id !== 'string' || !await documentBelongsToPrincipal({
      organizationId: auth.context.organizationId,
      userId: auth.context.userId,
      documentId: inputDocument.id,
    })) {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }
    let docForPdf: UniversalLegalDocument;
    try {
      docForPdf = await prepareUniversalDocumentForExport(inputDocument, { exportMode }).then((prepared) => prepared.document);
    } catch (error) {
      if (isExportGuardError(error)) {
        return NextResponse.json({
          ok: false,
          error: error.code,
          friendlyMessage: 'El documento no pasó el contrato común de exportación.',
          details: error.result.errors,
          warnings: error.result.warnings,
        }, { status: 422 });
      }
      throw error;
    }

    // No hay fallback a HTML/Chromium: si falla el exporter binario, se devuelve
    // un error honesto y no se utiliza renderedSections como bypass.
    try {
      const pdfBuffer = await exportUniversalToPdf(docForPdf, undefined, { exportMode });
      if (pdfBuffer && pdfBuffer.length > 500 && pdfBuffer.subarray(0, 4).toString() === '%PDF') {
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${resolveDocumentOutputFilename(docForPdf, 'pdf')}"`,
            'Content-Length': String(pdfBuffer.length),
            'X-Export-Method': 'pdf',
            'X-Export-Mode': exportMode,
            ...(exportMode === 'DRAFT' ? { 'X-Export-Review-Override': 'true' } : {}),
          },
        });
      }
    } catch (error: any) {
      console.warn('[export/pdf] exportUniversalToPdf falló:', error?.message);
    }

    return NextResponse.json({
      ok: false,
      error: 'PDF_EXPORT_FAILED',
      friendlyMessage: 'No se pudo crear el archivo PDF. El documento puede conservarse como borrador, pero el renderer PDF falló.',
    }, { status: 500, headers: { 'X-Export-Method': 'failed' } });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'PDF_EXPORT_FAILED', message: 'No fue posible exportar el documento PDF.', internalError: error });
  }
}
