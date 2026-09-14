export type ErrorCategory =
  | "quota_exceeded"
  | "rate_limited"
  | "insufficient_credits"
  | "invalid_api_key"
  | "missing_api_key"
  | "timeout"
  | "model_unavailable"
  | "provider_error"
  | "network_error"
  | "bad_request"
  | "unknown";

/**
 * Classifies an error message or exception into a standard error category.
 */
export function classifyError(err: unknown): ErrorCategory {
  if (!err) return "unknown";

  const msg = err instanceof Error ? err.message : String(err);
  const msgLower = msg.toLowerCase();

  // 1. Timeout / Abort
  if (
    msgLower.includes("timeout") ||
    msgLower.includes("abort") ||
    msgLower.includes("exceeded time") ||
    msgLower.includes("timed out")
  ) {
    return "timeout";
  }

  // 2. Missing API Key
  if (
    msgLower.includes("api key missing") ||
    msgLower.includes("api_key missing") ||
    msgLower.includes("no api key") ||
    msgLower.includes("api key no está configurada") ||
    msgLower.includes("missing_api_key")
  ) {
    return "missing_api_key";
  }

  // 3. Network issues
  if (
    msgLower.includes("fetch failed") ||
    msgLower.includes("econnreset") ||
    msgLower.includes("enotfound") ||
    msgLower.includes("econnrefused") ||
    msgLower.includes("network error") ||
    msgLower.includes("failed to fetch")
  ) {
    return "network_error";
  }

  // 4. Parse Status Codes from messages if thrown elsewhere as strings
  if (msgLower.includes("status 429") || msgLower.includes("429")) {
    if (msgLower.includes("quota") || msgLower.includes("cupo")) {
      return "quota_exceeded";
    }
    return "rate_limited";
  }
  if (msgLower.includes("status 402") || msgLower.includes("402")) {
    return "insufficient_credits";
  }
  if (
    msgLower.includes("status 401") ||
    msgLower.includes("status 403") ||
    msgLower.includes("401") ||
    msgLower.includes("403") ||
    msgLower.includes("invalid api key") ||
    msgLower.includes("unauthorized") ||
    msgLower.includes("forbidden")
  ) {
    return "invalid_api_key";
  }
  if (
    msgLower.includes("status 400") ||
    msgLower.includes("400") ||
    msgLower.includes("bad request") ||
    msgLower.includes("invalid_request")
  ) {
    return "bad_request";
  }
  if (
    msgLower.includes("status 503") ||
    msgLower.includes("503") ||
    msgLower.includes("model_unavailable") ||
    msgLower.includes("not available") ||
    msgLower.includes("overloaded")
  ) {
    return "model_unavailable";
  }
  if (
    msgLower.includes("status 500") ||
    msgLower.includes("status 502") ||
    msgLower.includes("status 504") ||
    msgLower.includes("internal server error")
  ) {
    return "provider_error";
  }

  return "unknown";
}

/**
 * Classifies HTTP status and optional error body from a provider response.
 */
export function classifyResponse(status: number, bodyText: string): ErrorCategory {
  const cleanBody = bodyText.toLowerCase();

  if (status === 429) {
    if (cleanBody.includes("quota") || cleanBody.includes("cupo")) {
      return "quota_exceeded";
    }
    return "rate_limited";
  }
  if (status === 402) {
    return "insufficient_credits";
  }
  if (status === 401 || status === 403) {
    return "invalid_api_key";
  }
  if (status === 400) {
    return "bad_request";
  }
  if (status === 503 || cleanBody.includes("overloaded") || cleanBody.includes("unavailable")) {
    return "model_unavailable";
  }
  if (status >= 500) {
    return "provider_error";
  }

  return "unknown";
}

/**
 * Determines if an error category is eligible to proceed to the next fallback provider.
 */
export function isFallbackEligible(category: ErrorCategory): boolean {
  // We proceed to fallback for everything except bad_request.
  return category !== "bad_request";
}
