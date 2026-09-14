import { beforeAll, describe, expect, it } from 'vitest';
import { createSourceDocument } from '../../lib/legal-engine/context';
import { classifyIntent } from '../../lib/legal-engine/classifier';
import { getDocumentTemplate, resolveTemplateByExplicitLabel } from '../../lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '../../lib/legal-engine/documentRouting';
import { runGenerationPipeline } from '../../lib/legal-engine/pipeline';

const SELECTED_REVISION_ID = 'recurso_revision_amparo_directo';
const SELECTED_CONTESTACION_ID = 'contestacion_revision_extraordinaria_amparo_directo';
const GENERIC_SELECTED_PROMPT = 'Generar exactamente el escrito seleccionado por el usuario.';

beforeAll(() => {
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[key];
  }
});

const syntheticSentenceSource = createSourceDocument({
  id: 'synthetic-sentencia-amparo-directo',
  filename: 'sentencia_amparo_directo_sintetica.pdf',
  sourceValidated: true,
  pages: [
    {
      page: 1,
      text: [
        'SENTENCIA DE AMPARO DIRECTO.',
        'Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito.',
        'La resolución estudia conceptos de violación y antecedentes del juicio.',
      ].join('\n'),
      chars: 220,
    },
    {
      page: 2,
      text: [
        'RESOLUCIÓN FINAL.',
        'La Justicia de la Unión no ampara ni protege a la parte quejosa.',
        'Se trata de una sentencia definitiva y no de una demanda inicial.',
      ].join('\n'),
      chars: 190,
    },
  ],
});

function buildDocumentAnalysisWorkflow() {
  return {
    sourceDocuments: [syntheticSentenceSource],
    analysis: { facts: [], missingData: [] },
    selection: { mode: 'automatic' },
    flow: 'DOCUMENT_ANALYSIS',
    updatedAt: new Date('2026-08-31T00:00:00.000Z').toISOString(),
  } as any;
}

async function runWithSelectedDocumentType(selectedDocumentType: string, documentTypeLabel: string) {
  return runGenerationPipeline({
    selectedDocumentType,
    documentTypeLabel,
    userInstruction: GENERIC_SELECTED_PROMPT,
    sourceDocuments: [syntheticSentenceSource],
    workflow: buildDocumentAnalysisWorkflow(),
    generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
  } as any);
}

describe('Document routing contract for explicit selectedDocumentType', () => {
  it('conserva el ID canónico soportado recurso_revision_amparo_directo y resuelve el mismo template sin fallback', () => {
    expect(classifyIntent('Interponer recurso de revisión en amparo directo').documentType).toBe(SELECTED_REVISION_ID);
    expect(getDocumentTemplate(SELECTED_REVISION_ID).tipo).toBe(SELECTED_REVISION_ID);
    expect(resolveTemplateByExplicitLabel(SELECTED_REVISION_ID)?.tipo).toBe(SELECTED_REVISION_ID);
  });

  it('rechaza el selectedDocumentType genérico amparo_indirecto con UNKNOWN_DOCUMENT_TYPE y jamás lo convierte en demanda_amparo_indirecto', async () => {
    const outcome = await runWithSelectedDocumentType('amparo_indirecto', 'Amparo indirecto')
      .then((doc) => ({ doc }))
      .catch((error) => ({ error }));

    if ('doc' in outcome) {
      expect(outcome.doc.documentType).not.toBe('demanda_amparo_indirecto');
      expect(outcome.doc.templateId).not.toBe('demanda_amparo_indirecto');
      throw new Error(`Expected UNKNOWN_DOCUMENT_TYPE but pipeline resolved ${outcome.doc.documentType}/${outcome.doc.templateId}`);
    }

    expect(String(outcome.error)).toMatch(/UNKNOWN_DOCUMENT_TYPE/);
  });

  it('rechaza también el rótulo genérico Amparo indirecto cuando no existe ID canónico', () => {
    expect(() => resolveDocumentRouting({ documentTypeLabel: 'Amparo indirecto' } as any)).toThrow(/UNKNOWN_DOCUMENT_TYPE/);
    expect(resolveTemplateByExplicitLabel('Amparo indirecto')).toBeNull();
    expect(() => getDocumentTemplate(undefined, 'Amparo indirecto')).toThrow(/UNKNOWN_DOCUMENT_TYPE/);
  });

  it('usa el ID canónico contestacion_revision_extraordinaria_amparo_directo cuando ya existe strategy/template', async () => {
    const outcome = await runWithSelectedDocumentType(
      SELECTED_CONTESTACION_ID,
      'Contestación / Revisión extraordinaria ante sentencia de amparo directo',
    )
      .then((doc) => ({ doc }))
      .catch((error) => ({ error }));

    expect('doc' in outcome).toBe(true);
    if (!('doc' in outcome)) throw outcome.error;
    expect(outcome.doc.documentType).toBe(SELECTED_CONTESTACION_ID);
    expect(outcome.doc.templateId).toBe(SELECTED_CONTESTACION_ID);
    expect(outcome.doc.documentType).not.toBe('demanda_amparo_indirecto');
    expect(outcome.doc.templateId).not.toBe('demanda_amparo_indirecto');
  });

  it('runGenerationPipeline respeta selectedDocumentType sobre la naturaleza de la fuente y deja metadata de routing trazable', async () => {
    const doc = await runGenerationPipeline({
      selectedDocumentType: SELECTED_REVISION_ID,
      userInstruction: GENERIC_SELECTED_PROMPT,
      documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
      existingClassification: {
        documentType: 'escrito_libre',
        documentTypeLabel: 'Escrito Libre',
        matter: 'general',
        jurisdiction: 'general',
        proceduralStage: 'cualquiera',
        objective: 'Solicitud libre al órgano jurisdiccional',
        requiredInputs: [],
        confidence: 0,
        isDynamic: true,
      },
      sourceDocuments: [syntheticSentenceSource],
      workflow: buildDocumentAnalysisWorkflow(),
      generateSection: async ({ section }: { section: { title: string } }) => `Contenido sintético de ${section.title}.`,
    } as any);

    expect(doc.documentType).toBe(SELECTED_REVISION_ID);
    expect(doc.templateId).toBe(SELECTED_REVISION_ID);
    expect(doc.proceduralIdentity?.sourceDocumentType).toBe('SENTENCIA_O_RESOLUCION');
    expect((doc.generationMetadata as any).routing).toMatchObject({
      selectedDocumentType: SELECTED_REVISION_ID,
      resolvedStrategy: SELECTED_REVISION_ID,
      resolvedTemplate: SELECTED_REVISION_ID,
      sourceDocumentType: 'SENTENCIA_O_RESOLUCION',
      fallbackUsed: false,
    });
  });
});
