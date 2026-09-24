import { NextRequest, NextResponse } from 'next/server';
import { searchWorkspaceJurisprudence } from '@/lib/workspace/research';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rateLimit = checkRequestRateLimit(request, 'research', 30);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas consultas. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });
  const query = new URL(request.url).searchParams.get('q')?.trim() || '';
  if (query.length < 3) {
    return NextResponse.json({ ok: false, error: 'La búsqueda debe contener al menos 3 caracteres.' }, { status: 400 });
  }

  try {
    const result = await searchWorkspaceJurisprudence(query);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[workspace/research] Error:', error);
    return NextResponse.json({ ok: false, error: 'No fue posible consultar las fuentes jurídicas.' }, { status: 502 });
  }
}
