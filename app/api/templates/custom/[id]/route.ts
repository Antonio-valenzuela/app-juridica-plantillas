import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { LIFECYCLE_METADATA_KEY, readDocumentLifecycle } from '@/lib/legal-engine/documentLifecycle';
import { filterVisibleTemplates, markTemplateAsUserOwned } from '@/lib/templates/templateOrigin';
import { sanitizeTemplateContent } from '@/lib/templates/templateSanitizer';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import path from 'node:path';
import { deleteOwnedTemplateFile } from '@/lib/security/templateFileCleanup';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

export const dynamic = 'force-dynamic';

const TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT = 'TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT';

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasLifecycleMetadata(value: unknown): boolean {
  return isRecord(value)
    && (Object.prototype.hasOwnProperty.call(value, LIFECYCLE_METADATA_KEY)
      || Object.prototype.hasOwnProperty.call(value, 'lifecycle'));
}

function isValidTemplateLifecycle(
  lifecycle: ReturnType<typeof readDocumentLifecycle>,
): boolean {
  if (!lifecycle) return false;
  return lifecycle.entityKind === 'TEMPLATE'
    && lifecycle.creationIntent === 'EXPLICIT_TEMPLATE'
    && (lifecycle.originClass === 'system'
      || lifecycle.originClass === 'user'
      || lifecycle.originClass === 'test_demo');
}

function hasExplicitTemplateIntent(input: unknown): boolean {
  return isRecord(input)
    && input.entityKind === 'TEMPLATE'
    && input.creationIntent === 'EXPLICIT_TEMPLATE';
}

function explicitIntentErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT,
      code: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT,
    },
    { status: 400 },
  );
}

function revalidateTemplateStructure(structureJson: unknown): Record<string, any> | null {
  if (hasLifecycleMetadata(structureJson)) {
    const lifecycle = readDocumentLifecycle(structureJson);
    if (!isValidTemplateLifecycle(lifecycle) || !isRecord(structureJson)) return null;

    const templateLifecycle = {
      entityKind: 'TEMPLATE' as const,
      originClass: 'user' as const,
      creationIntent: 'EXPLICIT_TEMPLATE' as const,
    };
    const revalidated: Record<string, any> = {
      ...structureJson,
      [LIFECYCLE_METADATA_KEY]: {
        ...(isRecord(structureJson[LIFECYCLE_METADATA_KEY])
          ? structureJson[LIFECYCLE_METADATA_KEY]
          : {}),
        ...templateLifecycle,
      },
    };
    if (isRecord(structureJson.lifecycle)) {
      revalidated.lifecycle = {
        ...structureJson.lifecycle,
        ...templateLifecycle,
      };
    }
    return revalidated;
  }
  return markTemplateAsUserOwned(structureJson);
}

