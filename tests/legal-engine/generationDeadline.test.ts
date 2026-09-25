import { describe, expect, it, afterEach } from 'vitest';
import { getGenerationJobDeadlineMs } from '@/lib/legal-engine/generationDeadline';

describe('generation job deadline', () => {
  afterEach(() => {
    delete process.env.GENERATION_JOB_DEADLINE_MS;
  });

  it('gives extended legal generation enough time for bounded page expansion', () => {
    expect(getGenerationJobDeadlineMs({ generationMode: 'extended-legal' })).toBe(25 * 60 * 1000);
  });

  it('keeps the standard generation deadline at fifteen minutes', () => {
    expect(getGenerationJobDeadlineMs({ generationMode: 'standard' })).toBe(15 * 60 * 1000);
  });

  it('honors an explicit configured deadline for either mode', () => {
    process.env.GENERATION_JOB_DEADLINE_MS = '900000';
    expect(getGenerationJobDeadlineMs({ generationMode: 'extended-legal' })).toBe(900000);
  });
});
