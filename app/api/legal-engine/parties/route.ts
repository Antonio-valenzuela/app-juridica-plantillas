import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { logger, generateRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_ROLES = new Set([
  'actor',
  'demandado',
  'apoderado',
  'abogado_defensor',
  'autoridad',
  'tercero_interesado',
  'quejoso',
  'firmante',
]);

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

// GET /api/legal-engine/parties?caseKey=...
export async function GET(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const caseKey = new URL(req.url).searchParams.get('caseKey')?.trim() || '';
  if (!caseKey) return errorResponse('MISSING_CASE_KEY');

  try {
    // El scope de seguridad SIEMPRE es el organizationId del contexto de auth;
    // nunca un organizationId enviado por el cliente.
    const parties = await prisma.caseParty.findMany({
      where: {
        organizationId: auth.context.organizationId,
        caseKey,
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ ok: true, parties });
  } catch (err: any) {
    console.error('[parties:GET] Error:', err?.message);
    return errorResponse('PARTIES_QUERY_FAILED', 500);
  }
}

const partyPostSchema = z.object({
  caseKey: z.string().min(1).max(200),
  role: z.string().min(1).max(50).refine((v) => VALID_ROLES.has(v), { message: 'INVALID_ROLE' }),
  name: z.string().max(200),
  source: z.enum(['manual', 'detected']).optional().default('manual'),
  confidence: z.number().min(0).max(100).nullable().optional(),
});

 // POST /api/legal-engine/parties
// Upsert lógico por (organizationId, caseKey, role).
// Regla de prioridad: una parte confirmada manualmente nunca se degrada por una detectada.
export async function POST(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = partyPostSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn('POST /parties invalid body', { operation: 'parties_POST', status: '400', errorCode: 'INVALID_BODY' });
    return NextResponse.json({ ok: false, error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }
  const organizationId = auth.context.organizationId;
  const caseKey = parsed.data.caseKey.trim();
  const role = parsed.data.role.trim();
  const rawName = parsed.data.name.trim();

  if (!caseKey) return errorResponse('MISSING_CASE_KEY');
  if (!VALID_ROLES.has(role)) return errorResponse('INVALID_ROLE');

  // Decisión explícita: name vacío = eliminar esa parte del expediente.
  // Se procesa ANTES de la validación de MISSING_NAME (sin código inalcanzable).
  if (rawName === '') {
    try {
      await prisma.caseParty.deleteMany({
        where: { organizationId, caseKey, role },
      });
      return NextResponse.json({ ok: true, deleted: true });
    } catch (err: any) {
      console.error('[parties:POST] Error al eliminar:', err?.message);
      return errorResponse('PARTY_DELETE_FAILED', 500);
    }
  }

  if (!rawName) return errorResponse('MISSING_NAME');

  const source = body?.source === 'detected' ? 'detected' : 'manual';
  const confidence =
    typeof body?.confidence === 'number' && Number.isFinite(body.confidence)
      ? Math.max(0, Math.min(100, Math.round(body.confidence)))
      : null;
  // Nota: draftId NO se acepta del cliente en este endpoint. El flujo actual guarda
  // las partes a nivel expediente (caseKey) antes de que exista un LegalDraft; si en
  // el futuro se asocia un draft, debe validarse primero su pertenencia a la organización.

  try {
    const existing = await prisma.caseParty.findFirst({
      where: { organizationId, caseKey, role },
    });

    if (!existing) {
      const party = await prisma.caseParty.create({
        data: { organizationId, caseKey, role, name: rawName, source, confidence },
      });
      return NextResponse.json({ ok: true, party });
    }

    // Idempotencia: nunca sobrescribir una parte confirmada manualmente con una detectada.
    if (existing.source === 'manual' && source === 'detected') {
      return NextResponse.json({ ok: true, party: existing });
    }

    const party = await prisma.caseParty.update({
      where: { id: existing.id },
      data: {
        name: rawName,
        source,
        ...(confidence !== null ? { confidence } : {}),
      },
    });
    return NextResponse.json({ ok: true, party });
  } catch (err: any) {
    console.error('[parties:POST] Error:', err?.message);
    return errorResponse('PARTY_SAVE_FAILED', 500);
  }
}

// DELETE /api/legal-engine/parties?id=...
export async function DELETE(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get('id')?.trim() || '';
  if (!id) return errorResponse('MISSING_ID');

  try {
    // Validación de propiedad: solo elimina si pertenece a la organización autenticada.
    const result = await prisma.caseParty.deleteMany({
      where: { id, organizationId: auth.context.organizationId },
    });
    if (result.count === 0) return errorResponse('PARTY_NOT_FOUND', 404);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (err: any) {
    console.error('[parties:DELETE] Error:', err?.message);
    return errorResponse('PARTY_DELETE_FAILED', 500);
  }
}
