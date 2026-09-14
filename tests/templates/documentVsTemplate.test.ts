import { describe, expect, it } from 'vitest';
import * as lifecycle from '@/lib/legal-engine/documentLifecycle';
import * as context from '@/lib/legal-engine/context';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

const SOURCE_ID = 'SOURCE_TEST_001';
const EXPEDIENTE_ID = 'EXPEDIENTE_TEST_001';
const FILE_NAME = 'DOCUMENTO_TEST_001.pdf';
const OLD_PARTY = 'PARTE_ANTERIOR_TEST';

type ReferenceInput = {
  id: string;
  filename?: string;
  extractedText?: string;
  content?: string;
  pages?: Array<{ page: number; text: string; chars: number }>;
};
type ReferenceFactory = (reference: ReferenceInput) => Record<string, unknown>;
type DraftFactory = (value: object) => Record<string, unknown>;
type FinalFactory = (value: object, transition?: { explicit: true }) => Record<string, unknown>;
type PreparedTemplate = Record<string, unknown> & {
  content: string;
  structureJson: { sourceMetadata: { originalDataRemoved: boolean } };
};
type PrepareTemplateFactory = (
  source: object,
  options: { title: string; creationIntent: 'EXPLICIT_TEMPLATE' },
) => PreparedTemplate;

const sourceText = [
  'JUZGADO: Tribunal de Prueba',
  `EXPEDIENTE: ${EXPEDIENTE_ID}`,
  `ACTOR: ${OLD_PARTY}`,
  'DEMANDADO: CONTRAPARTE_ANTERIOR_TEST',
  'HECHOS',
  'La parte actora solicita el cumplimiento de la obligación documentada.',
].join('\n');

function makeSource() {
  return context.createSourceDocument({
    id: SOURCE_ID,
    filename: FILE_NAME,
    type: 'application/pdf',
    extractedText: sourceText,
    sourceValidated: true,
    pages: [{ page: 1, text: sourceText, chars: sourceText.length }],
  });
}

