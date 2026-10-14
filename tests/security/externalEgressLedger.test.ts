import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProviderRouter } from '@/lib/ai/providerRouter';
import {
  clearExternalEgressMemory,
  readExternalEgressLedger,
  recentExternalEgressInMemory,
  recordExternalEgress,
  safeOperationLabel,
  summarizeExternalEgress,
} from '@/lib/ai/externalEgressLedger';
import type { AIProviderId, AIProviderResult, AIRequest, LegalAIProvider } from '@/lib/ai/providers/types';

/**
 * Métrica «Envíos a IA en la nube»: cada intento autorizado queda registrado con su volumen y resultado,
 * nunca con el contenido. Expediente sintético, proveedores simulados, sin red ni claves.
 */
const SYNTHETIC_CASE = 'EXPEDIENTE SINTÉTICO 0000/2099. Parte actora: PERSONA FICTICIA UNO. Hecho 1: dato inventado.';
const SYSTEM = 'Instrucción de sistema sintética.';

function provider(id: AIProviderId, behaviour: 'ok' | 'fail' | 'throw'): LegalAIProvider {
  return {
    id,
    isAvailable: async () => true,
    generate: async (): Promise<AIProviderResult> => {
      if (behaviour === 'throw') throw new Error('timeout simulado');
      if (behaviour === 'fail') return { provider: id, model: `${id}-simulado`, success: false, content: '', latencyMs: 1, errorCode: `${id.toUpperCase()}_HTTP_429` };
      return { provider: id, model: `${id}-simulado`, success: true, content: 'Respuesta simulada.', latencyMs: 1 };
    },
  };
}

function router(behaviours: Partial<Record<AIProviderId, 'ok' | 'fail' | 'throw'>>, chain: string[]) {
  const map = new Map<AIProviderId, LegalAIProvider>((['groq', 'nvidia', 'gemini', 'local'] as AIProviderId[]).map((id) => [id, provider(id, behaviours[id] ?? 'ok')]));
  return new ProviderRouter(map, () => chain);
}

const request = (extra: Partial<AIRequest> = {}): AIRequest => ({ userMessage: SYNTHETIC_CASE, systemPrompt: SYSTEM, purpose: 'LEGAL_GENERATION', taskType: 'FACT_RESPONSE', requestId: 'req-sintetico-1', ...extra });

