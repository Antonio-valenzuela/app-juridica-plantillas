import { describe, expect, it } from 'vitest';
import { segmentCandidates } from '@/lib/legal-engine/case-extraction/candidateSegmentation';
import type { SourceUnit } from '@/lib/legal-engine/case-extraction/sourceUnits';
import { createSourceProvenance } from '@/lib/legal-engine/case-extraction/provenance';

function units(text: string): SourceUnit[] {
  return text.split('\n').map((line, index) => ({
    unitId: `unit-${index}`,
    sourceId: 'src-a',
    sourceName: 'fixture.txt',
    kind: index === 0 && line.toUpperCase().startsWith('PRUEBAS') ? 'HEADING' : 'PARAGRAPH',
    text: line,
    page: 1,
    order: index,
    provenance: createSourceProvenance({
      sourceId: 'src-a',
      sourceName: 'fixture.txt',
      page: 1,
      excerpt: line,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    }),
  }));
}

describe('segmentCandidates', () => {
  it('segments numbered and bullet evidence without losing the heading context', () => {
    const { candidates } = segmentCandidates(units('PRUEBAS:\n1. contrato\n- recibos\n- requerimiento'));

    expect(candidates.map((candidate) => candidate.rawText)).toEqual(['contrato', 'recibos', 'requerimiento']);
    expect(candidates.every((candidate) => candidate.provenance[0].section === 'PRUEBAS')).toBe(true);
    expect(candidates.every((candidate) => candidate.decision === 'REQUIRES_REVIEW')).toBe(true);
  });

  it('does not split every sentence in a continuous paragraph', () => {
    const { candidates } = segmentCandidates(units('La actora celebró contrato y posteriormente realizó un pago en la misma relación fáctica.'));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].rawText).toContain('posteriormente realizó un pago');
  });

  it('does not treat a paragraph containing only a section label as a heading', () => {
    const paragraphUnits = units('PRUEBAS\nEl tribunal resolvió el recurso.').map((unit) => ({ ...unit, kind: 'PARAGRAPH' as const }));
    const { candidates } = segmentCandidates(paragraphUnits);

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.provenance[0].section !== 'PRUEBAS')).toBe(true);
  });

  it('assigns separate candidate identities to wrapped legal argument blocks', () => {
    const { candidates } = segmentCandidates([{
      unitId: 'unit-wrapped-arguments',
      sourceId: 'src-a',
      kind: 'PARAGRAPH',
      text: 'PRIMER CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 14.\nSEGUNDO CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 16.',
      page: 1,
      order: 0,
      provenance: createSourceProvenance({
        sourceId: 'src-a',
        page: 1,
        excerpt: 'PRIMER CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 14.\nSEGUNDO CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 16.',
        extractionMethod: 'PARAGRAPH',
        confidence: 1,
        inferenceLevel: 'LITERAL',
      }),
    }]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.candidateId).not.toBe(candidates[1]?.candidateId);
    expect(candidates[0]?.provenance[0]?.candidateId).toBe(candidates[0]?.candidateId);
    expect(candidates[1]?.provenance[0]?.candidateId).toBe(candidates[1]?.candidateId);
  });

  it('preserves text before the first wrapped argument block', () => {
    const { candidates } = segmentCandidates([{
      unitId: 'unit-preamble-arguments',
      sourceId: 'src-a',
      kind: 'PARAGRAPH',
      text: 'Referencia estructural al artículo 12.\nPRIMER CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 14.\nSEGUNDO CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 16.',
      page: 1,
      order: 0,
      provenance: createSourceProvenance({
        sourceId: 'src-a',
        page: 1,
        excerpt: 'Referencia estructural al artículo 12.\nPRIMER CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 14.\nSEGUNDO CONCEPTO DE VIOLACIÓN: Se vulneró el artículo 16.',
        extractionMethod: 'PARAGRAPH',
        confidence: 1,
        inferenceLevel: 'LITERAL',
      }),
    }]);

    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.rawText).toContain('artículo 12');
    expect(candidates[0]?.provenance[0]?.candidateId).toBe(candidates[0]?.candidateId);
  });
});
