import { describe, expect, it } from 'vitest';
import {
  makeAcceptedBlock,
  makeDocumentFixture,
  makeEmptyAssemblyResult,
  type DocumentAssemblyQualityGateResult,
  type DocumentAssemblyResult,
} from '@/lib/legal-engine/documentAssemblyTypes';
import type { ExportValidationResult } from '@/lib/legal-engine/exportGuards';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import {
  FinalDocumentMaterializationGateError,
  verifyFinalDocumentExportability,
} from '@/lib/legal-engine/finalDocumentMaterializationGate';

type AssemblyAttachedDocument = UniversalLegalDocument & {
  documentAssemblyResult?: DocumentAssemblyResult;
  documentAssemblyQualityGate?: DocumentAssemblyQualityGateResult;
};

function validDocument(): AssemblyAttachedDocument {
  const lifecycle = { entityKind: 'DRAFT' as const, readiness: 'READY_TO_EXPORT' as const };
  return {
    ...makeDocumentFixture(),
    lifecycle,
    __juridicoRadar: lifecycle,
  } as AssemblyAttachedDocument;
}

function validEvidence() {
  const document = validDocument();
  const baseAssembly = makeEmptyAssemblyResult();
  const assembly: DocumentAssemblyResult = {
    ...baseAssembly,
    documentId: document.id,
    document,
    assemblyStatus: 'ASSEMBLED',
    validationStatus: 'VALID',
    readiness: 'READY',
  };
  const assemblyGate: DocumentAssemblyQualityGateResult = {
    passed: true,
    canMarkAsReady: true,
    readiness: 'READY',
    baseQualityGate: {
      ...baseAssembly.document.validation,
      passed: true,
      canMarkAsFinal: true,
    } as never,
    findings: [],
    checks: [],
  };
  document.documentAssemblyResult = assembly;
  document.documentAssemblyQualityGate = assemblyGate;
  return {
    document,
    assembly,
    assemblyGate,
    exportValidation: { ok: true, errors: [], warnings: [] } satisfies ExportValidationResult,
  };
}

function expectGateError(run: () => unknown): void {
  expect(run).toThrow(FinalDocumentMaterializationGateError);
}

describe('FASE 7 Task 1 — final document materialization gate', () => {
  it('requires FASE 6 READY, assembly QualityGate PASS and export guard PASS before materialization', () => {
    const evidence = validEvidence();
    const originalDocument = structuredClone(evidence.document);
    const originalAssembly = structuredClone(evidence.assembly);
    const originalAssemblyGate = structuredClone(evidence.assemblyGate);
    const originalExportValidation = structuredClone(evidence.exportValidation);

    const verified = verifyFinalDocumentExportability({
      document: evidence.document,
      exportValidation: evidence.exportValidation,
    });

    expect(verified).toMatchObject({
      verificationMode: 'RICH_ASSEMBLY',
      document: evidence.document,
      assembly: evidence.assembly,
      assemblyGate: evidence.assemblyGate,
      exportValidation: evidence.exportValidation,
    });
    expect(evidence.document).toEqual(originalDocument);
    expect(evidence.assembly).toEqual(originalAssembly);
    expect(evidence.assemblyGate).toEqual(originalAssemblyGate);
    expect(evidence.exportValidation).toEqual(originalExportValidation);
  });

  it('rejects BLOCKED assembly readiness', () => {
    const evidence = validEvidence();
    evidence.assembly.readiness = 'BLOCKED';
    expectGateError(() => verifyFinalDocumentExportability(evidence));
  });

  it('rejects INVALID assembly readiness', () => {
    const evidence = validEvidence();
    evidence.assembly.readiness = 'INVALID';
    expectGateError(() => verifyFinalDocumentExportability(evidence));
  });

  it('rejects REQUIRES_REVIEW assembly readiness', () => {
    const evidence = validEvidence();
    evidence.assembly.readiness = 'REQUIRES_REVIEW';
    expectGateError(() => verifyFinalDocumentExportability(evidence));
  });

  it('rejects missing FASE 6 assembly evidence', () => {
    const document = validDocument();
    const exportValidation = { ok: true, errors: [], warnings: [] } satisfies ExportValidationResult;
    expectGateError(() => verifyFinalDocumentExportability({ document, exportValidation }));

    const evidence = validEvidence();
    delete evidence.document.documentAssemblyQualityGate;
    expectGateError(() => verifyFinalDocumentExportability(evidence));
  });

  it('rejects broken assembly trace or block links', () => {
    const evidence = validEvidence();
    const block = makeAcceptedBlock({ id: 'block-final-1' });
    evidence.assembly.orderedBlocks = [block];
    evidence.assembly.trace = {
      ...evidence.assembly.trace,
      orderedBlockIds: ['wrong-block-id'],
      blockLinks: [{ blockId: 'wrong-block-id', legalIssueIds: [], coverageItemIds: [] }],
    };
    expectGateError(() => verifyFinalDocumentExportability(evidence));
  });
});
