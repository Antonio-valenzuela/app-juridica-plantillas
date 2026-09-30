import { NextRequest, NextResponse } from 'next/server';
import { DESKTOP_MANUAL_COOKIE, getRuntimeMode, requireDesktopLocalAccess } from '@/lib/security/desktopLocalAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (getRuntimeMode() === 'WEB') return new Response(null, { status: 404 });
  const auth = requireDesktopLocalAccess(request, { allowCookie: false });
  if (!auth.ok) return auth.response;
  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  response.cookies.set(DESKTOP_MANUAL_COOKIE, process.env.LEX_DESKTOP_CAPABILITY!, {
    httpOnly: true, sameSite: 'strict', path: '/api/operational-manual',
    expires: new Date(Number(process.env.LEX_DESKTOP_EXPIRES_AT)),
  });
  return response;
}
