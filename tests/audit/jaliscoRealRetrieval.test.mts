import { it } from 'vitest';

// Explicit opt-in only. This retrieves one real norm; it never calls an LLM.
it.skipIf(process.env.REAL_JALISCO_RETRIEVAL !== '1')('retrieves and verifies the real Jalisco source through the existing research contract', async () => {
  await import('../../scripts/audit/verify-jalisco-official-research.mts');
}, 120000);
