import { NextRequest, NextResponse } from 'next/server';
import { generateSection } from '@/lib/legal-engine/pipeline';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { readDocumentExportReadiness } from '@/lib/legal-engine/documentLifecycle';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const requestId = req.headers.get('x-request-id')?.trim() || generateRequestId();
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;
  const rateLimit = checkRequestRateLimit(req, 'generation-section', 20, `${auth.context.organizationId}:${auth.context.userId}`);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas regeneraciones. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });

  try {
    const body = await req.json();
    const { document, sectionId, instruction } = body;

    if (!document || !sectionId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos: document y sectionId son requeridos.' }, { status: 400 });
    }

    const documentReadiness = readDocumentExportReadiness(document);
    if (documentReadiness === 'READY_TO_EXPORT' || documentReadiness === 'FINAL_DOCUMENT') {
      return NextResponse.json({
        ok: false,
        error: 'DOCUMENT_NOT_EDITABLE',
        friendlyMessage: 'El documento ya está listo para exportarse o fue finalizado; cualquier regeneración requiere volver a revisión.',
      }, { status: 409 });
    }

    const res = await generateSection(document as UniversalLegalDocument, sectionId, instruction);

    if (res.aiUsed !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: 'GENERACIÓN IA NO DISPONIBLE',
          aiStatus: 'UNAVAILABLE',
          provider: res.aiProvider || null,
          model: res.aiModel || null,
          reason: res.aiError || 'Ningún proveedor de IA configurado respondió.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ ok: true, text: res.text, sources: res.sources, warnings: res.warnings });
  } catch (error: any) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'SECTION_GENERATION_FAILED', message: 'No fue posible generar el apartado.', internalError: error });
  }
}
