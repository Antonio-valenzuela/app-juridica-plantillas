import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { markDocumentAsDraft, markDocumentAsSource } from '@/lib/legal-engine/documentLifecycle';
import { stripTransientAuditTrace } from '@/lib/legal-engine/legalDocumentSanitizer';

export const dynamic = 'force-dynamic';

const draftSchema = z.object({
  templateId: z.string().optional().nullable(),
  title: z.string().min(1, 'El título del borrador es requerido'),
  documentType: z.string().default('machote'),
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
  status: z.enum(['DRAFT', 'IN_REVIEW', 'READY_FOR_PROFESSIONAL_REVIEW', 'ARCHIVED']).default('DRAFT'),
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

export async function GET(request: NextRequest) {
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const drafts = await prisma.legalDraft.findMany({
      where: {
        organizationId: identity.organizationId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ ok: true, drafts });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al obtener borradores.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const identity = { organizationId: access.context.organizationId, userId: access.context.userId };

    const body = await request.json();
    const parsed = draftSchema.parse(body);
    const structuredDoc = normalizeDraftDocument(parsed.structuredDoc);
    const sourceDocuments = normalizeSourceDocuments(parsed.sourceDocuments) ?? null;

    const draft = await prisma.legalDraft.create({
      data: {
        organizationId: identity.organizationId,
        userId: identity.userId,
        templateId: parsed.templateId || null,
        title: parsed.title.trim(),
        documentType: parsed.documentType,
        matter: parsed.matter || null,
        jurisdiction: parsed.jurisdiction || 'federal',
        formData: (parsed.formData || {}) as any,
        renderedText: parsed.renderedText || '',
        pendingMarkers: (parsed.pendingMarkers || []) as any,
        structuredDoc: structuredDoc as any,
        pipelineState: (parsed.pipelineState || null) as any,
        sourceDocuments: sourceDocuments as any,
        validationResults: (parsed.validationResults || null) as any,
        generationMetadata: stripAuditTraceFromMetadata(parsed.generationMetadata || null) as any,
        status: parsed.status,
      },
    });

    return NextResponse.json({ ok: true, draft }, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Datos de borrador no válidos.', details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof TypeError) {
      return NextResponse.json(
        { ok: false, error: 'Datos de borrador no válidos.', details: [{ message: error.message }] },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message || 'Error al guardar el borrador.' },
      { status: 500 }
    );
  }
}
