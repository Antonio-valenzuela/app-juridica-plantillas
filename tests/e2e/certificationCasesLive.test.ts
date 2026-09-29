import { describe, it, expect } from 'vitest';
import { runSingleCaseDepth } from '../../scripts/audit/run-professional-drafting-phase3';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function setupEnvironment() {
  process.env.PHASE3_USE_CONFIGURED_PROVIDERS = 'true';
  process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
  process.env.AI_PROVIDER_CHAIN = 'gemini,groq,nvidia,local';
  process.env.GROQ_MODEL = 'qwen/qwen3.8-27b';
  process.env.SECTION_AI_TIMEOUT_MS = '90000';
  process.env.NVIDIA_REQUEST_TIMEOUT_MS = '90000';
  process.env.AI_PROVIDER_RETRIES = '1';
}

describe.skipIf(process.env.RUN_LIVE_PROVIDER_TESTS !== 'true')('Certificación de Generador Jurídico — Casos Reales 01 a 06', () => {
  // Caso 02
  describe('Caso 02: Laboral (Noé C4 vs Ayuntamiento)', () => {
    it('ejecuta Caso 02 en EXTENSIVE_40 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 02 EXTENSIVE_40 <<<');
      const result = await runSingleCaseDepth('02', 'EXTENSIVE_40');
      
      console.log('Caso 02 EXTENSIVE_40:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(12);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);

    it('ejecuta Caso 02 en PROFESSIONAL_20 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 02 PROFESSIONAL_20 <<<');
      const result = await runSingleCaseDepth('02', 'PROFESSIONAL_20');

      console.log('Caso 02 PROFESSIONAL_20:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);
  });

  // Caso 03
  describe('Caso 03: Civil (Prescripción IPJAL)', () => {
    it('ejecuta Caso 03 en EXTENSIVE_40 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 03 EXTENSIVE_40 <<<');
      const result = await runSingleCaseDepth('03', 'EXTENSIVE_40');
      
      console.log('Caso 03 EXTENSIVE_40:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(12);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);

    it('ejecuta Caso 03 en PROFESSIONAL_20 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 03 PROFESSIONAL_20 <<<');
      const result = await runSingleCaseDepth('03', 'PROFESSIONAL_20');

      console.log('Caso 03 PROFESSIONAL_20:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);
  });

  // Caso 04
  describe('Caso 04: Familiar (Alimentos Andrea)', () => {
    it('ejecuta Caso 04 en EXTENSIVE_40 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 04 EXTENSIVE_40 <<<');
      const result = await runSingleCaseDepth('04', 'EXTENSIVE_40');
      
      console.log('Caso 04 EXTENSIVE_40:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(12);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);

    it('ejecuta Caso 04 en PROFESSIONAL_20 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 04 PROFESSIONAL_20 <<<');
      const result = await runSingleCaseDepth('04', 'PROFESSIONAL_20');

      console.log('Caso 04 PROFESSIONAL_20:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);
  });

  // Caso 05
  describe('Caso 05: Mercantil (Demanda Rescisoria Sr. Raúl)', () => {
    it('ejecuta Caso 05 en EXTENSIVE_40 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 05 EXTENSIVE_40 <<<');
      const result = await runSingleCaseDepth('05', 'EXTENSIVE_40');
      
      console.log('Caso 05 EXTENSIVE_40:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(12);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);

    it('ejecuta Caso 05 en PROFESSIONAL_20 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 05 PROFESSIONAL_20 <<<');
      const result = await runSingleCaseDepth('05', 'PROFESSIONAL_20');

      console.log('Caso 05 PROFESSIONAL_20:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);
  });

  // Caso 06
  describe('Caso 06: Laboral (Marco C4 vs Ayuntamiento)', () => {
    it('ejecuta Caso 06 en EXTENSIVE_40 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 06 EXTENSIVE_40 <<<');
      const result = await runSingleCaseDepth('06', 'EXTENSIVE_40');
      
      console.log('Caso 06 EXTENSIVE_40:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(12_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(12);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);

    it('ejecuta Caso 06 en PROFESSIONAL_20 con calidad certificada', async () => {
      setupEnvironment();
      console.log('>>> EJECUTANDO CASO 06 PROFESSIONAL_20 <<<');
      const result = await runSingleCaseDepth('06', 'PROFESSIONAL_20');

      console.log('Caso 06 PROFESSIONAL_20:', {
        status: result.status,
        pages: result.exports.actualPdfPages,
        docxBytes: result.exports.docxBytes,
        pdfBytes: result.exports.pdfBytes,
        substantiveWords: (result.quality as any)?.substantiveWords,
        exactDuplicateRatio: (result.quality as any)?.exactDuplicateRatio,
        semanticDuplicateRatio: (result.quality as any)?.semanticDuplicateRatio,
        sourceCopyRatio: (result.quality as any)?.sourceCopyRatio,
        coherenceErrors: (result.quality as any)?.coherenceErrors,
        provenanceErrors: (result.quality as any)?.provenanceErrors,
      });

      expect(result.status).toBe('EXPORTED_REVIEW_DRAFT');
      expect(Number(result.exports.docxBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.pdfBytes)).toBeGreaterThan(10_000);
      expect(Number(result.exports.actualPdfPages)).toBeGreaterThanOrEqual(10);
      expect((result.quality as any)?.exactDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.semanticDuplicateRatio).toBeLessThan(0.05);
      expect((result.quality as any)?.sourceCopyRatio).toBeLessThan(0.30);
      expect((result.quality as any)?.coherenceErrors).toBe(0);
      expect((result.quality as any)?.provenanceErrors).toBe(0);
    }, 600_000);
  });
});
