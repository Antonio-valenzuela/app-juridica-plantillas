import { describe, expect, it } from 'vitest';
import { deriveRuntimeReadiness } from '@/lib/runtime/readiness';

describe('runtime readiness', () => {
  it('does not call a configured database ready before connectivity is verified', () => {
    const result = deriveRuntimeReadiness({
      databaseConfigured: true,
      databaseVerified: false,
      storageReady: true,
      providerReady: true,
      ocr: { enabled: false, workerReady: false, languageDataReady: false, pdfRendererReady: false },
    });

    expect(result.components.database.status).toBe('CONFIGURED_NOT_VERIFIED');
    expect(result.overall).toBe('NOT_READY');
  });

  it('reports OCR gaps without hiding them behind an enabled provider flag', () => {
    const result = deriveRuntimeReadiness({
      databaseConfigured: true,
      databaseVerified: true,
      storageReady: true,
      providerReady: true,
      ocr: { enabled: true, workerReady: true, languageDataReady: true, pdfRendererReady: false },
    });

    expect(result.components.ocr.status).toBe('BLOCKED');
    expect(result.components.ocr.detail).toMatch(/pdftoppm/i);
    expect(result.overall).toBe('NOT_READY');
  });

  it('is ready only when required runtime dependencies are verified', () => {
    const result = deriveRuntimeReadiness({
      databaseConfigured: true,
      databaseVerified: true,
      storageReady: true,
      providerReady: true,
      ocr: { enabled: false, workerReady: false, languageDataReady: false, pdfRendererReady: false },
    });

    expect(result.overall).toBe('READY');
  });
});

describe('almacenamiento de uploads en una instalación nueva', () => {
  it('acepta una carpeta aún no creada si su ancestro existente es escribible, y rechaza una ruta imposible', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const { isWritableOrCreatable } = await import('@/lib/runtime/readiness');
    const base = await mkdtemp(path.join(os.tmpdir(), 'lex-readiness-'));
    try {
      expect(await isWritableOrCreatable(path.join(base, 'documents', 'templates'))).toBe(true);
      expect(await isWritableOrCreatable(base)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
