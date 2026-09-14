import { NextRequest, NextResponse } from 'next/server';
import { generateSection } from '@/lib/legal-engine/pipeline';
import { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { readDocumentExportReadiness } from '@/lib/legal-engine/documentLifecycle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

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
    console.error('Error in generate-section API:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
