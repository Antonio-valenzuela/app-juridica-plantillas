/**
 * lib/logger.ts
 * Logger estructurado P0 — sin secretos, sin documentos completos.
 * Campos: requestId, jobId, userId, organizationId, provider, operation, duration, status, error
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  requestId?: string | null;
  jobId?: string | null;
  userId?: string | null;
  organizationId?: string | null;
  provider?: string | null;
  model?: string | null;
  operation?: string | null;
  durationMs?: number | null;
  status?: string | null;
  errorCode?: string | null;
  message: string;
  // Nunca incluir: api keys, documentos completos, secrets, PII innecesaria
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '[unstringifiable]';
  }
}

function log(level: LogLevel, fields: Omit<StructuredLog, 'timestamp' | 'level'>): void {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    ...fields,
  };
  // Sanitizar: eliminar posibles secrets si alguien los pasa por error
  const sanitized = safeStringify(entry)
    .replace(/nvapi-[^\s"']+/gi, '[REDACTED]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
  if (level === 'error') console.error(sanitized);
  else if (level === 'warn') console.warn(sanitized);
  else console.log(sanitized);
}

export const logger = {
  info: (msg: string, fields: Omit<StructuredLog, 'timestamp' | 'level' | 'message'> = {}) => log('info', { ...fields, message: msg }),
  warn: (msg: string, fields: Omit<StructuredLog, 'timestamp' | 'level' | 'message'> = {}) => log('warn', { ...fields, message: msg }),
  error: (msg: string, fields: Omit<StructuredLog, 'timestamp' | 'level' | 'message'> = {}) => log('error', { ...fields, message: msg }),
  debug: (msg: string, fields: Omit<StructuredLog, 'timestamp' | 'level' | 'message'> = {}) => log('debug', { ...fields, message: msg }),
};

export function generateRequestId(): string {
  try {
    return (globalThis as any).crypto?.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function sanitizeForLog(text: string, maxLen = 200): string {
  if (!text) return '';
  return text.slice(0, maxLen).replace(/\s+/g, ' ').trim();
}
