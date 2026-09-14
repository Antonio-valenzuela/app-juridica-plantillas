import { describe, expect, it } from 'vitest';
import { buildCaseWorkflow } from '@/lib/legal-engine/caseWorkflow';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { evaluateSourceOutputCompatibility } from '@/lib/legal-engine/sourceOutputCompatibility';
import { createEmptyDocument } from '@/lib/legal-engine/types';

const source = createSourceDocument({
  id: 'regression-source', filename: 'regression.txt', type: 'txt', sourceValidated: true,
  content: 'ACTOR: Ana López\nDEMANDADO: Beta Servicios\nHECHOS:\n1. Se celebró el contrato.\nPRUEBAS: contrato',
});

describe('legacy consumer regressions after rich extraction', () => {
  it('keeps CaseWorkflow compatible with projected facts and provenance', () => {
    const analysis = reconstructCaseAnalysis([source], 'Analizar', '', { includeReferenceInAnalysis: false });
    const workflow = buildCaseWorkflow({ sourceDocuments: [source], analysis, generationMode: 'automatic' });
    expect(workflow.analysis.facts.length).toBeGreaterThan(0);
    expect(workflow.analysis.facts[0].provenance).toBe('SOURCE_EXTRACTED');
  });

  it('keeps CoverageMatrix consumable from the legacy projection', () => {
    const analysis = reconstructCaseAnalysis([source], 'contestación de demanda', '', { includeReferenceInAnalysis: false });
    const matrix = buildCoverageMatrix(analysis, createEmptyDocument({ id: 'regression-doc', documentType: 'contestacion_demanda_civil' }), []);
    expect(matrix).toBeDefined();
    expect(Array.isArray(matrix.items)).toBe(true);
  });

  it('keeps source-output compatibility fail-closed without rich semantic promotion', () => {
    const result = evaluateSourceOutputCompatibility({ sourceDocuments: [source], selectedDocumentType: 'contestacion_demanda_civil', sourceMatter: 'civil' });
    expect(result).toBeDefined();
  });

  it('does not remove or weaken the existing Flujo A shape', () => {
    const analysis = reconstructCaseAnalysis([source], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.claims).toEqual(expect.any(Array));
    expect(analysis.facts).toEqual(expect.any(Array));
    expect(analysis.evidence).toEqual(expect.any(Array));
  });

  it('resets section context between source documents', () => {
    const first = createSourceDocument({
      id: 'regression-section-a', filename: 'section-a.txt', type: 'txt', sourceValidated: true,
      content: 'PRUEBAS\ncontrato',
    });
    const second = createSourceDocument({
      id: 'regression-section-b', filename: 'section-b.txt', type: 'txt', sourceValidated: true,
      content: 'FECHA: marzo de 2026',
    });
    const analysis = reconstructCaseAnalysis([first, second], 'Analizar', '', { includeReferenceInAnalysis: false });
    expect(analysis.richCaseAnalysis?.dates).toHaveLength(1);
    expect(analysis.richCaseAnalysis?.dates[0].precision).toBe('MONTH');
  });
});
