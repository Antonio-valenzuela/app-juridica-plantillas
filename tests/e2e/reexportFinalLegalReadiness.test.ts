import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { reexportFinalLegalReadinessCases } from '../../scripts/audit/reexport-final-legal-readiness';

describe('Reexportación de entregables de readiness legal', () => {
  it('reexporta seis pares DOCX/PDF válidos con el renderer corregido', async () => {
    const results = await reexportFinalLegalReadinessCases();
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.docxBytes > 500 && result.pdfBytes > 800)).toBe(true);
    const signatures = await Promise.all(results.map(async (result) => {
      const [docx, pdf] = await Promise.all([readFile(result.docxPath), readFile(result.pdfPath)]);
      expect(docx.byteLength).toBe(result.docxBytes);
      expect(pdf.byteLength).toBe(result.pdfBytes);
      return [docx.subarray(0, 2).toString(), pdf.subarray(0, 4).toString()];
    }));
    expect(signatures).toEqual(Array.from({ length: 6 }, () => ['PK', '%PDF']));
  }, 120_000);
});
