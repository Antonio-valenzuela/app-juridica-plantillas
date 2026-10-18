import { NextRequest, NextResponse } from 'next/server';
import { requireOperationalManualAccess } from '@/lib/security/desktopLocalAccess';
import { loadActiveManual } from '@/lib/operational-manual/store';
import { retrieveManualRules, MANUAL_MATTERS, type ManualMatter } from '@/lib/operational-manual/core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requireOperationalManualAccess(request);
  if (!auth.ok) return auth.response;
  const index = await loadActiveManual();
  if (!index) return NextResponse.json({ ok: false, error: 'MANUAL_NOT_IMPORTED' }, { status: 404 });
  const params = request.nextUrl.searchParams;
  const ruleId = params.get('ruleId');
  if (ruleId) {
    const fragment = index.fragments.find((item) => item.stableRuleId === ruleId);
    return fragment ? NextResponse.json({ ok: true, fragment }) : NextResponse.json({ ok: false, error: 'RULE_NOT_FOUND' }, { status: 404 });
  }
  const rawPage = params.get('page');
  if (rawPage) {
    const physicalPage = Number(rawPage);
    if (!Number.isInteger(physicalPage) || physicalPage < 1 || physicalPage > 212) return NextResponse.json({ ok: false, error: 'INVALID_PAGE' }, { status: 400 });
    return NextResponse.json({ ok: true, page: index.pages[physicalPage - 1], fragments: index.fragments.filter((item) => item.physicalPage === physicalPage) });
  }
  const matter = params.get('matter');
  if (matter) {
    if (!MANUAL_MATTERS.includes(matter as ManualMatter)) return NextResponse.json({ ok: false, error: 'INVALID_MATTER' }, { status: 400 });
    const result = retrieveManualRules(index, { matter: matter as ManualMatter, caseType: params.get('caseType') || '', action: params.get('action') || '', stage: params.get('stage') || '', task: params.get('task') || '', budgetChars: 5000 });
    return NextResponse.json({ ok: true, ...result });
  }
  const distribution = Object.fromEntries(MANUAL_MATTERS.map((item) => [item, index.fragments.filter((fragment) => fragment.matter === item).length]));
  return NextResponse.json({ ok: true, manifest: { ...index.manifest, pageCount: index.manifest.detectedPages }, distribution, sections: [...new Set(index.fragments.map((fragment) => fragment.section))] });
}
