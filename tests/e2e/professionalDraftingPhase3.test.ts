import { describe, expect, it } from 'vitest';
import { runProfessionalDraftingPhase3 } from '../../scripts/audit/run-professional-drafting-phase3';

describe('Fase 3 E2E: seis expedientes y dos profundidades', () => {
  it('produce doce borradores trazables en DOCX/PDF y conserva bloqueada la exportación FINAL', async () => {
    const summary = await runProfessionalDraftingPhase3() as any;

    expect(summary.productionDatabaseExcluded).toBe(true);
    expect(summary.writesToPrisma).toBe(false);
    expect(summary.requestedCaseCount).toBe(6);
    expect(summary.counts.total).toBe(12);
    expect(summary.counts.exportedReviewDrafts).toBe(12);
    expect(summary.counts.docx).toBe(12);
    expect(summary.counts.pdf).toBe(12);
    expect(summary.counts.failed).toBe(0);
    expect(summary.results).toHaveLength(12);
    expect(summary.results.every((result: any) => result.exports.actualPdfPages > 0)).toBe(true);
    expect(summary.counts.qualityPass).toBe(0);
    expect(summary.counts.qualityReviewRequired).toBe(4);
    expect(summary.counts.qualityFail).toBe(8);
    expect(summary.results.every((result: any) => result.quality.qualityGate !== 'PASS')).toBe(true);
    expect(summary.results.filter((result: any) => result.quality.issues.includes('SEMANTIC_DUPLICATION'))).toHaveLength(8);
    expect(summary.results.every((result: any) => result.pipeline.aiUsed === false)).toBe(true);
    expect(summary.results.every((result: any) => result.pipeline.contentStopReason === 'CONTENT_LIMIT_REACHED')).toBe(true);
    expect(summary.results.every((result: any) => String(result.exports.finalDocxBlock).startsWith('FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED'))).toBe(true);
    expect(summary.results.every((result: any) => String(result.exports.finalPdfBlock).startsWith('FINAL_DOCUMENT_MATERIALIZATION_NOT_VERIFIED'))).toBe(true);
  }, 900_000);
});
