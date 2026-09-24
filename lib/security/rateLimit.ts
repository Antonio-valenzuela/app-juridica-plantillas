type RateLimitEntry = {
  count: number;
  timestamp: number;
};

// In-memory store
const memoryStore = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

export function checkRateLimit(
  ip: string,
  limit = MAX_REQUESTS
): { ok: boolean; headers: Record<string, string> } {
  const now = Date.now();
  const entry = memoryStore.get(ip);

  if (!entry || now - entry.timestamp > WINDOW_MS) {
    memoryStore.set(ip, { count: 1, timestamp: now });
    return { ok: true, headers: { "X-RateLimit-Remaining": String(limit - 1) } };
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      headers: { "Retry-After": String(Math.ceil((entry.timestamp + WINDOW_MS - now) / 1000)) },
    };
  }

  entry.count += 1;
  memoryStore.set(ip, entry);

  return { ok: true, headers: { "X-RateLimit-Remaining": String(limit - entry.count) } };
}

export async function checkRateLimitDistributed(
  key: string,
  limit = MAX_REQUESTS
): Promise<{ ok: boolean; headers: Record<string, string> }> {
  // Single-node controlled-pilot implementation. This name remains for API
  // compatibility, but it must not be described as distributed persistence.
  return checkRateLimit(key, limit);
}

export function extractIp(req: Request): string {
  const trustProxy = process.env.TRUST_PROXY?.trim().toLowerCase() === 'true';
  if (!trustProxy) return 'direct-client';
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown-ip";
}

export function checkRequestRateLimit(
  request: Request,
  scope: string,
  limit: number,
  subject?: string,
): { ok: boolean; headers: Record<string, string> } {
  const identity = subject?.trim() || extractIp(request);
  return checkRateLimit(`${scope}:${identity}`, limit);
}
