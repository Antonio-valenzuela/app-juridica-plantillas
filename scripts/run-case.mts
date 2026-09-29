import { runSingleCaseDepth } from './audit/run-professional-drafting-phase3';
import type { DraftDepth } from '../lib/legal-engine/draftDepth';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function executeCase(caseNumber: string, depth: DraftDepth) {
  process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
  process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
  process.env.SECTION_AI_TIMEOUT_MS = '60000';
  process.env.AI_PROVIDER_RETRIES = '1';

  console.log(`\n================================================================`);
  console.log(`INICIANDO CASO ${caseNumber} — MODO ${depth}`);
  console.log(`================================================================`);

  const start = Date.now();
  const result = await runSingleCaseDepth(caseNumber, depth);
  const durationSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n--- RESULTADO CASO ${caseNumber} ${depth} (${durationSec}s) ---`);
  console.log('Status:', result.status);
  console.log('DOCX Bytes:', result.exports.docxBytes);
  console.log('PDF Bytes:', result.exports.pdfBytes);
  console.log('PDF Pages:', result.exports.actualPdfPages);
  console.log('Substantive Words:', (result.quality as any)?.substantiveWords);
  console.log('Exact Duplicate Ratio:', (result.quality as any)?.exactDuplicateRatio);
  console.log('Semantic Duplicate Ratio:', (result.quality as any)?.semanticDuplicateRatio);
  console.log('Source Copy Ratio:', (result.quality as any)?.sourceCopyRatio);
  console.log('Coherence Errors:', (result.quality as any)?.coherenceErrors);
  console.log('Provenance Errors:', (result.quality as any)?.provenanceErrors);
  console.log('Errors:', result.errors);
  console.log('Warnings:', result.warnings);

  if (result.status !== 'EXPORTED_REVIEW_DRAFT') {
    throw new Error(`CASO ${caseNumber} ${depth} FALLÓ: status=${result.status}`);
  }

  return result;
}

async function main() {
  const caseNumber = process.argv[2] || '02';
  const requestedDepth = process.argv[3] || 'ALL';

  const depths: DraftDepth[] = requestedDepth === 'ALL'
    ? ['EXTENSIVE_40', 'PROFESSIONAL_20']
    : [requestedDepth as DraftDepth];

  for (const depth of depths) {
    await executeCase(caseNumber, depth);
  }

  console.log(`\n>>> CASO ${caseNumber} COMPLETADO SATISFACTORIAMENTE EN TODOS LOS MODOS <<<`);
}

main().catch((err) => {
  console.error('\n*** ERROR EN EJECUCIÓN DE CASO ***', err);
  process.exit(1);
});
