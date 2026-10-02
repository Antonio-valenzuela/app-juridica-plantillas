import { NextRequest, NextResponse } from 'next/server';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { isExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { resolveDocumentOutputFilename, buildDownloadContentDisposition } from '@/lib/legal-engine/outputFilename';
import { documentBelongsToPrincipal } from '@/lib/legal-engine/documentOwnership';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { resolveExportMode } from '@/lib/legal-engine/exportModes';
import { isLocalSameOriginDraftExportRequest, UNSAVED_DRAFT_EXPORT_HEADER } from '@/lib/security/localDraftExport';
import { desktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id')?.trim() || generateRequestId();
  const local = desktopDraftRepository(req);
  if (local && !local.ok) return local.response;
  const unsavedDraftRequested = req.headers.get(UNSAVED_DRAFT_EXPORT_HEADER) === 'true';
  if (unsavedDraftRequested && !isLocalSameOriginDraftExportRequest(req)) {
    return NextResponse.json({ ok: false, errorCode: 'UNSAVED_DRAFT_EXPORT_LOCAL_ONLY', message: 'La exportación no guardada solo está disponible desde esta aplicación local.' }, { status: 403 });
  }
  let principal: { organizationId: string; userId: string } | null = null;
  if (!unsavedDraftRequested && !local?.ok) {
    const auth = await requireLawyerAccess(req);
    if (!auth.ok) return auth.response;
    principal = auth.context;
  }
  const rateLimit = checkRequestRateLimit(
    req,
    'export:docx',
    20,
    principal ? `${principal.organizationId}:${principal.userId}` : 'local-unsaved-draft',
  );
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
    // Local persistence has a separate authenticated DRAFT contract. It does
    // not fabricate a WEB principal or authorize FINAL.
    if (local?.ok && exportMode !== 'DRAFT') {
      return NextResponse.json({ ok: false, error: 'DESKTOP_FINAL_REVIEW_REQUIRED' }, { status: 422 });
    }
    if (unsavedDraftRequested && exportMode !== 'DRAFT') {
      return NextResponse.json({ ok: false, errorCode: 'UNSAVED_DRAFT_EXPORT_REQUIRES_DRAFT', message: 'La exportación no guardada solo admite el modo DRAFT.' }, { status: 400 });
    }
    if (typeof doc.id !== 'string') {
      return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }
    if (local?.ok) {
      const owned = (await local.store.list()).some(record => {
        const document = record.structuredDoc;
        return document && typeof document === 'object' && 'id' in document && document.id === doc.id;
      });
      if (!owned) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    } else if (!unsavedDraftRequested) {
      if (!principal) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
      let belongsToPrincipal: boolean;
      try {
        belongsToPrincipal = await documentBelongsToPrincipal({
          organizationId: principal.organizationId,
          userId: principal.userId,
          documentId: doc.id,
        });
      } catch (error) {
        console.warn('[export/docx] no se pudo verificar la persistencia del borrador:', error instanceof Error ? error.message : 'unknown');
        return NextResponse.json({ ok: false, errorCode: 'EXPORT_PERSISTENCE_UNAVAILABLE', message: 'No se pudo verificar el borrador guardado. Puedes descargar una copia DRAFT local.' }, { status: 503 });
      }
      if (!belongsToPrincipal) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
    }
    const exportOptions = { exportMode, ...(unsavedDraftRequested ? { unsavedDraft: true } : {}) };

    let sanitized: UniversalLegalDocument;
    let report: Awaited<ReturnType<typeof prepareUniversalDocumentForExport>>['report'];
    try {
      const prepared = await prepareUniversalDocumentForExport(doc, exportOptions);
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

    const buffer = await exportUniversalToDocx(sanitized, undefined, sanitized.generationMetadata.auditTrace, exportOptions);

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
        'Content-Disposition': buildDownloadContentDisposition(`${fileName}.docx`),
        'Content-Length': String(buffer.length),
        'X-Export-Mode': exportMode,
        ...(unsavedDraftRequested ? { 'X-Export-Persistence': 'UNSAVED_LOCAL_DRAFT' } : {}),
        'X-Sanitize-Report': JSON.stringify({ removedPrompts: report.removedPrompts, removedCrypto: report.removedCrypto, placeholders: report.placeholdersFound.length }),
        ...(exportMode === 'DRAFT' ? { 'X-Export-Review-Override': 'true' } : {}),
      },
    });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'DOCX_EXPORT_FAILED', message: 'No se pudo crear el archivo DOCX. El documento puede conservarse como borrador, pero la serialización falló.', internalError: error });
  }
}
