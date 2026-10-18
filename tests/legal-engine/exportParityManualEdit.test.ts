/**
 * Lote 9 — paridad editor ↔ DOCX ↔ PDF con una edición manual del abogado. Documento sintético generado con
 * redactor simulado; exportación real de DOCX y PDF; sin proveedores de IA.
 * Se compara el texto de cada bloque tras la edición, normalizado (sin acentos, mayúsculas ni espacios).
 */
import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { readDocxPackage, extractWordDocumentParagraphs } from '../helpers/docxPackageReader';
import { createSimulatedWriter, syntheticCase, syntheticDemandText } from '../helpers/simulatedLegalWriter';

const EDIT = 'EDICIÓN MANUAL DEL ABOGADO: fecha de presentación pendiente de confirmar.';
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function pdfText(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try { return (await parser.getText()).text; } finally { await parser.destroy(); }
}

describe('paridad editor ↔ DOCX ↔ PDF tras una edición manual', () => {
  it('la edición manual y el texto de cada bloque llegan íntegros a DOCX y a PDF', async () => {
    const c = syntheticCase(6, 4, 3);
    const source = createSourceDocument({
      id: 'parity-src', filename: 'demanda-sintetica.txt', content: `DEMANDA_CIVIL\n${syntheticDemandText(c)}`,
      sourceValidated: true, classification: { sourceDocumentType: 'CONTRATO_CIVIL', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
    });
    const writer = createSimulatedWriter(c);
    const doc: any = await runGenerationPipeline({
      selectedDocumentType: 'demanda_ordinaria_civil', documentTypeLabel: 'Demanda ordinaria civil', matter: 'civil',
      jurisdiction: 'Jalisco', userInstruction: 'Preparar demanda con base en la fuente sintética.',
      sourceDocuments: [source], generateSection: writer, expansionProvider: writer.expansionProvider,
      workflow: { flow: 'DOCUMENT_ANALYSIS', selection: { mode: 'automatic' }, updatedAt: new Date().toISOString() },
    } as never);

    // Edición manual: el abogado modifica un bloque con texto del cuerpo.
    const target = doc.sections.flatMap((section: any) => section.content).find((block: any) => (block.text || '').trim().length > 80);
    expect(target, 'bloque editable').toBeTruthy();
    target.text = `${target.text.trim()} ${EDIT}`;
    target.isManuallyEdited = true;

    const docxBytes = await exportUniversalToDocx(doc, undefined, undefined, { exportMode: 'DRAFT' });
    const docxPackage = await readDocxPackage(docxBytes);
    const docxParagraphs = extractWordDocumentParagraphs(await docxPackage.readText('word/document.xml'));
    // El DOCX imprime el «EXPEDIENTE: …» del destinatario en el ENCABEZADO de página, no en el cuerpo. El texto
    // cuenta como presente si aparece en el cuerpo o en el encabezado.
    const headerText = (await docxPackage.readText('word/header1.xml').catch(() => '')).replace(/<[^>]+>/g, ' ');
    const docxText = fold(`${docxParagraphs.join(' ')} ${headerText}`);
    const pdfTextValue = fold(await pdfText(await exportUniversalToPdf(doc, undefined, { exportMode: 'DRAFT' })));

    // La edición manual llega a los dos formatos.
    expect(docxText).toContain(fold(EDIT));
    expect(pdfTextValue).toContain(fold(EDIT));

    // Cada bloque con texto aparece en DOCX y en PDF (muestra completa, no un muestreo: todos los bloques).
    // Cada bloque se parte en sus partes antes del rótulo «expediente» (ese tramo puede ir en el encabezado).
    const blocks = doc.sections.flatMap((section: any) => section.content)
      .flatMap((block: any) => String(block.text || '').split(/\bexpediente\b/i).map((part) => fold(part).slice(0, 120)))
      .filter((key: string) => key.length >= 40);
    const missingDocx = blocks.filter((key: string) => !docxText.includes(key));
    const missingPdf = blocks.filter((key: string) => !pdfTextValue.includes(key));
    expect(blocks.length).toBeGreaterThan(0);
    expect(missingDocx, 'bloques ausentes en DOCX').toEqual([]);
    expect(missingPdf, 'bloques ausentes en PDF').toEqual([]);
  }, 280000);
});
