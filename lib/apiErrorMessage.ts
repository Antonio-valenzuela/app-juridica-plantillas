type ApiErrorPayload = {
  errorCode?: unknown;
  message?: unknown;
  friendlyMessage?: unknown;
  error?: unknown;
};

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  GENERATION_CAPACITY_UNAVAILABLE: 'La capacidad de generación no está disponible.',
};

export function getSafeApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;

  const candidate = payload as ApiErrorPayload;
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }

  if (typeof candidate.friendlyMessage === 'string' && candidate.friendlyMessage.trim()) {
    return candidate.friendlyMessage.trim();
  }

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error.trim();
  }

  if (typeof candidate.errorCode === 'string') {
    return SAFE_ERROR_MESSAGES[candidate.errorCode] || fallback;
  }

  return fallback;
}
