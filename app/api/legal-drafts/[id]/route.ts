import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { markDocumentAsDraft, markDocumentAsSource } from '@/lib/legal-engine/documentLifecycle';
import { stripTransientAuditTrace } from '@/lib/legal-engine/legalDocumentSanitizer';

export const dynamic = 'force-dynamic';

const updateDraftSchema = z.object({
  title: z.string().optional(),
  templateId: z.string().optional().nullable(),
  matter: z.string().optional().nullable(),
  jurisdiction: z.string().optional().nullable(),
  formData: z.any().optional().nullable(),
  renderedText: z.string().optional().nullable(),
  pendingMarkers: z.any().optional().nullable(),
  structuredDoc: z.any().optional().nullable(),
  pipelineState: z.any().optional().nullable(),
  sourceDocuments: z.any().optional().nullable(),
  validationResults: z.any().optional().nullable(),
  generationMetadata: z.any().optional().nullable(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'READY_FOR_PROFESSIONAL_REVIEW', 'ARCHIVED']).optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSourceDocuments(value: unknown): unknown[] | null | undefined {
  if (value === undefined || value === null) return value;
  if (!Array.isArray(value)) {
    throw new TypeError('sourceDocuments debe ser una lista');
  }

  return value.map((source) => {
    if (!isRecord(source)) {
      throw new TypeError('Cada fuente debe ser un documento objeto');
    }
    const sourceId = typeof source.id === 'string' ? source.id : undefined;
    return markDocumentAsSource(source, sourceId);
  });
}

function normalizeDraftDocument(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new TypeError('structuredDoc debe ser un documento objeto');
  }

  const draft = markDocumentAsDraft(value);
  const persistenceSafeDraft = stripTransientAuditTrace(draft as any);
  const nestedSources = normalizeSourceDocuments(persistenceSafeDraft.sourceDocuments);
  return nestedSources === undefined ? persistenceSafeDraft : { ...persistenceSafeDraft, sourceDocuments: nestedSources };
}

function stripAuditTraceFromMetadata(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const rest = { ...value };
  delete rest.auditTrace;
  return rest;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const draft = await prisma.legalDraft.findFirst({
      where: { id, organizationId: identity.organizationId, userId: identity.userId },
    });

    if (!draft) {
      return NextResponse.json({ ok: false, error: 'Borrador no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, draft });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al obtener borrador.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const body = await request.json();
    const parsed = updateDraftSchema.parse(body);

    const existing = await prisma.legalDraft.findFirst({
      where: { id, organizationId: identity.organizationId, userId: identity.userId },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Borrador no encontrado.' }, { status: 404 });
    }

    const structuredDoc = parsed.structuredDoc !== undefined
      ? normalizeDraftDocument(parsed.structuredDoc)
      : undefined;
    const sourceDocuments = parsed.sourceDocuments !== undefined
      ? normalizeSourceDocuments(parsed.sourceDocuments)
      : undefined;

    const draft = await prisma.legalDraft.update({
      where: { id },
      data: {
        ...(parsed.title ? { title: parsed.title.trim() } : {}),
        ...(parsed.templateId !== undefined ? { templateId: parsed.templateId } : {}),
        ...(parsed.matter !== undefined ? { matter: parsed.matter } : {}),
        ...(parsed.jurisdiction !== undefined ? { jurisdiction: parsed.jurisdiction } : {}),
        ...(parsed.formData !== undefined ? { formData: parsed.formData as any } : {}),
        ...(parsed.renderedText !== undefined ? { renderedText: parsed.renderedText } : {}),
        ...(parsed.pendingMarkers !== undefined ? { pendingMarkers: parsed.pendingMarkers as any } : {}),
        ...(parsed.structuredDoc !== undefined ? { structuredDoc: structuredDoc as any } : {}),
        ...(parsed.pipelineState !== undefined ? { pipelineState: parsed.pipelineState as any } : {}),
        ...(parsed.sourceDocuments !== undefined ? { sourceDocuments: sourceDocuments as any } : {}),
        ...(parsed.validationResults !== undefined ? { validationResults: parsed.validationResults as any } : {}),
        ...(parsed.generationMetadata !== undefined ? { generationMetadata: stripAuditTraceFromMetadata(parsed.generationMetadata) as any } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
      },
    });

    return NextResponse.json({ ok: true, draft });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Datos no válidos.', details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof TypeError) {
      return NextResponse.json(
        { ok: false, error: 'Datos no válidos.', details: [{ message: error.message }] },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al actualizar borrador.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const existing = await prisma.legalDraft.findFirst({
      where: { id, organizationId: identity.organizationId, userId: identity.userId },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Borrador no encontrado.' }, { status: 404 });
    }

    await prisma.legalDraft.deleteMany({ where: { id, organizationId: identity.organizationId, userId: identity.userId } });

    return NextResponse.json({ ok: true, message: 'Borrador eliminado.' });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al eliminar borrador.' },
      { status: 500 }
    );
  }
}
