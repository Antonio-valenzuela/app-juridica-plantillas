import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { createGenerationTraceContext, type GenerationTrace } from '@/lib/legal-engine/generationTrace';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';

function createTraceExportFixture() {
    const doc = createEmptyDocument({
      id: 'doc-trace-export',
      documentType: 'escrito_libre',
      documentTypeLabel: 'Escrito libre',
      sections: [
        createDocumentNode({
          id: 'sec-body',
          title: 'HECHOS',
          type: 'facts',
          content: [{
            id: 'block-body',
            layer: 'GENERATED_ARGUMENT',
            trustLevel: 'AI_INFERENCE',
            text: 'Hecho sintético documentado para la prueba de exportación. La parte compareciente manifiesta que este contenido únicamente sirve para verificar el enlace técnico entre el bloque visible, la tarea de generación y la matriz de cobertura. La información se presenta de forma completa, ordenada y suficiente para revisar la trazabilidad del documento sin introducir datos jurídicos nuevos ni alterar su estructura procesal.',
            generationId: 'generation-export-test',
            generationTaskId: 'task-export-1',
            taskId: 'task-export-1',
            coverageItemIds: ['cov-fact-1'],
            generatedBy: 'AI',
            provider: 'nvidia',
            model: 'test-model',
          }],
        }),
        createDocumentNode({
          id: 'sec-petition',
          title: 'PETITORIOS',
          type: 'petition',
          content: [{
            id: 'block-petition',
            layer: 'USER_POSITION',
            trustLevel: 'VERIFIED',
            text: 'ÚNICO. Proveer conforme a derecho.',
          }],
        }),
      ],
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        preflight: { status: 'READY', missingFields: [] },
      } as unknown as UniversalLegalDocument['generationMetadata'],
    });
    doc.missingFields = [];
    doc.anonymizedFields = [];
    doc.validation = { isValid: true, errors: [], warnings: [] };
    (doc as unknown as { qualityGate: unknown }).qualityGate = { passed: true, canMarkAsFinal: true, criticalErrors: [], warnings: [] };
    const trace = createGenerationTraceContext({ generationId: 'generation-export-test', doc, options: { enabled: true } });
    const exportable = markDocumentAsReadyToExport(doc, { explicit: true });
    return { trace, exportable };
}

describe('generation trace DOCX export', () => {
  it('links a visible paragraph to block, task and coverage after export', async () => {
    const { trace, exportable } = createTraceExportFixture();
    const buffer = await exportUniversalToDocx(exportable, undefined, trace.trace);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(trace.trace.assemblyMetadata.paragraphs.some((paragraph) =>
      paragraph.blockId === 'block-body' && paragraph.generationTaskId === 'task-export-1' && paragraph.coverageItemIds.includes('cov-fact-1')
    )).toBe(true);
    expect(trace.trace.exportMetadata?.byteLength).toBe(buffer.length);
    expect(trace.trace.exportMetadata?.format).toBe('docx');
  });

  it('migrates a persisted legacy audit trace missing wordAccounting before DOCX export', async () => {
    const { trace, exportable } = createTraceExportFixture();
    const legacyTrace = structuredClone(trace.trace) as Partial<GenerationTrace>;
    delete legacyTrace.wordAccounting;
    exportable.generationMetadata.auditTrace = legacyTrace as GenerationTrace;

    const buffer = await exportUniversalToDocx(exportable, undefined, undefined, { exportMode: 'DRAFT' });

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it('rejects a persisted trace with malformed wordAccounting instead of masking it', async () => {
    const { trace, exportable } = createTraceExportFixture();
    const invalidTrace = structuredClone(trace.trace) as GenerationTrace & { wordAccounting: unknown };
    (invalidTrace as unknown as { wordAccounting: unknown }).wordAccounting = { unexpected: true };
    exportable.generationMetadata.auditTrace = invalidTrace;

    await expect(exportUniversalToDocx(exportable, undefined, undefined, { exportMode: 'DRAFT' }))
      .rejects.toThrow('GENERATION_TRACE_WORD_ACCOUNTING_INVALID');
  });
});
