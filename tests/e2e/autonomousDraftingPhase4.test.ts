import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runProfessionalDraftingPhase3 } from '@/scripts/audit/run-professional-drafting-phase3';

describe('Fase 4: banco real aislado', () => {
  it('produce doce pares DRAFT en orden 40-20 sin acceder a proveedores ni base productiva', async () => {
    expect(process.env.PHASE4_AUDIT).toBe('true');
    expect(process.env.NVIDIA_API_KEY).toBe('');
    expect(process.env.GEMINI_API_KEY).toBe('');
    expect(process.env.GROQ_API_KEY).toBe('');
    expect(process.env.OPENROUTER_API_KEY).toBe('');

    const summary = await runProfessionalDraftingPhase3() as any;
    expect(summary.writesToPrisma).toBe(false);
    expect(summary.providerPolicy).toBe('CREDENTIALS_SUPPRESSED_LOCAL_FALLBACK_ONLY');
    expect(summary.counts.total).toBe(12);
    expect(summary.results.map((result: any) => [result.caseNumber, result.draftDepth]))
      .toEqual([
        ['01', 'EXTENSIVE_40'], ['02', 'EXTENSIVE_40'], ['03', 'EXTENSIVE_40'],
        ['04', 'EXTENSIVE_40'], ['05', 'EXTENSIVE_40'], ['06', 'EXTENSIVE_40'],
        ['01', 'PROFESSIONAL_20'], ['02', 'PROFESSIONAL_20'], ['03', 'PROFESSIONAL_20'],
        ['04', 'PROFESSIONAL_20'], ['05', 'PROFESSIONAL_20'], ['06', 'PROFESSIONAL_20'],
      ]);
    expect(summary.results.every((result: any) => result.pipeline.aiUsed === false)).toBe(true);
    expect(summary.results.every((result: any) => result.exports.docxBytes > 0 && result.exports.pdfBytes > 0)).toBe(true);
    expect(summary.results.every((result: any) => String(result.exports.finalDocxBlock).startsWith('FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED'))).toBe(true);
    const firstCase = summary.results.find((result: any) => result.caseNumber === '01' && result.draftDepth === 'EXTENSIVE_40');
    const generated = JSON.parse(await readFile(firstCase.files.generatedDocument, 'utf8'));
    const facts = generated.caseAnalysis.facts as Array<{ sourceFact: string }>;
    expect(new Set(facts.map((fact) => fact.sourceFact)).size).toBeGreaterThan(1);
  }, 900_000);
});
