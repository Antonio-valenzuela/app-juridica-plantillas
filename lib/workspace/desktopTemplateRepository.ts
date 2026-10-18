import 'server-only';
import { randomUUID } from 'node:crypto';
import { DesktopRecordRepository } from './desktopRecordRepository';
import { readDocumentLifecycle } from '@/lib/legal-engine/documentLifecycle';

export interface DesktopTemplate extends Record<string, unknown> {
  id: string; title: string; content: string | null; originalText: string | null;
  structureJson: unknown; variables: unknown; sourceFileName: string | null;
  createdAt: string; updatedAt: string; version: number;
}
export function desktopTemplates() {
  return new DesktopRecordRepository<DesktopTemplate>('templates', record => {
    const lifecycle = readDocumentLifecycle(record.structureJson);
    return typeof record.title === 'string' && lifecycle?.entityKind === 'TEMPLATE'
      && lifecycle.creationIntent === 'EXPLICIT_TEMPLATE' && typeof record.updatedAt === 'string';
  });
}
export async function createDesktopTemplate(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const record = { ...data, id: randomUUID(), createdAt: now, updatedAt: now } as DesktopTemplate;
  delete record.organizationId; delete record.createdBy;
  await desktopTemplates().put(record);
  return record;
}
