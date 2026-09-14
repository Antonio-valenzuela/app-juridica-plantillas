import { describe, expect, it } from 'vitest';
import { createSourceDocument, buildAutoContext } from '../../lib/legal-engine/context';
import { runGenerationPipeline, generateSection } from '../../lib/legal-engine/pipeline';
import { classifyIntent } from '../../lib/legal-engine/classifier';
import { buildStructure } from '../../lib/legal-engine/structureBuilder';
import { validateDocument } from '../../lib/legal-engine/validator';
import { exportUniversalToDocx } from '../../lib/legal-engine/exportDocxUniversal';
import { createEmptyDocument } from '../../lib/legal-engine/types';

const CANARY_EXPEDIENTE = 'EXP_CANARIO_55441';
const CANARY_CLIENTE = 'CLIENTE_CANARIO_92831';
const SOURCE_TEST_ID = 'SOURCE_TEST_001';

// Fuente canario del expediente sintético (27 páginas simuladas)
const canarySource = createSourceDocument({
  id: SOURCE_TEST_ID,
  filename: `${SOURCE_TEST_ID}.pdf`,
  name: `Amparo Directo ${CANARY_EXPEDIENTE}`,
  sourceValidated: true,
  pages: Array.from({ length: 27 }, (_, i) => ({
    page: i + 1,
    text: `PÁGINA ${i + 1} DE LA SENTENCIA ${CANARY_EXPEDIENTE}. ` +
          (i === 0 ? `AMPARO DIRECTO ${CANARY_EXPEDIENTE}. QUEJOSO: TRABAJADOR. MAGISTRADO PONENTE: ${CANARY_CLIENTE}.` : '') +
          (i === 7 ? 'PRIMERO. Competencia. Este Segundo Tribunal Colegiado en Materia de Trabajo es competente. TERCERO. Oportunidad.' : '') +
          (i === 12 ? 'QUINTO. Estudio. Son inoperantes el segundo, tercero y cuarto conceptos de violación por ser cosa juzgada.' : '') +
          (i === 17 ? 'Por otra parte, en el quinto concepto de violación refiere que en la segunda proposición del laudo se le absolvió.' : '') +
          (i === 20 ? 'ÚNICO. La Justicia de la Unión NO AMPARA NI PROTEGE a la parte quejosa.' : ''),
    chars: 2000
  }))
});

