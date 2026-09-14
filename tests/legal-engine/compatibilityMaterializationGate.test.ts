import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import {
  FinalDocumentMaterializationGateError,
  verifyCompatibilityMaterialization,
} from '@/lib/legal-engine/finalDocumentMaterializationGate';

function documentOfType(documentType = 'escrito_libre') {
  const document = createEmptyDocument({
    id: `task7-gate-${documentType}`,
    title: 'Documento de gate',
    documentType,
    sections: [
      createDocumentNode({
        id: 'gate-body',
        title: 'CUERPO',
        type: 'facts',
        content: [{ id: 'gate-block', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Contenido de gate.' }],
      }),
      createDocumentNode({
        id: 'gate-petition',
        title: 'PETITORIOS',
        type: 'petition',
        content: [{ id: 'gate-petition-block', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'PRIMERO. Lo solicitado.' }],
      }),
    ],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as never,
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

function exportValidation(document: ReturnType<typeof documentOfType>) {
  return { ...validateForExport(document), ok: true } as const;
}

describe('FASE 7 Task 7 — compatibility materialization gate', () => {
  it('44. exposes an explicit RichVerifiedInput or VerifiedCompatibilityInput union', () => {
    const source = readFileSync('lib/legal-engine/finalDocumentMaterializationTypes.ts', 'utf8');
    expect(source).toContain('export interface RichVerifiedInput');
    expect(source).toContain('export interface VerifiedCompatibilityInput');
    expect(source).toContain('export type VerifiedMaterializationInput = RichVerifiedInput | VerifiedCompatibilityInput');
  });

  it('47. cannot report FASE 6 READY for a compatibility input', () => {
    const verified = verifyCompatibilityMaterialization({
      document: documentOfType(),
      exportValidation: exportValidation(documentOfType()),
    });
    expect(verified.verificationMode).toBe('COMPATIBILITY');
    expect(verified).not.toHaveProperty('assembly');
    expect(verified).not.toHaveProperty('assemblyGate');
    expect(verified).not.toMatchObject({ readiness: 'READY' });
  });

  it('48. rejects unknown or non-approved non-rich materialization input', () => {
    const unknown = documentOfType('tipo_no_registrado');
    expect(() => verifyCompatibilityMaterialization({
      document: unknown,
      exportValidation: { ok: true, errors: [], warnings: [] },
    })).toThrow(FinalDocumentMaterializationGateError);

    const legacyFallback = documentOfType();
    (legacyFallback as any).legalIssueMatrix = { sourceMode: 'LEGACY_FALLBACK' };
    expect(() => verifyCompatibilityMaterialization({
      document: legacyFallback,
      exportValidation: { ok: true, errors: [], warnings: [] },
    })).toThrow(FinalDocumentMaterializationGateError);

    const renderedDocument = {
      title: 'legacy',
      sections: [{ title: 'legacy', content: 'legacy' }],
    } as never;
    expect(() => verifyCompatibilityMaterialization({
      document: renderedDocument,
      exportValidation: { ok: true, errors: [], warnings: [] },
    })).toThrow(FinalDocumentMaterializationGateError);
  });
});
