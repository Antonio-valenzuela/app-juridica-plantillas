const STANDARD_GENERATION_JOB_DEADLINE_MS = 15 * 60 * 1000;
const EXTENDED_GENERATION_JOB_DEADLINE_MS = 25 * 60 * 1000;

export function getGenerationJobDeadlineMs(generationExtension?: { generationMode?: string } | null): number {
  const configured = Number(process.env.GENERATION_JOB_DEADLINE_MS);
  if (Number.isFinite(configured) && configured >= 60_000) {
    return Math.floor(configured);
  }

  return generationExtension?.generationMode === 'extended-legal'
    ? EXTENDED_GENERATION_JOB_DEADLINE_MS
    : STANDARD_GENERATION_JOB_DEADLINE_MS;
}
