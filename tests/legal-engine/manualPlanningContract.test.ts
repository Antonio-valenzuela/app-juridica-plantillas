import { it, expect } from 'vitest';
import { controlledSource } from '@/tests/fixtures/controlledLegalQuality';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
it('records bounded manual planning retrieval even when substantive tasks are blocked', async () => {
  const source: UploadedSourceDocument = controlledSource('contestacion');
  const doc = await runGenerationPipeline({ selectedDocumentType: 'contestacion_demanda_civil', matter: 'civil', sourceDocuments: [source], flow: 'DOCUMENT_ANALYSIS', externalProviderOptIn: false, userInstruction: 'Preparar contestación de demanda sin inventar postura.', traceOptions: { enabled: true } });
  const retrieval = doc.generationMetadata.operationalManual?.retrievals.find(r => r.retrievalStage === 'DOCUMENT_PLAN');
  expect(retrieval).toBeDefined();
  expect(retrieval!.selectedRuleIds.length).toBeGreaterThan(0);
  expect((retrieval as unknown as { contextCharacters: number }).contextCharacters).toBeLessThanOrEqual(4500);
  expect((retrieval as unknown as { categories: string[] }).categories.length).toBeGreaterThan(0);
  expect(doc.generationMetadata.operationalManual?.manualVersion).toBe('1.0');
  expect(doc.generationMetadata.verifiedAuthorities || []).toHaveLength(0);
  expect((doc.generationMetadata as typeof doc.generationMetadata & { readiness: string }).readiness).toBe('REVIEW_REQUIRED');
}, 60000);
