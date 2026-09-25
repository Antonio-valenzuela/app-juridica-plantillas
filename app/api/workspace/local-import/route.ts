import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
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

function publicSource(source: { kind: 'DIRECTORY' | 'ZIP'; path: string; limited: boolean }) {
  return {
    kind: source.kind,
    name: path.basename(source.path),
    limited: source.limited,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action?: 'analyze' | 'import';
      sourcePath?: string;
      limit?: number;
      scanId?: string;
      recordIds?: string[];
    };

    if (body.action === 'import') {
      if (!body.scanId || !Array.isArray(body.recordIds)) {
        return NextResponse.json({ ok: false, error: 'Selecciona un inventario y al menos un archivo.' }, { status: 400 });
      }
      const result = await store.importSelected(body.scanId, body.recordIds);
      return NextResponse.json({ ok: true, ...result });
    }

    if (!body.sourcePath?.trim()) {
      return NextResponse.json({ ok: false, error: 'Indica la ruta local de una carpeta o archivo ZIP.' }, { status: 400 });
    }

    const scanned = await scanLocalImportSource(body.sourcePath.trim(), {
      limit: Number.isInteger(body.limit) && body.limit! > 0 ? body.limit : undefined,
    });
    const saved = await store.saveScan(scanned.source, scanned.inventory);
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
  try {
    const query = new URL(request.url).searchParams.get('q') || '';
    return NextResponse.json({ ok: true, items: await store.listImportedRecords(query) });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}
