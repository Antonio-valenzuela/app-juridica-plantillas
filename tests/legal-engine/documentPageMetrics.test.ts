import { describe, expect, it } from 'vitest';
import { countPdfPages } from '@/lib/legal-engine/documentPageMetrics';

describe('PDF page metrics', () => {
  it('counts serialized page objects but not the page-tree object', () => {
    const pdf = new TextEncoder().encode([
      '<< /Type /Pages /Count 2 >>',
      '<< /Type /Page /Parent 3 0 R >>',
      '<< /Type /Page /Parent 3 0 R >>',
    ].join('\n'));

    expect(countPdfPages(pdf)).toBe(2);
  });

  it('returns zero when the bytes contain no serialized page objects', () => {
    expect(countPdfPages(new TextEncoder().encode('not a PDF page tree'))).toBe(0);
  });
});
