import { describe, it, expect } from 'vitest';
import { runSingleCaseDepth } from '../../scripts/audit/run-professional-drafting-phase3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== 'true')('Caso 01 — Generación Controlada PROFESSIONAL_20 con Proveedor Real', () => {
  it('ejecuta Caso 01 en PROFESSIONAL_20 con proveedores reales y produce borrador sustantivo', async () => {
    process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
    process.env.GEMINI_MODEL = 'gemini-flash-lite-latest';
    process.env.SECTION_AI_TIMEOUT_MS = '60000';
    process.env.AI_PROVIDER_RETRIES = '1';

    console.log('--- INICIANDO EJECUCIÓN CASO 01 PROFESSIONAL_20 ---');
    const result = await runSingleCaseDepth('01', 'PROFESSIONAL_20');

    console.log('--- RESULTADO CASO 01 PROFESSIONAL_20 ---');
    console.log('Status:', result.status);
    console.log('Total Ms:', result.totalMs);
    console.log('DOCX Bytes:', result.exports.docxBytes);
    console.log('PDF Bytes:', result.exports.pdfBytes);
    console.log('Actual PDF Pages:', result.exports.actualPdfPages);
    console.log('Quality Metrics:', result.quality);
    console.log('Errors:', result.errors);
    console.log('Warnings:', result.warnings);

    expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
    expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
    expect(Number(result.exports.pdfBytes)).toBeGreaterThan(8_000);
    expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
  }, 600_000);
});
