import { afterEach, describe, expect, it } from 'vitest';
import { runFastMode } from '@/lib/ai/orchestrator';
import { LocalProvider } from '@/lib/ai/providers/local';

const originalKey = process.env.NVIDIA_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = originalKey;
});

describe('provider trace semantics', () => {
  it('records requested NVIDIA and actual LOCAL when the key is absent', async () => {
    delete process.env.NVIDIA_API_KEY;
    const result = await runFastMode({ userMessage: 'contenido jurídico', mode: 'fast' });

    expect(result.providerRequested).toBe('nvidia');
    expect(result.providerActuallyUsed).toBe('local');
    expect(result.model).toBe('local-deterministic-rules-v1');
    expect(result.fallbackReason).toBe('NVIDIA_NO_API_KEY');
    expect(result.origin).toBe('LOCAL_PLACEHOLDER');
    expect(result.isLegalAiContent).toBe(false);
  });

  it('never reports LocalProvider as complete AI legal content', async () => {
    const result = await new LocalProvider().generate({ userMessage: 'expediente 123' });

    expect(result.origin).toBe('LOCAL_PLACEHOLDER');
    expect(result.isLegalAiContent).toBe(false);
    expect(result.model).toBe('local-deterministic-rules-v1');
  });
});
