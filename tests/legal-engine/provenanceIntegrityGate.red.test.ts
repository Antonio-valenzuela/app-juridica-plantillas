import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildSourceGrounding } from '@/lib/legal-engine/sourceGrounding';
import { evaluateProvenanceIntegrityGate } from '@/lib/legal-engine/provenanceIntegrityGate';
import { makeDocumentFixture, makeEmptyAssemblyResult } from '@/lib/legal-engine/documentAssemblyTypes';
import { verifyFinalDocumentExportability } from '@/lib/legal-engine/finalDocumentMaterializationGate';

function source(text: string) {
  return createSourceDocument({
    id: 'provenance-fixture',
    filename: 'demanda.docx',
    extractedText: text,
    pages: [{ page: 1, text, chars: text.length }],
    sourceValidated: true,
    sourceQualityStatus: 'READY',
  });
}

describe('PROVENANCE_INTEGRITY_GATE', () => {
  it('passes when expediente has explicit case provenance and cited authority stays separate', () => {
    const grounding = buildSourceGrounding(source([
      'EXPEDIENTE: 123/2026',
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR EL CUMPLIMIENTO DE CONTRATO.',
      'HECHOS:',
      'El demandado incumplió el contrato celebrado entre las partes.',
      'CRITERIOS JURISPRUDENCIALES:',
      'Amparo directo 2/2022.',
      'Hechos: Un hombre demandó a su padre.',
    ].join('\n')));

    const result = evaluateProvenanceIntegrityGate({ sourceGrounding: [grounding] });
    expect(result.status).toBe('PASS');
    expect(result.issues).toEqual([]);
  });

  it('blocks an expediente copied from jurisprudence and precedent facts copied as case facts', () => {
    const grounding = buildSourceGrounding(source([
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR EL CUMPLIMIENTO DE CONTRATO.',
      'CRITERIOS JURISPRUDENCIALES:',
      'Amparo directo 2/2022.',
      'Hechos: Un hombre demandó a su padre.',
    ].join('\n')));

    const result = evaluateProvenanceIntegrityGate({
      sourceGrounding: [grounding],
      caseRefs: { expediente: '2/2022' },
      caseAnalysis: {
        facts: [{ text: 'Hechos: Un hombre demandó a su padre.' }],
      } as any,
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.issues).toEqual(expect.arrayContaining([
      'CASE_METADATA_DERIVED_FROM_JURISPRUDENCE',
      'CASE_FACT_DERIVED_FROM_PRECEDENT_FACTS',
    ]));
  });

  it('keeps unresolved source metadata reviewable for DRAFT but not final', () => {
    const grounding = buildSourceGrounding(source([
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR EL CUMPLIMIENTO DE CONTRATO.',
      'Amparo directo 3296/2004.',
    ].join('\n')));
    const result = evaluateProvenanceIntegrityGate({ sourceGrounding: [grounding] });
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.issues).toContain('CASE_EXPEDIENTE_REQUIRES_INPUT');
  });

  it('blocks FINAL materialization but allows an explicitly marked DRAFT review artifact', () => {
    const grounding = buildSourceGrounding(source([
      'C. JUEZ DE LO CIVIL EN TURNO.',
      'VENGO A DEMANDAR EL CUMPLIMIENTO DE CONTRATO.',
    ].join('\n')));
    const document = makeDocumentFixture({
      generationMetadata: {
        ...makeDocumentFixture().generationMetadata,
        sourceGrounding: [grounding],
      },
    }) as any;
    document.lifecycle = { entityKind: 'DRAFT', readiness: 'READY_TO_EXPORT' };
    document.__juridicoRadar = document.lifecycle;
    const assembly = makeEmptyAssemblyResult();
    assembly.documentId = document.id;
    assembly.documentType = document.documentType;
    assembly.document = document;
    assembly.assemblyStatus = 'ASSEMBLED';
    assembly.validationStatus = 'VALID';
    assembly.readiness = 'READY';
    document.documentAssemblyResult = assembly;
    document.documentAssemblyQualityGate = {
      passed: true,
      canMarkAsReady: true,
      readiness: 'READY',
      baseQualityGate: {} as any,
      findings: [],
      checks: [],
    };
    const evidence = { document, exportValidation: { ok: true, errors: [], warnings: [] } } as any;

    expect(() => verifyFinalDocumentExportability(evidence)).toThrow(/PROVENANCE_INTEGRITY_GATE/);
    expect(verifyFinalDocumentExportability(evidence, { exportMode: 'DRAFT' }).verificationMode).toBe('RICH_ASSEMBLY');
  });
});
