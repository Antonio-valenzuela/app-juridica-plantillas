import { NextRequest, NextResponse } from 'next/server';
import { requireLawyerAccess } from '@/lib/security/lawyerAuth';
import { loadGenerationArtifact } from '@/lib/legal-engine/generationPersistence';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const auth = await requireLawyerAccess(request);
  if (!auth.ok) return auth.response;
  const { documentId } = await params;
  const document = await loadGenerationArtifact(auth.context.organizationId, auth.context.userId, documentId);
  if (!document) return NextResponse.json({ ok: false, error: 'DOCUMENT_NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, document, documentId: document.id });
}
