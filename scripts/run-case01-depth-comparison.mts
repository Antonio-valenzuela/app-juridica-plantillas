import { runSingleCaseDepth } from './audit/run-professional-drafting-phase3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
  process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
  process.env.SECTION_AI_TIMEOUT_MS = '60000';
  process.env.AI_PROVIDER_RETRIES = '1';

  console.log('================================================================');
  console.log('EJECUCIÓN CASO 01 — MODO PROFESSIONAL_20');
  console.log('================================================================');

  const result20 = await runSingleCaseDepth('01', 'PROFESSIONAL_20');

  console.log('\n--- RESULTADO CASO 01 PROFESSIONAL_20 ---');
  console.log('Status:', result20.status);
  console.log('Total Ms:', result20.totalMs);
  console.log('DOCX Bytes:', result20.exports.docxBytes);
  console.log('PDF Bytes:', result20.exports.pdfBytes);
  console.log('Actual PDF Pages:', result20.exports.actualPdfPages);
  console.log('Quality Metrics:', result20.quality);

  // Load EXTENSIVE_40 result for comparison
  const extensiveRunResultPath = path.resolve('audit/professional-drafting-phase3/cases/01/EXTENSIVE_40/evidence/run-result.json');
  const extensiveResult = JSON.parse(await readFile(extensiveRunResultPath, 'utf8'));

  console.log('\n================================================================');
  console.log('COMPARATIVA MATERIAL: PROFESSIONAL_20 vs EXTENSIVE_40');
  console.log('================================================================');
  console.log({
    métrica: 'Páginas PDF reales',
    PROFESSIONAL_20: result20.exports.actualPdfPages,
    EXTENSIVE_40: extensiveResult.exports.actualPdfPages,
  });
  console.log({
    métrica: 'Palabras sustantivas',
    PROFESSIONAL_20: (result20.quality as any)?.substantiveWords,
    EXTENSIVE_40: (extensiveResult.quality as any)?.substantiveWords,
  });
  console.log({
    métrica: 'Bytes DOCX',
    PROFESSIONAL_20: result20.exports.docxBytes,
    EXTENSIVE_40: extensiveResult.exports.docxBytes,
  });
  console.log({
    métrica: 'Bytes PDF',
    PROFESSIONAL_20: result20.exports.pdfBytes,
    EXTENSIVE_40: extensiveResult.exports.pdfBytes,
  });
  console.log({
    métrica: 'Exact Duplicate Ratio',
    PROFESSIONAL_20: (result20.quality as any)?.exactDuplicateRatio,
    EXTENSIVE_40: (extensiveResult.quality as any)?.exactDuplicateRatio,
  });
  console.log({
    métrica: 'Semantic Duplicate Ratio',
    PROFESSIONAL_20: (result20.quality as any)?.semanticDuplicateRatio,
    EXTENSIVE_40: (extensiveResult.quality as any)?.semanticDuplicateRatio,
  });
  console.log({
    métrica: 'Source Copy Ratio',
    PROFESSIONAL_20: (result20.quality as any)?.sourceCopyRatio,
    EXTENSIVE_40: (extensiveResult.quality as any)?.sourceCopyRatio,
  });
}

main().catch(console.error);