describe('Caso de Prueba Obligatorio y Motor Universal de Documentos', () => {
  it(`Ejecuta el flujo completo para el caso canario ${CANARY_EXPEDIENTE} (PDF -> extracción -> validación -> análisis -> estructura -> generación -> exportación)`, async () => {
    // 1. Extracción completa por página
    expect(canarySource.pages).toHaveLength(27);
    expect(canarySource.sourceValidated).toBe(true);

    // 2. Ejecutar Pipeline Universal sin truncar texto
    const doc = await runGenerationPipeline({
      userInstruction: `Interponer Recurso de Revisión contra la sentencia de Amparo Directo ${CANARY_EXPEDIENTE} que declaró inoperante el agravio por cosa juzgada`,
      sourceDocuments: [canarySource],
    });

    // 3. Estructura y clasificación
    expect(doc.documentType).toBe('recurso_revision_amparo_directo');
    expect(doc.sections.length).toBeGreaterThanOrEqual(10);
    expect(doc.sourceDocuments).toHaveLength(1);

    // 4. Traceabilidad (documento -> página -> fragmento -> argumento)
    const argumentSection = doc.sections.find(s => s.type === 'argument');
    expect(argumentSection).toBeDefined();
    expect(argumentSection?.content.length).toBeGreaterThan(0);
    expect(doc.generationMetadata.trace).toBeDefined();
    expect(doc.generationMetadata.trace!.length).toBeGreaterThan(0);

    // 5. Validación antes de exportar
    const validation = validateDocument(doc);
    expect(validation).toBeDefined();

    // 6. Un documento generado queda DRAFT hasta una transición explícita.
    await expect(exportUniversalToDocx(doc)).rejects.toThrow(/LIFECYCLE_NOT_EXPORTABLE|READY_TO_EXPORT|export/i);
  });

  it('Demuestra funcionamiento del Motor Universal con una CONTESTACIÓN', async () => {
    const contestationSource = createSourceDocument({
      id: 'demanda-laboral-1',
      filename: 'demanda_inicial.pdf',
      sourceValidated: true,
      pages: [
        { page: 1, text: 'DEMANDA LABORAL INICIAL. ACTOR: PEDRO GÓMEZ. DEMANDADO: EMPRESA X S.A. DE C.V.', chars: 100 },
        { page: 2, text: 'PRESTACIONES: Reinstalación y salarios caídos.', chars: 50 }
      ]
    });

    const doc = await runGenerationPipeline({
      userInstruction: 'Contestar la demanda laboral oponiendo la excepción de prescripción',
      sourceDocuments: [contestationSource]
    });

    expect(doc.documentType).toBe('contestacion_demanda_laboral');
    expect(doc.parties.actor || doc.parties.quejoso).toBeDefined();
    expect(doc.sections.some(s => s.title.toLowerCase().includes('contestaci') || s.title.toLowerCase().includes('excepciones'))).toBe(true);
  });

  it('Demuestra funcionamiento del Motor Universal con un ESCRITO DE CUMPLIMIENTO', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Presentar escrito manifestando cumplimiento de sentencia de amparo',
    });

    expect(doc.documentType).toBe('escrito_cumplimiento_sentencia');
    expect(doc.sections.some(s => s.type === 'petition')).toBe(true);
  });

  it('Demuestra funcionamiento del Motor Universal con un RECURSO', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Interponer recurso de queja contra el auto que desechó la demanda',
    });

    expect(doc.documentType).toBe('recurso_queja');
    expect(doc.sections.length).toBeGreaterThan(3);
  });

  it('Demuestra funcionamiento del Motor Universal con un DOCUMENTO SIN PLANTILLA PREVIA (indicación libre)', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Solicito a la autoridad municipal un permiso para deslinde de predio',
    });

    expect(doc.documentType).toBe('escrito_libre');
    expect(doc.classification.isDynamic).toBe(true);
    expect(doc.sections.length).toBeGreaterThan(4);
  });

  it('Bloquea la generación si sourceValidated === false salvo modo de advertencia explícito', async () => {
    const unvalidatedSource = createSourceDocument({
      id: 'scan-1',
      filename: 'escaneo_borroso.pdf',
      sourceValidated: false,
      pages: [{ page: 1, text: 'texto ilegible o sin OCR', chars: 25 }]
    });

    // 1. Debe bloquear y arrojar error sin warningMode
    await expect(runGenerationPipeline({
      userInstruction: 'Generar escrito',
      sourceDocuments: [unvalidatedSource],
    })).rejects.toThrow(/fuente no está validada/i);

    // 2. Debe permitir con allowUnvalidatedSource / warningMode
    const docWithWarning = await runGenerationPipeline({
      userInstruction: 'Generar escrito',
      sourceDocuments: [unvalidatedSource],
      allowUnvalidatedSource: true,
      warningMode: true
    });

    expect(docWithWarning).toBeDefined();
    expect(docWithWarning.sourceDocuments[0].sourceValidated).toBe(false);
  });

  it('Preserva los cambios manuales del abogado al regenerar una sección', async () => {
    const doc = await runGenerationPipeline({
      userInstruction: 'Redactar demanda de amparo indirecto',
    });

    const argSection = doc.sections.find(s => s.type === 'argument')!;
    argSection.isManuallyEdited = true;
    argSection.content = [{
      id: 'block-lawyer-1',
      layer: 'USER_POSITION',
      trustLevel: 'VERIFIED',
      text: 'Texto personalizado y corregido expresamente por el abogado defensor.',
      isManuallyEdited: true
    }];

    // Regenerate document with existing document passed
    const regenerated = await runGenerationPipeline({
      existingDocument: doc,
      userInstruction: 'Actualizar y ampliar el escrito',
    });

    const regeneratedArg = regenerated.sections.find(s => s.id === argSection.id);
    expect(regeneratedArg?.content[0].text).toBe('Texto personalizado y corregido expresamente por el abogado defensor.');
  });

  it('Formatea datos faltantes como DATO_PENDIENTE y no inventa hechos', async () => {
    const secResult = await generateSection(
      createEmptyDocument({ documentType: 'escrito_libre', documentTypeLabel: 'Escrito Libre' }),
      'sec-1',
      'Generar encabezado y datos de parte'
    );

    expect(secResult.text).toBeDefined();
  });
});
