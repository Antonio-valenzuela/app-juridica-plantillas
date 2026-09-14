import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('FASE 7 Task 1 — shared materialization boundary contracts', () => {
  it('consumes existing FASE 6 evidence without rerunning FASE 6 validators', () => {
    const source = readFileSync('lib/legal-engine/finalDocumentMaterializationGate.ts', 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*\/(?:documentAssemblyQualityGate|documentReadiness|documentAssembly)['"];/);
    expect(source).not.toMatch(/\b(?:assembleLegalDraft|evaluateDocumentAssemblyChecks|decideDocumentAssemblyReadiness|runDocumentAssemblyQualityGate)\s*\(/);
  });
});
