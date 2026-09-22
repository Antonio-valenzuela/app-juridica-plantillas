/* eslint-disable */
const mammoth = require('mammoth');
const fs = require('fs');

async function main() {
  const docxPath = 'C:/Users/yahir/Downloads/LexPlantillas_Referencia_Diseno_Stitch.docx';
  const result = await mammoth.extractRawText({ path: docxPath });
  fs.writeFileSync('C:/Users/yahir/Desktop/APP-plantillas/data/stitch_docx_extracted.txt', result.value, 'utf8');
  console.log('EXTRACTED LENGTH:', result.value.length);
  console.log('--- FIRST 2000 CHARS ---');
  console.log(result.value.slice(0, 2000));
}

main().catch(console.error);
