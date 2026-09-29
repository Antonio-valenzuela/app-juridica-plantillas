import { describe, it, expect } from 'vitest';
import { runSingleCaseDepth } from '../../scripts/audit/run-professional-drafting-phase3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== 'true')('Caso 01 — Generación Controlada EXTENSIVE_40 con Proveedor Real', () => {
  it('ejecuta Caso 01 en EXTENSIVE_40 con proveedores reales y produce borrador sustantivo', async () => {
    // Activar proveedores reales configurados (Gemini / Groq / NVIDIA)
    process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
    process.env.PHASE4_AUDIT = 'true';
    process.env.PHASE4_AUDIT_ATTEMPT = 'attempt-04';
    process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
    process.env.SECTION_AI_TIMEOUT_MS = '60000';
    process.env.AI_PROVIDER_RETRIES = '1';

    console.log('--- INICIANDO EJECUCIÓN CASO 01 EXTENSIVE_40 ---');
    const result = await runSingleCaseDepth('01', 'EXTENSIVE_40');

    console.log('--- RESULTADO CASO 01 ---');
    console.log('Status:', result.status);
    console.log('Total Ms:', result.totalMs);
    console.log('DOCX Bytes:', result.exports.docxBytes);
    console.log('PDF Bytes:', result.exports.pdfBytes);
    console.log('Actual PDF Pages:', result.exports.actualPdfPages);
    console.log('Quality Metrics:', result.quality);
    console.log('Errors:', result.errors);
    console.log('Warnings:', result.warnings);

    // Cargar traza si existe
    if (result.files.trace) {
      const traceJson = JSON.parse(await readFile(result.files.trace, 'utf8'));
      console.log('Provider actually used:', traceJson.providerActuallyUsed);
      console.log('Model:', traceJson.model);
      console.log('Generation tasks:', traceJson.generationTasks?.length);
      console.log('Task executions:', traceJson.taskExecutions?.length);
      console.log('Issue generation attempts:', traceJson.issueGenerationAttempts?.length);
    }

    expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
    expect(Number(result.exports.docxBytes)).toBeGreaterThan(15_000);
    expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
    expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(15);
  }, 600_000); // 10 minutos
});
