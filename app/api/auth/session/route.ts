import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { buildSessionCookie, createSessionToken } from '@/lib/security/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')?.trim();
  const organizationId = request.headers.get('x-org-id')?.trim();
  if (!userId || !organizationId) {
    return NextResponse.json({ ok: false, error: 'SESSION_BOOTSTRAP_REQUIRES_TRUSTED_IDENTITY' }, { status: 401 });
  }

  const access = await requireLawyerAccess(request);
  if (!access.ok) return access.response;
  if (access.context.userId !== userId || access.context.organizationId !== organizationId) {
    return NextResponse.json({ ok: false, error: 'SESSION_IDENTITY_MISMATCH' }, { status: 401 });
  }

  try {
    const token = createSessionToken(access.context);
    return NextResponse.json(
      { ok: true, userId: access.context.userId, organizationId: access.context.organizationId },
      { headers: { 'Set-Cookie': buildSessionCookie(token), 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[auth/session] session creation failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: 'SESSION_UNAVAILABLE' }, { status: 503 });
  }
}
