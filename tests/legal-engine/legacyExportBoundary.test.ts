import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { validateForExport } from '@/lib/legal-engine/exportGuards';
import { materializePreparedFinalDocument } from '@/lib/legal-engine/finalDocumentMaterialization';
import { verifyCompatibilityMaterialization } from '@/lib/legal-engine/finalDocumentMaterializationGate';

const root = 'lib/legal-engine';

function compatibilityInput() {
  const document = markDocumentAsReadyToExport(createEmptyDocument({
    id: 'task7-legacy-boundary',
    title: 'Escrito libre de frontera',
    documentType: 'escrito_libre',
    sections: [createDocumentNode({
      id: 'body',
      title: 'CUERPO',
      type: 'facts',
      content: [{ id: 'body-block', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'Contenido sintético.' }],
    }), createDocumentNode({
      id: 'petition',
      title: 'PETITORIOS',
      type: 'petition',
      content: [{ id: 'petition-block', layer: 'USER_POSITION', trustLevel: 'VERIFIED', text: 'PRIMERO. Lo solicitado.' }],
    })],
    generationMetadata: {
      ...createEmptyDocument().generationMetadata,
      preflight: { status: 'READY', missingFields: [] },
    } as never,
  }), { explicit: true });
  return verifyCompatibilityMaterialization({
    document,
    exportValidation: { ...validateForExport(document), ok: true },
  });
}

describe('FASE 7 Task 7 — legacy exporter boundary', () => {
  it('40. keeps RenderedDocument outside the rich universal materialization path', () => {
    const materialization = readFileSync(`${root}/finalDocumentMaterialization.ts`, 'utf8');
    const types = readFileSync(`${root}/finalDocumentMaterializationTypes.ts`, 'utf8');
    const gate = readFileSync(`${root}/finalDocumentMaterializationGate.ts`, 'utf8');
    const legacyDocx = readFileSync(`${root}/../templates/exportDocx.ts`, 'utf8');
    const legacyPdf = readFileSync(`${root}/../templates/exportPdf.ts`, 'utf8');

    expect(materialization).not.toMatch(/RenderedDocument|renderedSections/);
    expect(types).not.toMatch(/RenderedDocument|renderedSections/);
    expect(gate).not.toMatch(/RenderedDocument|renderedSections/);
    expect(legacyDocx).toContain('assertLegacyRenderedDocumentExportable');
    expect(legacyPdf).toContain('generatePrintHtml');
  });

  it('35. performs final materialization without provider calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const model = materializePreparedFinalDocument(compatibilityInput());
    expect(model.sections[0]?.paragraphs[0]?.text).toBe('Contenido sintético.');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('36. performs final materialization without research calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const model = materializePreparedFinalDocument(compatibilityInput());
    expect(model.materializationFingerprint).toMatch(/^materialization-/);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('37. performs final materialization without database calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const model = materializePreparedFinalDocument(compatibilityInput());
    expect(model.documentId).toEqual(expect.any(String));
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
