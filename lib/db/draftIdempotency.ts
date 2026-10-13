import { createHash } from 'node:crypto';

/**
 * Clave de idempotencia del guardado de un borrador.
 *
 * Prioridad: header `Idempotency-Key` → campo `idempotencyKey` del cuerpo → id del
 * documento estructurado. El id del documento es estable entre reintentos del
 * editor (una generación nueva produce otro id), así que reenviar el mismo
 * documento actualiza el borrador existente en lugar de duplicarlo.
 */
export function resolveDraftIdempotencyKey(
  headers: Headers,
  body: unknown,
  structuredDoc: unknown,
): string | null {
  const candidates = [
    headers.get('idempotency-key'),
    body && typeof body === 'object' ? (body as { idempotencyKey?: unknown }).idempotencyKey : null,
    structuredDoc && typeof structuredDoc === 'object' ? (structuredDoc as { id?: unknown }).id : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && candidate.trim().length <= 200) return candidate.trim();
  }
  return null;
}

/** UUID determinista (formato v4/variant RFC 4122) derivado de una clave. */
export function deterministicUuidFromKey(key: string): string {
  const hex = createHash('sha256').update(`lexplantillas:draft:${key}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
