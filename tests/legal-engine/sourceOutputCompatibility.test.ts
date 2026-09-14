import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '../../lib/legal-engine/context';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import type { CaseWorkflow } from '../../lib/legal-engine/types';
import {
  evaluateSourceOutputCompatibility,
  SourceDocumentIncompatibleError,
} from '../../lib/legal-engine/sourceOutputCompatibility';

function syntheticSource(id: string, text: string) {
  return createSourceDocument({
    id,
    filename: `${id}.pdf`,
    sourceValidated: true,
    content: text,
  });
}

function documentAnalysisWorkflow(source: ReturnType<typeof syntheticSource>) {
  return {
    sourceDocuments: [source],
    analysis: { facts: [], missingData: [] },
    selection: { mode: 'automatic' as const },
    flow: 'DOCUMENT_ANALYSIS' as const,
    updatedAt: '2026-09-01T00:00:00.000Z',
  } as unknown as CaseWorkflow;
}

describe('compatibilidad entre fuente y documento de salida', () => {
  it('bloquea antes de generar una contestación civil cuando la fuente es una sentencia de amparo', async () => {
    const source = syntheticSource(
      'synthetic-amparo-sentence',
      'SENTENCIA DEFINITIVA DE AMPARO DIRECTO. Tribunal Colegiado. Materia laboral. Resolución que decide conceptos de violación.',
    );
    let generationCalls = 0;

    await expect(runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      userInstruction: 'Contestar la demanda civil.',
      sourceDocuments: [source],
      workflow: documentAnalysisWorkflow(source),
      generateSection: async () => {
        generationCalls += 1;
        return 'Esta generación no debe iniciar.';
      },
    })).rejects.toMatchObject({
      code: 'SOURCE_DOCUMENT_INCOMPATIBLE',
      metadata: {
        selectedDocumentType: 'contestacion_demanda_civil',
        sourceDocumentType: 'SENTENCIA_AMPARO_DIRECTO',
        sourceMatter: 'LABORAL',
        requiredSourceTypes: [
          'DEMANDA_CIVIL',
          'ESCRITO_INICIAL_CIVIL',
        ],
      },
    });
    expect(generationCalls).toBe(0);
  });

  it('acepta una demanda civil como fuente de una contestación civil', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceMatter: 'Civil',
      sourceDocuments: [syntheticSource(
        'synthetic-civil-demand',
        'DEMANDA CIVIL. Juzgado civil competente. HECHOS: 1. Se celebró el contrato. PRESTACIONES: 1. El pago reclamado.',
      )],
      sourceAnalysis: {
        numberedFacts: [{ number: '1' }],
        sourceClaims: [{ number: '1' }],
      },
    });

    expect(result).toMatchObject({
      status: 'COMPATIBLE',
      sourceDocumentType: 'DEMANDA_CIVIL',
      sourceMatter: 'CIVIL',
      requiredSourceTypes: [
        'DEMANDA_CIVIL',
        'ESCRITO_INICIAL_CIVIL',
      ],
    });
  });

  it('acepta una demanda mercantil como fuente de la salida mercantil correspondiente', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_mercantil',
      sourceDocuments: [syntheticSource(
        'synthetic-commercial-demand',
        'DEMANDA MERCANTIL. Juicio ejecutivo mercantil. HECHOS: 1. Se suscribió el título. PRESTACIONES: 1. El pago del adeudo.',
      )],
      sourceAnalysis: {
        numberedFacts: [{ number: '1' }],
        sourceClaims: [{ number: '1' }],
      },
    });

    expect(result.status).toBe('COMPATIBLE');
    expect(result.sourceDocumentType).toBe('DEMANDA_MERCANTIL');
    expect(result.sourceMatter).toBe('MERCANTIL');
  });

  it('propaga la compatibilidad al documento generado para una demanda civil válida', async () => {
    const source = syntheticSource(
      'synthetic-pipeline-civil-demand',
      [
        'DEMANDA CIVIL',
        'Juzgado civil competente.',
        'HECHO I: Se celebró el contrato cuya existencia se acredita en autos.',
        'PRESTACIONES:',
        '1. El pago de la cantidad reclamada.',
      ].join('\n'),
    );

    const document = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      userInstruction: 'Contestar la demanda civil.',
      sourceDocuments: [source],
      workflow: documentAnalysisWorkflow(source),
      generateSection: async ({ section }) => `Contenido sintético de ${section.title}.`,
    });

    expect(document.templateId).toBe('contestacion_demanda_civil');
    expect(document.sections.length).toBeGreaterThan(0);
    expect(document.generationMetadata.sourceOutputCompatibility).toMatchObject({
      status: 'COMPATIBLE',
      sourceDocumentType: 'DEMANDA_CIVIL',
      sourceMatter: 'CIVIL',
    });
  });

  it('marca extracción incompleta en una demanda admisible sin convertirla en incompatibilidad', () => {
    const result = evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [syntheticSource(
        'synthetic-partial-demand',
        'DEMANDA CIVIL. Se solicita contestación de las prestaciones reclamadas.',
      )],
      sourceAnalysis: {
        numberedFacts: [],
        sourceClaims: [{ number: '1' }],
      },
    });

    expect(result).toMatchObject({
      status: 'NEEDS_INPUT',
      code: 'EXTRACTION_INCOMPLETE',
      sourceDocumentType: 'DEMANDA_CIVIL',
    });
    expect(result.missingRequirements).toContain('hechos numerados de la demanda');
    expect(result.code).not.toBe('SOURCE_DOCUMENT_INCOMPATIBLE');
  });

  it('deja NEEDS_INPUT en el documento cuando el pipeline recibe una demanda admisible con extracción parcial', async () => {
    const source = syntheticSource(
      'synthetic-pipeline-partial-demand',
      [
        'DEMANDA CIVIL',
        'Juzgado civil competente.',
        'PRESTACIONES:',
        '1. El pago de la cantidad reclamada.',
      ].join('\n'),
    );

    const document = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_demanda_civil',
      documentTypeLabel: 'Contestación de Demanda Civil',
      matter: 'Civil',
      userInstruction: 'Contestar la demanda civil.',
      sourceDocuments: [source],
      workflow: documentAnalysisWorkflow(source),
      generateSection: async ({ section }) => `Contenido sintético de ${section.title}.`,
    });

    expect(document.generationMetadata.sourceOutputCompatibility).toMatchObject({
      status: 'NEEDS_INPUT',
      code: 'EXTRACTION_INCOMPLETE',
      sourceDocumentType: 'DEMANDA_CIVIL',
    });
    expect(document.missingFields).toContain('hechos numerados de la demanda');
  });

  it('no permite que datos extraíbles de una sentencia de amparo eviten el bloqueo de compatibilidad', () => {
    expect(() => evaluateSourceOutputCompatibility({
      selectedDocumentType: 'contestacion_demanda_civil',
      sourceDocuments: [syntheticSource(
        'synthetic-rich-amparo-sentence',
        'SENTENCIA DE AMPARO DIRECTO. Expediente judicial. HECHOS: 1. Se dictó resolución. PRESTACIONES: 1. Se pidió protección federal.',
      )],
      sourceAnalysis: {
        numberedFacts: [{ number: '1' }],
        sourceClaims: [{ number: '1' }],
      },
    })).toThrowError(SourceDocumentIncompatibleError);
  });
});
