import { describe, expect, it } from 'vitest';
import {
  buildCaseWorkflow,
  chooseGenerationSource,
  type CaseWorkflowInput,
} from '@/lib/legal-engine/caseWorkflow';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';

describe('CaseWorkflow', () => {
  it('normaliza el análisis y conserva procedencia por página', () => {
    const input: CaseWorkflowInput = {
      sourceDocuments: [{
        id: 'src-1',
        filename: 'demanda.txt',
        type: 'txt',
        extractedText: 'HECHO PRIMERO. El actor celebró contrato.',
        pages: [{ page: 1, text: 'HECHO PRIMERO. El actor celebró contrato.', chars: 43 }],
        sourceValidated: true,
      }],
      analysis: {
        parties: { actor: 'Ana', demandado: 'Luis' },
        facts: [{
          id: 'fact-1',
          number: 'PRIMERO',
          text: 'El actor celebró contrato.',
          documentId: 'src-1',
          page: 1,
          confidence: 0.9,
        }],
        missingData: [],
      },
      generationMode: 'automatic',
    };

    const workflow = buildCaseWorkflow(input);

    expect(workflow.analysis.facts[0].provenance).toBe('SOURCE_EXTRACTED');
    expect(workflow.analysis.facts[0].page).toBe(1);
  });

  it('separa plantilla personal de documento de referencia', () => {
    expect(chooseGenerationSource({ mode: 'personal_template', templateId: 'tpl-1' })).toEqual({
      mode: 'personal_template',
      templateId: 'tpl-1',
      referenceDocumentId: undefined,
    });

    expect(chooseGenerationSource({ mode: 'reference_document', referenceDocumentId: 'ref-1' })).toEqual({
      mode: 'reference_document',
      templateId: undefined,
      referenceDocumentId: 'ref-1',
    });
  });

  it('conserva hechos numerados como unidades independientes con página de origen', () => {
    const analysis = reconstructCaseAnalysis([{
      id: 'src-demand',
      filename: 'demanda.txt',
      extractedText: [
        'HECHO PRIMERO. La parte actora celebró el contrato.',
        'HECHO SEGUNDO. La demandada dejó de cumplir.',
        'HECHO TERCERO. Se reclamó el pago correspondiente.',
      ].join('\n'),
      pages: [{
        page: 4,
        text: [
          'HECHO PRIMERO. La parte actora celebró el contrato.',
          'HECHO SEGUNDO. La demandada dejó de cumplir.',
          'HECHO TERCERO. Se reclamó el pago correspondiente.',
        ].join('\n'),
        chars: 150,
      }],
      sourceValidated: true,
    }]);

    expect(analysis.facts).toHaveLength(3);
    expect(analysis.facts.map((fact) => fact.number)).toEqual(['PRIMERO', 'SEGUNDO', 'TERCERO']);
    expect(analysis.facts[1].text).toContain('La demandada dejó de cumplir');
    expect(analysis.facts.every((fact) => fact.documentId === 'src-demand' && fact.page === 4)).toBe(true);
    expect(analysis.facts.every((fact) => fact.provenance === 'SOURCE_EXTRACTED')).toBe(true);
  });
});
