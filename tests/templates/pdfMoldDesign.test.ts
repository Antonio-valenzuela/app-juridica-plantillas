import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { exportUniversalToPdfWithMold } from '@/lib/legal-engine/exportPdfUniversal';
import { preparePdfImage } from '@/lib/legal-engine/pdfImages';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReadyToExport } from '@/lib/legal-engine/documentLifecycle';
import { inspectDocxMold, moldPdfSettings, pdfFontFor } from '@/lib/templates/docxMold';
import { buildSyntheticLawyerTemplate } from '../helpers/syntheticLawyerTemplate';

/** PNG sintético sin CRC real (el lector no lo valida). */
function png(width: number, height: number, colorType: number, rows: number[][], extra: Array<[string, Buffer]> = []): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(body.length, 0);
    header.write(type, 4, 'latin1');
    return Buffer.concat([header, body, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const raw = Buffer.concat(rows.map((row) => Buffer.from([0, ...row])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map(([type, body]) => chunk(type, body)),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function block(id: string, text: string) {
  return { id, layer: 'USER_POSITION' as const, trustLevel: 'VERIFIED' as const, text };
}

function makeDocument() {
  const doc = createEmptyDocument({
    id: 'doc-pdf-mold',
    title: 'Escrito sintético',
    documentType: 'escrito_libre',
    documentTypeLabel: 'Escrito libre',
    sections: [
      createDocumentNode({ id: 'proemio', order: 10, title: 'PROEMIO Y COMPARECENCIA', type: 'identity', content: [block('b1', 'María López comparece en el expediente 995/2099 con la personalidad debidamente acreditada para exponer lo siguiente.')] }),
      createDocumentNode({ id: 'hechos', order: 20, title: 'HECHOS', type: 'facts', content: [block('b2', 'La actora entregó el inmueble arrendado a la demandada sin objeción alguna, según consta en el acta de entrega.')] }),
      createDocumentNode({ id: 'petitorios', order: 30, title: 'PUNTOS PETITORIOS', type: 'petition', content: [block('b4', 'PRIMERO. Tenerme por presentado en tiempo y forma. SEGUNDO. Proveer de conformidad con lo solicitado.')] }),
      createDocumentNode({ id: 'firma', order: 40, title: 'FIRMA', type: 'signature', content: [block('b5', 'PROTESTO LO NECESARIO EN DERECHO. CIUDAD DE MÉXICO A LA FECHA DE SU PRESENTACIÓN.')] }),
    ],
    generationMetadata: { ...createEmptyDocument().generationMetadata, preflight: { status: 'READY', missingFields: [] } } as never,
  });
  doc.intake = { request: 'caso sintético María López 995/2099' } as never;
  doc.missingFields = [];
  doc.anonymizedFields = [];
  doc.validation = { isValid: true, errors: [], warnings: [] };
  (doc as never as { qualityGate: unknown }).qualityGate = { passed: true, canMarkAsFinal: true };
  return markDocumentAsReadyToExport(doc, { explicit: true });
}

describe('lector de imágenes para el PDF', () => {
  it('decodifica PNG gris, RGB, RGBA (con máscara) y paleta', () => {
    const gray = preparePdfImage(png(2, 1, 0, [[10, 200]]), 'image/png');
    expect(gray).toMatchObject({ width: 2, height: 1, colorSpace: 'DeviceGray', filter: 'FlateDecode' });
    expect(gray?.alpha).toBeUndefined();

    const rgb = preparePdfImage(png(1, 1, 2, [[255, 0, 0]]), 'image/png');
    expect(rgb).toMatchObject({ colorSpace: 'DeviceRGB' });

    const rgba = preparePdfImage(png(1, 2, 6, [[255, 0, 0, 128], [0, 0, 255, 255]]), 'image/png');
    expect(rgba?.alpha).toBeInstanceOf(Buffer);

    const indexed = preparePdfImage(png(1, 1, 3, [[0]], [['PLTE', Buffer.from([1, 2, 3])]]), 'image/png');
    expect(indexed).toMatchObject({ colorSpace: 'DeviceRGB' });
  });

  it('JPEG se incrusta tal cual y lo no soportado devuelve null', () => {
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    expect(preparePdfImage(jpeg, 'image/jpeg')).toMatchObject({ width: 1, height: 1, filter: 'DCTDecode' });
    expect(preparePdfImage(Buffer.from('GIF89a'), 'image/png')).toBeNull();
    expect(preparePdfImage(Buffer.from([1, 2, 3, 4]), 'image/jpeg')).toBeNull();
  });
});

describe('tipografía de la plantilla en el PDF', () => {
  it('fuentes estándar exactas y la más cercana para las demás', () => {
    expect(pdfFontFor('Times New Roman')).toEqual({ family: 'serif', exact: true });
    expect(pdfFontFor('Arial')).toEqual({ family: 'sans', exact: true });
    expect(pdfFontFor('Courier New')).toEqual({ family: 'mono', exact: true });
    expect(pdfFontFor('Garamond')).toEqual({ family: 'serif', exact: false });
    expect(pdfFontFor('Calibri')).toEqual({ family: 'sans', exact: false });
    expect(pdfFontFor('Fuente Rara')).toEqual({ family: 'serif', exact: false });
  });

  it('Garamond usa Times y avisa; Arial usa Helvetica sin avisar de la fuente', async () => {
    const garamond = moldPdfSettings(await inspectDocxMold(await buildSyntheticLawyerTemplate({ font: 'Garamond' })));
    expect(garamond.family).toBe('serif');
    expect(garamond.warnings.join(' ')).toMatch(/Times.*más cercana.*Garamond/);

    const arial = moldPdfSettings(await inspectDocxMold(await buildSyntheticLawyerTemplate({ font: 'Arial' })));
    expect(arial.family).toBe('sans');
    expect(arial.warnings.join(' ')).not.toContain('más cercana');

    const pdfSans = (await exportUniversalToPdfWithMold(makeDocument(), arial)).toString('latin1');
    expect(pdfSans).toContain('/BaseFont /Helvetica-Oblique');
    // El cuerpo usa Helvetica (F5) en lugar de Times (F1).
    expect(pdfSans).toMatch(/BT \/F5 \d+(\.\d+)? Tf[^\n]*María López/);

    const courier = moldPdfSettings(await inspectDocxMold(await buildSyntheticLawyerTemplate({ font: 'Courier New' })));
    const pdfMono = (await exportUniversalToPdfWithMold(makeDocument(), courier)).toString('latin1');
    expect(pdfMono).toContain('/BaseFont /Courier');
    expect(pdfMono).toMatch(/BT \/F9 \d+(\.\d+)? Tf[^\n]*María López/);
  });
});

describe('imágenes del membrete en el PDF', () => {
  it('incluye el logotipo del encabezado de la plantilla como imagen del PDF', async () => {
    const info = await inspectDocxMold(await buildSyntheticLawyerTemplate());
    expect(info.headerImages).toHaveLength(1);
    expect(info.headerImages[0]).toMatchObject({ mime: 'image/png', align: 'left' });

    const settings = moldPdfSettings(info);
    const notices: string[] = [];
    const pdf = (await exportUniversalToPdfWithMold(makeDocument(), settings, undefined, {}, notices)).toString('latin1');
    expect(pdf).toContain('/Subtype /Image');
    expect(pdf).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
    expect(pdf).toMatch(/cm \/Im1 Do Q/);
    expect(notices).toEqual([]);
    expect(settings.warnings.join(' ')).not.toContain('no incluye las imágenes');
    expect(settings.warnings.join(' ')).toContain('texto del encabezado y pie');
  });

  it('una imagen ilegible se omite y se avisa', async () => {
    const info = await inspectDocxMold(await buildSyntheticLawyerTemplate());
    const settings = moldPdfSettings(info);
    settings.headerImages = [{ ...settings.headerImages[0]!, data: new Uint8Array([1, 2, 3]) }];
    const notices: string[] = [];
    const pdf = (await exportUniversalToPdfWithMold(makeDocument(), settings, undefined, {}, notices)).toString('latin1');
    expect(pdf).not.toContain('/Subtype /Image');
    expect(notices.join(' ')).toContain('no se pudo leer');
  });

  it('la imagen del pie queda en el margen inferior', async () => {
    const info = await inspectDocxMold(await buildSyntheticLawyerTemplate());
    const settings = moldPdfSettings(info);
    settings.footerImages = [{ ...settings.headerImages[0]!, align: 'right' }];
    settings.headerImages = [];
    const pdf = (await exportUniversalToPdfWithMold(makeDocument(), settings)).toString('latin1');
    // Alineada a la derecha, con la base en 30 pt.
    expect(pdf).toMatch(/q [\d.]+ 0 0 [\d.]+ [\d.]+ 30\.00 cm \/Im1 Do Q/);
  });
});
