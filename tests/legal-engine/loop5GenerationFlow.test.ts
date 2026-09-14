import { describe, expect, it } from 'vitest';
import { extractDownloadFilename } from '@/lib/legal-engine/outputFilename';

describe('Loop 5 — descarga y continuidad del flujo', () => {
  it('usa el filename seguro entregado por el servidor, incluido RFC 5987', () => {
    expect(extractDownloadFilename('attachment; filename="Contestación revisión.docx"'))
      .toBe('Contestación revisión.docx');
    expect(extractDownloadFilename("attachment; filename*=UTF-8''Contestaci%C3%B3n%20revisi%C3%B3n.pdf"))
      .toBe('Contestación revisión.pdf');
  });

  it('rechaza valores de header inseguros y deja que la UI use su fallback', () => {
    expect(extractDownloadFilename('inline; filename="../secreto.pdf"')).toBe('.._secreto.pdf');
    expect(extractDownloadFilename(null)).toBeUndefined();
    expect(extractDownloadFilename('attachment')).toBeUndefined();
  });
});
