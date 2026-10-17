import { NextRequest, NextResponse } from 'next/server';
import { executionOwnerKey, requireWorkspaceExecutionAccess } from '@/lib/security/workspaceExecutionAccess';
import { runLegalResearchOnly } from '@/lib/legal-engine/pipeline';
import { createDofAdapter } from '@/lib/legal-engine/legal-research/adapters/dof';
import { researchStoreKey, saveResearchBundles } from '@/lib/legal-engine/researchBundleStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Investigación jurídica oficial (Lote 7). Solo corre con consentimiento explícito del abogado. Los bundles
 * resultantes se guardan en el servidor por propietario y expediente: la generación los toma de ahí y el
 * cliente nunca los envía. La jurisprudencia del SJF no se verifica aquí: queda para verificación manual.
 */
export async function POST(req: NextRequest) {
  const auth = await requireWorkspaceExecutionAccess(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  if (body.externalResearchConsent !== true) {
    return NextResponse.json({ ok: false, errorCode: 'RESEARCH_CONSENT_REQUIRED', message: 'La investigación oficial requiere tu consentimiento explícito.' }, { status: 403 });
  }
  const expediente = typeof body.expediente === 'string' ? body.expediente.trim() : '';
  if (!expediente) {
    return NextResponse.json({ ok: false, errorCode: 'EXPEDIENTE_REQUIRED' }, { status: 400 });
  }
  if (!body.caseAnalysis || !body.issueMatrix) {
    return NextResponse.json({ ok: false, errorCode: 'RESEARCH_INPUT_REQUIRED' }, { status: 400 });
  }

  const result = await runLegalResearchOnly({
    caseAnalysis: body.caseAnalysis,
    issueMatrix: body.issueMatrix,
    provider: createDofAdapter(),
  });
  const stored = saveResearchBundles(researchStoreKey(executionOwnerKey(auth.context), expediente), result.bundles);
  return NextResponse.json({
    ok: true,
    storedBundles: stored,
    issueIds: result.bundles.map((bundle) => bundle.legalIssueId),
    readiness: result.readiness,
  });
}
