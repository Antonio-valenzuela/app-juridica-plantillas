export const ADMIN_TOKEN_STORAGE_KEY = 'juridico_admin_token';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAdminToken(): string {
  try {
    const stored = storage()?.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // storage unavailable
  }
  return 'dev-admin-token';
}

export function setAdminToken(value: unknown): string {
  const token = typeof value === 'string' ? value.trim() : '';
  const store = storage();

  try {
    if (store) {
      if (token) store.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      else store.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }

  return token;
}

export function clearAdminToken(): void {
  setAdminToken('');
}

export function getAdminTokenHeaders(
  init: Record<string, string> = {},
  explicitToken?: unknown,
): Record<string, string> {
  const headers = { ...init };
  const token = typeof explicitToken === 'string' ? explicitToken.trim() : getAdminToken();

  if (token) headers['x-admin-token'] = token;
  return headers;
}

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const tokenHeaders = getAdminTokenHeaders(Object.fromEntries(headers.entries()));
  Object.entries(tokenHeaders).forEach(([key, value]) => headers.set(key, value));
  const method = (init.method || 'GET').toUpperCase();
  const browserManagedBody = typeof FormData !== 'undefined' && init.body instanceof FormData
    || typeof Blob !== 'undefined' && init.body instanceof Blob
    || typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams;
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type') && !browserManagedBody) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearAdminToken();
    throw new Error('ADMIN_TOKEN_REQUIRED');
  }
  return response;
}
