import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLexPlantillasStoragePaths } from '@/lib/workspace/storagePaths';

/**
 * Registro local de envíos a proveedores de IA en la nube (Groq, NVIDIA, Gemini).
 *
 * Una línea por intento HTTP autorizado: proveedor, modelo, operación, consentimiento, caracteres enviados y
 * recibidos, resultado y latencia. NUNCA guarda el contenido enviado, nombres de archivo, partes ni
 * expedientes: sirve para controlar QUÉ VOLUMEN salió, CUÁNDO y A QUIÉN, no para reconstruirlo.
 * Vive junto a los datos del usuario (no en temporales) y no usa la base de datos.
 */

export type ExternalEgressChannel = 'llm' | 'image_parse';

export interface ExternalEgressRecord {
  version: 1;
  at: string;
  requestId: string | null;
  provider: string;
  model: string | null;
  /** Operación declarada por quien llama (p. ej. tipo de tarea del motor); nunca texto del expediente. */
  operation: string;
  channel: ExternalEgressChannel;
  attempt: number;
  /** Solo se registra lo que se envió con consentimiento explícito de la solicitud en curso. */
  consent: 'EXPLICIT_PER_REQUEST';
  charsSent: number;
  charsReceived: number;
  outcome: 'OK' | 'ERROR';
  errorCode: string | null;
  latencyMs: number;
}

const MEMORY_LIMIT = 500;
const memory: ExternalEgressRecord[] = [];

export function resolveExternalEgressLedgerPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.LEX_EXTERNAL_EGRESS_LEDGER_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  // Las pruebas nunca escriben en la carpeta de datos real del usuario.
  if (env.NODE_ENV === 'test' || env.VITEST) return null;
  return path.join(resolveLexPlantillasStoragePaths().logs, 'external-ai-egress.ndjson');
}

const OPERATION_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** La operación es una etiqueta técnica; cualquier otra cosa se descarta para no filtrar texto del caso. */
export function safeOperationLabel(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return OPERATION_RE.test(text) ? text : 'sin_etiqueta';
}

export async function recordExternalEgress(entry: Omit<ExternalEgressRecord, 'version' | 'at' | 'consent'> & { at?: string }): Promise<void> {
  const record: ExternalEgressRecord = {
    version: 1,
    at: entry.at || new Date().toISOString(),
    requestId: entry.requestId ? String(entry.requestId).slice(0, 80) : null,
    provider: entry.provider,
    model: entry.model ? String(entry.model).slice(0, 120) : null,
    operation: safeOperationLabel(entry.operation),
    channel: entry.channel,
    attempt: entry.attempt,
    consent: 'EXPLICIT_PER_REQUEST',
    charsSent: Math.max(0, Math.round(entry.charsSent || 0)),
    charsReceived: Math.max(0, Math.round(entry.charsReceived || 0)),
    outcome: entry.outcome,
    errorCode: entry.errorCode ? String(entry.errorCode).slice(0, 80) : null,
    latencyMs: Math.max(0, Math.round(entry.latencyMs || 0)),
  };
  memory.push(record);
  if (memory.length > MEMORY_LIMIT) memory.splice(0, memory.length - MEMORY_LIMIT);
  const file = resolveExternalEgressLedgerPath();
  if (!file) return;
  try {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    // El registro nunca interrumpe la generación; el fallo queda en consola sin datos del caso.
    console.warn('[externalEgressLedger] no se pudo escribir el registro local', (error as NodeJS.ErrnoException)?.code || 'ERROR');
  }
}

/** Solo para pruebas y diagnósticos en proceso. */
export function recentExternalEgressInMemory(): readonly ExternalEgressRecord[] {
  return memory;
}

export function clearExternalEgressMemory(): void {
  memory.length = 0;
}

export async function readExternalEgressLedger(file = resolveExternalEgressLedgerPath()): Promise<ExternalEgressRecord[]> {
  if (!file) return [...memory];
  let raw = '';
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw error;
  }
  const records: ExternalEgressRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as ExternalEgressRecord;
      if (parsed?.version === 1 && typeof parsed.at === 'string' && typeof parsed.provider === 'string') records.push(parsed);
    } catch { /* línea dañada: se ignora */ }
  }
  return records;
}

export interface ExternalEgressSummary {
  rangeDays: number;
  ledgerAvailable: boolean;
  totals: { attempts: number; ok: number; errors: number; charsSent: number; charsReceived: number; operations: number };
  byProvider: Array<{ provider: string; attempts: number; ok: number; errors: number; charsSent: number }>;
  byOperation: Array<{ operation: string; attempts: number }>;
  recent: Array<Pick<ExternalEgressRecord, 'at' | 'provider' | 'model' | 'operation' | 'channel' | 'outcome' | 'errorCode' | 'charsSent' | 'charsReceived' | 'latencyMs'>>;
}

export function summarizeExternalEgress(records: readonly ExternalEgressRecord[], rangeDays: number, now = new Date()): ExternalEgressSummary {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  start.setUTCHours(0, 0, 0, 0);
  const inRange = records.filter((record) => {
    const time = Date.parse(record.at);
    return Number.isFinite(time) && time >= start.getTime() && time <= now.getTime();
  });
  const providers = new Map<string, ExternalEgressSummary['byProvider'][number]>();
  const operations = new Map<string, number>();
  const requests = new Set<string>();
  for (const record of inRange) {
    const provider = providers.get(record.provider) || { provider: record.provider, attempts: 0, ok: 0, errors: 0, charsSent: 0 };
    provider.attempts += 1;
    if (record.outcome === 'OK') provider.ok += 1; else provider.errors += 1;
    provider.charsSent += record.charsSent;
    providers.set(record.provider, provider);
    operations.set(record.operation, (operations.get(record.operation) || 0) + 1);
    requests.add(record.requestId || `${record.at}:${record.provider}`);
  }
  const ok = inRange.filter((record) => record.outcome === 'OK').length;
  return {
    rangeDays,
    ledgerAvailable: true,
    totals: {
      attempts: inRange.length,
      ok,
      errors: inRange.length - ok,
      charsSent: inRange.reduce((sum, record) => sum + record.charsSent, 0),
      charsReceived: inRange.reduce((sum, record) => sum + record.charsReceived, 0),
      operations: requests.size,
    },
    byProvider: [...providers.values()].sort((a, b) => b.attempts - a.attempts),
    byOperation: [...operations.entries()].map(([operation, attempts]) => ({ operation, attempts })).sort((a, b) => b.attempts - a.attempts),
    recent: [...inRange].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map(({ at, provider, model, operation, channel, outcome, errorCode, charsSent, charsReceived, latencyMs }) => ({ at, provider, model, operation, channel, outcome, errorCode, charsSent, charsReceived, latencyMs })),
  };
}
