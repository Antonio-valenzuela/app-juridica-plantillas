import { describe, expect, it } from 'vitest';
import { segmentCandidates } from '@/lib/legal-engine/case-extraction/candidateSegmentation';
import { classifyCandidates } from '@/lib/legal-engine/case-extraction/classification';
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

function paragraphUnit(text: string): SourceUnit {
  return {
    unitId: 'wrapped-paragraph',
    sourceId: 'src-a',
    sourceName: 'fixture.txt',
    kind: 'PARAGRAPH',
    text,
    page: 1,
    order: 0,
    provenance: createSourceProvenance({
      sourceId: 'src-a',
      sourceName: 'fixture.txt',
      page: 1,
      excerpt: text,
      extractionMethod: 'PARAGRAPH',
      confidence: 1,
      inferenceLevel: 'LITERAL',
    }),
  };
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

  it('propagates an explicitly delimited paragraph heading to the following candidates', () => {
    const { candidates } = segmentCandidates([paragraphUnit([
      'PRESTACIONES:',
      'A) El pago de $250,000.',
      'B) Intereses.',
      'C) Gastos y costas.',
    ].join('\n'))]);

    expect(candidates.map((candidate) => candidate.rawText)).toEqual([
      'El pago de $250,000.',
      'Intereses.',
      'Gastos y costas.',
    ]);
    expect(candidates.map((candidate) => candidate.provenance[0].section)).toEqual([
      'PRESTACIONES',
      'PRESTACIONES',
      'PRESTACIONES',
    ]);
  });

  it('classifies each paragraph-delimited prestation as an independent claim', () => {
    const { candidates } = segmentCandidates([paragraphUnit([
      'PRESTACIONES:',
      'A) El pago de $250,000.',
      'B) Intereses.',
      'C) Gastos y costas.',
    ].join('\n'))]);

    const classified = classifyCandidates(candidates);

    expect(classified).toHaveLength(3);
    expect(classified.map((candidate) => candidate.kind)).toEqual(['CLAIM', 'CLAIM', 'CLAIM']);
  });

  it('classifies each paragraph-delimited hecho as a fact despite date-shaped text', () => {
    const { candidates } = segmentCandidates([paragraphUnit([
      'HECHOS:',
      '1. El 1 de enero de 2026 se celebró el contrato.',
      '2. El 15 de febrero de 2026 se reclamó el pago.',
      '3. El 4 de marzo de 2026 se notificó la negativa.',
    ].join('\n'))]);

    const classified = classifyCandidates(candidates);

    expect(classified).toHaveLength(3);
    expect(classified.map((candidate) => candidate.kind)).toEqual(['FACT', 'FACT', 'FACT']);
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
