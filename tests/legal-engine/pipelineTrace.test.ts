import { describe, expect, it } from 'vitest';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

describe('pipeline generation trace', () => {
  it('attaches one closed audit trace with sanitized snapshots and common generationId', async () => {
    const document = await runGenerationPipeline({
      generationId: 'generation-trace-test',
      traceOptions: { enabled: true },
      flow: 'NEW_WRITING',
      matter: 'civil',
      documentTypeLabel: 'Escrito libre',
      userInstruction: 'Preparar escrito de revisión estructural',
      generateSection: async () => 'Contenido de sección para verificación.',
    });

    const trace = document.generationMetadata.auditTrace;
    expect(trace).toBeDefined();
    expect(trace?.generationId).toBe('generation-trace-test');
    expect(trace?.completedAt).toBeDefined();
    expect(trace?.caseAnalysisSnapshot).toBeDefined();
    expect(trace?.documentPlanSnapshot?.sections.length).toBeGreaterThan(0);
    expect(trace?.coverageMatrixBeforeGeneration).toBeDefined();
    expect(trace?.coverageMatrixAfterGeneration).toBeDefined();
    expect(document.generationMetadata.generationId).toBe('generation-trace-test');
  });
});
