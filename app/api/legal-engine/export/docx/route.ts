import { NextRequest, NextResponse } from 'next/server';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { isExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
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
  const rateLimit = checkRequestRateLimit(req, 'export:docx', 20, `${auth.context.organizationId}:${auth.context.userId}`);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas exportaciones. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });

  try {
    const body = await req.json();
    const { document } = body;

    if (!document) {
      return NextResponse.json({ ok: false, error: 'Falta el documento a exportar.' }, { status: 400 });
    }

    const doc = document as UniversalLegalDocument;
    const exportMode = body.exportMode === undefined
      ? (body.allowReviewOverride === true ? 'DRAFT' : 'FINAL')
      : resolveExportMode(body.exportMode);
    if (!exportMode) {
      return NextResponse.json({ ok: false, errorCode: 'INVALID_EXPORT_MODE', message: 'El modo de exportación debe ser DRAFT o FINAL.' }, { status: 400 });
    }
    if (typeof doc.id !== 'string' || !await documentBelongsToPrincipal({
      organizationId: auth.context.organizationId,
      userId: auth.context.userId,
      documentId: doc.id,
    })) {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }

    let sanitized: UniversalLegalDocument;
    let report: Awaited<ReturnType<typeof prepareUniversalDocumentForExport>>['report'];
    try {
      const prepared = await prepareUniversalDocumentForExport(doc, { exportMode });
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

    const buffer = await exportUniversalToDocx(sanitized, undefined, sanitized.generationMetadata.auditTrace, { exportMode });

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
        'X-Export-Mode': exportMode,
        'X-Sanitize-Report': JSON.stringify({ removedPrompts: report.removedPrompts, removedCrypto: report.removedCrypto, placeholders: report.placeholdersFound.length }),
        ...(exportMode === 'DRAFT' ? { 'X-Export-Review-Override': 'true' } : {}),
      },
    });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'DOCX_EXPORT_FAILED', message: 'No se pudo crear el archivo DOCX. El documento puede conservarse como borrador, pero la serialización falló.', internalError: error });
  }
}
