import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('undici', () => ({ fetch: fetchMock }));

import { generateGeminiCompletion } from '@/lib/ai/providers/gemini';
import { generateGroqCompletion } from '@/lib/ai/providers/groq';
import { generateNVIDIACompletion } from '@/lib/ai/providers/nvidia';

const originalEnv = { ...process.env };
const privateBodySentinel = 'PRIVATE_SOURCE_SENTINEL_MUST_NOT_APPEAR';

describe('provider adapter error privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GROQ_API_KEY = 'test-key';
    process.env.NVIDIA_API_KEY = 'test-key';
    fetchMock.mockResolvedValue(new Response(privateBodySentinel, { status: 503, headers: { 'x-request-id': 'request-safe-id' } }));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it.each([
    ['Gemini', () => generateGeminiCompletion({ prompt: 'offline test' })],
    ['Groq', () => generateGroqCompletion({ prompt: 'offline test' })],
    ['NVIDIA', () => generateNVIDIACompletion({ prompt: 'offline test' })],
  ])('%s records only status and request id for HTTP errors', async (_provider, invoke) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let thrown: unknown;
    try { await invoke(); } catch (error) { thrown = error; }

    const logs = errorLog.mock.calls.flat().map(String).join(' ');
    expect(thrown).toBeInstanceOf(Error);
    expect(logs).toContain('503');
    expect(logs).toContain('request-safe-id');
    expect(logs).not.toContain(privateBodySentinel);
    expect((thrown as Error).message).toContain('request-safe-id');
    expect((thrown as Error).message).not.toContain(privateBodySentinel);
    expect(logs).not.toContain('statusText');
    expect(logs).not.toContain('endpoint');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
