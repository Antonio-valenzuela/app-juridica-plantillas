import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { analyzeLegalDocumentFormatting } from '@/lib/legal-engine/legalFormatAnalyzer';
import { buildFormattedDocument, validateFormattingIntegrity } from '@/lib/legal-engine/legalFormatter';
import { loadLawyerProfile } from '@/lib/workspace/lawyerProfileStore';
import { logger, generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/legal-engine/format
// Operación FORMATEAR: analiza estructura (NVIDIA, JSON-only) y aplica formato
// determinístico. El contenido es SIEMPRE el texto original; si la validación de
// integridad falla se devuelve LEGAL_CONTENT_CHANGED y NO se entrega documento.
const formatSchema = z.object({
  sourceDocuments: z.array(z.any()).min(1, 'MISSING_SOURCE_DOCUMENTS'),
});

export async function POST(req: NextRequest) {
  const requestId = generateRequestId();
  const start = Date.now();
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const parsed = formatSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('POST /format invalid body', { requestId, operation: 'format', status: '400', errorCode: 'INVALID_BODY' });
    return NextResponse.json({ ok: false, error: 'MISSING_SOURCE_DOCUMENTS', details: parsed.error.issues }, { status: 400 });
  }
  const sources = parsed.data.sourceDocuments as UploadedSourceDocument[];

  // Texto original completo (fuente única de verdad del contenido).
  const fullText = sources
    .flatMap((s) => s.pages?.map((p) => p.text) || [s.extractedText || s.content || ''])
    .join('\n\n')
    .trim();

  if (!fullText || fullText.length < 100) {
    return NextResponse.json(
      { ok: false, error: 'NO_TEXT_CONTENT', message: 'El documento no contiene suficiente texto extraído.' },
      { status: 422 }
    );
  }

  try {
    // CAPA 1 — análisis estructural (JSON exclusivamente; con fallback determinístico interno)
    const { analysis, aiUsed, provider, model } = await analyzeLegalDocumentFormatting(fullText);

    // Perfil del abogado: SOLO referencia de estilo (nunca altera contenido). Mismo
    // fallback que generate: body → DB → DEFAULT.
    const { profile } = await loadLawyerProfile(auth.context.organizationId, auth.context.lawyerId);

    // CAPA 2 — formateador determinístico
    const document = buildFormattedDocument(analysis, sources, {
      lawyerProfile: profile,
      aiUsed,
      aiProvider: aiUsed ? provider : undefined,
      aiModel: model,
    });

    // Validación automática original vs formateado
    const report = validateFormattingIntegrity(fullText, document);
    if (!report.ok) {
      logger.warn('LEGAL_CONTENT_CHANGED', {
        requestId,
        operation: 'format',
        status: '409',
        provider: aiUsed ? provider : null,
        durationMs: Date.now() - start,
        errorCode: 'LEGAL_CONTENT_CHANGED',
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'LEGAL_CONTENT_CHANGED',
          report: {
            sequentialOk: report.sequentialOk,
            coveragePct: report.coveragePct,
            checkedTokens: report.checkedTokens,
            missingTokens: report.missingTokens,
          },
        },
        { status: 409 }
      );
    }

    logger.info('POST /format success', {
      requestId,
      organizationId: auth.context.organizationId,
      userId: auth.context.userId,
      provider: aiUsed ? provider : null,
      operation: 'format',
      durationMs: Date.now() - start,
      status: 'success',
    });

    return NextResponse.json({
      ok: true,
      document,
      report: {
        sequentialOk: report.sequentialOk,
        coveragePct: report.coveragePct,
        checkedTokens: report.checkedTokens,
        elementsCounted: analysis.sections.length,
        analysisSource: analysis.source,
        editorialNotes: analysis.sections.filter((e) => e.type === 'internal_note').length,
        aiUsed,
        provider: aiUsed ? provider : null,
      },
    });
  } catch (err: any) {
    logger.error('POST /format failed', {
      requestId,
      operation: 'format',
      durationMs: Date.now() - start,
      status: 'failed',
      errorCode: err?.message?.slice(0, 100) || 'FORMAT_FAILED',
    });
    return NextResponse.json({ ok: false, error: 'FORMAT_FAILED' }, { status: 500 });
  }
}
