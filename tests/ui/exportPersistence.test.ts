import { describe, expect, it, vi } from 'vitest';
import { persistDocumentBeforeExport } from '@/lib/legal-engine/exportPersistence';

describe('exportación de documentos generados', () => {
  it('persiste el documento antes de enviar la solicitud de exportación', async () => {
    const events: string[] = [];
    const document = { id: 'generated-document-1' };
    const saveDraft = vi.fn(async () => {
      events.push('save');
      return true;
    });
    const sendExport = vi.fn(async () => {
      events.push('export');
      return 'response';
    });

    await expect(persistDocumentBeforeExport(document, saveDraft, sendExport)).resolves.toBe('response');
    expect(events).toEqual(['save', 'export']);
    expect(saveDraft).toHaveBeenCalledWith(document);
    expect(sendExport).toHaveBeenCalledWith(document);
  });

  it('no envía la exportación si el guardado no pudo persistir el documento', async () => {
    const saveDraft = vi.fn(async () => false);
    const sendExport = vi.fn();

    await expect(
      persistDocumentBeforeExport({ id: 'generated-document-2' }, saveDraft, sendExport),
    ).rejects.toThrow('No se pudo guardar el documento antes de exportar.');
    expect(sendExport).not.toHaveBeenCalled();
  });
});
