import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { loadLawyerProfile, saveLawyerProfile } from '@/lib/workspace/lawyerProfileStore';
import { getProviderDisclosure } from '@/lib/ai/providerDisclosure';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/workspace/lawyer-profile
// Retorna el perfil del org actual; si no existe en DB retorna DEFAULT_LAWYER_PROFILE (sin persistirlo).
export async function GET(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  try {
    const { profile, fromDefault } = await loadLawyerProfile(
      auth.context.organizationId,
      auth.context.lawyerId
    );
    return NextResponse.json({ ok: true, profile, isDefault: fromDefault, aiDisclosure: getProviderDisclosure() });
  } catch (err: any) {
    console.error('[lawyer-profile:GET] Error:', err?.message);
    return NextResponse.json({ ok: false, error: 'PROFILE_LOAD_FAILED' }, { status: 500 });
  }
}

// PUT /api/workspace/lawyer-profile
// Guarda/actualiza el perfil del org autenticado (upsert por organizationId).
export async function PUT(req: NextRequest) {
  const auth = await requireLawyerAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'INVALID_BODY' }, { status: 400 });
  }

  try {
    // El scope SIEMPRE es el organizationId del contexto de auth; el cliente no puede
    // indicar otra organización. lawyerId tampoco se acepta del body.
    const profile = await saveLawyerProfile(auth.context.organizationId, auth.context.lawyerId, body);
    return NextResponse.json({ ok: true, profile });
  } catch (err: any) {
    console.error('[lawyer-profile:PUT] Error:', err?.message);
    return NextResponse.json({ ok: false, error: 'PROFILE_SAVE_FAILED' }, { status: 500 });
  }
}
