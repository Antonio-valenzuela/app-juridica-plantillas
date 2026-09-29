import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';

async function run() {
  const manifest = JSON.parse(await readFile('audit/final-legal-readiness-2026/selected-cases.json', 'utf8'));
  const c01 = manifest.cases.find((c: any) => c.caseNumber === '01');
  console.log('Source path:', c01.extractedSourcePath);
  const buffer = await readFile(c01.extractedSourcePath);
  const extracted = await mammoth.extractRawText({ buffer });
  const text = extracted.value;
  console.log('Source length (chars):', text.length);
  console.log('--- SAMPLE OF SOURCE (first 2000 chars) ---');
  console.log(text.slice(0, 2000));

  console.log('\n--- SEARCH FOR "contrato" OR "tiempo determinado" IN SOURCE ---');
  const contractMentions = text.match(/.{0,50}(?:contrat|tiempo determinado|temporal|nombramiento).{0,50}/gi) || [];
  console.log('Mentions found:', contractMentions.length);
  for (const m of contractMentions.slice(0, 5)) {
    console.log(' - ' + m.trim());
  }
}

run().catch(console.error);
