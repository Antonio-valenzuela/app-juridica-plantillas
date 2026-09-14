import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { isExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

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
    let docForPdf: UniversalLegalDocument;
    try {
      docForPdf = await prepareUniversalDocumentForExport(inputDocument).then((prepared) => prepared.document);
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
      const pdfBuffer = await exportUniversalToPdf(docForPdf);
      if (pdfBuffer && pdfBuffer.length > 500 && pdfBuffer.subarray(0, 4).toString() === '%PDF') {
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${resolveDocumentOutputFilename(docForPdf, 'pdf')}"`,
            'Content-Length': String(pdfBuffer.length),
            'X-Export-Method': 'pdf',
          },
        });
      }
    } catch (error: any) {
      console.warn('[export/pdf] exportUniversalToPdf falló:', error?.message);
    }

    return NextResponse.json({
      ok: false,
      error: 'PDF_EXPORT_FAILED',
      friendlyMessage: 'No se pudo generar un PDF binario válido. No se utilizará el payload legacy.',
    }, { status: 500, headers: { 'X-Export-Method': 'failed' } });
  } catch (error: any) {
    console.error('Error exporting PDF:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
