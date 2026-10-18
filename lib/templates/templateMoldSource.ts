import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolveOwnedTemplateFilePath } from '@/lib/security/templateFileCleanup';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

export interface LawyerTemplateSource {
  templateId: string;
  fileName: string | null;
  /** 'docx' permite copiar el diseño; cualquier otro formato no (se avisa al abogado). */
  kind: 'docx' | 'other';
  bytes?: Buffer;
  originalText: string;
}

interface TemplateRecordLike {
  id: string;
  originalText?: string | null;
  content?: string | null;
  sourceFileName?: string | null;
  structureJson?: unknown;
}

function savedFileNameOf(record: TemplateRecordLike): string | null {
  const storage = (record.structureJson as { storage?: { savedFileName?: unknown } } | null)?.storage;
  return typeof storage?.savedFileName === 'string' ? storage.savedFileName : null;
}

/** Convierte un registro de plantilla ya autorizado en su fuente (archivo + texto). Solo lee de la carpeta de plantillas. */
export async function templateSourceFromRecord(
  record: TemplateRecordLike,
  templatesDir: string = resolveLexPlantillasStoragePaths().templates,
): Promise<LawyerTemplateSource> {
  const savedFileName = savedFileNameOf(record);
  const originalText = record.originalText || record.content || '';
  const base = { templateId: record.id, fileName: record.sourceFileName ?? savedFileName, originalText };
  if (!savedFileName || !/\.docx$/i.test(savedFileName)) return { ...base, kind: 'other' };
  const filePath = resolveOwnedTemplateFilePath(templatesDir, savedFileName);
  if (!filePath) return { ...base, kind: 'other' };
  try {
    return { ...base, kind: 'docx', bytes: await readFile(filePath) };
  } catch {
    return { ...base, kind: 'other' };
  }
}

export interface TemplateAccessContext {
  templateId: string;
  organizationId?: string;
  userId?: string;
  local: boolean;
}

/** Busca la plantilla del abogado respetando propiedad (misma regla que /api/templates/files). */
export async function loadLawyerTemplateSource(ctx: TemplateAccessContext): Promise<LawyerTemplateSource | null> {
  if (ctx.local) {
    const { desktopTemplates } = await import('@/lib/workspace/desktopTemplateRepository');
    const record = (await desktopTemplates().list()).find((template) => template.id === ctx.templateId);
    return record ? templateSourceFromRecord(record as unknown as TemplateRecordLike) : null;
  }
  if (!ctx.organizationId || !ctx.userId) return null;
  const { prisma } = await import('@/lib/prisma');
  const record = await prisma.legalTemplate.findFirst({
    where: { id: ctx.templateId, organizationId: ctx.organizationId, createdBy: ctx.userId },
    select: { id: true, originalText: true, content: true, sourceFileName: true, structureJson: true },
  });
  return record ? templateSourceFromRecord(record as TemplateRecordLike) : null;
}

/** Valores del caso nuevo: lo que comparte con la plantilla no se trata como dato viejo. */
export function caseValuesOfDocument(doc: UniversalLegalDocument): string[] {
  return [
    ...Object.values(doc.parties || {}),
    ...Object.values(doc.caseRefs || {}),
    ...Object.values((doc.intake as Record<string, unknown> | undefined) || {}),
    ...Object.values(doc.variables || {}).map((variable: unknown) => (variable as { value?: unknown } | undefined)?.value),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

export { templateDesignNotice } from './templateDesignCopy';
