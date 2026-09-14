/**
 * lib/config/timeouts.ts
 *
 * Centralised timeout configuration for the Juridico Radar platform.
 *
 * Every value is driven by an environment variable so operators can tune
 * without touching code.  The fallback value (used in development/test) is
 * listed alongside each variable.
 *
 * A value of 0 disables the timeout for that step.  In production (NODE_ENV
 * === "production") 0 is rejected and the default is used instead to avoid
 * accidentally leaving timeouts disabled in a live environment.
 */

function ms(envVar: string, defaultMs: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return defaultMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMs;
  // In production, a value of 0 disables the guard - not allowed.
  if (parsed === 0 && process.env.NODE_ENV === 'production') return defaultMs;
  return parsed;
}

// ─── Search timeouts ──────────────────────────────────────────────────────────

/**
 * Maximum time (ms) to wait for the local PostgreSQL hybrid search.
 * Default: 3 000 ms
 */
export const LOCAL_SEARCH_MS = ms('TIMEOUT_LOCAL_SEARCH_MS', 3_000);

/**
 * Maximum time (ms) per external official source request.
 * Applied inside searchOfficialSources() per-source AbortController.
 * Default: 1 500 ms
 */
export const PER_SOURCE_MS = ms('TIMEOUT_PER_SOURCE_MS', 1_500);

/**
 * Overall time (ms) budget for the federated external search step.
 * This wraps the entire searchOfficialSources() call.
 * Default: 6 000 ms
 */
export const EXTERNAL_SEARCH_MS = ms('TIMEOUT_EXTERNAL_SEARCH_MS', 6_000);

/**
 * Time (ms) to wait for local version / norma-diff queries.
 * Default: 3 000 ms
 */
export const LOCAL_VERSIONS_MS = ms('TIMEOUT_LOCAL_VERSIONS_MS', 3_000);

/**
 * Time (ms) to wait for weekly-diff queries.
 * Default: 3 000 ms
 */
export const WEEKLY_DIFFS_MS = ms('TIMEOUT_WEEKLY_DIFFS_MS', 3_000);

// ─── AI / LLM timeouts ───────────────────────────────────────────────────────

/**
 * Time (ms) for the LLM query-expansion step.
 * Falls back to static expansion if this times out.
 * Default: 4 000 ms
 */
export const LLM_EXPANSION_MS = ms('TIMEOUT_LLM_EXPANSION_MS', 4_000);

/**
 * Time (ms) for the final AI synthesis / RAG answer step.
 * Default: 5 000 ms
 */
export const AI_SYNTHESIS_MS = ms('TIMEOUT_AI_SYNTHESIS_MS', 5_000);

/**
 * Per-provider timeout used inside the AI router for individual LLM calls.
 * Maps to the existing AI_PROVIDER_TIMEOUT_MS variable.
 * Default: 8 000 ms
 */
export const AI_PROVIDER_MS = ms('AI_PROVIDER_TIMEOUT_MS', 8_000);

/**
 * Hard ceiling for an entire AI operation chain (all providers + retries).
 * Maps to the existing AI_GLOBAL_TIMEOUT_MS variable.
 * Default: 20 000 ms
 */
export const AI_GLOBAL_MS = ms('AI_GLOBAL_TIMEOUT_MS', 20_000);

// ─── Ingest timeouts ──────────────────────────────────────────────────────────

/**
 * Time (ms) to wait when fetching a single DOF / SIDOF page.
 * Default: 10 000 ms
 */
export const INGEST_FETCH_MS = ms('TIMEOUT_INGEST_FETCH_MS', 10_000);

/**
 * Time (ms) allowed for an entire ingest run (all documents from one source).
 * Default: 120 000 ms (2 min)
 */
export const INGEST_RUN_MS = ms('TIMEOUT_INGEST_RUN_MS', 120_000);

// ─── Summary for logging ─────────────────────────────────────────────────────

export const TIMEOUTS = {
  LOCAL_SEARCH_MS,
  PER_SOURCE_MS,
  EXTERNAL_SEARCH_MS,
  LOCAL_VERSIONS_MS,
  WEEKLY_DIFFS_MS,
  LLM_EXPANSION_MS,
  AI_SYNTHESIS_MS,
  AI_PROVIDER_MS,
  AI_GLOBAL_MS,
  INGEST_FETCH_MS,
  INGEST_RUN_MS,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;

export const TIMEOUT_DEFAULTS = {
  SOURCE_FETCH_TIMEOUT_MS: 10000,
  AI_ANALYSIS_TIMEOUT_MS: 30000,
  EXTERNAL_SOURCE_TIMEOUT_MS: 3000,
};

export function getTimeoutMs(name: string, fallback: number): number {
  const envVal = process.env[name];
  if (envVal === undefined || envVal === '') {
    return fallback;
  }
  const parsed = Number(envVal);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  // Permitir 0 solo fuera de producción
  if (parsed === 0 && process.env.NODE_ENV === 'production') {
    return fallback || 1000;
  }
  return parsed;
}
