import { NextRequest, NextResponse } from 'next/server';
import { requireCaseAccess } from '@/lib/cases/access';
import { apiErrorResponse } from '@/lib/security/apiErrors';
import { generateRequestId } from '@/lib/logger';
import { desktopDraftRepository } from '@/lib/workspace/desktopDraftRepository';
import { readExternalEgressLedger, summarizeExternalEgress } from '@/lib/ai/externalEgressLedger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseRangeDays(value: string | null): 7 | 30 | 90 {
  const parsed = Number(value);
  return parsed === 7 || parsed === 90 ? parsed : 30;
}

/** Métrica «Envíos a IA en la nube»: solo metadatos del registro local, nunca contenido. */
export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')?.trim() || generateRequestId();
  try {
    const local = desktopDraftRepository(request);
    if (local && !local.ok) return local.response;
    if (!local?.ok) {
      const access = await requireCaseAccess(request);
      if (!access.ok) return access.response;
    }
    const records = await readExternalEgressLedger();
    const summary = summarizeExternalEgress(records, parseRangeDays(request.nextUrl.searchParams.get('rangeDays')));
    return NextResponse.json({ ok: true, ...summary }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse({ requestId, status: 500, errorCode: 'AI_EGRESS_LOAD_FAILED', message: 'No fue posible leer el registro de envíos a IA en la nube.', internalError: error });
  }
}
