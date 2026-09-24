import { describe, expect, it } from 'vitest';
import { validateUploadBuffer } from '@/lib/security/uploadValidation';

describe('upload hardening preflight', () => {
  it('rechaza un PDF con extensión válida pero firma inválida', () => {
    const result = validateUploadBuffer({
      buffer: Buffer.from('not-a-pdf'),
      fileName: 'demanda.pdf',
      mimeType: 'application/pdf',
    });
    expect(result).toMatchObject({ ok: false, errorCode: 'UPLOAD_SIGNATURE_INVALID' });
  });

  it('rechaza mismatch entre extensión y MIME declarado', () => {
    const result = validateUploadBuffer({
      buffer: Buffer.from('%PDF-1.7'),
      fileName: 'demanda.pdf',
      mimeType: 'image/png',
    });
    expect(result).toMatchObject({ ok: false, errorCode: 'UPLOAD_MIME_MISMATCH' });
  });

  it('rechaza dimensiones PNG peligrosas antes de extracción/OCR', () => {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
    header.writeUInt32BE(100_000, 16);
    header.writeUInt32BE(100_000, 20);
    const result = validateUploadBuffer({
      buffer: header,
      fileName: 'scan.png',
      mimeType: 'image/png',
    });
    expect(result).toMatchObject({ ok: false, errorCode: 'UPLOAD_IMAGE_TOO_LARGE' });
  });

  it('rechaza nombres con traversal antes de crear rutas o temporales', () => {
    const result = validateUploadBuffer({
      buffer: Buffer.from('texto'),
      fileName: '../documento.txt',
      mimeType: 'text/plain',
    });
    expect(result).toMatchObject({ ok: false, errorCode: 'INVALID_UPLOAD_FILENAME' });
  });
});
