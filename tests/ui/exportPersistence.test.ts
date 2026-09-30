import { describe, expect, it, vi } from 'vitest';
import { getSafeApiErrorMessage } from '@/lib/apiErrorMessage';
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

  it('expone la explicación segura de persistencia sin solicitar el PDF', async () => {
    const sendExport = vi.fn();
    const error = await persistDocumentBeforeExport({ id: 'generated-document-3' }, async () => false, sendExport)
      .then(() => null, (reason: unknown) => reason);

    expect(error).toMatchObject({ errorCode: 'DRAFT_PERSISTENCE_REQUIRED' });
    expect(getSafeApiErrorMessage(error, 'No fue posible exportar el PDF.')).toBe(
      'No se pudo guardar el borrador; la exportación se detuvo y el archivo no fue solicitado. Reintenta cuando el guardado esté disponible.',
    );
    expect(sendExport).not.toHaveBeenCalled();
  });

  it('usa únicamente la ruta efímera DRAFT cuando falla el guardado y mantiene FINAL bloqueado', async () => {
    const document = { id: 'generated-document-unsaved' };
    const sendPersistedExport = vi.fn(async () => 'persisted-export');
    const sendUnsavedDraftExport = vi.fn(async () => 'unsaved-draft-export');

    await expect(persistDocumentBeforeExport(
      document,
      async () => false,
      sendPersistedExport,
      { exportMode: 'DRAFT', sendUnsavedDraftExport },
    )).resolves.toBe('unsaved-draft-export');

    expect(sendPersistedExport).not.toHaveBeenCalled();
    expect(sendUnsavedDraftExport).toHaveBeenCalledWith(document);

    await expect(persistDocumentBeforeExport(
      document,
      async () => false,
      sendPersistedExport,
      { exportMode: 'FINAL', sendUnsavedDraftExport },
    )).rejects.toMatchObject({ errorCode: 'DRAFT_PERSISTENCE_REQUIRED' });
    expect(sendPersistedExport).not.toHaveBeenCalled();
    expect(sendUnsavedDraftExport).toHaveBeenCalledTimes(1);
  });

  it('usa el fallback si falla la disponibilidad de persistencia después de un guardado aparentemente exitoso', async () => {
    const sendUnsavedDraftExport = vi.fn(async () => ({ status: 200, source: 'unsaved' }));
    const sendExport = vi.fn(async () => ({ status: 503, source: 'persisted' }));
    const options = {
      exportMode: 'DRAFT' as const,
      sendUnsavedDraftExport,
      isPersistenceUnavailableResponse: (response: { status: number }) => response.status === 503,
    };

    await expect(persistDocumentBeforeExport({ id: 'stale-saved-draft' }, async () => true, sendExport, options))
      .resolves.toMatchObject({ status: 200, source: 'unsaved' });
    expect(sendUnsavedDraftExport).toHaveBeenCalledOnce();

    sendUnsavedDraftExport.mockClear();
    sendExport.mockResolvedValue({ status: 422, source: 'quality-gate' });
    await expect(persistDocumentBeforeExport({ id: 'blocked-draft' }, async () => true, sendExport, options))
      .resolves.toMatchObject({ status: 422, source: 'quality-gate' });
    expect(sendUnsavedDraftExport).not.toHaveBeenCalled();
  });
});
