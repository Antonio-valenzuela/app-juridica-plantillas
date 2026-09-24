import { describe, expect, it } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReviewRequired, markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { ExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { DRAFT_EXPORT_NOTICE, resolveExportMode } from '@/lib/legal-engine/exportModes';
import { materializeDocumentForPageMeasurement } from '@/lib/legal-engine/finalDocumentMaterialization';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage } from '../helpers/docxPackageReader';

function reviewDocument() {
  const document = createEmptyDocument({
    id: 'export-mode-review',
    documentType: 'escrito_libre',
    sections: [createDocumentNode({
      id: 'body',
      title: 'Contenido',
      type: 'argument',
      content: [{ id: 'body-1', text: 'Contenido generado válido para revisión.' } as any],
    })],
  });
  return markDocumentAsReviewRequired({
    ...document,
    qualityGate: { passed: false, canMarkAsFinal: false, criticalErrors: [], warnings: [] },
  } as any);
}

function readyDocument() {
  const text = 'Contenido jurídico listo para exportación verificable. '.repeat(12);
  const document = createEmptyDocument({
    id: 'export-mode-ready',
    documentType: 'escrito_libre',
    sections: [
      createDocumentNode({ id: 'header', title: 'DESTINATARIO', type: 'header', content: [{ id: 'header-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
      createDocumentNode({ id: 'body', title: 'CONTENIDO', type: 'facts', content: [{ id: 'body-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
      createDocumentNode({ id: 'petition', title: 'PETITORIOS', type: 'petition', content: [{ id: 'petition-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: `ÚNICO. ${text}` }] }),
      createDocumentNode({ id: 'signature', title: 'FIRMA', type: 'signature', content: [{ id: 'signature-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }] }),
    ],
  });
  (document as any).qualityGate = { passed: true, canMarkAsFinal: true, criticalErrors: [], warnings: [] };
  (document.generationMetadata as any).preflight = { status: 'READY', missingFields: [] };
  document.missingFields = [];
  document.anonymizedFields = [];
  document.validation = { isValid: true, errors: [], warnings: [] };
  return markDocumentAsReadyToExport(document, { explicit: true });
}

describe('exportMode DRAFT | FINAL', () => {
  it('permite DRAFT con NEEDS_REVIEW sin promover el documento', async () => {
    const prepared = await prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'DRAFT' });

    expect(prepared.document.generationMetadata.exportMode).toBe('DRAFT');
    expect(prepared.document.generationMetadata.exportNotice).toBe(DRAFT_EXPORT_NOTICE);
    expect(prepared.reviewOverrideApplied).toBe(true);
  });

  it('bloquea FINAL mientras el documento requiere revisión', async () => {
    await expect(prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'FINAL' }))
      .rejects.toBeInstanceOf(ExportGuardError);
  });

  it('permite FINAL únicamente después de READY_TO_EXPORT', async () => {
    const ready = readyDocument();
    const prepared = await prepareUniversalDocumentForExport(ready, { exportMode: 'FINAL' });

    expect(prepared.document.generationMetadata.exportMode).toBe('FINAL');
    expect(prepared.document.generationMetadata.exportNotice).toBeUndefined();
  });

  it('resuelve solo los modos explícitos y rechaza valores desconocidos', () => {
    expect(resolveExportMode('DRAFT')).toBe('DRAFT');
    expect(resolveExportMode('FINAL')).toBe('FINAL');
    expect(resolveExportMode('anything')).toBeNull();
  });

  it('materializa el aviso profesional del borrador para los renderers comunes', async () => {
    const prepared = await prepareUniversalDocumentForExport(reviewDocument(), { exportMode: 'DRAFT' });
    const model = materializeDocumentForPageMeasurement(prepared.document);

    expect(model.header.map((paragraph) => paragraph.text)).toContain(DRAFT_EXPORT_NOTICE);
  });

  it('genera DOCX y PDF de borrador sin llamar al pipeline de IA', async () => {
    const document = reviewDocument();
    const providerBefore = document.generationMetadata.aiProvider;
    const [docx, pdf] = await Promise.all([
      exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' }),
      exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT' }),
    ]);
    const packageReader = await readDocxPackage(docx);
    const header = await packageReader.readText('word/header1.xml');

    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(docx.byteLength).toBeGreaterThan(500);
    expect(header).toContain('BORRADOR PARA REVISIÓN DEL ABOGADO');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(pdf.toString('latin1')).toContain('(BORRADOR)');
    expect(document.generationMetadata.aiProvider).toBe(providerBefore);
  });
});
