import { describe, expect, it } from 'vitest';
import {
  buildAutoContext,
  buildGenerationContext,
  createSourceDocument,
  requiresValidatedSources,
} from '../../lib/legal-engine/context';
import { buildDraftingPlan, buildLawyerStyleDirective, runGenerationPipeline } from '../../lib/legal-engine/pipeline';
import { runMultiStepLegalQuery } from '../../lib/legal-engine/multiStep';
import { buildCaseWorkflow } from '../../lib/legal-engine/caseWorkflow';
import { DEFAULT_LAWYER_PROFILE } from '../../lib/workspace/lawyerProfileTypes';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const EXPEDIENTE_TEST_ID = 'EXPEDIENTE_TEST_001';

const fullSource = createSourceDocument({
  id: 'sentencia-1',
  filename: 'sentencia.pdf',
  sourceValidated: true,
  pages: [
    { page: 1, text: `AMPARO DIRECTO ${CANARY_EXPEDIENTE}. Antecedentes de la resolución.`, chars: 63 },
    { page: 2, text: 'La autoridad responsable sostuvo que la carga de la prueba corresponde a la parte demandada.', chars: 97 },
    { page: 3, text: 'PUNTOS RESOLUTIVOS. Se niega el amparo solicitado.', chars: 54 },
  ],
});

