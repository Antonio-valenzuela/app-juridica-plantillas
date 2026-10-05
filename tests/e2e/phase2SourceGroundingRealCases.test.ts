import { describe, expect, it } from 'vitest';
import { runPhase2SourceGrounding } from '../../scripts/audit/run-phase2-source-grounding';

describe.sequential('FASE 2 E2E source grounding with six real sources', () => {
  it('runs SOURCE -> CLASSIFICATION -> ROUTING -> GENERATION without expected-type injection', async () => {
    const summary = await runPhase2SourceGrounding() as any;

    expect(summary.counts).toMatchObject({
      total: 6,
      passReviewable: 6,
      failed: 0,
      docx: 6,
      pdf: 6,
    });
    expect(summary.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseNumber: '01', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_LABORAL', matter: 'LABORAL', outputDocumentType: 'contestacion_demanda_laboral' }) }),
      expect.objectContaining({ caseNumber: '02', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_LABORAL', matter: 'LABORAL', outputDocumentType: 'contestacion_demanda_laboral' }) }),
      expect.objectContaining({ caseNumber: '03', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_CIVIL', matter: 'CIVIL', outputDocumentType: 'contestacion_demanda_civil' }) }),
      expect.objectContaining({ caseNumber: '04', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_CIVIL', matter: 'FAMILIAR', outputDocumentType: 'contestacion_alimentos' }) }),
      expect.objectContaining({ caseNumber: '05', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_MERCANTIL', matter: 'MERCANTIL', outputDocumentType: 'contestacion_demanda_mercantil' }) }),
      expect.objectContaining({ caseNumber: '06', observed: expect.objectContaining({ sourceDocumentType: 'DEMANDA_LABORAL', matter: 'LABORAL', outputDocumentType: 'contestacion_demanda_laboral' }) }),
    ]));
    for (const result of summary.results) {
      expect(result.classification.passed).toBe(true);
      expect(result.routing.templateSource).toBe('CANONICAL_ID');
      expect(result.provenanceIntegrityGate.name).toBe('PROVENANCE_INTEGRITY_GATE');
      expect(result.provenanceIntegrityGate.status).toBe('REVIEW_REQUIRED');
      expect(result.files.docx).toContain('DRAFT.docx');
      expect(result.files.pdf).toContain('DRAFT.pdf');
    }
  // Six sequential local OCR/generation/DOCX/PDF cases exceeded 180s when
  // run alongside the full regression; this is runtime headroom, not a change
  // to any source, routing, provenance, DRAFT, or FINAL assertion.
  }, 300_000);
});
