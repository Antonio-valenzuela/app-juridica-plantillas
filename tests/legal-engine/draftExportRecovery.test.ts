import { describe, expect, it, vi } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { persistDocumentBeforeExport } from '@/lib/legal-engine/exportPersistence';
import { extractWordDocumentParagraphs, readDocxPackage } from '../helpers/docxPackageReader';

function fixture(text = 'La actora ingresó el 3 de diciembre de 2024.') {
  const document = createEmptyDocument({ id: 'draft-recovery', documentType: 'escrito_libre', sections: [
    createDocumentNode({ id: 'body', title: 'HECHOS PARA REVISIÓN', type: 'facts', content: [
      { id: 'body-1', layer: 'GENERATED_ARGUMENT', trustLevel: 'UNVERIFIED', generatedBy: 'AI', text },
    ] }),
  ] });
  document.generationMetadata.draftDepth = 'EXTENSIVE_40';
  return document;
}

async function docxText(bytes: Buffer) {
  const zip = await readDocxPackage(bytes);
  return [...extractWordDocumentParagraphs(await zip.readText('word/document.xml')),
    ...extractWordDocumentParagraphs(await zip.readText('word/header1.xml'))].join('\n');
}

describe('DRAFT recuperable sin aprobación jurídica ni persistencia', () => {
  it('1: DOCX conserva hechos no sustentados y la marca de borrador', async () => {
    const document = fixture();
    const before = JSON.stringify(document);
    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    expect(prepared.qualityGate.criticalErrors.map(e => e.checkId)).toContain('UNSUPPORTED_FACTUAL_CLAIM');
    expect(prepared.qualityGate.canMarkAsFinal).toBe(false);
    const bytes = await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' });
    expect(await docxText(bytes)).toContain(document.sections[0].content[0].text);
    expect(await docxText(bytes)).toContain('BORRADOR');
    expect(JSON.stringify(document)).toBe(before);
  });
  it('2: PDF válido con los mismos findings', async () => {
    const bytes = await exportUniversalToPdf(fixture(), undefined, { exportMode: 'DRAFT' });
    expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes.toString('latin1')).toContain('BORRADOR');
  });
  it('3: FINAL permanece bloqueado para ambos formatos', async () => {
    // Adversarial ready metadata must not hide an unsupported assertion.
    // Exercise the factual gate, not just the earlier lifecycle rejection.
    const document = fixture();
    document.sections.push(createDocumentNode({ id: 'petition', title: 'PETITORIOS', type: 'petition', content: [
      { id: 'p1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'ÚNICO. Tener por presentado el escrito.' },
    ] }));
    document.validation = { isValid: true, errors: [], warnings: [] };
    const ready = markDocumentAsReadyToExport(document, { explicit: true });
    await expect(exportUniversalToDocx(ready)).rejects.toThrow(/UNSUPPORTED_FACTUAL_CLAIM/);
    await expect(exportUniversalToPdf(ready)).rejects.toThrow(/UNSUPPORTED_FACTUAL_CLAIM/);
  });
  it('4: afirmaciones UNVERIFIED se conservan, no se promueven', async () => {
    const document = fixture('La parte actora sostiene una versión que requiere contraste con las constancias.');
    document.generationMetadata.factualClaims = [{ blockId: 'body-1', claim: document.sections[0].content[0].text,
      status: 'UNVERIFIED', sourceSpans: [] }];
    const prepared = await prepareUniversalDocumentForExport(document, { exportMode: 'DRAFT' });
    expect(prepared.qualityGate.criticalErrors.map(e => e.checkId)).toContain('FACTUAL_CLAIM_UNVERIFIED');
    expect(prepared.document.generationMetadata.factualClaims?.[0].status).toBe('UNVERIFIED');
    await expect(prepareUniversalDocumentForExport(document, { exportMode: 'FINAL' })).rejects.toThrow();
  });
  it('5: cita NO VERIFICADO y placeholder permanecen en el archivo, FINAL bloqueado', async () => {
    const document = fixture('El [NO VERIFICADO: artículo 47 de la LFT] requiere revisión. [REQUIERE CONFIRMACIÓN DEL ABOGADO]');
    expect(await docxText(await exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT' })))
      .toContain('[NO VERIFICADO: artículo 47 de la LFT]');
    await expect(exportUniversalToDocx(document)).rejects.toThrow();
  });
  it.each(['docx', 'pdf'] as const)('6/7: %s usa texto actual aun si guardar lanza error; no declara guardado', async format => {
    const document = fixture('EDICIÓN ACTUAL DEL ABOGADO: conservar este texto.');
    const save = vi.fn(async () => { throw new Error('No se pudo comprobar el borrador anterior antes de guardar.'); });
    const persisted = vi.fn();
    const transient = vi.fn(async () => format === 'docx'
      ? exportUniversalToDocx(document, undefined, undefined, { exportMode: 'DRAFT', unsavedDraft: true })
      : exportUniversalToPdf(document, undefined, { exportMode: 'DRAFT', unsavedDraft: true }));
    const bytes = await persistDocumentBeforeExport(document, save, persisted, { exportMode: 'DRAFT', sendUnsavedDraftExport: transient });
    expect(transient).toHaveBeenCalledWith(document);
    expect(persisted).not.toHaveBeenCalled();
    expect(bytes.subarray(0, format === 'docx' ? 2 : 4).toString()).toBe(format === 'docx' ? 'PK' : '%PDF');
    if (format === 'docx') expect(await docxText(bytes)).toContain(document.sections[0].content[0].text);
    expect(document.generationMetadata.exportMode).toBeUndefined();
  });
  it('8: rechaza documento vacío', async () => {
    await expect(exportUniversalToDocx(fixture(''), undefined, undefined, { exportMode: 'DRAFT' })).rejects.toThrow();
    await expect(exportUniversalToPdf(fixture(''), undefined, { exportMode: 'DRAFT' })).rejects.toThrow();
  });
  it('9: FINAL aprobado conserva su contrato normal', async () => {
    const document = fixture('Contenido jurídico listo para exportación verificable. '.repeat(12));
    document.generationMetadata.draftDepth = undefined;
    document.sections[0].content[0].generatedBy = undefined;
    document.sections[0].content[0].trustLevel = 'VERIFIED';
    document.sections.push(createDocumentNode({ id: 'petition', title: 'PETITORIOS', type: 'petition', content: [
      { id: 'p1', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'ÚNICO. Tener por presentado el escrito.' },
    ] }));
    document.validation = { isValid: true, errors: [], warnings: [] };
    const ready = markDocumentAsReadyToExport(document, { explicit: true });
    expect((await exportUniversalToDocx(ready)).subarray(0, 2).toString()).toBe('PK');
    expect((await exportUniversalToPdf(ready)).subarray(0, 4).toString()).toBe('%PDF');
  });
  it('10: guardar/reabrir/editar/exportar no sobreescribe la versión guardada', async () => {
    const saved = JSON.stringify(fixture('Contenido guardado anterior.'));
    const reopened = JSON.parse(saved) as ReturnType<typeof fixture>;
    reopened.sections[0].content[0].text = 'Contenido modificado después de reabrir.';
    const bytes = await persistDocumentBeforeExport(reopened, async () => false, vi.fn(), {
      exportMode: 'DRAFT', sendUnsavedDraftExport: current => exportUniversalToDocx(current, undefined, undefined, { exportMode: 'DRAFT', unsavedDraft: true }),
    });
    expect(await docxText(bytes)).toContain('Contenido modificado después de reabrir.');
    expect(JSON.parse(saved).sections[0].content[0].text).toBe('Contenido guardado anterior.');
    expect(reopened.sections[0].content[0].text).toBe('Contenido modificado después de reabrir.');
  });
});
