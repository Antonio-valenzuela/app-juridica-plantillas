import { describe, expect, it } from 'vitest';
import { runVerificationContinuation } from '@/lib/legal-engine/verificationContinuation';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

function documentFixture(): UniversalLegalDocument {
  return {
    id: '4036c1cb-9931-43ee-82c4-4917052cfc52',
    documentType: 'contestacion_revision_amparo_directo',
    documentTypeLabel: 'Contestación',
    matter: 'Amparo',
    jurisdiction: 'Federal',
    status: 'draft',
    sections: [],
    validation: { isValid: false, errors: [], warnings: [] },
    generationMetadata: {
      pipelineState: { isComplete: false, hasErrors: true, currentStage: 'validate' },
    },
  } as unknown as UniversalLegalDocument;
}

describe('verification continuation', () => {
  it('recalculates gates without changing the document id or regenerating pages', () => {
    const input = documentFixture();
    const result = runVerificationContinuation(input);

    expect(result.document.id).toBe(input.id);
    expect(result.regeneratedPages).toBe(false);
    expect((result.document.generationMetadata as any).readiness).toBe('REVIEW_REQUIRED');
    expect((result.document as any).qualityGate).toBeDefined();
  });
});