describe('T5: documento, referencia y plantilla explícita permanecen separados', () => {
  it('clasifica una fuente recibida y un documento creado como entidades distintas', () => {
    const source = makeSource();
    const draft = createEmptyDocument({
      id: 'DRAFT_TEST_001',
      title: 'Borrador de prueba',
      sourceDocuments: [source],
    });
    const createReferenceDocument = (context as unknown as Record<string, unknown>)
      .createReferenceDocument as ReferenceFactory | undefined;

    expect(lifecycle.readDocumentEntityKind(source)).toBe('SOURCE_DOCUMENT');
    expect(lifecycle.readDocumentEntityKind(draft)).toBe('DRAFT');
    expect(typeof createReferenceDocument).toBe('function');

    if (typeof createReferenceDocument === 'function') {
      const reference = createReferenceDocument({
        id: 'REFERENCE_TEST_001',
        filename: 'REFERENCIA_TEST_001.pdf',
        extractedText: 'Estructura de apoyo sin hechos del asunto.',
        pages: [{ page: 1, text: 'Estructura de apoyo sin hechos del asunto.', chars: 41 }],
      });
      expect(lifecycle.readDocumentEntityKind(reference)).toBe('REFERENCE_DOCUMENT');
    }
  });

  it('solo permite marcar FINAL_DOCUMENT mediante una transición explícita desde un borrador', () => {
    const lifecycleApi = lifecycle as unknown as Record<string, unknown>;
    const markDocumentAsDraft = lifecycleApi.markDocumentAsDraft as DraftFactory | undefined;
    const markDocumentAsFinal = lifecycleApi.markDocumentAsFinal as FinalFactory | undefined;

    expect(typeof markDocumentAsDraft).toBe('function');
    expect(typeof markDocumentAsFinal).toBe('function');

    if (typeof markDocumentAsDraft !== 'function' || typeof markDocumentAsFinal !== 'function') return;

    const draft = markDocumentAsDraft({
      id: 'DRAFT_TEST_002',
      manualEdit: 'Edición manual del abogado.',
    });

    expect(() => markDocumentAsFinal(draft)).toThrow(/expl[ií]cita/i);

    const finalDocument = markDocumentAsFinal(draft, { explicit: true });
    expect(lifecycle.readDocumentEntityKind(finalDocument)).toBe('FINAL_DOCUMENT');
    expect(finalDocument.manualEdit).toBe('Edición manual del abogado.');
  });

  it('no convierte automáticamente fuente, borrador, final ni referencia en plantilla', () => {
    const source = makeSource();
    const lifecycleApi = lifecycle as unknown as Record<string, unknown>;
    const markDocumentAsDraft = lifecycleApi.markDocumentAsDraft as DraftFactory | undefined;
    const markDocumentAsFinal = lifecycleApi.markDocumentAsFinal as FinalFactory | undefined;
    const createReferenceDocument = (context as unknown as Record<string, unknown>)
      .createReferenceDocument as ReferenceFactory | undefined;

    expect(typeof markDocumentAsDraft).toBe('function');
    expect(typeof markDocumentAsFinal).toBe('function');
    expect(typeof createReferenceDocument).toBe('function');

    if (
      typeof markDocumentAsDraft !== 'function'
      || typeof markDocumentAsFinal !== 'function'
      || typeof createReferenceDocument !== 'function'
    ) return;

    const draft = markDocumentAsDraft({ id: 'DRAFT_TEST_003', sourceDocuments: [source] });
    const finalDocument = markDocumentAsFinal(draft, { explicit: true });
    const reference = createReferenceDocument({
      id: 'REFERENCE_TEST_002',
      content: 'Referencia estructural de apoyo.',
    });

    for (const document of [source, draft, finalDocument, reference]) {
      expect(lifecycle.readDocumentEntityKind(document)).not.toBe('TEMPLATE');
      expect(() => lifecycle.markTemplateEntity(document, 'user')).toThrow();
    }
  });

  it('prepara una plantilla explícita parametrizada sin conservar valores del asunto anterior', () => {
    const prepareExplicitTemplate = (context as unknown as Record<string, unknown>)
      .prepareExplicitTemplate as PrepareTemplateFactory | undefined;
    expect(typeof prepareExplicitTemplate).toBe('function');
    if (typeof prepareExplicitTemplate !== 'function') return;

    const template = prepareExplicitTemplate(makeSource(), {
      title: 'Plantilla reutilizable de prueba',
      creationIntent: 'EXPLICIT_TEMPLATE',
    });
    const serializedTemplate = JSON.stringify(template);

    expect(lifecycle.readDocumentEntityKind(template)).toBe('TEMPLATE');
    expect(template.content).toContain('{{expediente}}');
    expect(template.content).not.toContain(EXPEDIENTE_ID);
    expect(template.content).not.toContain(OLD_PARTY);
    expect(serializedTemplate).not.toContain(SOURCE_ID);
    expect(serializedTemplate).not.toContain(EXPEDIENTE_ID);
    expect(serializedTemplate).not.toContain(FILE_NAME);
    expect(template.structureJson.sourceMetadata.originalDataRemoved).toBe(true);
  });

  it('marca como DRAFT el resultado generado, conserva la fuente y preserva edición manual', async () => {
    const source = makeSource();
    const generated = await runGenerationPipeline({
      sourceDocuments: [source],
      documentTypeLabel: 'Promoción de prueba',
      matter: 'Materia de prueba',
      userInstruction: 'Preparar un documento jurídico de prueba.',
      generateSection: async ({ section }) => `Contenido generado para ${section.title}.`,
    });

    expect(lifecycle.readDocumentEntityKind(generated)).toBe('DRAFT');
    expect(lifecycle.readDocumentEntityKind(generated.sourceDocuments[0])).toBe('SOURCE_DOCUMENT');

    const editable = generated.sections.find((section) => section.content.length > 0);
    expect(editable).toBeDefined();
    if (!editable) return;

    editable.isManuallyEdited = true;
    editable.content[0].isManuallyEdited = true;
    editable.content[0].text = 'Edición manual T5 que debe conservarse.';
    const reopened = JSON.parse(JSON.stringify(generated));

    const regenerated = await runGenerationPipeline({
      existingDocument: reopened,
      sourceDocuments: [source],
      targetSection: editable.id,
      userInstruction: 'Continuar documento de prueba.',
      generateSection: async () => 'Texto automático que no debe sustituir la edición.',
    });

    expect(regenerated.sections.find((section) => section.id === editable.id)?.content[0].text)
      .toBe('Edición manual T5 que debe conservarse.');
    expect(lifecycle.readDocumentEntityKind(regenerated)).toBe('DRAFT');
  });

  it('marca la extracción recibida como SOURCE_DOCUMENT sin convertir su resultado en plantilla', async () => {
    const result = await extractDocument({
      buffer: Buffer.from('contenido de prueba no estructurado'),
      fileName: FILE_NAME,
      mimeType: 'application/pdf',
    });

    expect(lifecycle.readDocumentEntityKind(result)).toBe('SOURCE_DOCUMENT');
    expect(lifecycle.readDocumentEntityKind(result)).not.toBe('TEMPLATE');
  });
});