// Solo campos editables por el abogado — nunca permite sobreescribir organizationId/createdBy/version/indexed
const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().optional(),
  category: z.string().trim().min(1).max(100).optional(),
  jurisdiction: z.string().optional(),
  practiceArea: z.string().optional(),
  documentType: z.string().optional(),
  description: z.string().optional(),
  legalBasis: z.string().optional(),
  applicableLaws: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  exportFormats: z.array(z.string()).optional(),
  variables: z.any().optional(),
  structureJson: z.any().optional(),
  originalText: z.string().optional(),
  content: z.string().optional(),
  aiInstructions: z.string().optional(),
  systemPrompt: z.string().optional(),
  sourceFileName: z.string().optional(),
  visibility: z.enum(['PRIVATE', 'ORG', 'PUBLIC']).optional(),
  entityKind: z.literal('TEMPLATE').optional(),
  creationIntent: z.literal('EXPLICIT_TEMPLATE').optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const orgId = access.context.organizationId;

    const template = await prisma.legalTemplate.findFirst({
      where: {
        id,
        OR: [
          { organizationId: orgId },
          { visibility: 'PUBLIC' },
        ],
      },
    });

    if (!template) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const visibleTemplates = filterVisibleTemplates([template], {
      includeLegacy: searchParams.get('includeLegacy') === 'true',
      includeTestDemo: searchParams.get('includeTestDemo') === 'true',
      includeDemo: searchParams.get('includeDemo') === 'true',
    });
    if (visibleTemplates.length === 0) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      template: {
        ...template,
        originalText: sanitizeTemplateContent(template.originalText),
        content: sanitizeTemplateContent(template.content),
      },
    });
  } catch (error: any) {
    console.error('[templates/custom/[id]] GET Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al obtener la plantilla.' },
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
    // Mutaciones: scope ESTRICTO al organizationId autenticado. Nunca al tenant compartido 'demo-legal'.
    const orgId = access.context.organizationId;

    const existing = await prisma.legalTemplate.findFirst({
      where: {
        id,
        organizationId: orgId,
      },
      select: { id: true, structureJson: true, variables: true, sourceFileName: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    if (!hasLifecycleMetadata(existing.structureJson)
      || !isValidTemplateLifecycle(readDocumentLifecycle(existing.structureJson))) {
      return explicitIntentErrorResponse();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'El cuerpo JSON no es válido.', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }
    if (isRecord(body)
      && (Object.prototype.hasOwnProperty.call(body, 'entityKind')
        || Object.prototype.hasOwnProperty.call(body, 'creationIntent'))
    ) {
      if (!hasExplicitTemplateIntent(body)) return explicitIntentErrorResponse();
    }

    const parsed = patchSchema.parse(body);
    if (hasLifecycleMetadata(parsed.structureJson)
      && !isValidTemplateLifecycle(readDocumentLifecycle(parsed.structureJson))) {
      return explicitIntentErrorResponse();
    }
    const normalizedPatch: Record<string, any> = {
      ...parsed,
      ...(parsed.originalText !== undefined
        ? { originalText: sanitizeTemplateContent(parsed.originalText) }
        : {}),
      ...(parsed.content !== undefined
        ? { content: sanitizeTemplateContent(parsed.content) }
        : {}),
    };
    delete normalizedPatch.variables;
    if (parsed.originalText !== undefined || parsed.content !== undefined) {
      const submittedText = sanitizeTemplateContent(parsed.originalText ?? parsed.content ?? '');
      if (!submittedText) {
        return NextResponse.json(
          { ok: false, error: 'El contenido de la plantilla no puede estar vacío.' },
          { status: 400 },
        );
      }
      const reviewed = analyzePersonalTemplateText(submittedText, {
        sourceFileName: parsed.sourceFileName || existing.sourceFileName || undefined,
      });
      const parameterizedText = sanitizeTemplateContent(reviewed.parameterizedText);
      if (!parameterizedText) {
        return NextResponse.json(
          { ok: false, error: 'El contenido de la plantilla no puede estar vacío.' },
          { status: 400 },
        );
      }
      normalizedPatch.originalText = parameterizedText;
      normalizedPatch.content = parameterizedText;
      normalizedPatch.structureJson = reviewed.structureJson;
      normalizedPatch.variables = reviewed.variables;
    } else if (parsed.structureJson !== undefined) {
      // No se acepta una estructura arbitraria sin texto revisado; se conserva
      // únicamente la estructura ya persistida de la plantilla.
      delete normalizedPatch.structureJson;
    }

    delete normalizedPatch.entityKind;
    delete normalizedPatch.creationIntent;
    const templateStructure = revalidateTemplateStructure(
      normalizedPatch.structureJson ?? existing.structureJson,
    );
    if (!templateStructure) return explicitIntentErrorResponse();

    const updateResult = await prisma.legalTemplate.updateMany({
      where: { id, organizationId: orgId },
      data: {
        ...normalizedPatch,
        structureJson: templateStructure,
        version: { increment: 1 },
        updatedAt: new Date(),
        indexed: false,
        indexedAt: null,
        contentHash: null,
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    const updated = await prisma.legalTemplate.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, template: updated });
  } catch (error: any) {
    console.error('[templates/custom/[id]] PATCH Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Datos no válidos.', details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: 'Error al actualizar la plantilla.' },
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
    // Mutaciones: scope ESTRICTO al organizationId autenticado. Nunca al tenant compartido 'demo-legal'.
    const orgId = access.context.organizationId;

    const existing = await prisma.legalTemplate.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, structureJson: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    const structure = isRecord(existing.structureJson)
      ? existing.structureJson as Record<string, unknown>
      : null;
    const storage = structure && isRecord(structure.storage) ? structure.storage : null;
    const savedFileName = storage?.savedFileName;
    if (savedFileName !== undefined && typeof savedFileName !== 'string') {
      return NextResponse.json(
        { ok: false, errorCode: 'TEMPLATE_FILE_CLEANUP_FAILED', error: 'No fue posible validar el archivo asociado.' },
        { status: 409 },
      );
    }

    if (typeof savedFileName === 'string') {
      let cleanupResult: Awaited<ReturnType<typeof deleteOwnedTemplateFile>>;
      try {
        cleanupResult = await deleteOwnedTemplateFile({
          storageRoot: resolveLexPlantillasStoragePaths().templates,
          savedFileName,
        });
      } catch (error) {
        console.error('[templates/custom/[id]] DELETE file cleanup failed:', error);
        return NextResponse.json(
          { ok: false, errorCode: 'TEMPLATE_FILE_CLEANUP_FAILED', error: 'No fue posible limpiar el archivo asociado.' },
          { status: 500 },
        );
      }
      if (cleanupResult === 'SKIPPED_INVALID') {
        return NextResponse.json(
          { ok: false, errorCode: 'TEMPLATE_FILE_CLEANUP_FAILED', error: 'La ruta del archivo asociado no es segura.' },
          { status: 409 },
        );
      }
    }

    const deleted = await prisma.legalTemplate.deleteMany({
      where: {
        id,
        organizationId: orgId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ ok: false, error: 'Plantilla no encontrada.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[templates/custom/[id]] DELETE Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Error al eliminar la plantilla.' },
      { status: 500 }
    );
  }
}
