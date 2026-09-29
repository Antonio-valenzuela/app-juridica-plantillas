import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import path from 'node:path';

async function inspectPdf() {
  const pdfPath = path.resolve('audit/professional-drafting-phase3/cases/01/EXTENSIVE_40/outputs/caso-01-EXTENSIVE_40-DRAFT.pdf');
  const buffer = await readFile(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const parsed = await parser.getText();
  await parser.destroy();

  const totalPages = parsed.pages.length;
  console.log('Total PDF Pages:', totalPages);

  const percentiles = [
    { label: '0% (Página 1)', pageIdx: 0 },
    { label: '25% (Página ' + Math.round(totalPages * 0.25) + ')', pageIdx: Math.round(totalPages * 0.25) - 1 },
    { label: '50% (Página ' + Math.round(totalPages * 0.50) + ')', pageIdx: Math.round(totalPages * 0.50) - 1 },
    { label: '75% (Página ' + Math.round(totalPages * 0.75) + ')', pageIdx: Math.round(totalPages * 0.75) - 1 },
    { label: '100% (Página ' + totalPages + ')', pageIdx: totalPages - 1 },
  ];

  for (const { label, pageIdx } of percentiles) {
    const pageText = parsed.pages[pageIdx]?.text || '';
    console.log('\n==================================================');
    console.log(`=== MUESTRA ${label} (Longitud: ${pageText.length} caracteres) ===`);
    console.log('==================================================');
    console.log(pageText.slice(0, 1200));
    if (pageText.length > 1200) {
      console.log('... [resto de página omitido para brevedad] ...');
    }
  }
}

inspectPdf().catch(console.error);
