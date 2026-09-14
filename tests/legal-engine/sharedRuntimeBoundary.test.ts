import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sharedFiles = [
  'lib/legal-engine/finalDocumentMaterializationTypes.ts',
  'lib/legal-engine/finalDocumentMaterialization.ts',
  'lib/legal-engine/exportArtifactTypes.ts',
];

describe('FASE 7 Task 6 — shared/runtime boundary', () => {
  it('has zero Node builtin imports and zero Buffer in shared materialization contracts', () => {
    const sources = sharedFiles.map((file) => ({ file, source: readFileSync(file, 'utf8') }));
    const sharedSource = sources.map(({ source }) => source).join('\n');

    expect((sharedSource.match(/from\s+['"](?:node:)?fs['"]|require\(['"](?:node:)?fs['"]\)/g) || [])).toHaveLength(0);
    expect((sharedSource.match(/from\s+['"](?:node:)?path['"]|require\(['"](?:node:)?path['"]\)/g) || [])).toHaveLength(0);
    expect((sharedSource.match(/from\s+['"](?:node:)?crypto['"]|require\(['"](?:node:)?crypto['"]\)/g) || [])).toHaveLength(0);
    expect((sharedSource.match(/\bBuffer\b/g) || [])).toHaveLength(0);
    expect(readFileSync('lib/legal-engine/finalDocumentMaterializationTypes.ts', 'utf8')).not.toMatch(/Uint8Array/);
  });
});
