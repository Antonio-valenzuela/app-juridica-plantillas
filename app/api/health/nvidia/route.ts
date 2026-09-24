import { NextResponse } from 'next/server';
import { NVIDIAProvider } from '@/lib/ai/providers/nvidia';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const health = await new NVIDIAProvider().healthCheck!();
    return NextResponse.json(
      { ok: health.available === true, ...health },
      { status: health.available === true ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health/nvidia] probe failed:', error);
    return NextResponse.json(
      { ok: false, provider: 'nvidia', configured: false, available: false, lastError: 'No fue posible consultar NVIDIA.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
