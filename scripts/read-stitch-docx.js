/* eslint-disable */
const mammoth = require('mammoth');
const fs = require('fs');

async function main() {
  const docxPath = process.argv[2];
  const outputPath = process.argv[3] || 'data/stitch_docx_extracted.txt';
  if (!docxPath) throw new Error('Uso: node scripts/read-stitch-docx.js <ruta-docx> [salida-txt]');
  const result = await mammoth.extractRawText({ path: docxPath });
  fs.writeFileSync(outputPath, result.value, 'utf8');
  console.log('EXTRACTED LENGTH:', result.value.length);
  console.log('--- FIRST 2000 CHARS ---');
  console.log(result.value.slice(0, 2000));
}

main().catch(console.error);
