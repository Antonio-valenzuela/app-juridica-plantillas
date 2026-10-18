import { NextRequest, NextResponse } from 'next/server';
import { requireOperationalManualAccess } from '@/lib/security/desktopLocalAccess';
import { readCanonicalManualBytes } from '@/lib/operational-manual/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireOperationalManualAccess(request);
  if (!auth.ok) return auth.response;
  const bytes = await readCanonicalManualBytes();
  if (!bytes) return NextResponse.json({ ok: false, error: 'MANUAL_NOT_IMPORTED' }, { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="LEX_PLANTILLAS_MANUAL_OPERATIVO.pdf"',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
