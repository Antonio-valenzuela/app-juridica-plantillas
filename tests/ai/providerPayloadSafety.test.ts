import { describe, expect, it } from 'vitest';
import { resolveGeminiOutputTokenLimit, sanitizeGeminiResponseSchema } from '@/lib/ai/providers/gemini';
import { resolveGroqOutputTokenLimit } from '@/lib/ai/providers/groq';

describe('provider payload safety for extended generation', () => {
  it('removes OpenAI-only JSON schema keywords before sending a Gemini schema', () => {
    const sanitized = sanitizeGeminiResponseSchema({
      type: 'OBJECT',
      additionalProperties: false,
      properties: {
        thesis: { type: 'STRING', title: 'ignored' },
      },
    });

    expect(sanitized).not.toHaveProperty('additionalProperties');
    expect((sanitized.properties as any).thesis).not.toHaveProperty('title');
  });

  it('clamps provider output budgets to configured safe ceilings', () => {
    const previousGemini = process.env.GEMINI_MAX_OUTPUT_TOKENS;
    const previousGroq = process.env.GROQ_MAX_OUTPUT_TOKENS;
    process.env.GEMINI_MAX_OUTPUT_TOKENS = '4096';
    process.env.GROQ_MAX_OUTPUT_TOKENS = '1000';
    try {
      expect(resolveGeminiOutputTokenLimit(7000)).toBe(4096);
      expect(resolveGroqOutputTokenLimit(7000)).toBe(1000);
    } finally {
      if (previousGemini === undefined) delete process.env.GEMINI_MAX_OUTPUT_TOKENS;
      else process.env.GEMINI_MAX_OUTPUT_TOKENS = previousGemini;
      if (previousGroq === undefined) delete process.env.GROQ_MAX_OUTPUT_TOKENS;
      else process.env.GROQ_MAX_OUTPUT_TOKENS = previousGroq;
    }
  });
});
