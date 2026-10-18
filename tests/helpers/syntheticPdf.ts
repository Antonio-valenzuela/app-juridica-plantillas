/**
 * Generador mínimo de PDF con texto nativo para pruebas (sin dependencias).
 * Solo datos sintéticos: nunca se usa con expedientes reales.
 */
const escapePdfText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Codifica a WinAnsi (cp1252) los caracteres latinos usados en español. */
function toWinAnsi(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    bytes.push(code < 256 ? code : 0x3f);
  }
  return Uint8Array.from(bytes);
}

export function buildSyntheticPdf(pages: string[][]): Buffer {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? toWinAnsi(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const pageCount = pages.length;
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ');
  const bodies: Array<string | Uint8Array[]> = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((lines, i) => {
    const ops = ['BT', '/F1 12 Tf', '14 TL', '50 760 Td', ...lines.map(line => `(${escapePdfText(line)}) Tj T*`), 'ET'].join('\n');
    const stream = toWinAnsi(ops);
    bodies.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
    bodies.push([toWinAnsi(`<< /Length ${stream.length} >>\nstream\n`), stream, toWinAnsi('\nendstream')]);
  });

  write('%PDF-1.4\n');
  bodies.forEach((body, index) => {
    offsets.push(length);
    write(`${index + 1} 0 obj\n`);
    if (typeof body === 'string') write(body);
    else body.forEach(write);
    write('\nendobj\n');
  });
  const xref = length;
  write(`xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`);
  offsets.forEach(offset => write(`${String(offset).padStart(10, '0')} 00000 n \n`));
  write(`trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts.map(part => Buffer.from(part)));
}

const COURT = 'JUZGADO QUINTO EN MATERIA FAMILIAR';

/** PDF sintético de `pageCount` páginas: un auto en la 1, una sentencia definitiva desde la 5 y notificación en la última. */
export function appealPdf(pageCount = 44): Buffer {
  const pages: string[][] = Array.from({ length: pageCount }, (_, i) => [
    `Continuación de las actuaciones. Foja ${i + 1}.`, 'Texto sintético de relleno sin encabezado resolutivo.',
  ]);
  pages[0] = [COURT, 'AUTO: SE DESECHA INCIDENTE, SE CITA A SENTENCIA.', 'ZAPOPAN, JALISCO A 12 DOCE DE AGOSTO DEL AÑO 2026',
    'Por recibido el escrito de PARTE DEMANDADA UNO.', 'NOTIFICACIÓN: BOLETÍN 120, 13 de agosto de 2026.'];
  pages[4] = ['PODER JUDICIAL DEL ESTADO', COURT, 'SE DICTA SENTENCIA DEFINITIVA', 'EXPEDIENTE: ANON-01',
    'ACTORES: ALFA UNO; BETA UNO.', 'DEMANDADOS: PARTE DEMANDADA UNO.', 'ZAPOPAN, JALISCO A 24 VEINTICUATRO DE AGOSTO DE 2026',
    'RESULTANDO. La parte actora reclamó el pago de una suma por un contrato sintético.',
    'CONSIDERANDO. Se condena a la parte demandada al pago reclamado.'];
  pages[pageCount - 1] = ['RESOLUTIVOS', 'Notifíquese personalmente.', 'NOTIFICACIÓN: BOLETÍN 139, 25 de agosto de 2026.'];
  return buildSyntheticPdf(pages);
}

/**
 * PDF sintético del caso reportado: SOLO un auto de juzgado familiar que desecha un incidente y cita para
 * sentencia (página 1) y constancias de trámite; no contiene la demanda ni la sentencia.
 */
export function autoFamiliarPdf(pageCount = 44): Buffer {
  const pages: string[][] = Array.from({ length: pageCount }, (_, i) => [
    'JUZGADO TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL', 'EXPEDIENTE: 1234/2025',
    `CONSTANCIA SECRETARIAL. Obran agregadas las actuaciones del periodo. Foja ${i + 1}.`,
  ]);
  pages[0] = ['JUZGADO TERCERO DE LO FAMILIAR DEL PRIMER PARTIDO JUDICIAL', 'EXPEDIENTE: 1234/2025', 'JUICIO: DIVORCIO INCAUSADO Y ALIMENTOS',
    'Guadalajara, Jalisco, a doce de agosto de dos mil veinticinco.',
    'Visto el escrito del autorizado de la parte demandada, mediante el cual promueve incidente de nulidad de actuaciones,',
    'SE DESECHA el incidente por notoriamente improcedente.',
    'Asimismo, al no existir diligencia pendiente, SE CITA A LAS PARTES PARA OIR SENTENCIA DEFINITIVA.',
    'NOTIFIQUESE PERSONALMENTE. Asi lo acordo y firma la Jueza, ante la Secretaria de Acuerdos.'];
  return buildSyntheticPdf(pages);
}
