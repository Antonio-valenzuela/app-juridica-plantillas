import { describe, expect, it } from 'vitest';
import { createDocumentNode } from '@/lib/legal-engine/types';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import type { DocumentPlanResult } from '@/lib/legal-engine/documentPlan';
import { deriveSectionContracts, validateSectionContracts } from '@/lib/legal-engine/documentSectionContracts';

function contestacionContractsInput(options: { omitTitle?: string } = {}) {
  const documentType = 'contestacion_demanda_laboral';
  const template = getDocumentTemplate(documentType);
  const sections = template.estructura
    .filter((title) => title !== options.omitTitle)
    .map((title, index) => createDocumentNode({
      id: title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_'),
      title,
      order: index * 10,
      type: title.includes('PRUEBAS') ? 'evidence' : title.includes('PETITORIOS') ? 'petition' : title.includes('ALEGATOS') ? 'argument' : 'custom',
    }));
  const documentPlan: DocumentPlanResult = {
    sections,
    planSource: 'GENERATED',
    templateId: documentType,
  };
  return { documentType, documentPlan, candidateSections: sections };
}

describe('declarative document section contracts', () => {
  it('derives the canonical ordinary contestacion order from the existing template', () => {
    const contracts = deriveSectionContracts(contestacionContractsInput());
    expect(contracts.map((contract) => contract.title)).toEqual([
      'PROEMIO', 'COMPARECENCIA Y PERSONALIDAD', 'OBJETO DEL ESCRITO',
      'CONTESTACIÓN DE HECHOS', 'CONTESTACIÓN DE PRESTACIONES',
      'EXCEPCIONES Y DEFENSAS', 'PRUEBAS', 'ALEGATOS', 'PETITORIOS', 'FIRMA',
    ]);
  });

  it('marks petition/evidence/argument roles from section type and Coverage, not text templates', () => {
    const contracts = deriveSectionContracts(contestacionContractsInput());
    expect(contracts.find((contract) => contract.type === 'petition')?.contentRole).toBe('PETITION');
    expect(contracts.find((contract) => contract.type === 'evidence')?.contentRole).toBe('EVIDENCE');
  });

  it('reports a missing required section without synthesizing one', () => {
    const findings = validateSectionContracts(contestacionContractsInput({ omitTitle: 'PETITORIOS' }));
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_REQUIRED_SECTION', severity: 'BLOCKER' }),
    ]));
  });
});
