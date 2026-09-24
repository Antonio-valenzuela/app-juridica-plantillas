import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  deleteOwnedTemplateFile,
  resolveOwnedTemplateFilePath,
} from '@/lib/security/templateFileCleanup';

describe('template file cleanup', () => {
  it('deletes only the owned file and preserves unrelated files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'app-plantillas-'));
    const owned = path.join(root, 'owned.pdf');
    const unrelated = path.join(root, 'unrelated.pdf');
    writeFileSync(owned, 'owned');
    writeFileSync(unrelated, 'unrelated');

    await expect(deleteOwnedTemplateFile({ storageRoot: root, savedFileName: 'owned.pdf' }))
      .resolves.toBe('DELETED');

    expect(existsSync(owned)).toBe(false);
    expect(readFileSync(unrelated, 'utf8')).toBe('unrelated');
  });

  it('rejects traversal and nested paths before touching storage', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'app-plantillas-'));
    const outside = path.join(path.dirname(root), 'outside.txt');
    writeFileSync(outside, 'must remain');

    expect(resolveOwnedTemplateFilePath(root, '../outside.txt')).toBeNull();
    await expect(deleteOwnedTemplateFile({ storageRoot: root, savedFileName: '../outside.txt' }))
      .resolves.toBe('SKIPPED_INVALID');
    expect(readFileSync(outside, 'utf8')).toBe('must remain');
  });

  it('reports a missing owned file without failing the deletion workflow', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'app-plantillas-'));
    mkdirSync(path.join(root, 'nested'));

    await expect(deleteOwnedTemplateFile({ storageRoot: root, savedFileName: 'missing.pdf' }))
      .resolves.toBe('NOT_FOUND');
  });
});
