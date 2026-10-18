import 'server-only';
import { DesktopRecordRepository } from './desktopRecordRepository';
import type { WorkspaceCaseSummary } from './cases';
export interface DesktopCase extends WorkspaceCaseSummary {
  notes: string;
  draftIds: string[];
  importedRecords?: Array<{ id: string; scanId: string; sha256: string; storageRelativePath: string }>;
  kind: 'LOCAL_CASE';
}
export function desktopCases() {
  return new DesktopRecordRepository<DesktopCase>('cases', item => item.kind === 'LOCAL_CASE' && typeof item.title === 'string'
    && Array.isArray(item.draftIds) && item.draftIds.every(id => /^[0-9a-f-]{36}$/.test(id)) && typeof item.notes === 'string');
}
