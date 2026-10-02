import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceExecutionAccess } from '@/lib/security/workspaceExecutionAccess';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';
import { desktopCases } from '@/lib/workspace/desktopCaseRepository';
import { defaultWorkspaceManager } from '@/lib/workspace/legalWorkspace';
import { scanLocalImportSource } from '@/lib/workspace/localImportSource';
import { LocalImportStore } from '@/lib/workspace/localImportStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const storagePaths = defaultWorkspaceManager.getStoragePaths();
const store = new LocalImportStore(storagePaths.root, {
  scansRoot: storagePaths.imports,
  documentsRoot: storagePaths.documents,
});
function localStore() {
  const paths = resolveLexPlantillasStoragePaths();
  return new LocalImportStore(paths.root, { scansRoot: paths.imports, documentsRoot: paths.documents });
}

function publicSource(source: { kind: 'DIRECTORY' | 'ZIP'; path: string; limited: boolean }) {
  return {
    kind: source.kind,
    name: path.basename(source.path),
    limited: source.limited,
  };
}

export async function POST(request: NextRequest) {
  const access = await requireWorkspaceExecutionAccess(request);
  if (!access.ok) return access.response;
  const selectedStore = access.context.kind === 'DESKTOP_LOCAL' ? localStore() : store;

  try {
    const body = await request.json() as {
      action?: 'analyze' | 'import';
      sourcePath?: string;
      limit?: number;
      scanId?: string;
      recordIds?: string[];
      caseId?: string;
    };

    if (body.action === 'import') {
      if (!body.scanId || !Array.isArray(body.recordIds)) {
        return NextResponse.json({ ok: false, error: 'Selecciona un inventario y al menos un archivo.' }, { status: 400 });
      }
      if (access.context.kind === 'DESKTOP_LOCAL' && body.caseId && (!/^[0-9a-f-]{36}$/.test(body.caseId) || !await desktopCases().find(body.caseId))) {
        return NextResponse.json({ ok: false, error: 'CASE_NOT_FOUND' }, { status: 404 });
      }
      const result = await selectedStore.importSelected(body.scanId, body.recordIds);
      if (access.context.kind === 'DESKTOP_LOCAL' && body.caseId) {
        const saved = await selectedStore.loadScan(body.scanId);
        const selectedIds = new Set(body.recordIds);
        const references = saved.inventory.records.filter(record => record.imported && selectedIds.has(record.id) && record.storageRelativePath)
          .map(record => ({ id: record.id, scanId: saved.scanId, sha256: record.sha256, storageRelativePath: record.storageRelativePath! }));
        const linked = await desktopCases().mutate(body.caseId, current => current ? { ...current,
          importedRecords: [...(current.importedRecords || []).filter(record => !references.some(ref => ref.sha256 === record.sha256)), ...references],
          updatedAt: new Date().toISOString() } : null);
        if (!linked) return NextResponse.json({ ok: false, error: 'CASE_ASSOCIATION_FAILED', imported: result.imported }, { status: 409 });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    if (!body.sourcePath?.trim()) {
      return NextResponse.json({ ok: false, error: 'Indica la ruta local de una carpeta o archivo ZIP.' }, { status: 400 });
    }

    const scanned = await scanLocalImportSource(body.sourcePath.trim(), {
      limit: Number.isInteger(body.limit) && body.limit! > 0 ? body.limit : undefined,
    });
    const saved = await selectedStore.saveScan(scanned.source, scanned.inventory);
    return NextResponse.json({
      ok: true,
      scanId: saved.scanId,
      source: publicSource(saved.source),
      summary: saved.inventory.summary,
      records: saved.inventory.records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible analizar la fuente local.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const access = await requireWorkspaceExecutionAccess(request);
  if (!access.ok) return access.response;

  try {
    const query = new URL(request.url).searchParams.get('q') || '';
    return NextResponse.json({ ok: true, items: await (access.context.kind === 'DESKTOP_LOCAL' ? localStore() : store).listImportedRecords(query) });
  } catch {
    if (access.context.kind === 'DESKTOP_LOCAL') return NextResponse.json({ ok: false, error: 'LOCAL_IMPORT_READ_FAILED' }, { status: 500 });
    return NextResponse.json({ ok: true, items: [] });
  }
}
