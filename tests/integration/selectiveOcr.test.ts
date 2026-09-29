import { describe, expect, it } from 'vitest';
import { selectOcrPageNumbers } from '@/lib/pdf/documentExtractor';
import { resolveOcrConcurrency } from '@/lib/pdf/ocrProviders';

describe('selective OCR', () => {
  it('selects only native pages below the existing density threshold', () => {
    const pages = [
      { page: 1, text: 'Texto nativo válido '.repeat(8), chars: 160 },
      { page: 2, text: 'Encabezado', chars: 9 },
      { page: 3, text: 'Texto nativo válido '.repeat(8), chars: 160 },
      { page: 4, text: '', chars: 0 },
    ];

    expect(selectOcrPageNumbers(pages, 4)).toEqual([2, 4]);
  });

  it('falls back conservatively to every page when page-level native text is absent', () => {
    expect(selectOcrPageNumbers([], 3)).toEqual([1, 2, 3]);
  });

  it('clamps OCR concurrency to a safe bounded range', () => {
    expect(resolveOcrConcurrency(0, 44)).toBe(2);
    expect(resolveOcrConcurrency(3, 44)).toBe(3);
    expect(resolveOcrConcurrency(99, 44)).toBe(4);
    expect(resolveOcrConcurrency(4, 2)).toBe(2);
  });
});
