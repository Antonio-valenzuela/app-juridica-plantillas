import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLocalImportSource } from '@/lib/workspace/localImportSource';
import { LocalImportStore } from '@/lib/workspace/localImportStore';

describe('local import store', () => {
  it('persists an inventory and imports only selected safe records', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lex-import-store-'));
    const source = path.join(root, 'source');
    const storeRoot = path.join(root, 'workspace');
    try {
      const fs = await import('node:fs/promises');
      await fs.mkdir(source, { recursive: true });
      await fs.writeFile(path.join(source, 'demanda.docx'), 'legal fixture');
      await fs.writeFile(path.join(source, 'firma.key'), 'private fixture');

      const scanned = await scanLocalImportSource(source);
      const store = new LocalImportStore(storeRoot);
      const saved = await store.saveScan(scanned.source, scanned.inventory);
      const safe = scanned.inventory.records.find((record) => record.name === 'demanda.docx')!;
      const security = scanned.inventory.records.find((record) => record.name === 'firma.key')!;

      const result = await store.importSelected(saved.scanId, [safe.id, security.id]);

      expect(result.imported).toHaveLength(1);
      expect(result.skipped).toEqual([{ id: security.id, reason: 'EXCLUIDO_POR_SEGURIDAD' }]);
      expect(await stat(path.join(storeRoot, 'documents', safe.sha256.slice(0, 16) + '.docx'))).toBeTruthy();
      await expect(readFile(path.join(storeRoot, 'documents', safe.sha256.slice(0, 16) + '.docx'), 'utf8')).resolves.toBe('legal fixture');
      expect((await store.loadScan(saved.scanId)).inventory.records.find((record) => record.id === safe.id)?.imported).toBe(true);
      expect((await store.listImportedRecords('demanda')).map((record) => record.id)).toEqual([safe.id]);
      expect(await store.listImportedRecords('firma.key')).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('separates import inventories from document bytes when the app-data layout is provided', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lex-import-layout-'));
    const source = path.join(root, 'source');
    const appDataRoot = path.join(root, 'LexPlantillas');
    const scansRoot = path.join(appDataRoot, 'imports');
    const documentsRoot = path.join(appDataRoot, 'documents');
    try {
      const fs = await import('node:fs/promises');
      await fs.mkdir(source, { recursive: true });
      await fs.writeFile(path.join(source, 'oficio.pdf'), 'legal fixture');
      const scanned = await scanLocalImportSource(source);
      const store = new LocalImportStore(appDataRoot, { scansRoot, documentsRoot });
      const saved = await store.saveScan(scanned.source, scanned.inventory);
      const safe = scanned.inventory.records[0]!;
      await store.importSelected(saved.scanId, [safe.id]);

      expect(await stat(path.join(scansRoot, `${saved.scanId}.json`))).toBeTruthy();
      expect(await stat(path.join(documentsRoot, `${safe.sha256.slice(0, 16)}.pdf`))).toBeTruthy();
      await expect(stat(path.join(appDataRoot, 'scans', `${saved.scanId}.json`))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
