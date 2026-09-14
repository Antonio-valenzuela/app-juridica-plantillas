/**
 * Helper para generar fixtures sintéticos reales en memoria (Buffer / Uint8Array).
 *
 * Utiliza las librerías nativas del proyecto (docx, pdf 1.4 directo, Buffer utf-8)
 * sin añadir dependencias externas ni usar datos reales de usuarios.
 *
 * Todos los datos son explícitamente sintéticos (EXP-TEST-*, PERSONA_TEST_*, etc.).
 */

import { Document, Paragraph, TextRun, Packer } from 'docx';
import sharp from 'sharp';

/**
 * Genera un PDF 1.4 estándar y válido en memoria con texto extraíble por pdf-parse.
 */
export function createSyntheticPdfBuffer(text: string): Buffer {
  const cleanLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Escapar paréntesis y barras para PDF literal string
  const escapePdf = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  let streamContent = 'BT\n/F1 12 Tf\n14.4 TL\n72 720 Td\n';
  for (let i = 0; i < cleanLines.length; i++) {
    const line = escapePdf(cleanLines[i]);
    if (i === 0) {
      streamContent += `(${line}) Tj\n`;
    } else {
      streamContent += `T* (${line}) Tj\n`;
    }
  }
  streamContent += 'ET\n';

  const streamBuf = Buffer.from(streamContent, 'latin1');

  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1');
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'latin1');
  const obj3 = Buffer.from(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    'latin1'
  );
  const obj4 = Buffer.from(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    'latin1'
  );
  const obj5Header = Buffer.from(`5 0 obj\n<< /Length ${streamBuf.length} >>\nstream\n`, 'latin1');
  const obj5Footer = Buffer.from('\nendstream\nendobj\n', 'latin1');

  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');

  // Calcular offsets xref
  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  const offset5 = offset4 + obj4.length;
  const offsetEndObj5 = offset5 + obj5Header.length + streamBuf.length + obj5Footer.length;

  const pad = (n: number) => String(n).padStart(10, '0');

  const xref = Buffer.from(
    `xref\n0 6\n` +
      `0000000000 65535 f \n` +
      `${pad(offset1)} 00000 n \n` +
      `${pad(offset2)} 00000 n \n` +
      `${pad(offset3)} 00000 n \n` +
      `${pad(offset4)} 00000 n \n` +
      `${pad(offset5)} 00000 n \n`,
    'latin1'
  );

  const trailer = Buffer.from(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offsetEndObj5}\n%%EOF\n`,
    'latin1'
  );

  return Buffer.concat([
    header,
    obj1,
    obj2,
    obj3,
    obj4,
    obj5Header,
    streamBuf,
    obj5Footer,
    xref,
    trailer,
  ]);
}

/**
 * Renderiza texto en una imagen sintética real (PNG o JPEG) con dimensiones nítidas para OCR.
 */
export async function createSyntheticImageBuffer(
  format: 'image/png' | 'image/jpeg' = 'image/jpeg',
  customLines?: string[]
): Promise<Buffer> {
  const lines = customLines || [
    'EXP-OCR-TEST-001',
    'PERSONA_OCR_ALPHA',
    'JUICIO DE PRUEBA',
    'DEMANDA ORDINARIA CIVIL ANTE EL JUZGADO',
    'HECHOS: Se demanda el cumplimiento forzoso de contrato.',
    'PUNTOS PETITORIOS: Proveer conforme a derecho.',
  ];

  const lineHeight = 40;
  const height = Math.max(300, (lines.length + 2) * lineHeight);
  const width = 850;

  const textSvg = lines
    .map((line, idx) => {
      const y = 60 + idx * lineHeight;
      const safe = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<text x="30" y="${y}" font-family="sans-serif" font-size="22" font-weight="bold" fill="#111111">${safe}</text>`;
    })
    .join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#FFFFFF" />
      ${textSvg}
    </svg>
  `;

  const s = sharp(Buffer.from(svg));
  if (format === 'image/png') {
    return s.png().toBuffer();
  }
  return s.jpeg({ quality: 95 }).toBuffer();
}

/**
 * Genera un PDF sintético escaneado REAL (image-only, sin capa de texto seleccionable).
 * Contiene una imagen JPEG embebida en un XObject sin ningún operador de texto (sin BT...ET).
 * Obliga a la aplicación a pasar por la ruta OCR real.
 */
export async function createSyntheticScannedPdfBuffer(customLines?: string[]): Promise<Buffer> {
  const jpegBuffer = await createSyntheticImageBuffer('image/jpeg', customLines);
  const width = 850;
  const height = 300;

  const header = Buffer.from('%PDF-1.4\n', 'latin1');
  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1');
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'latin1');
  const obj3 = Buffer.from(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    'latin1'
  );
  // El Contents sólo dibuja la imagen: cero comandos de texto (sin BT, sin ET, sin Tj)
  const contentStream = Buffer.from('q 612 0 0 792 0 0 cm /Im0 Do Q\n', 'latin1');
  const obj4 = Buffer.from(`4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream.toString('latin1')}endstream\nendobj\n`, 'latin1');

  // Objeto 5: Imagen XObject con filtro DCTDecode (JPEG nativo)
  const obj5Header = Buffer.from(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`,
    'latin1'
  );
  const obj5Footer = Buffer.from('\nendstream\nendobj\n', 'latin1');

  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  const offset5 = offset4 + obj4.length;
  const offsetEndObj5 = offset5 + obj5Header.length + jpegBuffer.length + obj5Footer.length;

  const pad = (n: number) => String(n).padStart(10, '0');

  const xref = Buffer.from(
    `xref\n0 6\n` +
      `0000000000 65535 f \n` +
      `${pad(offset1)} 00000 n \n` +
      `${pad(offset2)} 00000 n \n` +
      `${pad(offset3)} 00000 n \n` +
      `${pad(offset4)} 00000 n \n` +
      `${pad(offset5)} 00000 n \n`,
    'latin1'
  );

  const trailer = Buffer.from(
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offsetEndObj5}\n%%EOF\n`,
    'latin1'
  );

  return Buffer.concat([
    header,
    obj1,
    obj2,
    obj3,
    obj4,
    obj5Header,
    jpegBuffer,
    obj5Footer,
    xref,
    trailer,
  ]);
}

/**
 * Genera un PDF sintético escaneado multipágina (2 páginas image-only).
 */
export async function createSyntheticMultiPageScannedPdfBuffer(
  pagesLines?: string[][]
): Promise<Buffer> {
  const p1Lines = pagesLines?.[0] || [
    'EXP-OCR-MULTIPAGE-001 - PÁGINA 1',
    'ACTOR: EMPRESA_OCR_ALPHA',
    'DEMANDADO: CORPORATIVO_BETA',
    'DEMANDA EJECUTIVA MERCANTIL',
  ];
  const p2Lines = pagesLines?.[1] || [
    'EXP-OCR-MULTIPAGE-001 - PÁGINA 2',
    'HECHOS: Pagaré vencido con fecha de pago omitida.',
    'PUNTOS PETITORIOS: Requerir de pago y embargo.',
  ];

  const img1 = await createSyntheticImageBuffer('image/jpeg', p1Lines);
  const img2 = await createSyntheticImageBuffer('image/jpeg', p2Lines);

  const header = Buffer.from('%PDF-1.4\n', 'latin1');
  const obj1 = Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'latin1');
  const obj2 = Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>\nendobj\n', 'latin1');

  // Page 1
  const obj3 = Buffer.from(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
    'latin1'
  );
  const c1 = Buffer.from('q 612 0 0 792 0 0 cm /Im0 Do Q\n', 'latin1');
  const obj4 = Buffer.from(`4 0 obj\n<< /Length ${c1.length} >>\nstream\n${c1.toString('latin1')}endstream\nendobj\n`, 'latin1');
  const obj5Header = Buffer.from(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width 850 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img1.length} >>\nstream\n`, 'latin1');
  const obj5Footer = Buffer.from('\nendstream\nendobj\n', 'latin1');

  // Page 2
  const obj6 = Buffer.from(
    '6 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 8 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    'latin1'
  );
  const c2 = Buffer.from('q 612 0 0 792 0 0 cm /Im1 Do Q\n', 'latin1');
  const obj7 = Buffer.from(`7 0 obj\n<< /Length ${c2.length} >>\nstream\n${c2.toString('latin1')}endstream\nendobj\n`, 'latin1');
  const obj8Header = Buffer.from(`8 0 obj\n<< /Type /XObject /Subtype /Image /Width 850 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img2.length} >>\nstream\n`, 'latin1');
  const obj8Footer = Buffer.from('\nendstream\nendobj\n', 'latin1');

  const o1 = header.length;
  const o2 = o1 + obj1.length;
  const o3 = o2 + obj2.length;
  const o4 = o3 + obj3.length;
  const o5 = o4 + obj4.length;
  const o6 = o5 + obj5Header.length + img1.length + obj5Footer.length;
  const o7 = o6 + obj6.length;
  const o8 = o7 + obj7.length;
  const startXref = o8 + obj8Header.length + img2.length + obj8Footer.length;

  const pad = (n: number) => String(n).padStart(10, '0');
  const xref = Buffer.from(
    `xref\n0 9\n` +
      `0000000000 65535 f \n` +
      `${pad(o1)} 00000 n \n` +
      `${pad(o2)} 00000 n \n` +
      `${pad(o3)} 00000 n \n` +
      `${pad(o4)} 00000 n \n` +
      `${pad(o5)} 00000 n \n` +
      `${pad(o6)} 00000 n \n` +
      `${pad(o7)} 00000 n \n` +
      `${pad(o8)} 00000 n \n`,
    'latin1'
  );
  const trailer = Buffer.from(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`, 'latin1');

  return Buffer.concat([
    header,
    obj1,
    obj2,
    obj3,
    obj4,
    obj5Header,
    img1,
    obj5Footer,
    obj6,
    obj7,
    obj8Header,
    img2,
    obj8Footer,
    xref,
    trailer,
  ]);
}

/**
 * Genera un archivo DOCX real y válido en memoria con la librería docx del proyecto.
 * Extraíble fielmente por mammoth.
 */
export async function createSyntheticDocxBuffer(text: string): Promise<Buffer> {
  const paragraphs = text
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          children: [new TextRun({ text: p, font: 'Arial', size: 24 })],
        })
    );

  const doc = new Document({
    sections: [
      {
        children: paragraphs.length > 0 ? paragraphs : [new Paragraph('Documento sintético.')],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

/**
 * Genera un archivo TXT en memoria como Buffer utf-8.
 */
export function createSyntheticTxtBuffer(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}
