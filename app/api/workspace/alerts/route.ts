import { NextRequest, NextResponse } from 'next/server';
import { searchWorkspaceDof } from '@/lib/workspace/research';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rateLimit = checkRequestRateLimit(request, 'alerts', 30);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas consultas. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim() || '';
  const date = params.get('date')?.trim() || undefined;

  try {
    const result = await searchWorkspaceDof(query, date);
    return NextResponse.json({ ok: true, source: 'DOF/SIDOF', ...result });
  } catch (error) {
    console.error('[workspace/alerts] Error:', error);
    return NextResponse.json({ ok: false, error: 'No fue posible consultar el DOF.' }, { status: 502 });
  }
}
