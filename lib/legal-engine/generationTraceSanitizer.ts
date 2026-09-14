import type { UniversalLegalDocument } from './types';

const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|password|secret|cookie|credential|private[_-]?key)/i;
const SECRET_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/nvapi-[A-Za-z0-9._-]+/gi, '[REDACTED]'],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
  [/https?:\/\/[^/\s:]+:[^@\s]+@/gi, 'https://[REDACTED]@'],
  [/(api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]'],
];

function redactString(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
}

/**
 * Sanitiza valores antes de guardarlos en un trace. Las claves sensibles se
 * eliminan por completo; los valores de texto se redactan por patrón.
 */
export function sanitizeTraceValue(value: unknown, keyHint?: string): unknown {
  if (keyHint && SECRET_KEY_PATTERN.test(keyHint)) return undefined;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeTraceValue(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      const sanitized = sanitizeTraceValue(child, key);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  }
  return String(value);
}

/**
 * Quita únicamente el trace transitorio del documento que va a persistirse.
 * El objeto de entrada y su metadata restante permanecen intactos.
 */
export function stripTransientAuditTrace<T extends UniversalLegalDocument>(doc: T): T {
  return {
    ...doc,
    generationMetadata: {
      ...doc.generationMetadata,
      auditTrace: undefined,
    },
  };
}
