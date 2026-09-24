import { describe, expect, it } from 'vitest';
import { createDocumentNode, createEmptyDocument } from '@/lib/legal-engine/types';
import { markDocumentAsReviewRequired } from '@/lib/legal-engine/documentLifecycle';
import { ExportGuardError, prepareUniversalDocumentForExport } from '@/lib/legal-engine/exportGuards';

function reviewDocument() {
  const base = createEmptyDocument({
    id: 'review-override-regression',
    documentType: 'escrito_libre',
    sections: [
      createDocumentNode({
        id: 'body',
        title: 'Contenido',
        type: 'argument',
        content: [{ id: 'body-1', text: 'Borrador para revisión profesional.' } as any],
      }),
    ],
  });
  return markDocumentAsReviewRequired({
    ...base,
    qualityGate: { passed: false, canMarkAsFinal: false, criticalErrors: [], warnings: [] },
  } as any);
}

describe('explicit review export override', () => {
  it('still blocks a normal export while review is required', async () => {
    await expect(prepareUniversalDocumentForExport(reviewDocument())).rejects.toBeInstanceOf(ExportGuardError);
  });

  it('allows an explicitly requested review export without promoting lifecycle readiness', async () => {
    const prepared = await prepareUniversalDocumentForExport(reviewDocument(), { allowReviewOverride: true });
    expect(prepared.reviewOverrideApplied).toBe(true);
    expect(prepared.reviewOverrideWarnings.some((warning) => warning.includes('REVIEW_EXPORT_OVERRIDE'))).toBe(true);
  });

  it('does not bypass an empty document with the review override', async () => {
    const empty = reviewDocument();
    empty.sections = [];
    await expect(prepareUniversalDocumentForExport(empty, { allowReviewOverride: true })).rejects.toBeInstanceOf(ExportGuardError);
  });
});
