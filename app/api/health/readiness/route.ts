import { NextResponse } from 'next/server';
import { collectRuntimeReadiness } from '@/lib/runtime/readiness';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const readiness = await collectRuntimeReadiness();
    return NextResponse.json(readiness, {
      status: readiness.overall === 'READY' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[health/readiness] probe failed:', error);
    return NextResponse.json(
      {
        overall: 'NOT_READY',
        components: { runtime: { status: 'BLOCKED', detail: 'No fue posible evaluar el estado operativo.' } },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
