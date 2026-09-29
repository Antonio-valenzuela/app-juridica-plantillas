import { describe, expect, it } from 'vitest';
import { assembleLegalDraft } from '@/lib/legal-engine/documentAssembly';
import { makeAssemblyInput, makeDocumentFixture, makePlanFixture } from '@/lib/legal-engine/documentAssemblyTypes';
import { buildContestacionSignatureBlock } from '@/lib/legal-engine/contestacionStructure';
import { hasUnresolvedFactualDependencies } from '@/lib/legal-engine/seedMarkers';

describe('contestacion signature assembly', () => {
  const assembleSignature = (party: string) => {
    const document = makeDocumentFixture();
    const section = {
      ...makePlanFixture().sections[0]!,
      id: 'sec-con-firma',
      title: 'FIRMA',
      type: 'signature' as const,
      content: [],
    };
    const block = buildContestacionSignatureBlock(section.id, party);
    const result = assembleLegalDraft(makeAssemblyInput({
      document,
      documentPlan: makePlanFixture({ sections: [section] }),
      candidateSections: [{ ...section, content: [block] }],
      candidateBlocks: [{ sectionId: section.id, block }],
    }));
    return { block, result };
  };

  it('keeps a sourced defendant name in the final signature section', () => {
    const { block, result } = assembleSignature('María López');
    expect(result.document.sections[0]?.content).toHaveLength(1);
    expect(result.document.sections[0]?.content[0]?.text).toContain('María López');
    expect(block.generatedBy).toBe('DETERMINISTIC');
    expect(hasUnresolvedFactualDependencies(block.text)).toBe(false);
  });

  it('uses one discreet editable field when the signatory is unknown', () => {
    const { block, result } = assembleSignature('[DATO PENDIENTE DE EXPEDIENTE: Nombre del demandado]');
    expect(result.document.sections[0]?.content).toHaveLength(1);
    expect(block.text).toContain('Nombre y calidad de quien firma: ____________________');
    expect(block.text).not.toContain('DATO PENDIENTE');
    expect(hasUnresolvedFactualDependencies(block.text)).toBe(false);
  });
});
