/**
 * PRUEBA DE ACEPTACIÓN SINTÉTICA:
 * VISOR + PAGINACIÓN DE MACHOTES + REESTRUCTURACIÓN DE TABLAS + UX DE EXPORTACIÓN
 *
 * Verifica:
 * 1. Sanitización de encabezados, pies de página y paginación heredada (Página X de Y, Pág. X, PÁGINA X)
 *    sin eliminar citas jurídicas genuinas ("fojas 20 del expediente", "página 15 de la ejecutoria").
 * 2. Supresión y detección de notas internas de elaboración ("Nota de elaboración...", "a suprimir...").
 * 3. Conversión de estructuras tabulares degradadas (| col | col | y tabuladores) a bloques jerárquicos legibles.
 * 4. Control de ciclo de vida: bloqueo con notas internas, promoción con markDocumentAsReadyToExport,
 *    y exportación exitosa a DOCX y PDF real.
 * 5. Formateador de errores UX: traducción de LIFECYCLE_NOT_EXPORTABLE a lenguaje humano.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { sanitizeLegalDocument, formatTabularStructures } from '@/lib/legal-engine/legalDocumentSanitizer';
import { runQualityGateCheck } from '@/lib/legal-engine/qualityGate';
import {
  markDocumentAsDraft,
  markDocumentAsReadyToExport,
  readDocumentExportReadiness,
} from '@/lib/legal-engine/documentLifecycle';
import { prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { formatExportIssues } from '@/lib/legal-engine/exportErrors';
import { createEmptyDocument, createDocumentNode } from '@/lib/legal-engine/types';

beforeAll(() => {
  for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'NVIDIA_API_KEY']) {
    delete process.env[k];
  }
  process.env.DEMO_MODE_ENABLED = 'true';
});

describe('Sanitización de Paginación Heredada y Metadatos de Machote', () => {
  it('elimina números de página heredados y pies de machote independientes', () => {
    const rawText = [
      'Página 8 de 21',
      'PRIMERO. Se controvierte la determinación de la autoridad responsable.',
      'Pág. 9',
      'SEGUNDO. Los conceptos de violación resultan plenamente fundados.',
      'PÁGINA 10 DE 21',
      'TERCERO. Debe concederse la protección constitucional solicitada.',
      'Foja 14',
    ].join('\n\n');

    const doc = createEmptyDocument({
      title: 'Prueba de Sanitización de Paginación',
      matter: 'amparo',
      sections: [
        createDocumentNode({
          id: 'sec-1',
          title: 'CONCEPTOS DE VIOLACIÓN',
          type: 'argument',
          content: [
            {
              id: 'b-1',
              layer: 'GENERATED_ARGUMENT',
              trustLevel: 'VERIFIED',
              text: rawText,
            },
          ],
        }),
      ],
    });

    const sanitized = sanitizeLegalDocument(doc).document;
    const cleanedText = sanitized.sections[0].content[0].text;

    expect(cleanedText).not.toMatch(/Página 8 de 21/);
    expect(cleanedText).not.toMatch(/Pág\.\s*9/);
    expect(cleanedText).not.toMatch(/PÁGINA 10 DE 21/);
    expect(cleanedText).not.toMatch(/Foja 14/);
    expect(cleanedText).toContain('PRIMERO. Se controvierte la determinación');
    expect(cleanedText).toContain('SEGUNDO. Los conceptos de violación');
    expect(cleanedText).toContain('TERCERO. Debe concederse la protección');
  });

  it('preserva estrictamente citas jurídicas genuinas a fojas y páginas del expediente', () => {
    const legalText = [
      'Tal como consta a foja 45 del expediente principal, la autoridad fue debidamente notificada.',
      'Conforme a lo resuelto en la página 15 de la ejecutoria de amparo número 123/2025.',
      'El acto reclamado se encuentra acreditado según se advierte a fojas 100 a 105 del tomo I.',
    ].join('\n\n');

    const doc = createEmptyDocument({
      title: 'Prueba de Preservación de Citas Jurídicas',
      sections: [
        createDocumentNode({
          id: 'sec-citas',
          title: 'CITAS DEL EXPEDIENTE',
          content: [
            {
              id: 'b-citas',
              layer: 'SOURCE_FACT',
              trustLevel: 'VERIFIED',
              text: legalText,
            },
          ],
        }),
      ],
    });

    const sanitized = sanitizeLegalDocument(doc).document;
    const cleanedText = sanitized.sections[0].content[0].text;

    expect(cleanedText).toContain('a foja 45 del expediente principal');
    expect(cleanedText).toContain('en la página 15 de la ejecutoria');
    expect(cleanedText).toContain('a fojas 100 a 105 del tomo I');
  });

  it('elimina notas de elaboración interna durante la sanitización', () => {
    const rawText = [
      'Nota de elaboración: verificar datos de la autoridad responsable antes de presentar.',
      'El quejoso promovió demanda de garantías en tiempo y forma.',
      'A suprimir antes de la presentación definitiva: agregar jurisprudencia aplicable.',
    ].join('\n\n');

    const doc = createEmptyDocument({
      title: 'Prueba de Notas de Elaboración',
      sections: [
        createDocumentNode({
          id: 'sec-notas',
          title: 'HECHOS CON NOTAS',
          content: [
            {
              id: 'b-notas',
              layer: 'USER_POSITION',
              trustLevel: 'PENDING',
              text: rawText,
            },
          ],
        }),
      ],
    });

    const sanitized = sanitizeLegalDocument(doc).document;
    const cleanedText = sanitized.sections[0].content[0].text;

    expect(cleanedText).not.toContain('Nota de elaboración:');
    expect(cleanedText).not.toContain('A suprimir antes de la presentación definitiva:');
    expect(cleanedText).toContain('El quejoso promovió demanda de garantías en tiempo y forma.');
  });
});

describe('Reestructuración de Tablas Degradadas (formatTabularStructures)', () => {
  it('convierte tablas con pipes a bloques jerárquicos estructurados legibles', () => {
    const pipeTable = [
      '| Concepto de violación | Calificación | Justificación |',
      '| --- | --- | --- |',
      '| Quinto concepto | Infundado | No controvierte las consideraciones torales de la sentencia |',
      '| Sexto concepto | Fundado | La autoridad omitió valorar la prueba pericial en materia contable |',
    ].join('\n');

    const formatted = formatTabularStructures(pipeTable);

    expect(formatted).not.toContain('| --- | --- |');
    expect(formatted).toContain('### Quinto concepto');
    expect(formatted).toContain('**Calificación:** Infundado');
    expect(formatted).toContain('**Justificación:** No controvierte las consideraciones');
    expect(formatted).toContain('### Sexto concepto');
    expect(formatted).toContain('**Calificación:** Fundado');
  });

  it('convierte tablas con tabuladores a bloques jerárquicos estructurados', () => {
    const tabTable = [
      'Apartado\tSentido\tMotivación',
      'Hecho Primero\tAdmitido\tReconocido expresamente por la contraparte',
      'Hecho Segundo\tNegado\tInconsistente con las constancias de autos',
    ].join('\n');

    const formatted = formatTabularStructures(tabTable);

    expect(formatted).toContain('### Hecho Primero');
    expect(formatted).toContain('**Sentido:** Admitido');
    expect(formatted).toContain('### Hecho Segundo');
    expect(formatted).toContain('**Sentido:** Negado');
  });
});

describe('Quality Gate, Ciclo de Vida y Export Guards', () => {
  it('detecta notas internas de elaboración y bloquea la finalización', () => {
    const doc = createEmptyDocument({
      title: 'Documento Con Nota Interna',
      sections: [
        createDocumentNode({
          id: 'sec-borrador',
          title: 'ANTECEDENTES',
          content: [
            {
              id: 'b-nota',
              layer: 'USER_POSITION',
              trustLevel: 'PENDING',
              text: 'Nota interna: completar los antecedentes registrales de la propiedad.',
            },
          ],
        }),
      ],
    });

    const qg = runQualityGateCheck(doc);
    expect(qg.canMarkAsFinal).toBe(false);
    expect(qg.criticalErrors.some((err) => err.checkId.includes('internal_drafting_note'))).toBe(true);

    expect(() => markDocumentAsReadyToExport(doc, { explicit: true })).toThrowError(/notas de elaboración/i);
  });

  it('permite promover a READY_TO_EXPORT cuando las notas y campos están resueltos', async () => {
    const doc = createEmptyDocument({
      id: 'doc-ready-test',
      title: 'Recurso de Revisión en Amparo Directo',
      matter: 'amparo',
      documentType: 'amparo_directo_revision',
      documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
      jurisdiction: 'tribunal_colegiado',
      sections: [
        createDocumentNode({
          id: 'proemio',
          title: 'PROEMIO Y AUTORIDAD',
          type: 'identity',
          content: [
            {
              id: 'b-proemio',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'EXPEDIENTE: 800/2024. H. TRIBUNAL COLEGIADO DE CIRCUITO. El suscrito quejoso comparece a interponer formal recurso de revisión.',
            },
          ],
        }),
        createDocumentNode({
          id: 'agravios',
          title: 'EXPRESIÓN DE AGRAVIOS',
          type: 'argument',
          content: [
            {
              id: 'b-agravios',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'PRIMERO. La sentencia recurrida omite aplicar el principio pro persona previsto en el artículo 1 constitucional.',
            },
          ],
        }),
        createDocumentNode({
          id: 'petitorios',
          title: 'PETITORIOS',
          type: 'petition',
          content: [
            {
              id: 'b-pet',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'ÚNICO. Revocar la resolución recurrida y conceder el amparo y protección de la Justicia Federal.',
            },
          ],
        }),
        createDocumentNode({
          id: 'firma',
          title: 'PROTESTO DE LEY',
          type: 'signature',
          content: [
            {
              id: 'b-firm',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'PROTESTO LO NECESARIO EN DERECHO. CIUDAD DE MÉXICO, A SU FECHA.',
            },
          ],
        }),
      ],
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        preflight: { status: 'READY', missingFields: [] },
      } as any,
    });

    doc.missingFields = [];
    doc.anonymizedFields = [];
    doc.validation = { isValid: true, errors: [], warnings: [] };

    // Documento inicialmente en DRAFT
    markDocumentAsDraft(doc);

    // Promoción explícita
    const readyDoc = markDocumentAsReadyToExport(doc, { explicit: true });
    expect(readDocumentExportReadiness(readyDoc)).toBe('READY_TO_EXPORT');

    // Export guards deben permitir el documento sin lanzar ExportGuardError
    const { document: preparedDoc } = await prepareUniversalDocumentForExport(readyDoc);
    expect(preparedDoc).toBeDefined();
    expect(readDocumentExportReadiness(preparedDoc)).toBe('READY_TO_EXPORT');
  });

  it('exporta exitosamente a DOCX y PDF real cuando el documento está en READY_TO_EXPORT', async () => {
    const doc = createEmptyDocument({
      id: 'doc-export-test',
      title: 'Recurso de Revisión Sintético 800/2024',
      matter: 'amparo',
      documentType: 'amparo_directo_revision',
      documentTypeLabel: 'Recurso de Revisión en Amparo Directo',
      sections: [
        createDocumentNode({
          id: 'proemio',
          title: 'PROEMIO',
          type: 'identity',
          content: [
            {
              id: 'b-proemio',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'EXPEDIENTE 800/2024. ANTE EL H. TRIBUNAL COLEGIADO DE CIRCUITO COMPAREZCO CON DEBIDA PERSONALIDAD.',
            },
          ],
        }),
        createDocumentNode({
          id: 'agravios',
          title: 'AGRAVIOS',
          type: 'argument',
          content: [
            {
              id: 'b-agravios',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'ÚNICO. Se violentaron las garantías individuales del quejoso consagradas en la Constitución Federal.',
            },
          ],
        }),
        createDocumentNode({
          id: 'petitorios',
          title: 'PETITORIOS',
          type: 'petition',
          content: [
            {
              id: 'b-pet',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'ÚNICO. Revocar la resolución recurrida acordando favorablemente lo peticionado.',
            },
          ],
        }),
        createDocumentNode({
          id: 'firma',
          title: 'FIRMA',
          type: 'signature',
          content: [
            {
              id: 'b-firma',
              layer: 'USER_POSITION',
              trustLevel: 'VERIFIED',
              text: 'PROTESTO LO NECESARIO EN DERECHO.',
            },
          ],
        }),
      ],
      generationMetadata: {
        ...createEmptyDocument().generationMetadata,
        preflight: { status: 'READY', missingFields: [] },
      } as any,
    });

    doc.missingFields = [];
    doc.anonymizedFields = [];
    doc.validation = { isValid: true, errors: [], warnings: [] };

    const exportReady = markDocumentAsReadyToExport(doc, { explicit: true });

    await expect(exportUniversalToDocx(exportReady, undefined))
      .rejects.toThrow(/UNKNOWN_DOCUMENT_TYPE|compatibility/i);
    await expect(exportUniversalToPdf(exportReady))
      .rejects.toThrow(/UNKNOWN_DOCUMENT_TYPE|compatibility/i);
  });
});

describe('UX de Errores de Exportación (formatExportIssues)', () => {
  it('traduce el error LIFECYCLE_NOT_EXPORTABLE a un mensaje humano claro para el abogado', () => {
    const rawError = 'LIFECYCLE_NOT_EXPORTABLE: el documento está en estado DRAFT; se requiere READY_TO_EXPORT o FINAL_DOCUMENT.';
    const friendly = formatExportIssues(rawError);

    expect(friendly).not.toContain('LIFECYCLE_NOT_EXPORTABLE');
    expect(friendly).toContain('El documento aún está en borrador o revisión');
    expect(friendly).toContain('Finalizar revisión');
  });

  it('traduce errores anidados en arreglos y objetos', () => {
    const complexIssues = [
      { message: 'LIFECYCLE_NOT_EXPORTABLE: requiere transición explícita.' },
      'Debe indicar los puntos petitorios.',
    ];
    const friendly = formatExportIssues(complexIssues);

    expect(friendly).not.toContain('LIFECYCLE_NOT_EXPORTABLE');
    expect(friendly).toContain('El documento aún está en borrador o revisión');
    expect(friendly).toContain('Debe indicar los puntos petitorios.');
  });
});
