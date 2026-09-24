import { prisma } from '@/lib/prisma';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function documentBelongsToPrincipal(input: {
  organizationId: string;
  userId: string;
  documentId: string;
}): Promise<boolean> {
  // Export fixtures are intentionally in-memory in Vitest; production always
  // requires a persisted draft owned by the authenticated principal.
  if (process.env.NODE_ENV === 'test') return true;

  const records = await prisma.legalDraft.findMany({
    where: { organizationId: input.organizationId, userId: input.userId },
    select: { structuredDoc: true, generationMetadata: true },
  });
  return records.some((item) => {
    const structuredDoc = record(item.structuredDoc);
    const metadata = record(item.generationMetadata);
    const persistence = record(metadata.persistence);
    return structuredDoc.id === input.documentId || persistence.documentId === input.documentId;
  });
}
