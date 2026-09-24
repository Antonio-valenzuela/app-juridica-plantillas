import { NextRequest, NextResponse } from 'next/server';
import { filterWorkspaceLibrary, loadWorkspaceLibrary } from '@/lib/workspace/research';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const query = new URL(request.url).searchParams.get('q') || '';
  return NextResponse.json({
    ok: true,
    source: 'lex-mx-local-import',
    items: filterWorkspaceLibrary(loadWorkspaceLibrary(), query),
  });
}
