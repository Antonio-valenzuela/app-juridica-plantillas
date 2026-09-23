import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { buildDocumentPlan } from '@/lib/legal-engine/documentPlan';
import { getDocumentTemplate } from '@/lib/legal-engine/documentTemplates';
import { resolveDocumentRouting } from '@/lib/legal-engine/documentRouting';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { sanitizeLegalDocument } from '@/lib/legal-engine/legalDocumentSanitizer';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { materializeDocumentForPageMeasurement, renderableBodyParagraphs } from '@/lib/legal-engine/finalDocumentMaterialization';

describe('regresión real: apelación civil y contrato de generación', () => {
  it('A: una apelación explícita nunca se resuelve como contestación civil', () => {
    const routing = resolveDocumentRouting({
      selectedDocumentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
    });

    expect(routing.resolvedStrategy).toBe('apelacion_civil');
    expect(routing.resolvedTemplate).toBe('apelacion_civil');
    expect(routing.resolvedTemplate).not.toBe('contestacion_demanda_civil');
  });

  it('B: apelación sin machote obtiene un plan canónico reutilizable', () => {
    const template = getDocumentTemplate('apelacion_civil', 'Apelación Civil');
    const doc = createEmptyDocument({
      documentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
      matter: 'Civil',
    });
    const plan = buildDocumentPlan({ doc, template });
    const titles = plan.sections.map((section) => section.title.toUpperCase());

    expect(plan.planSource).toBe('CANONICAL_GENERATED');
    expect(titles).toEqual(expect.arrayContaining([
      'RUBRO / AUTORIDAD',
      'OBJETO: INTERPOSICIÓN DEL RECURSO',
      'RESOLUCIÓN IMPUGNADA',
      'AGRAVIOS',
      'PUNTOS PETITORIOS',
      'LUGAR / FECHA',
      'FIRMA',
    ]));
  });

  it('C-D: la estructura y sus títulos sobreviven al modelo materializado', async () => {
    const doc = await runGenerationPipeline({
      flow: 'NEW_WRITING',
      selectedDocumentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
      userInstruction: 'Interponer apelación civil con agravios y petitorios.',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      generationExtension: { generationMode: 'standard' },
    } as any);

    const titles = doc.sections.map((section) => section.title);
    expect(titles).toContain('AGRAVIOS');
    expect(titles).not.toEqual([]);
    expect(doc.sections.every((section) => section.title.trim().length > 0)).toBe(true);
    const renderModel = materializeDocumentForPageMeasurement(doc);
    const renderedParagraphs = [
      ...renderModel.header,
      ...renderableBodyParagraphs(renderModel),
      ...renderModel.footer,
    ];
    const renderedText = renderedParagraphs.map((paragraph) => paragraph.text).join('\n');
    expect(renderedText).toContain('AGRAVIOS');
    expect(renderedText).toContain('PUNTOS PETITORIOS');
    expect(renderedParagraphs).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'AGRAVIOS', role: 'TITLE' }),
      expect.objectContaining({ text: 'PUNTOS PETITORIOS', role: 'TITLE' }),
    ]));
  });

  it('E: minPages=40 llega al contrato persistido del pipeline', async () => {
    const doc = await runGenerationPipeline({
      flow: 'NEW_WRITING',
      selectedDocumentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
      userInstruction: 'Interponer apelación civil extensa.',
      sourceDocuments: [],
      allowUnvalidatedSource: true,
      generationExtension: { generationMode: 'extended-legal', targetPages: 40, minPages: 40, maxPages: 44 },
    } as any);

    expect((doc.generationMetadata as any).generationExtension.minPages).toBe(40);
  });

  it('F: detecta el placeholder interno exacto y sus variantes antes de exportar', () => {
    const doc = createEmptyDocument({ documentType: 'apelacion_civil' });
    doc.sections = [{
      id: 'sec-pruebas',
      title: 'PRUEBAS',
      type: 'BODY',
      order: 0,
      content: [{ id: 'block-1', text: '[REQUIEREDEFINIRPRUEBASA OFRECER]', layer: 'GENERATED_ARGUMENT' } as any],
      children: [],
      isManuallyEdited: false,
      validationWarnings: [],
    } as any];

    const result = sanitizeLegalDocument(doc, { dedupeBlocks: false });
    expect(result.report.placeholdersFound).toEqual(expect.arrayContaining(['[REQUIEREDEFINIRPRUEBASA OFRECER]']));
    expect(result.report.placeholdersFound.some((marker) => /REQUIERE/i.test(marker))).toBe(true);
  });

  it('G: fuente escaneada de densidad extrema no puede pasar como fuente analizada', async () => {
    const source = createSourceDocument({
      id: 'scanned-low-density',
      filename: 'scanned-low-density.pdf',
      sourceValidated: true,
      pages: Array.from({ length: 44 }, (_, index) => ({ page: index + 1, text: 'scan', chars: 18 })),
    });

    await expect(runGenerationPipeline({
      flow: 'DOCUMENT_ANALYSIS',
      selectedDocumentType: 'apelacion_civil',
      documentTypeLabel: 'Apelación Civil',
      userInstruction: 'Redactar una apelación civil fundada.',
      sourceDocuments: [source],
      allowUnvalidatedSource: true,
      workflow: { flow: 'DOCUMENT_ANALYSIS', sourceDocuments: [source], selection: { mode: 'automatic' } },
    } as any)).rejects.toThrow(/NEEDS_SOURCE_REVIEW|SOURCE_TYPE_UNKNOWN|EXTRACTION_INCOMPLETE/);
  });
});
