import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_ASSEMBLY_READINESS,
  makeEmptyAssemblyResult,
} from '@/lib/legal-engine/documentAssemblyTypes';

const NEW_FASE6_SHARED_MODULES = [
  'documentAssemblyTypes.ts',
  'documentAssembly.ts',
  'documentSectionContracts.ts',
  'documentConsistency.ts',
  'documentEvidence.ts',
  'documentAuthority.ts',
  'documentRedundancy.ts',
  'documentCoverage.ts',
  'documentReadiness.ts',
  'documentAssemblyQualityGate.ts',
].map((file) => `lib/legal-engine/${file}`);

function readNewFase6SharedModuleSources(): string {
  return NEW_FASE6_SHARED_MODULES
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

describe('FASE 6 shared contracts', () => {
  it('exposes the five document readiness states', () => {
    expect(DOCUMENT_ASSEMBLY_READINESS).toEqual([
      'READY', 'INCOMPLETE', 'BLOCKED', 'REQUIRES_REVIEW', 'INVALID',
    ]);
  });

  it('represents immutable section, block, finding and trace collections', () => {
    const result = makeEmptyAssemblyResult();
    expect(result.sections).toEqual([]);
    expect(result.orderedBlocks).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.trace.orderedSectionIds).toEqual([]);
  });

  it('keeps every new shared FASE 6 module free of Node builtin imports', () => {
    expect(readNewFase6SharedModuleSources()).not.toMatch(
      /(?:from\s+['"](?:node:crypto|crypto|node:fs|fs|node:path|path)['"]|require\(['"](?:node:crypto|crypto|node:fs|fs|node:path|path)['"]\))/, 
    );
  });
});
