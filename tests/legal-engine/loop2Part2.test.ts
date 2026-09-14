import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractDocument } from '@/lib/pdf/documentExtractor';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { buildCaseContext } from '@/lib/legal-engine/caseContext';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { extractPlaceholders } from '@/lib/workspace/legalEditContract';
import { sanitizeLegalDocument } from '@/lib/legal-engine/legalDocumentSanitizer';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import { markDocumentAsFinal } from '@/lib/legal-engine/documentLifecycle';
import { resolveDocumentOutputFilename } from '@/lib/legal-engine/outputFilename';

const REAL_PUBLIC_PDF = path.resolve(
  process.cwd(),
  'data/uploads/templates/1787377598439-0129000036717288006AST.PDF',
);

function documentWithText(text: string) {
  return createEmptyDocument({
    id: 'loop2-part2-doc',
    title: 'Escrito de prueba de calidad',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito Libre',
    sections: [
      createDocumentNode({
        id: 'body',
        type: 'argument',
        title: 'ARGUMENTOS',
        content: [{ id: 'body-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text }],
      }),
      createDocumentNode({
        id: 'petition',
        type: 'petition',
        title: 'PUNTOS PETITORIOS',
        content: [{ id: 'petition-block', layer: 'GENERATED_ARGUMENT', trustLevel: 'VERIFIED', text: 'PRIMERO. Tener por presentado el escrito.' }],
      }),
    ],
  });
}

describe('LOOP 2 PARTE 2 — extracción, contexto y salida segura', () => {
  it('modela el promovente anonimizado del PDF real sin convertirlo en un faltante ordinario', async () => {
    const extraction = await extractDocument({
      buffer: fs.readFileSync(REAL_PUBLIC_PDF),
      fileName: '0129000036717288006AST(1).PDF',
      mimeType: 'application/pdf',
    });
    const source = createSourceDocument({
      id: 'real-public-source',
      filename: extraction.fileName,
      type: extraction.mimeType,
      pages: extraction.pages,
      sourceValidated: extraction.sourceValidated,
      fileSizeBytes: extraction.fileSizeBytes,
    });
    const analysis = reconstructCaseAnalysis([source], 'Analizar el expediente');
    const context = buildCaseContext([source], analysis);

    expect(extraction.sourceValidated).toBe(true);
    expect(analysis.anonymizedData).toContain('Nombre del promovente');
    expect(analysis.missingData).not.toContain('Nombre de la parte quejosa / promovente');
    expect(context.fields.promovente).toMatchObject({
      status: 'ANONYMIZED',
      label: 'Nombre del promovente',
    });
    expect(context.anonymizedFields).toContain('Nombre del promovente');
    expect(context.missingFields).not.toContain('Nombre del promovente');
  }, 60000);

  it('detecta y canoniza el marcador compacto antes de que llegue al renderer o al editor', () => {
    const doc = documentWithText('Comparece [DATOPENDIENTE:Nombredelpromovente] y formula argumentos jurídicos.');

    expect(extractPlaceholders(doc)).toContain('[DATO PENDIENTE: Nombre del promovente]');
    const { document: sanitized, report } = sanitizeLegalDocument(doc);
    const output = sanitized.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');

    expect(output).toContain('[DATO PENDIENTE: Nombre del promovente]');
    expect(report.placeholdersFound).toContain('[DATO PENDIENTE: Nombre del promovente]');
  });

  it('hace que missingFields y los marcadores impidan considerar el documento listo para FINAL', () => {
    const doc = documentWithText('La parte comparece y sostiene su pretensión con base en las constancias autorizadas.');
    doc.missingFields = ['Autoridad responsable'];
    const quality = runQualityGateCheck(doc);

    expect(quality.metrics.pendingFieldsCount).toBeGreaterThan(0);
    expect(quality.canMarkAsFinal).toBe(false);
    expect(() => markDocumentAsFinal(doc, { explicit: true })).toThrow(/calidad|pendiente|final/i);
  });

  it('bloquea un marcador pendiente aunque esté escrito en su variante compacta', () => {
    const doc = documentWithText('Texto de salida suficientemente desarrollado para una revisión jurídica completa. [DATOPENDIENTE:Nombredelpromovente]');
    const quality = runQualityGateCheck(doc);

    expect(quality.metrics.pendingFieldsCount).toBeGreaterThan(0);
    expect(quality.canMarkAsFinal).toBe(false);
  });

  it('propaga CaseContext y missingFields hasta el documento generado sin sustituir el dato anonimizado', async () => {
    const source = createSourceDocument({
      id: 'anon-source',
      filename: 'version-publica.pdf',
      sourceValidated: true,
      pages: [{
        page: 1,
        text: 'AMPARO DIRECTO 7/2026\nQUEJOSO:\n***** ******* *****\nAUTORIDAD RESPONSABLE: TRIBUNAL DE PRUEBA',
        chars: 110,
      }],
    });
    const generated = await runGenerationPipeline({
      userInstruction: 'Redactar un escrito de análisis del expediente',
      sourceDocuments: [source],
      allowUnvalidatedSource: true,
    });
    const text = generated.sections.flatMap((section) => section.content.map((block) => block.text)).join('\n');

    expect(generated.caseContext?.fields.promovente.status).toBe('ANONYMIZED');
    expect(generated.missingFields).not.toContain('Nombre del promovente');
    expect(generated.anonymizedFields).toContain('Nombre del promovente');
    expect(text).not.toContain('[DATOPENDIENTE:Nombredelpromovente]');
  }, 60000);

  it('conserva una sección vacía para que la validación la reporte como incompleta', () => {
    const doc = documentWithText('La salida contiene desarrollo jurídico suficiente para revisar la sección y sus requisitos formales.');
    doc.sections.push(createDocumentNode({
      id: 'empty-required-section',
      type: 'evidence',
      title: 'PRUEBAS',
      content: [],
    }));

    const { document: sanitized } = sanitizeLegalDocument(doc);
    const quality = runQualityGateCheck(sanitized);

    expect(sanitized.sections.some((section) => section.id === 'empty-required-section')).toBe(true);
    expect(quality.metrics.emptySectionsCount).toBeGreaterThan(0);
    expect(quality.canMarkAsFinal).toBe(false);
  });

  it('genera un nombre de archivo seguro desde outputFilename sin heredar la extensión de la fuente', () => {
    const doc = createEmptyDocument({
      title: 'Documento fuente.pdf',
      generationMetadata: {
        pipelineState: createEmptyDocument().generationMetadata.pipelineState,
        routing: {
          sourceDocumentType: 'SENTENCIA_O_RESOLUCION',
          resolvedStrategy: 'escrito_libre',
          resolvedTemplate: 'escrito_libre',
          templateSource: 'SAFE_FALLBACK',
          fallbackUsed: true,
          outputFilename: 'Contestación: caso/privado.docx',
        },
      },
    });

    const filename = resolveDocumentOutputFilename(doc, 'pdf');
    expect(filename).toMatch(/\.pdf$/);
    expect(filename).not.toMatch(/[<>:"/\\|?*]/);
    expect(filename).not.toContain('fuente');
  });
});
