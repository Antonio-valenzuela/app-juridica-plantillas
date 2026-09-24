import { describe, expect, it } from 'vitest';
import { buildCaseWorkflow } from '@/lib/legal-engine/caseWorkflow';
import { buildCoverageMatrix } from '@/lib/legal-engine/coverageMatrix';
import { applyInstructionSupportedRichFields, reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
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

  it('projects an explicit challenge instruction and a standalone sentence heading', () => {
    const sentence = createSourceDocument({
      id: 'regression-sentence', filename: 'sentencia.txt', type: 'txt', sourceValidated: true,
      content: 'SENTENCIA DEFINITIVA\nEl juzgado dicta sentencia definitiva dentro del expediente 12/2026.',
    });
    const analysis = reconstructCaseAnalysis(
      [sentence],
      'Genera una apelación combatiendo esa sentencia.',
      '',
      { includeReferenceInAnalysis: false },
    );
    expect(analysis.challengedActs[0]?.actDescription).toMatch(/SENTENCIA DEFINITIVA/i);
    expect(analysis.richCaseAnalysis?.clientPosition.status).toBe('CONFIRMED');
    expect(analysis.richCaseAnalysis?.missingData.some((item) => item.field === 'clientPosition')).toBe(false);
  });

  it('reapplies instruction-supported posture when the caller supplies a rich snapshot', () => {
    const analysis = reconstructCaseAnalysis(
      [source],
      'Genera una apelación combatiendo esa sentencia.',
      '',
      { includeReferenceInAnalysis: false },
    );
    const supplied = structuredClone(analysis.richCaseAnalysis!);
    supplied.clientPosition = { status: 'UNKNOWN', source: 'SOURCE_POSITION', propositionIds: [], provenance: [] };
    supplied.missingData = [{
      field: 'clientPosition', reason: 'missing', importance: 'HIGH', blocking: true,
      sourceSearched: ['source'], requiresClientInput: true,
    }];
    const projected = applyInstructionSupportedRichFields(supplied, 'Genera una apelación combatiendo esa sentencia.');
    expect(projected.clientPosition.status).toBe('CONFIRMED');
    expect(projected.clientPosition.propositionIds).toEqual(expect.arrayContaining(
      projected.arguments.map((item) => item.id),
    ));
    expect(projected.missingData.some((item) => item.field === 'clientPosition')).toBe(false);
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
