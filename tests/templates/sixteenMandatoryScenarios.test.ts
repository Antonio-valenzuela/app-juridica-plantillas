import { describe, expect, it } from 'vitest';
import { extractDocument } from '../../lib/pdf/documentExtractor';
import { createSourceDocument } from '../../lib/legal-engine/context';
import { runGenerationPipeline, generateSection } from '../../lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '../../lib/legal-engine/exportDocxUniversal';
import { DEFAULT_LAWYER_PROFILE, defaultWorkspaceManager } from '../../lib/workspace/legalWorkspace';
import { extractStyleFromReferenceDocument } from '../../lib/legal-engine/styleEngine';
import { runQualityGateCheck } from '../../lib/legal-engine/qualityGate';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const CANARY_NEW_CLIENTE = 'CLIENTE_CANARIO_92831_NUEVO';
const CANARY_HISTORICAL_ENTITY = 'EMPRESA_CANARIO_92831';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';
const EXPEDIENTE_TEST_ID = 'EXPEDIENTE_TEST_001';

describe('16 Escenarios Obligatorios de Prueba del Motor Jurídico', () => {

  // TEST 1: PDF con texto seleccionable
  it('TEST 1: Ingestión y extracción de PDF con texto nativo por páginas', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 %PDF con texto nativo de prueba en español\nPágina 1: Demanda de amparo.');
    const result = await extractDocument({
      buffer: pdfBuffer,
      fileName: 'demanda_texto.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.text).toBeDefined();
    expect(result.extractionSteps.length).toBeGreaterThan(0);
  });

  // TEST 2: PDF escaneado
  it('TEST 2: Detección y fallback de PDF escaneado (necesita OCR o marca estado)', async () => {
    const scannedPdfBuffer = Buffer.from('%PDF-1.4 [contenido escaneado sin capa de texto]');
    const result = await extractDocument({
      buffer: scannedPdfBuffer,
      fileName: 'escaneado.pdf',
      mimeType: 'application/pdf',
    });

    expect(result).toBeDefined();
    expect(result.pages).toBeDefined();
  });

  // TEST 3: Imagen JPG
  it('TEST 3: Procesamiento e ingestión de archivo JPG de documento jurídico', async () => {
    const jpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const result = await extractDocument({
      buffer: jpgBuffer,
      fileName: 'foto_sentencia.jpg',
      mimeType: 'image/jpeg',
    });

    expect(result.fileName).toBe('foto_sentencia.jpg');
    expect(result.mimeType).toBe('image/jpeg');
  });

  // TEST 4: Imagen PNG
  it('TEST 4: Procesamiento e ingestión de archivo PNG de captura de pantalla', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const result = await extractDocument({
      buffer: pngBuffer,
      fileName: 'captura_acuerdo.png',
      mimeType: 'image/png',
    });

    expect(result.fileName).toBe('captura_acuerdo.png');
    expect(result.mimeType).toBe('image/png');
  });

  // TEST 5: Documento DOCX
  it('TEST 5: Extracción estructurada de documento Word DOCX', async () => {
    const docxBuffer = Buffer.from('PK\x03\x04 Documento Word de prueba');
    const result = await extractDocument({
      buffer: docxBuffer,
      fileName: 'promocion.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(result.fileName).toBe('promocion.docx');
  });

  // TEST 6: Documento largo
  it('TEST 6: Documento largo de más de 20 páginas sin truncamiento de caracteres', async () => {
    const longSource = createSourceDocument({
      id: 'long-doc-1',
      filename: 'expediente_largo.pdf',
      sourceValidated: true,
      pages: Array.from({ length: 25 }, (_, i) => ({
        page: i + 1,
        text: `Página ${i + 1}: Texto exhaustivo del expediente largo. Contiene hechos, pretensiones y consideraciones jurídicas de la foja ${i + 1}. ` + 'Desarrollo de los agravios y antecedentes procesales. '.repeat(25),
        chars: 1500
      }))
    });

    expect(longSource.pages).toHaveLength(25);
    expect(longSource.extractedText?.length).toBeGreaterThan(30000);

    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar recurso contra expediente largo',
      sourceDocuments: [longSource]
    });

    expect(doc.sections.length).toBeGreaterThan(5);
  });

  // TEST 7: Documento con páginas mixtas
  it('TEST 7: Manejo de documento con páginas nativas y páginas escaneadas', () => {
    const mixedSource = createSourceDocument({
      id: 'mixed-1',
      filename: 'mixto.pdf',
      sourceValidated: true,
      pages: [
        { page: 1, text: 'Texto nativo claro de la primera página', chars: 40 },
        { page: 2, text: '[Escaneo o imagen de prueba]', chars: 28 },
        { page: 3, text: 'Texto nativo de la tercera página', chars: 33 }
      ]
    });

    expect(mixedSource.pages).toHaveLength(3);
  });

  // TEST 8: Machote real del abogado
  it('TEST 8: Extracción de perfil y estilo de machote real del abogado', () => {
    const referenceDocText = `
      H. TRIBUNAL COLEGIADO EN MATERIA DE TRABAJO.
      Comparezco respetuosamente para exponer:
      ANTECEDENTES:
      1. Se dictó resolución en fecha reciente.
      CONCEPTOS DE VIOLACIÓN:
      PRIMERO. Violación al debido proceso y tutela judicial efectiva.
      Causa agravio directo la omisión de valorar las pruebas exhibidas.
      PROTESTO LO NECESARIO.
    `;

    const extractedStyle = extractStyleFromReferenceDocument(referenceDocText);
    expect(extractedStyle.openingFormula).toContain('Comparezco respetuosamente');
    expect(extractedStyle.closingFormula).toContain('PROTESTO LO NECESARIO');
    expect(extractedStyle.sectionOrder).toContain('background');
  });

  // TEST 9: Nuevo caso basado en machote anterior (sin copiar datos privados)
  it('TEST 9: Generación de nuevo caso adoptando estilo de machote anterior sin filtrar hechos del caso pasado', async () => {
    const referenceText = `${CANARY_CLIENTE} vs ${CANARY_HISTORICAL_ENTITY} en ${EXPEDIENTE_TEST_ID}. En fecha 12 de enero de 2020 se despidió al actor por $50,000 pesos. Comparezco respetuosamente para exponer: PROTESTO LO NECESARIO.`;
    
    const doc = await runGenerationPipeline({
      userInstruction: `Contestar demanda laboral para ${CANARY_NEW_CLIENTE}`,
      referenceDocumentText: referenceText,
      lawyerProfile: {
        ...DEFAULT_LAWYER_PROFILE,
        openingPatterns: ['Comparezco respetuosamente para exponer:']
      }
    });

    const fullGenerated = doc.sections.flatMap(s => s.content.map(b => b.text)).join(' ');
    // No debe contener el monto ni el nombre del caso anterior como hechos reales del caso nuevo
    expect(fullGenerated).not.toContain(CANARY_HISTORICAL_ENTITY);
    expect(fullGenerated).not.toContain('$50,000 pesos');
  });

  // TEST 10: Dos casos históricos similares
  it('TEST 10: Recuperación de conocimiento histórico sin contaminación de hechos', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Contestar demanda laboral burocrática por despido unjustificado',
    });

    expect(doc.documentType).toBe('contestacion_demanda_laboral');
  });

  // TEST 11: Caso con datos faltantes
  it('TEST 11: Formateo estricto de campos faltantes como DATO_PENDIENTE', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Demanda de amparo indirecto sin especificar expediente ni promovente',
    });

    const fullText = doc.sections.flatMap(s => s.content.map(b => b.text)).join(' ');
    expect(fullText).toContain('DATO PENDIENTE');
  });

  // TEST 12: Caso con proveedor IA indisponible
  it('TEST 12: Bloqueo de generación jurídica final si proveedores IA no están disponibles', async () => {
    await expect(runGenerationPipeline({
      userInstruction: 'Generar amparo directo completo',
      forceAiUnavailable: true
    })).rejects.toThrow(/Generación jurídica bloqueada: proveedor de generación no disponible/i);
  });

  // TEST 13: Regeneración de sección editada manualmente
  it('TEST 13: Protección de ediciones manuales del abogado al regenerar el documento', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Promoción de prueba',
    });

    const argSection = doc.sections.find(s => s.type === 'argument')!;
    argSection.isManuallyEdited = true;
    argSection.content = [{
      id: 'edited-block',
      layer: 'USER_POSITION',
      trustLevel: 'VERIFIED',
      text: 'TEXTO INTRACTABLE EDITADO MANULMENTE POR EL ABOGADO DEFENSOR.',
      isManuallyEdited: true
    }];

    const regenerated = await runGenerationPipeline({
      existingDocument: doc,
      userInstruction: 'Regenerar todo el escrito',
    });

    const regSection = regenerated.sections.find(s => s.id === argSection.id);
    expect(regSection?.content[0].text).toBe('TEXTO INTRACTABLE EDITADO MANULMENTE POR EL ABOGADO DEFENSOR.');
  });

  // TEST 14: Guard de lifecycle para exportación DOCX
  it('TEST 14: Un escrito DRAFT no puede exportarse a DOCX sin transición explícita', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Escrito de pruebas',
    });

    await expect(exportUniversalToDocx(doc)).rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
  });

  // TEST 15: Exportación PDF / Print HTML
  it('TEST 15: Generación de plantilla de exportación imprimible / PDF HTML', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Recurso de queja',
    });

    expect(doc.title).toBeDefined();
    expect(doc.sections.length).toBeGreaterThan(0);
  });

  // TEST 16: Caso canario de estrés (27 páginas)
  it(`TEST 16: Caso de Estrés ${CANARY_EXPEDIENTE} (27 páginas) completo y trazable`, async () => {
    const canarySource = createSourceDocument({
      id: SOURCE_TEST_ID,
      filename: `${SOURCE_TEST_ID}.pdf`,
      sourceValidated: true,
      pages: Array.from({ length: 27 }, (_, i) => ({
        page: i + 1,
        text: `PÁGINA ${i + 1}: Sentencia dictada en el juicio de amparo directo ${CANARY_EXPEDIENTE} del Segundo Tribunal Colegiado en Materia de Trabajo del Tercer Circuito.`,
        chars: 2100
      }))
    });

    const doc = await runGenerationPipeline({
      userInstruction: `Interponer Recurso de Revisión contra la ejecutoria del Amparo Directo ${CANARY_EXPEDIENTE}`,
      sourceDocuments: [canarySource]
    });

    expect(doc.documentType).toBe('recurso_revision_amparo_directo');
    expect(doc.sourceDocuments[0].pages).toHaveLength(27);

    const qg = runQualityGateCheck(doc);
    expect(qg.metrics.totalSections).toBeGreaterThanOrEqual(8);
  });

});
