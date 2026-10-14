import { NextRequest, NextResponse } from 'next/server';
import { searchStateLegislation, STATE_OFFICIAL_CATALOGS } from '@/lib/workspace/stateLegislation';
import { checkRequestRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rateLimit = checkRequestRateLimit(request, 'library-state', 30);
  if (!rateLimit.ok) return NextResponse.json({ ok: false, errorCode: 'RATE_LIMITED', message: 'Demasiadas consultas. Intenta de nuevo más tarde.' }, { status: 429, headers: rateLimit.headers });
  const params = new URL(request.url).searchParams;
  const state = (params.get('estado') || 'JALISCO').trim().toUpperCase();
  if (!STATE_OFFICIAL_CATALOGS[state]) return NextResponse.json({ ok: false, errorCode: 'STATE_NOT_SUPPORTED', message: 'Entidad no soportada.' }, { status: 400 });
  const result = await searchStateLegislation(params.get('q') || '', state);
  if (result.error) {
    console.error('[workspace/library/state] Error:', result.error);
    return NextResponse.json({ ok: false, errorCode: 'STATE_LEGISLATION_UNAVAILABLE', message: 'No fue posible consultar la legislación estatal de la SCJN.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, source: 'SCJN · Sistema de Consulta de Ordenamientos', state, retrievedAt: new Date().toISOString(), items: result.items });
}
