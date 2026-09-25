import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  extractLocalImportZipEntries,
  hashLocalFile,
  type LocalImportSourceInfo,
  type LocalImportZipSelection,
} from './localImportSource';
import type { LocalImportInventory, LocalImportRecord } from './localImporter';

export interface SavedLocalImportScan {
  scanId: string;
  createdAt: string;
  source: LocalImportSourceInfo;
  inventory: LocalImportInventory;
}

export interface LocalImportResult {
  imported: Array<LocalImportRecord & { storageRelativePath: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

export interface LocalImportStorePaths {
  scansRoot?: string;
  documentsRoot?: string;
}

function safeScanId(scanId: string): string {
  return scanId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function isInside(root: string, target: string): boolean {
  const normalizedRoot = path.resolve(root) + path.sep;
  return path.resolve(target).startsWith(normalizedRoot);
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export class LocalImportStore {
  private readonly root: string;
  private readonly scansRoot: string;
  private readonly documentsRoot: string;

  constructor(root: string, paths: LocalImportStorePaths = {}) {
    this.root = path.resolve(root);
    this.scansRoot = path.resolve(paths.scansRoot || path.join(this.root, 'scans'));
    this.documentsRoot = path.resolve(paths.documentsRoot || path.join(this.root, 'documents'));
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.scansRoot, { recursive: true });
    await mkdir(this.documentsRoot, { recursive: true });
  }

  private scanPath(scanId: string): string {
    const safeId = safeScanId(scanId);
    if (!safeId) throw new Error('Inventario local inválido.');
    return path.join(this.scansRoot, `${safeId}.json`);
  }

  async saveScan(source: LocalImportSourceInfo, inventory: LocalImportInventory): Promise<SavedLocalImportScan> {
    await this.ensureDirectories();
    const saved: SavedLocalImportScan = {
      scanId: `${Date.now()}-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      source,
      inventory,
    };
    await writeJsonAtomically(this.scanPath(saved.scanId), saved);
    return saved;
  }

  async loadScan(scanId: string): Promise<SavedLocalImportScan> {
    const saved = JSON.parse(await readFile(this.scanPath(scanId), 'utf8')) as SavedLocalImportScan;
    if (!saved?.scanId || !saved?.source?.path || !Array.isArray(saved.inventory?.records)) {
      throw new Error('El inventario local no es válido.');
    }
    return saved;
  }

  async listImportedRecords(rawQuery = ''): Promise<LocalImportRecord[]> {
    await this.ensureDirectories();
    const query = rawQuery.trim().toLocaleLowerCase();
    const files = await readdir(this.scansRoot);
    const records: LocalImportRecord[] = [];
    for (const file of files.filter((candidate) => candidate.endsWith('.json'))) {
      try {
        const saved = JSON.parse(await readFile(path.join(this.scansRoot, file), 'utf8')) as SavedLocalImportScan;
        for (const record of saved.inventory.records) {
          const searchable = `${record.name} ${record.relativePath} ${record.category} ${record.matter}`.toLocaleLowerCase();
          if (record.imported && (!query || searchable.includes(query))) records.push(record);
        }
      } catch {
        // Un inventario corrupto no debe impedir consultar los demás.
      }
    }
    return records.sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
  }

  async importSelected(scanId: string, recordIds: string[]): Promise<LocalImportResult> {
    await this.ensureDirectories();
    const saved = await this.loadScan(scanId);
    const selectedIds = new Set(recordIds);
    const selected = saved.inventory.records.filter((record) => selectedIds.has(record.id));
    const skipped: LocalImportResult['skipped'] = [];
    const eligible: LocalImportRecord[] = [];

    for (const record of selected) {
      if (record.imported) {
        skipped.push({ id: record.id, reason: 'YA_IMPORTADO' });
      } else if (record.status !== 'IMPORTABLE') {
        skipped.push({ id: record.id, reason: record.status });
      } else {
        eligible.push(record);
      }
    }

    const selectedForZip: LocalImportZipSelection[] = [];
    const pendingFiles = new Map<string, { outputName: string; temporaryOutputName: string }>();
    const imported: LocalImportResult['imported'] = [];
    for (const record of eligible) {
      const outputName = `${record.sha256.slice(0, 16)}${record.extension || '.bin'}`;
      const temporaryOutputName = `.${outputName}.${randomUUID()}.partial`;
      const temporaryDestination = path.join(this.documentsRoot, temporaryOutputName);
      if (!isInside(this.root, temporaryDestination)) throw new Error('Destino de importación inválido.');
      pendingFiles.set(record.id, { outputName, temporaryOutputName });

      if (saved.source.kind === 'ZIP') {
        selectedForZip.push({ id: record.id, relativePath: record.relativePath, outputName: temporaryOutputName });
      } else {
        const sourceFile = path.resolve(saved.source.path, record.relativePath);
        if (!isInside(saved.source.path, sourceFile)) throw new Error('Ruta de origen inválida.');
        await copyFile(sourceFile, temporaryDestination);
      }

      imported.push({ ...record, imported: true, importedAt: new Date().toISOString(), storageRelativePath: path.join('documents', outputName) });
    }

    try {
      if (selectedForZip.length > 0) {
        await extractLocalImportZipEntries(saved.source.path, this.documentsRoot, selectedForZip);
      }

      for (const record of imported) {
        const pending = pendingFiles.get(record.id);
        if (!pending) throw new Error(`No se encontró el archivo temporal importado: ${record.name}`);
        const temporaryDestination = path.join(this.documentsRoot, pending.temporaryOutputName);
        const destination = path.join(this.documentsRoot, pending.outputName);
        const destinationStat = await stat(temporaryDestination);
        if (!destinationStat.isFile() || await hashLocalFile(temporaryDestination) !== record.sha256) {
          throw new Error(`No se pudo verificar el archivo importado: ${record.name}`);
        }
        await rename(temporaryDestination, destination);
        const index = saved.inventory.records.findIndex((candidate) => candidate.id === record.id);
        if (index >= 0) saved.inventory.records[index] = record;
      }

      saved.inventory.summary.importable = saved.inventory.records.filter((record) => record.status === 'IMPORTABLE' && !record.imported).length;
      await writeJsonAtomically(this.scanPath(saved.scanId), saved);
    } catch (error) {
      await Promise.all([...pendingFiles.values()].map(({ temporaryOutputName }) => unlink(path.join(this.documentsRoot, temporaryOutputName)).catch(() => undefined)));
      throw error;
    }
    return { imported, skipped };
  }
}
