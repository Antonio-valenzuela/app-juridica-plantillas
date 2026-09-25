import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

describe('LexPlantillas local storage paths', () => {
  it('resolves the Windows app-data root without embedding a user profile path', () => {
    const previous = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = path.join(os.tmpdir(), 'lexplantillas-local-appdata');
    try {
      const paths = resolveLexPlantillasStoragePaths();
      expect(paths.root).toBe(path.join(process.env.LOCALAPPDATA, 'LexPlantillas'));
      expect(paths.data).toBe(path.join(paths.root, 'data'));
      expect(paths.documents).toBe(path.join(paths.root, 'documents'));
      expect(paths.imports).toBe(path.join(paths.root, 'imports'));
      expect(paths.index).toBe(path.join(paths.root, 'index'));
      expect(paths.backups).toBe(path.join(paths.root, 'backups'));
      expect(paths.logs).toBe(path.join(paths.root, 'logs'));
      expect(paths.root).not.toContain(process.cwd());
    } finally {
      if (previous === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previous;
    }
  });

  it('allows an explicit isolated root for tests and controlled deployments', () => {
    const paths = resolveLexPlantillasStoragePaths(path.join(os.tmpdir(), 'lexplantillas-test-root'));
    expect(paths.root).toBe(path.join(os.tmpdir(), 'lexplantillas-test-root'));
    expect(paths.workspace).toBe(path.join(paths.data, 'legal-workspace'));
    expect(paths.templates).toBe(path.join(paths.documents, 'templates'));
  });
});
