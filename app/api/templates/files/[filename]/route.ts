import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireCaseAccess } from '@/lib/cases/access';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const UPLOADS_BASE = path.join(process.cwd(), 'data', 'uploads', 'templates');

const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'txt', 'png', 'jpg', 'jpeg']);

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain; charset=utf-8',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const access = await requireCaseAccess(request);
    if (!access.ok) return access.response;

    const { filename } = await params;
    const sanitized = path.basename(filename);
    const ext = sanitized.split('.').pop()?.toLowerCase() || '';

    // Solo tipos de documento/plantilla conocidos — nada ejecutable ni arbitrario.
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ ok: false, error: 'Tipo de archivo no permitido.' }, { status: 403 });
    }

    const filePath = path.resolve(UPLOADS_BASE, sanitized);

    // Contención estricta: el archivo resuelto debe vivir dentro del directorio de uploads.
    if (filePath !== UPLOADS_BASE && !filePath.startsWith(UPLOADS_BASE + path.sep)) {
      return NextResponse.json({ ok: false, error: 'Archivo no encontrado.' }, { status: 404 });
    }

    const template = await prisma.legalTemplate.findFirst({
      where: {
        organizationId: access.context.organizationId,
        createdBy: access.context.userId,
        structureJson: { path: ['storage', 'savedFileName'], equals: sanitized },
      },
      select: { id: true },
    });
    if (!template) {
      return NextResponse.json({ ok: false, error: 'Archivo no encontrado.' }, { status: 404 });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ ok: false, error: 'Archivo no encontrado.' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': CONTENT_TYPES[ext],
        'Content-Disposition': `inline; filename="${sanitized}"`,
        'X-Content-Type-Options': 'nosniff',
        // Documentos de clientes: no cacheables por proxies/CDN compartidos.
        'Cache-Control': 'private, max-age=600',
      },
    });
  } catch (error: any) {
    console.error('[templates/files] Error:', error);
    return NextResponse.json({ ok: false, error: 'Error al servir archivo.' }, { status: 500 });
  }
}
