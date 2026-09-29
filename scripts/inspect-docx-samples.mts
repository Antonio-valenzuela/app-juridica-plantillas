import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import path from 'node:path';

async function inspectDocx() {
  const docxPath = path.resolve('audit/professional-drafting-phase3/cases/01/EXTENSIVE_40/outputs/caso-01-EXTENSIVE_40-DRAFT.docx');
  const buffer = await readFile(docxPath);
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  console.log('DOCX Total Length (chars):', text.length);
  console.log('DOCX Word Count:', text.match(/[\p{L}\p{N}]+/gu)?.length || 0);

  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  console.log('DOCX Total Paragraphs:', paragraphs.length);

  console.log('\n--- DOCX PRIMEROS 3 PÁRRAFOS ---');
  console.log(paragraphs.slice(0, 3).join('\n\n'));

  console.log('\n--- DOCX PÁRRAFOS MEDIOS (50%) ---');
  const mid = Math.floor(paragraphs.length / 2);
  console.log(paragraphs.slice(mid, mid + 2).join('\n\n'));

  console.log('\n--- DOCX ÚLTIMOS 2 PÁRRAFOS ---');
  console.log(paragraphs.slice(-2).join('\n\n'));
}

inspectDocx().catch(console.error);