describe('motor universal de documentos', () => {
  it('transporta perfiles de estilo distintos a la directiva que recibe la generación', () => {
    const formal = buildLawyerStyleDirective({
      ...DEFAULT_LAWYER_PROFILE,
      preferredTone: 'formal_academico',
      averageSectionLength: 'extenso',
      preferredDocumentLength: 'extenso_exhaustivo',
    });
    const combative = buildLawyerStyleDirective({
      ...DEFAULT_LAWYER_PROFILE,
      preferredTone: 'combativo_tecnico',
      averageSectionLength: 'breve',
      preferredDocumentLength: 'conciso',
    });

    expect(formal).toContain('Tono preferido: formal_academico');
    expect(combative).toContain('Tono preferido: combativo_tecnico');
    expect(formal).not.toBe(combative);
  });

  it('conserva la extracción por página y recupera evidencia fuera del inicio del documento', () => {
    const context = buildGenerationContext({
      instruction: 'Refuta el criterio de carga de la prueba',
      sources: [fullSource],
      sectionTitle: 'Agravio primero',
    });

    expect(context.text).toContain('carga de la prueba corresponde');
    expect(context.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentId: 'sentencia-1', page: 2 }),
      ])
    );
  });

  it('bloquea la generación cuando una fuente no está validada', async () => {
    const unsafeSource = createSourceDocument({
      id: 'escaneo-1',
      filename: 'escaneo.pdf',
      sourceValidated: false,
      pages: [{ page: 1, text: 'texto incompleto', chars: 16 }],
    });

    await expect(runGenerationPipeline({
      userInstruction: 'Necesito un escrito de contestación',
      sourceDocuments: [unsafeSource],
    })).rejects.toThrow(/fuente no.*validada/i);

    expect(requiresValidatedSources([unsafeSource])).toBe(true);
  });

  it('no reemplaza una sección editada manualmente al regenerar', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Necesito un escrito de contestación',
      sourceDocuments: [fullSource],
      generateSection: async ({ section }) => `Contenido generado para ${section.title}`,
    });
    const target = doc.sections.find((section) => section.type === 'argument')!;
    target.isManuallyEdited = true;
    target.content[0].isManuallyEdited = true;
    target.content[0].text = 'Texto corregido por el abogado.';

    const result = await runGenerationPipeline({
      existingDocument: doc,
      targetSection: target.id,
      userInstruction: 'Amplía el argumento',
      sourceDocuments: [fullSource],
      generateSection: async () => 'Texto que no debe sustituir la edición.',
    });

    expect(result.sections.find((section) => section.id === target.id)?.content[0].text)
      .toBe('Texto corregido por el abogado.');
    expect(result.sections.find((section) => section.id === target.id)?.content[0].provenance)
      .toBe('USER_EDITED');
  });

  it('limita el modo multi-step y registra una traza de recuperación', async () => {
    const result = await runMultiStepLegalQuery({
      question: '¿Qué argumento responde a la carga de la prueba?',
      sources: [fullSource],
      maxSteps: 2,
    });

    expect(result.trace).toHaveLength(2);
    expect(result.context.references.some((reference) => reference.page === 2)).toBe(true);
  });

  it('agrega AutoContext de encabezado a cada fragmento recuperado', () => {
    const chunks = buildAutoContext(fullSource, 70);
    expect(chunks.every((chunk) => chunk.text.includes('Documento: sentencia.pdf'))).toBe(true);
  });

  it('transporta el modo de generación elegido al documento final', async () => {
    const workflow = buildCaseWorkflow({
      sourceDocuments: [fullSource],
      analysis: { facts: [], missingData: [] },
      generationMode: 'automatic',
    });

    const result = await runGenerationPipeline({
      workflow,
      sourceDocuments: [fullSource],
      userInstruction: 'Necesito una contestación desarrollada',
      generateSection: async ({ section }) => `Contenido para ${section.title}`,
    });

    expect(result.generationMetadata.generationMode).toBe('automatic');
    expect(result.generationMetadata.provenance).toContain('AI_GENERATED');
    expect(result.sections.some((section) => section.content.some((block) => block.provenance === 'AI_GENERATED'))).toBe(true);
  });

  it('usa la estructura del modelo seleccionado sin copiar sus datos históricos', async () => {
    const workflow = buildCaseWorkflow({
      sourceDocuments: [fullSource],
      analysis: { facts: [], missingData: [] },
      generationMode: 'personal_template',
      templateId: 'template-familiar',
    });
    const historicalTemplate = [
      'CONTESTACIÓN FAMILIAR DE MODELO',
      'PROEMIO Y PERSONALIDAD',
      'SECCIÓN PERSONALIZADA DEL MODELO',
      'EXCEPCIONES Y DEFENSAS',
      'PETITORIOS',
      `El cliente histórico ${CANARY_CLIENTE}, expediente ${EXPEDIENTE_TEST_ID}, solicita alimentos.`,
      'Desarrollo argumentativo del modelo para conservar su forma y extensión. '.repeat(12),
    ].join('\n');

    const result = await runGenerationPipeline({
      workflow,
      sourceDocuments: [fullSource],
      referenceDocumentText: historicalTemplate,
      documentTypeLabel: 'Contestación de Demanda',
      userInstruction: 'Genera la contestación del caso nuevo',
      generateSection: async () => 'Contenido del caso nuevo sin datos históricos.',
    });

    expect(result.sections.map((section) => section.title)).toContain('SECCIÓN PERSONALIZADA DEL MODELO');
    expect(result.sections.flatMap((section) => section.content).map((block) => block.text).join('\n'))
      .not.toContain(CANARY_CLIENTE);
    expect(result.generationMetadata.provenance).toContain('TEMPLATE_STRUCTURE');
  });

  it('transporta todos los hechos numerados al plan de redacción sin truncarlos', async () => {
    const result = await runGenerationPipeline({
      sourceDocuments: [fullSource],
      workflow: buildCaseWorkflow({
        sourceDocuments: [fullSource],
        analysis: {
          facts: [
            { id: 'f-1', number: 'HECHO I', text: 'Primer hecho completo', confidence: 0.9, provenance: 'SOURCE_EXTRACTED' },
            { id: 'f-2', number: 'HECHO II', text: 'Segundo hecho completo', confidence: 0.9, provenance: 'SOURCE_EXTRACTED' },
            { id: 'f-3', number: 'HECHO III', text: 'Tercer hecho completo', confidence: 0.9, provenance: 'SOURCE_EXTRACTED' },
            { id: 'f-4', number: 'HECHO IV', text: 'Cuarto hecho completo', confidence: 0.9, provenance: 'SOURCE_EXTRACTED' },
          ],
          missingData: [],
        },
        generationMode: 'automatic',
      }),
      userInstruction: 'Genera una contestación desarrollada',
      generateSection: async ({ section }) => `Contenido para ${section.title}`,
    });

    const plan = buildDraftingPlan(result, 0, result.caseAnalysis);
    expect(plan.sections[0].sourceFacts).toEqual([
      'HECHO I: Primer hecho completo',
      'HECHO II: Segundo hecho completo',
      'HECHO III: Tercer hecho completo',
      'HECHO IV: Cuarto hecho completo',
    ]);
  });

  it('lleva todos los hechos numerados al documento final cuando usa fallback local', async () => {
    const previousKey = process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    try {
      const source = createSourceDocument({
        id: 'demanda-cuatro-hechos',
        filename: 'demanda.txt',
        sourceValidated: true,
        pages: [{
          page: 1,
          text: 'HECHO PRIMERO: A\nHECHO SEGUNDO: B\nHECHO TERCERO: C\nHECHO CUARTO: D',
          chars: 67,
        }],
      });
      const result = await runGenerationPipeline({
        sourceDocuments: [source],
        documentTypeLabel: 'Contestación de demanda',
        userInstruction: 'Contestar la demanda hecho por hecho',
        workflow: buildCaseWorkflow({
          sourceDocuments: [source],
          analysis: {
            facts: [
              { id: '1', number: 'PRIMERO', text: 'A', confidence: 0.9 },
              { id: '2', number: 'SEGUNDO', text: 'B', confidence: 0.9 },
              { id: '3', number: 'TERCERO', text: 'C', confidence: 0.9 },
              { id: '4', number: 'CUARTO', text: 'D', confidence: 0.9 },
            ],
            missingData: [],
          },
          generationMode: 'automatic',
        }),
      });
      const finalText = result.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');
      expect(finalText).toContain('PRIMERO. A');
      expect(finalText).toContain('SEGUNDO. B');
      expect(finalText).toContain('TERCERO. C');
      expect(finalText).toContain('CUARTO. D');
    } finally {
      if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
      else process.env.NVIDIA_API_KEY = previousKey;
    }
  });

  it('conecta documento de referencia con estructura propia sin mezclarlo con modo automático', async () => {
    const reference = [
      'FORMATO HISTÓRICO DE REFERENCIA',
      'ENCABEZADO ESPECIAL DE REFERENCIA',
      'SECCIÓN ÚNICA DEL DOCUMENTO ANTERIOR',
      'FÓRMULA DE CIERRE DEL DOCUMENTO ANTERIOR',
      `Datos históricos que no deben copiarse: ${CANARY_CLIENTE}, expediente ${EXPEDIENTE_TEST_ID}.`,
      'Texto de forma y estilo reutilizable. '.repeat(30),
    ].join('\n');
    const source = createSourceDocument({
      id: 'demanda-nueva',
      filename: 'demanda-nueva.txt',
      sourceValidated: true,
      pages: [{ page: 1, text: 'HECHO PRIMERO: Caso nuevo.', chars: 26 }],
    });
    const result = await runGenerationPipeline({
      sourceDocuments: [source],
      referenceDocumentText: reference,
      referenceDocumentId: 'documento-anterior-1',
      documentTypeLabel: 'Contestación de demanda',
      userInstruction: 'Contestar el caso nuevo usando solo la forma del documento anterior.',
      workflow: buildCaseWorkflow({
        sourceDocuments: [source],
        analysis: { facts: [], missingData: [] },
        generationMode: 'reference_document',
        referenceDocumentId: 'documento-anterior-1',
      }),
      generateSection: async ({ section }) => `Contenido nuevo para ${section.title}`,
    });

    const titles = result.sections.map((section) => section.title);
    const body = result.sections.flatMap((section) => section.content).map((block) => block.text).join('\n');
    expect(result.generationMetadata.generationMode).toBe('reference_document');
    expect(result.generationMetadata.referenceDocumentId).toBe('documento-anterior-1');
    expect(titles).toContain('SECCIÓN ÚNICA DEL DOCUMENTO ANTERIOR');
    expect(body).not.toContain(CANARY_CLIENTE);
    expect(body).not.toContain(EXPEDIENTE_TEST_ID);
  });
});
