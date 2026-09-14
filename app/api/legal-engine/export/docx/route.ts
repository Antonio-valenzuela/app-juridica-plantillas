import { NextRequest, NextResponse } from 'next/server';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { isExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { document } = body;

    if (!document) {
      return NextResponse.json({ ok: false, error: 'Falta el documento a exportar.' }, { status: 400 });
    }

    const doc = document as UniversalLegalDocument;

    let sanitized: UniversalLegalDocument;
    let report: Awaited<ReturnType<typeof prepareUniversalDocumentForExport>>['report'];
    try {
      const prepared = await prepareUniversalDocumentForExport(doc);
      sanitized = prepared.document;
      report = prepared.report;
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

    const buffer = await exportUniversalToDocx(sanitized, undefined, sanitized.generationMetadata.auditTrace);

    // Validación de archivo REAL
    if (!buffer || buffer.length < 500) {
      return NextResponse.json({ ok: false, error: 'DOCX generado vacío' }, { status: 500 });
    }
    if (buffer.subarray(0,2).toString() !== 'PK') {
      return NextResponse.json({ ok: false, error: 'DOCX no válido (no es ZIP)' }, { status: 500 });
    }

    const fileName = resolveDocumentOutputFilename(sanitized, 'docx').replace(/\.docx$/i, '');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'Content-Disposition': `attachment; filename="${fileName}.docx"`,
        'Content-Length': String(buffer.length),
        'X-Sanitize-Report': JSON.stringify({ removedPrompts: report.removedPrompts, removedCrypto: report.removedCrypto, placeholders: report.placeholdersFound.length }),
      },
    });
  } catch (error: any) {
    console.error('Error exporting DOCX:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
