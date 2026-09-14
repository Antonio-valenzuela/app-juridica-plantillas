import { describe, expect, it } from 'vitest';
import { buildSourceUnits } from '@/lib/legal-engine/case-extraction/sourceUnits';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

function sourceWithPages(id: string, page: number, text: string): UploadedSourceDocument {
  return {
    id,
    filename: `${id}.txt`,
    type: 'txt',
    pages: [{ page, text, chars: text.length }],
    extractedText: text,
    sourceValidated: true,
  };
}

describe('buildSourceUnits', () => {
  it('preserves source, page and ordered elements from DocumentIndex', () => {
    const units = buildSourceUnits([sourceWithPages('src-a', 3, 'HECHOS\n1. Contrato')]);

    expect(units[0]).toMatchObject({ sourceId: 'src-a', page: 3 });
    expect(units.every((unit, index) => unit.order === index)).toBe(true);
    expect(units.every((unit) => unit.provenance.sourceId === 'src-a')).toBe(true);
  });

  it('reuses DocumentIndex table units without inventing rows', () => {
    const units = buildSourceUnits([sourceWithPages('src-table', 1, '| Prueba | Hecho |\n| contrato | 1 |')]);

    expect(units.some((unit) => unit.kind === 'TABLE')).toBe(true);
    expect(units.find((unit) => unit.kind === 'TABLE')?.tableRows).toBeUndefined();
  });
});
