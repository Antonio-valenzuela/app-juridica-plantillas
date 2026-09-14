import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch, type Response as UndiciResponse } from 'undici';
import {
  generateNVIDIACompletion,
  type NVIDIACompletionOptions,
} from '@/lib/ai/providers/nvidia';

vi.mock('undici', () => ({ fetch: vi.fn() }));

const mockedFetch = vi.mocked(fetch);

describe('NVIDIA structured output transport', () => {
  const previousApiKey = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = 'test-nvidia-key';
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: '{"candidates":[]}' }, finish_reason: 'stop' }],
      }),
      text: async () => '',
    } as UndiciResponse);
  });

  afterEach(() => {
    if (previousApiKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = previousApiKey;
  });

  it('serializes outputSchema as strict json_schema response_format', async () => {
    const outputSchema = {
      type: 'object',
      required: ['candidates'],
      properties: { candidates: { type: 'array' } },
      additionalProperties: false,
    };

    await generateNVIDIACompletion({
      prompt: 'controlled prompt',
      outputSchema,
    } as NVIDIACompletionOptions & { outputSchema: Record<string, unknown> });

    const requestInit = mockedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body));

    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'nvidia_structured_output',
        strict: true,
        schema: outputSchema,
      },
    });
  });

  it('preserves the legacy body when no outputSchema is requested', async () => {
    await generateNVIDIACompletion({ prompt: 'legacy prompt' });

    const requestInit = mockedFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(requestInit?.body));

    expect(body).not.toHaveProperty('response_format');
  });

  it('preserves HTTP status on a failed structured-output request', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({}),
      text: async () => 'structured output unsupported',
    } as UndiciResponse);

    await expect(generateNVIDIACompletion({ prompt: 'structured prompt' })).rejects.toMatchObject({
      httpStatus: 400,
    });
  });

  it('reports raw response characters before trimming content', async () => {
    const rawText = ' {"candidates":[]} ';
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        choices: [{ message: { content: rawText }, finish_reason: 'stop' }],
      }),
      text: async () => '',
    } as UndiciResponse);

    const result = await generateNVIDIACompletion({ prompt: 'structured prompt' });

    expect(result.httpStatus).toBe(200);
    expect(result.rawChars).toBe(rawText.length);
  });

  it('preserves HTTP status when the response envelope is not JSON', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => { throw new Error('invalid response envelope'); },
      text: async () => 'not-json',
    } as unknown as UndiciResponse);

    await expect(generateNVIDIACompletion({ prompt: 'structured prompt' })).rejects.toMatchObject({
      httpStatus: 200,
    });
  });
});
