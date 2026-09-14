import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { syntheticContestacionInput } from '../fixtures/generationTraceSyntheticCase';

describe('generation trace controlled runs', () => {
  let outputDir = '';
  let previousKey: string | undefined;
  let previousRealTest: string | undefined;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'generation-trace-e2e-'));
    previousKey = process.env.NVIDIA_API_KEY;
    previousRealTest = process.env.NVIDIA_REAL_TEST;
    process.env.NVIDIA_API_KEY = '';
    process.env.NVIDIA_REAL_TEST = 'false';
  });

  afterEach(async () => {
    if (previousKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousKey;
    if (previousRealTest === undefined) delete process.env.NVIDIA_REAL_TEST;
    else process.env.NVIDIA_REAL_TEST = previousRealTest;
    await rm(outputDir, { recursive: true, force: true });
  });

  it('runs the synthetic case without NVIDIA and records fallback truthfully', async () => {
    const doc = await runGenerationPipeline({
      ...syntheticContestacionInput(),
      generationId: 'generation-fallback-synthetic',
      traceOptions: { enabled: true, outputDir, writeMarkdown: true },
    });
    const trace = doc.generationMetadata.auditTrace!;
    expect(trace.providerRequested).toBe('NVIDIA');
    expect(['LOCAL', 'NONE']).toContain(trace.providerActuallyUsed);
    expect(trace.providerFallbackReason).toBeTruthy();
    expect(trace.generationTasks.some((task) => task.origin !== 'AI_GENERATED_LEGAL_CONTENT')).toBe(true);
    expect(trace.coverageMatrixAfterGeneration?.items.some((item) => item.reason === 'NO_GENERATED_BLOCK')).toBe(true);
    const json = await readFile(join(outputDir, 'generation-trace-generation-fallback-synthetic.json'), 'utf8');
    const markdown = await readFile(join(outputDir, 'generation-report-generation-fallback-synthetic.md'), 'utf8');
    expect(json).toContain('generation-fallback-synthetic');
    expect(markdown).toContain('## FALLBACKS');
    expect(json + markdown).not.toMatch(/NVIDIA_API_KEY=|nvapi-/i);
  });

  it.skipIf(!process.env.NVIDIA_API_KEY)('does not simulate NVIDIA when the key is absent', async () => {
    const doc = await runGenerationPipeline({
      ...syntheticContestacionInput(),
      generationId: 'generation-nvidia-real-synthetic',
      traceOptions: { enabled: true, outputDir, writeMarkdown: true },
    });
    expect(doc.generationMetadata.auditTrace!.providerActuallyUsed).toBe('NVIDIA');
  });
});
