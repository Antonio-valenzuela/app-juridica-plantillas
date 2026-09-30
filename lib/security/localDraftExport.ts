export const UNSAVED_DRAFT_EXPORT_HEADER = 'x-unsaved-draft-export';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

/**
 * Allows transient draft export only from the browser origin served locally.
 * It intentionally rejects remote hosts, missing Origin headers, and proxies
 * that make the request and browser origins differ.
 */
export function isLocalSameOriginDraftExportRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    return requestUrl.protocol === 'http:'
      && originUrl.protocol === 'http:'
      && requestUrl.origin === originUrl.origin
      && isLoopbackHostname(requestUrl.hostname);
  } catch {
    return false;
  }
}
