import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { writeGenerationTraceArtifacts } from '@/lib/legal-engine/generationTraceReports';
import { createEmptyDocument } from '@/lib/legal-engine/types';

describe('generation trace reports', () => {
  it('writes JSON and Markdown without secrets', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'generation-trace-'));
    try {
      const doc = createEmptyDocument({ id: 'doc-report' });
      const context = createGenerationTraceContext({ doc, options: { enabled: true } });
      context.addWarning('NVIDIA_API_KEY=nvapi-secret');
      const trace = context.close();
      const files = await writeGenerationTraceArtifacts(trace, { outputDir, writeMarkdown: true });
      const json = await readFile(files.jsonPath, 'utf8');
      const md = await readFile(files.markdownPath!, 'utf8');
      expect(JSON.parse(json).generationId).toBe(trace.generationId);
      expect(json + md).not.toMatch(/nvapi-secret|NVIDIA_API_KEY=/i);
      expect(md).toContain('## SOURCE');
      expect(md).toContain('## DOCX EXPORT');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