describe('registro de envíos a IA en la nube', () => {
  beforeEach(() => clearExternalEgressMemory());

  it('sin consentimiento: ninguna salida y ningún registro', async () => {
    await router({}, ['groq', 'nvidia', 'local']).route(request());
    expect(recentExternalEgressInMemory()).toHaveLength(0);
  });

  it('con consentimiento: registra cada intento remoto (fallo + respaldo), sin contenido', async () => {
    const result = await router({ groq: 'fail', nvidia: 'ok' }, ['groq', 'nvidia', 'local']).route(request({ externalProviderOptIn: true }));
    expect(result.result.providerActuallyUsed).toBe('nvidia');
    const records = recentExternalEgressInMemory();
    expect(records.map((record) => [record.provider, record.outcome])).toEqual([['groq', 'ERROR'], ['nvidia', 'OK']]);
    expect(records[0]).toMatchObject({ consent: 'EXPLICIT_PER_REQUEST', operation: 'FACT_RESPONSE', channel: 'llm', errorCode: 'GROQ_HTTP_429', requestId: 'req-sintetico-1' });
    expect(records[1].charsSent).toBe(SYNTHETIC_CASE.length + SYSTEM.length);
    expect(records[1].charsReceived).toBe('Respuesta simulada.'.length);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('PERSONA FICTICIA');
    expect(serialized).not.toContain('SINTÉTICO 0000/2099');
    expect(serialized).not.toContain('Instrucción de sistema');
  });

  it('registra reintentos de un tiempo agotado y nunca registra el respaldo local', async () => {
    await router({ groq: 'throw' }, ['groq', 'local']).route(request({ externalProviderOptIn: true, maxProviderRetries: 1 }));
    const records = recentExternalEgressInMemory();
    expect(records.map((record) => `${record.provider}#${record.attempt}:${record.errorCode}`)).toEqual(['groq#1:GROQ_TIMEOUT', 'groq#2:GROQ_TIMEOUT']);
    expect(records.some((record) => record.provider === 'local')).toBe(false);
  });

  it('un respaldo remoto NO autorizado no se intenta: si el autorizado falla, se cae a local', async () => {
    const result = await router({ groq: 'fail', nvidia: 'ok', gemini: 'ok' }, ['groq', 'nvidia', 'gemini', 'local'])
      .route(request({ externalProviderOptIn: true, authorizedExternalProviders: ['groq'] }));
    expect(result.result.providerActuallyUsed).toBe('local');
    expect(result.executionLogs.map((log) => log.provider)).toEqual(['groq', 'local']);
    expect(recentExternalEgressInMemory().map((record) => record.provider)).toEqual(['groq']);
  });

  it('una lista vacía autorizada equivale a no enviar nada', async () => {
    const result = await router({}, ['groq', 'nvidia', 'local']).route(request({ externalProviderOptIn: true, authorizedExternalProviders: [] }));
    expect(result.executionLogs.map((log) => log.provider)).toEqual(['local']);
    expect(recentExternalEgressInMemory()).toHaveLength(0);
  });

  it('la lista autorizada nunca amplía la cadena configurada ni acepta ids desconocidos', async () => {
    const { explicitAuthorizedProviders } = await import('@/lib/ai/caseProviderConsent');
    expect(explicitAuthorizedProviders(['GROQ', 'openai', 7, 'nvidia', 'groq'])).toEqual(['groq', 'nvidia']);
    expect(explicitAuthorizedProviders('groq')).toBeUndefined();
    const result = await router({ groq: 'fail' }, ['groq', 'local']).route(request({ externalProviderOptIn: true, authorizedExternalProviders: ['groq', 'nvidia'] }));
    expect(result.executionLogs.map((log) => log.provider)).toEqual(['groq', 'local']);
  });

  it('una operación con texto libre no se guarda como etiqueta (no filtra datos del caso)', () => {
    expect(safeOperationLabel('FACT_RESPONSE')).toBe('FACT_RESPONSE');
    expect(safeOperationLabel('Contestar a PERSONA FICTICIA UNO')).toBe('sin_etiqueta');
  });

  it('resume por proveedor, operación y periodo', () => {
    const now = new Date('2026-10-13T18:00:00Z');
    const base = { version: 1 as const, consent: 'EXPLICIT_PER_REQUEST' as const, model: 'm', channel: 'llm' as const, attempt: 1, charsReceived: 10, latencyMs: 100, errorCode: null };
    const summary = summarizeExternalEgress([
      { ...base, at: '2026-10-13T10:00:00Z', requestId: 'a', provider: 'groq', operation: 'FACT_RESPONSE', charsSent: 100, outcome: 'OK' },
      { ...base, at: '2026-10-13T10:01:00Z', requestId: 'a', provider: 'nvidia', operation: 'FACT_RESPONSE', charsSent: 50, outcome: 'ERROR', errorCode: 'NVIDIA_HTTP_5XX' },
      { ...base, at: '2026-08-01T10:00:00Z', requestId: 'b', provider: 'groq', operation: 'CLAIM', charsSent: 999, outcome: 'OK' },
    ], 30, now);
    expect(summary.totals).toEqual({ attempts: 2, ok: 1, errors: 1, charsSent: 150, charsReceived: 20, operations: 1 });
    expect(summary.byProvider.map((item) => item.provider)).toEqual(['groq', 'nvidia']);
    expect(summary.recent[0].provider).toBe('nvidia');
  });

  describe('archivo local', () => {
    let dir = '';
    beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'lex-egress-')); process.env.LEX_EXTERNAL_EGRESS_LEDGER_PATH = path.join(dir, 'egress.ndjson'); });
    afterEach(() => { delete process.env.LEX_EXTERNAL_EGRESS_LEDGER_PATH; rmSync(dir, { recursive: true, force: true }); });

    it('agrega una línea por envío y se lee de vuelta', async () => {
      await recordExternalEgress({ requestId: 'x', provider: 'groq', model: 'm', operation: 'SECTION_SUPPORT', channel: 'llm', attempt: 1, charsSent: 12, charsReceived: 3, outcome: 'OK', errorCode: null, latencyMs: 5 });
      const raw = readFileSync(process.env.LEX_EXTERNAL_EGRESS_LEDGER_PATH!, 'utf8');
      expect(raw.trim().split('\n')).toHaveLength(1);
      const records = await readExternalEgressLedger(process.env.LEX_EXTERNAL_EGRESS_LEDGER_PATH);
      expect(records[0]).toMatchObject({ provider: 'groq', operation: 'SECTION_SUPPORT', charsSent: 12 });
    });
  });
});
