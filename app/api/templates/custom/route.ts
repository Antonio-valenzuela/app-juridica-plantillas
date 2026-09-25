import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireCaseAccess } from '@/lib/cases/access';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { sanitizeTemplateContent } from '@/lib/templates/templateSanitizer';
import { filterVisibleTemplates, markTemplateAsUserOwned } from '@/lib/templates/templateOrigin';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';
import {
  TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT,
  validateTemplateCreationPayload,
  type TemplateCreationPayloadValidation,
} from '@/lib/templates/templateCreationIntent';
import fs from 'fs';
import path from 'path';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Limpia extracción sin perder saltos de párrafo ni caracteres jurídicos. */
const sanitizeExtractedText = sanitizeTemplateContent;

/** Genera un slug URL-safe desde un título */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

function explicitIntentErrorResponse() {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      error: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT,
      code: TEMPLATE_CREATION_REQUIRES_EXPLICIT_INTENT,
    },
    { status: 400 },
  );
}

const customTemplateJsonSchema = z.object({
  entityKind: z.literal('TEMPLATE'),
  creationIntent: z.literal('EXPLICIT_TEMPLATE'),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100).default('General'),
  slug: z.string().optional(),
  jurisdiction: z.string().optional().default('federal'),
  practiceArea: z.string().optional(),
  documentType: z.string().min(1).default('machote'),
  description: z.string().optional(),
  legalBasis: z.string().optional(),
  applicableLaws: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  disclaimer: z.string().optional(),
  exportFormats: z.array(z.string()).optional(),
  variables: z.any().optional(),
  structureJson: z.any().optional(),
  originalText: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  aiInstructions: z.string().optional().nullable(),
  systemPrompt: z.string().optional().nullable(),
  sourceFileName: z.string().optional().nullable(),
  visibility: z.enum(['PRIVATE', 'ORG', 'PUBLIC']).optional().default('ORG'),
});

