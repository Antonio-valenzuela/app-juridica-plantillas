/**
 * generationLock.ts — Control de Duplicados / Idempotencia
 *
 * Evita que la misma solicitud POST /api/legal-engine/generate se ejecute
 * dos veces simultáneamente (doble-click, retry, etc.).
 *
 * Usa idempotencyKey o fingerprint de la solicitud.
 * Almacenamiento en memoria (suficiente para instancias single-node; si hay
 * varias réplicas, el cliente debe usar idempotencyKey HTTP).
 */
import { createHash, randomUUID as nodeRandomUUID } from 'crypto';

export interface LockEntry {
  key: string;
  startedAt: number;
  generationId: string;
}

const LOCK_TTL_MS = 90_000; // 90s — supera el timeout de sección (15s) + margen
// Mapa global para sobrevivir HMR (misma razón que generationJobs)
const globalForLocks = globalThis as unknown as { __JR_LOCKS_MAP__?: Map<string, LockEntry> };
if (!globalForLocks.__JR_LOCKS_MAP__) globalForLocks.__JR_LOCKS_MAP__ = new Map<string, LockEntry>();
const locks = globalForLocks.__JR_LOCKS_MAP__;

function cleanupExpired(): void {
  const now = Date.now();
  for (const [k, v] of locks.entries()) {
    if (now - v.startedAt > LOCK_TTL_MS) locks.delete(k);
  }
}

export function buildFingerprint(input: {
  sourceIds?: string[];
  userInstruction?: string;
  matter?: string;
  jurisdiction?: string;
  documentType?: string;
  documentTypeLabel?: string;
  referenceDocumentId?: string;
  expediente?: string;
  partiesHash?: string;
}): string {
  const payload = JSON.stringify({
    ids: (input.sourceIds || []).sort(),
    prompt: (input.userInstruction || '').trim().slice(0, 500),
    matter: (input.matter || '').trim().toLowerCase(),
    jurisdiction: (input.jurisdiction || '').trim().toLowerCase(),
    docType: (input.documentType || '').trim().toLowerCase(),
    docTypeLabel: (input.documentTypeLabel || '').trim().toLowerCase(),
    refId: input.referenceDocumentId || '',
    expediente: (input.expediente || '').trim(),
    partiesHash: input.partiesHash || '',
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function tryAcquireGenerationLock(key: string): { acquired: boolean; existing?: LockEntry; generationId: string } {
  cleanupExpired();
  const existing = locks.get(key);
  if (existing) {
    // Si ya hay una generación en curso para esta key, no permitir duplicado
    return { acquired: false, existing, generationId: existing.generationId };
  }
  const entry: LockEntry = { key, startedAt: Date.now(), generationId: ((globalThis as any).crypto?.randomUUID?.() || nodeRandomUUID()) };
  locks.set(key, entry);
  return { acquired: true, generationId: entry.generationId };
}

export function releaseGenerationLock(key: string): void {
  locks.delete(key);
}

export function isGenerationLocked(key: string): boolean {
  cleanupExpired();
  return locks.has(key);
}
