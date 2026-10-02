import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExecutionAccess } from '@/lib/security/workspaceExecutionAccess';
import { loadWorkspaceGenerationArtifact } from '@/lib/legal-engine/generationPersistence';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const auth = await requireWorkspaceExecutionAccess(request);
  if (!auth.ok) return auth.response;
  const { documentId } = await params;
  const document = await loadWorkspaceGenerationArtifact(auth.context, documentId);
  if (!document) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, document, documentId: document.id });
}
