import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const route = readFileSync(resolve(root, 'app/api/workspace/local-import/route.ts'), 'utf8');

describe('local import API contract', () => {
  it('uses the local scanner and store instead of external providers', () => {
    expect(route).toContain("scanLocalImportSource");
    expect(route).toContain("LocalImportStore");
    expect(route).toContain("action === 'import'");
    expect(route).toContain("recordIds");
    expect(route).not.toMatch(/providerRouter|fetch\(['\"]https?:/i);
  });

  it('keeps private imports outside the repository workspace', () => {
    expect(route).toContain('getStoragePaths');
    expect(route).toContain('scansRoot: storagePaths.imports');
    expect(route).toContain('documentsRoot: storagePaths.documents');
  });

  it('does not return document content in the analyze response contract', () => {
    expect(route).toContain('records: saved.inventory.records');
    expect(route).not.toContain('content:');
  });
});