export async function GET(request: NextRequest) {
  try {
    const access = await requireCaseAccess(request);
    // Sin identidad resuelta NO se lista nada (evita exponer plantillas ajenas).
    if (!access.ok) return access.response;
    const orgId = access.context.organizationId;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const includeLegacy = searchParams.get('includeLegacy') === 'true';
    const includeTestDemo = searchParams.get('includeTestDemo') === 'true';
    const includeDemo = searchParams.get('includeDemo') === 'true';

    // LegalTemplate exige organizationId: el usuario sólo puede listar
    // plantillas de su propia organización, incluyendo las creadas por él.
    const where: any = { organizationId: orgId };

    if (q) {
      where.AND = [
        {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { content: { contains: q, mode: 'insensitive' } },
            { legalBasis: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const templates = await prisma.legalTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        category: true,
        jurisdiction: true,
        practiceArea: true,
        documentType: true,
        description: true,
        legalBasis: true,
        applicableLaws: true,
        warnings: true,
        disclaimer: true,
        exportFormats: true,
        structureJson: true,
        originalText: true,
        content: true,
        variables: true,
        visibility: true,
        version: true,
        indexed: true,
        indexedAt: true,
        createdBy: true,
        sourceFileName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const visibleTemplates = filterVisibleTemplates(templates, {
      includeLegacy,
      includeTestDemo,
      includeDemo,
    }).map((template) => ({
      ...template,
      originalText: sanitizeExtractedText(template.originalText),
      content: sanitizeExtractedText(template.content),
    }));

    return NextResponse.json({ ok: true, success: true, templates: visibleTemplates });
  } catch (error: any) {
    console.error('[templates/custom] GET Error:', error);
    return NextResponse.json(
      { ok: false, success: false, error: 'No fue posible obtener las plantillas.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Identidad OBLIGATORIA: sin workspace resuelto no se crea nada bajo
    // identificadores falsos (rompería el scoping y la trazabilidad).
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;
    const orgId = access.context.organizationId;
    const userId = access.context.userId;

    const contentType = request.headers.get('content-type') || '';

    // ── MODO 1: SUBIDA CON ARCHIVO FÍSICO (FormData) ─────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const intentValidation: TemplateCreationPayloadValidation = validateTemplateCreationPayload({
        entityKind: formData.get('entityKind'),
        creationIntent: formData.get('creationIntent'),
      });
      if (!intentValidation.ok) return explicitIntentErrorResponse();

      const rawFile = formData.get('file');
      if (rawFile !== null && !(rawFile instanceof File)) {
        return NextResponse.json(
          { ok: false, success: false, error: 'El archivo recibido no es válido.' },
          { status: 400 }
        );
      }
      const file = rawFile as File | null;
      if (file && file.size <= 0) {
        return NextResponse.json(
          { ok: false, success: false, error: 'El archivo recibido está vacío.' },
          { status: 400 }
        );
      }

      const rawTitleValue = formData.get('title');
      const rawCategoryValue = formData.get('category');
      const rawDocumentContent = formData.get('documentContent');
      if (
        (rawTitleValue !== null && typeof rawTitleValue !== 'string')
        || (rawCategoryValue !== null && typeof rawCategoryValue !== 'string')
        || (rawDocumentContent !== null && typeof rawDocumentContent !== 'string')
      ) {
        return NextResponse.json(
          { ok: false, success: false, error: 'Los datos de la plantilla no son válidos.' },
          { status: 400 }
        );
      }

      const rawTitle = typeof rawTitleValue === 'string' ? rawTitleValue.trim() : '';
      const rawCategory = typeof rawCategoryValue === 'string' ? rawCategoryValue.trim() : '';
      if ((rawTitleValue !== null && !rawTitle) || (rawCategoryValue !== null && !rawCategory)) {
        return NextResponse.json(
          { ok: false, success: false, error: 'El título y la categoría no pueden estar vacíos.' },
          { status: 400 }
        );
      }

      const title = (rawTitle || file?.name?.replace(/\.[^/.]+$/, '') || 'Machote Oficial').trim();
      const category = rawCategory || 'Amparo';
      const legalBasisValue = formData.get('legalBasis');
      const legalBasis = typeof legalBasisValue === 'string' ? legalBasisValue.trim() || null : null;
      let documentContent = typeof rawDocumentContent === 'string' ? rawDocumentContent.trim() : '';
      let storage: Record<string, any> | null = null;
      let createdFilePath: string | null = null;

      const sourceFileName = file?.name || null;
      let fileUrl: string | null = null;
      let pageCount = 1;

      // 1. Guardar archivo físico en almacenamiento persistente (OBLIGATORIO)
      if (file && file.size > 0) {
        // Validaciones de entrada (espejo de analyze-upload): tamaño y extensión.
        const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
        const ALLOWED_EXTS = ['pdf', 'docx', 'doc', 'txt', 'rtf', 'jpg', 'jpeg', 'png'];
        const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { ok: false, success: false, error: 'El archivo excede el límite de 15 MB.' },
            { status: 400 }
          );
        }
        if (!ALLOWED_EXTS.includes(fileExt)) {
          return NextResponse.json(
            { ok: false, success: false, error: `Tipo de archivo no permitido (${fileExt}). Permitidos: ${ALLOWED_EXTS.join(', ')}.` },
            { status: 400 }
          );
        }

        const uploadDir = resolveLexPlantillasStoragePaths().templates;
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const savedFileName = `${Date.now()}-${sanitizedName}`;
        const filePath = path.join(uploadDir, savedFileName);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        createdFilePath = filePath;
        fs.writeFileSync(filePath, buffer);

        fileUrl = `/api/templates/files/${savedFileName}`;

        // 2. Extracción semántica ligera para IA (OPCIONAL - NUNCA ABORTA SI FALLA)
        try {
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'pdf') {
            const pdfResult = await extractPdfTextServer(buffer);
            pageCount = pdfResult.numpages || 1;
            const cleaned = sanitizeExtractedText(pdfResult.text || '');
            if (cleaned.length > 20 && !documentContent) {
              documentContent = cleaned;
            }
          }
        } catch (e: any) {
          console.warn('[templates/custom] Extracción auxiliar no bloqueante omitida:', e?.message);
        }

        storage = {
          filePath,
          savedFileName,
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(),
        };
      }

      documentContent = sanitizeExtractedText(documentContent);
      if (!documentContent) {
        if (createdFilePath) {
          try {
            if (fs.existsSync(createdFilePath)) fs.unlinkSync(createdFilePath);
          } catch (cleanupError) {
            const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            console.warn('[templates/custom] No fue posible limpiar el archivo temporal:', message);
          }
        }
        return NextResponse.json(
          { ok: false, success: false, error: 'Por favor selecciona un archivo o escribe el contenido del machote.' },
          { status: 400 }
        );
      }

      const reviewedTemplate = analyzePersonalTemplateText(documentContent, {
        sourceFileName: sourceFileName || undefined,
        pageCount,
      });
      const safeTemplateText = reviewedTemplate.parameterizedText ?? documentContent;
      const safeStructure = {
        ...reviewedTemplate.structureJson,
        ...(fileUrl ? { pageCount, fileUrl } : {}),
        ...(storage ? { storage } : {}),
      };
      const safeVariables: any = reviewedTemplate.variables.length > 0
        ? reviewedTemplate.variables
        : { QUEJOSO: '', EXPEDIENTE: '', AUTORIDAD: '', FECHA: '' };

      const baseSlug = slugify(title) || 'machote';
      const slug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

      const template = await prisma.legalTemplate.create({
        data: {
          organizationId: orgId,
          createdBy: userId,
          title,
          slug,
          category,
          jurisdiction: 'federal',
          practiceArea: category.toLowerCase(),
          documentType: 'machote',
          description: `Machote oficial (${sourceFileName || 'Documento'})`,
          legalBasis,
          applicableLaws: [],
          warnings: [],
          exportFormats: ['docx', 'pdf', 'text'],
          variables: safeVariables,
          structureJson: markTemplateAsUserOwned(safeStructure),
          originalText: safeTemplateText || null,
          content: safeTemplateText || null,
          sourceFileName,
          visibility: 'ORG',
          version: 1,
          indexed: false,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          success: true,
          id: template.id,
          filename: sourceFileName,
          pages: pageCount,
          template,
        },
        { status: 201 }
      );
    }

    // ── MODO 2: TEXTO PLANO / JSON ───────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, success: false, error: 'El cuerpo JSON no es válido.', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }
    const intentValidation: TemplateCreationPayloadValidation = validateTemplateCreationPayload(body);
    if (!intentValidation.ok) return explicitIntentErrorResponse();

    const parsed = customTemplateJsonSchema.parse(body);

    // The server is the last privacy boundary. Even clients that do not use
    // the review modal cannot persist a case-specific document as a reusable
    // template: labels, dates, case numbers and known canaries are converted
    // to semantic fields before the row is written.
    const submittedText = sanitizeExtractedText(parsed.originalText ?? parsed.content ?? '');
    if (!submittedText) {
      return NextResponse.json(
        { ok: false, success: false, error: 'El contenido del machote no puede estar vacío.' },
        { status: 400 }
      );
    }
    const reviewedTemplate = analyzePersonalTemplateText(submittedText, {
      sourceFileName: parsed.sourceFileName || undefined,
    });
    const safeTemplateText = reviewedTemplate.parameterizedText ?? submittedText;
    const safeStructure = reviewedTemplate.structureJson;
    const safeVariables = JSON.parse(JSON.stringify(reviewedTemplate.variables));

    const baseSlug = slugify(parsed.title) || 'machote';
    const slug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const template = await prisma.legalTemplate.create({
      data: {
        organizationId: orgId,
        createdBy: userId,
        title: parsed.title.trim(),
        slug,
        category: parsed.category,
        jurisdiction: parsed.jurisdiction || 'federal',
        practiceArea: parsed.practiceArea || parsed.category.toLowerCase(),
        documentType: parsed.documentType,
        description: parsed.description || `Machote personalizado (${parsed.category})`,
        legalBasis: parsed.legalBasis || null,
        applicableLaws: parsed.applicableLaws ?? [],
        warnings: parsed.warnings ?? [],
        disclaimer: parsed.disclaimer || null,
        exportFormats: parsed.exportFormats ?? ['docx', 'pdf', 'text'],
        variables: safeVariables,
        structureJson: markTemplateAsUserOwned(safeStructure),
        originalText: safeTemplateText || null,
        content: safeTemplateText || null,
        aiInstructions: parsed.aiInstructions || null,
        systemPrompt: parsed.systemPrompt || null,
        sourceFileName: parsed.sourceFileName || null,
        visibility: parsed.visibility,
        version: 1,
        indexed: false,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        success: true,
        id: template.id,
        filename: parsed.sourceFileName,
        pages: 1,
        template,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[templates/custom] POST Error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, success: false, error: 'Datos no válidos para la plantilla.', details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, success: false, error: 'No fue posible guardar el machote.' },
      { status: 500 }
    );
  }
}
