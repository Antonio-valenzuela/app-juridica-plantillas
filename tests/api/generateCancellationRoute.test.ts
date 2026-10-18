/**
 * Integración offline de la ruta /generate (modo síncrono) con el pipeline REAL.
 * El proveedor de IA es simulado: nunca invoca Groq, Gemini, NVIDIA ni otro servicio externo.
 * Documento y fuente son sintéticos. Un proveedor «colgado» no responde nunca: la cancelación debe
 * detener la generación igualmente (carrera con la señal, sin llamadas posteriores, sin checkpoints mutados).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  mode: 'answer' as 'answer' | 'hang',
  calls: 0,
  afterAbortCalls: 0,
  hangStarted: false,
}));

vi.mock('@/lib/ai/orchestrator', async () => {
  const { currentAbortSignal, GenerationCancelledError } = await import('@/lib/ai/abortContext');
  return {
    NVIDIAProvider: class {},
    runFastMode: vi.fn(async (request: { systemPrompt?: string; signal?: AbortSignal }) => {
      const signal = request.signal ?? currentAbortSignal();
      if (signal?.aborted) {
        state.afterAbortCalls += 1;
        throw new GenerationCancelledError();
      }
      state.calls += 1;
      if (state.mode === 'hang') return new Promise<never>(() => undefined); // nunca responde
      return {
        provider: 'groq', model: 'test-model', success: true, latencyMs: 1,
        content: 'Desarrollo sintético de la contestación, fundado en la fuente sintética.',
        origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true,
      };
    }),
  };
});

// Plazo corto para la prueba; el valor real lo calcula el servidor (ver test de derivación).
vi.mock('@/lib/legal-engine/generationDeadline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/legal-engine/generationDeadline')>();
  return { ...actual, getGenerationJobDeadlineMs: vi.fn(() => 300) };
});
vi.mock('@/lib/workspace/lawyerProfileStore', () => ({ loadLawyerProfile: vi.fn().mockResolvedValue({ profile: {}, fromDefault: true }) }));
vi.mock('@/lib/security/workspaceExecutionAccess', () => ({
  requireWorkspaceExecutionAccess: vi.fn().mockResolvedValue({ ok: true, context: { organizationId: 'test', userId: 'test', lawyerId: 'test' } }),
  executionOwnerKey: vi.fn(), ownsExecution: vi.fn(),
}));
vi.mock('@/lib/security/rateLimit', () => ({ checkRequestRateLimit: vi.fn().mockReturnValue({ ok: true }) }));
vi.mock('@/lib/security/aiCostControls', () => ({ checkGenerationAdmission: vi.fn().mockResolvedValue({ ok: true }), maxGenerationInputChars: () => 1_000_000 }));

import { POST } from '@/app/api/legal-engine/generate/route';
import { getGenerationJobDeadlineMs } from '@/lib/legal-engine/generationDeadline';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { createSimulatedWriter, syntheticCase, syntheticDemandText } from '../helpers/simulatedLegalWriter';



function syntheticSource() {
  const c = syntheticCase(6, 4, 3);
  return createSourceDocument({
    id: 'synthetic-contestacion-source', filename: 'demanda-sintetica.txt',
    content: `DEMANDA_CIVIL\n${syntheticDemandText(c)}`,
    sourceValidated: true,
    classification: { sourceDocumentType: 'DEMANDA_CIVIL', role: 'PRIMARY', provenance: 'KNOWN_PROVENANCE' },
  });
}

const post = (body: Record<string, unknown>) => POST(new NextRequest('http://localhost/api/legal-engine/generate?sync=1', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    sync: true,
    selectedDocumentType: 'contestacion_demanda_civil',
    uncertifiedDraftAcknowledged: true,
    userInstruction: 'Preparar contestación de demanda con base en la fuente sintética.',
    sourceDocuments: [syntheticSource()],
    ...body,
  }),
}));

/**
 * Espera determinista con `setImmediate` real bajo reloj falso: deja avanzar el pipeline
 * (microtasks y temporizadores de 0 ms) hasta que la condición se cumpla, sin depender del reloj de pared.
 */
async function waitForState(predicate: () => boolean, timeoutMs = 10_000) {
  const realDeadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < realDeadline) {
    await vi.advanceTimersByTimeAsync(0);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('ruta /generate síncrona: meta, plazo, cancelación y presupuesto', () => {
  beforeEach(() => {
    state.mode = 'answer';
    state.calls = 0;
    state.afterAbortCalls = 0;
    state.hangStarted = false;
    vi.mocked(getGenerationJobDeadlineMs).mockClear();
  });

  it('pageTarget 40 prevalece sobre un generationExtension estándar enviado por el cliente y deriva el plazo del servidor', async () => {
    state.mode = 'hang';
    await post({ generationExtension: { generationMode: 'standard' }, pageTarget: { preset: 'EXTENSO', pages: 40 } });
    const contract = vi.mocked(getGenerationJobDeadlineMs).mock.calls.at(-1)?.[0] as { generationMode?: string } | undefined;
    expect(contract?.generationMode).toBe('extended-legal');
  });

  it('timeout durante la ampliación: 504 con GENERATION_TIMEOUT, NEEDS_REVIEW y BELOW_TARGET/TIMEOUT; sin llamadas posteriores', async () => {
    // Plazo bajo reloj falso: el vencimiento ocurre justo cuando la ampliación ya está colgada,
    // nunca antes por retraso del event-loop bajo carga (flake observado en la suite completa).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Redacción inicial OK; las ampliaciones (prompts «Redacción jurídica…») se quedan colgadas.
      const { runFastMode } = await import('@/lib/ai/orchestrator');
      vi.mocked(runFastMode).mockImplementation(async (request: any) => {
        // Mismo contrato que el router: una llamada con la señal ya cancelada no llega al proveedor.
        const { currentAbortSignal, GenerationCancelledError } = await import('@/lib/ai/abortContext');
        const signal = request.signal ?? currentAbortSignal();
        if (signal?.aborted) { state.afterAbortCalls += 1; throw new GenerationCancelledError(); }
        if (String(request.systemPrompt).startsWith('Redacción jurídica')) {
          state.calls += 1;
          state.hangStarted = true;
          return new Promise<never>(() => undefined);
        }
        state.calls += 1;
        return { provider: 'groq', model: 'test', success: true, latencyMs: 1, content: 'Desarrollo inicial sintético.', origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true } as any;
      });

      const responsePromise = post({ pageTarget: { preset: 'EXTENSO', pages: 40 } });
      await waitForState(() => state.hangStarted);
      expect(state.hangStarted).toBe(true);
      await vi.advanceTimersByTimeAsync(350);

      const response = await responsePromise;
      const body = await response.json();
      expect(response.status).toBe(504);
      expect(body.errorCode).toBe('GENERATION_TIMEOUT');
      expect(body.terminalStatus).toBe('NEEDS_REVIEW');
      expect(body.document?.generationMetadata?.pageTargetResult).toMatchObject({ outcome: 'BELOW_TARGET', failureCause: 'TIMEOUT' });

      // El pipeline terminó (post() ya resolvió). Drena la cola de microtasks para que
      // cualquier tarea asíncrona pendiente en el event-loop pueda completarse; luego
      // verifica que no hubo llamadas adicionales al proveedor tras el abort.
      const callsAtTimeout = state.calls;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(state.calls).toBe(callsAtTimeout);
      expect(state.afterAbortCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelación durante la redacción inicial: el proveedor colgado no retiene la generación ni inicia llamadas nuevas', async () => {
    // Mismo patrón determinista: el plazo simulado vence solo cuando la primera llamada ya está colgada.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { runFastMode } = await import('@/lib/ai/orchestrator');
      vi.mocked(runFastMode).mockImplementation(async (request: any) => {
        const { currentAbortSignal, GenerationCancelledError } = await import('@/lib/ai/abortContext');
        const signal = request.signal ?? currentAbortSignal();
        if (signal?.aborted) { state.afterAbortCalls += 1; throw new GenerationCancelledError(); }
        state.calls += 1;
        state.hangStarted = true;
        return new Promise<never>(() => undefined); // redacción inicial colgada
      });

      const responsePromise = post({ pageTarget: { preset: 'EXTENSO', pages: 40 } });
      await waitForState(() => state.hangStarted);
      expect(state.hangStarted).toBe(true);
      await vi.advanceTimersByTimeAsync(350);

      const response = await responsePromise;
      const body = await response.json();
      expect(response.status).toBe(504);
      expect(body.errorCode).toBe('GENERATION_TIMEOUT');
      expect(body.terminalStatus).toBe('NEEDS_REVIEW');
      // Solo el último checkpoint válido (bloques no-IA ya completados), marcado como TIMEOUT: nunca completo.
      expect(body.document?.generationMetadata?.pageTargetResult).toMatchObject({ outcome: 'BELOW_TARGET', failureCause: 'TIMEOUT' });

      // Drena microtasks pendientes de forma determinista (sin sleep fijo).
      const callsAtTimeout = state.calls;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(state.calls).toBe(callsAtTimeout);
      expect(state.afterAbortCalls).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('el presupuesto global de llamadas se respeta entre redacción inicial y ampliación', async () => {
    const { runFastMode } = await import('@/lib/ai/orchestrator');
    vi.mocked(runFastMode).mockImplementation(async () => {
      state.calls += 1;
      return { provider: 'groq', model: 'test', success: true, latencyMs: 1, content: 'Desarrollo sintético repetido.', origin: 'AI_GENERATED_LEGAL_CONTENT', isLegalAiContent: true } as any;
    });
    const response = await post({ pageTarget: { preset: 'BREVE', pages: 5 } });
    const body = await response.json();
    const extension = body.document?.generationMetadata?.generationExtension;
    expect(extension?.metrics?.llmCalls).toBeGreaterThan(0);
    expect(extension.metrics.llmCalls).toBeLessThanOrEqual(extension.maxCallsPerDocument);
  });
});

describe('ruta síncrona: el mismo estado de error que la asíncrona', () => {
  it('no devuelve un documento como completado cuando la meta no se alcanza (BELOW_TARGET)', async () => {
    const { runFastMode } = await import('@/lib/ai/orchestrator');
    vi.mocked(runFastMode).mockImplementation(async () => ({ provider: 'groq', model: 'test', success: false, latencyMs: 1, content: '', origin: 'NONE' } as any));
    const response = await post({ pageTarget: { preset: 'EXTENSO', pages: 40 } });
    const body = await response.json();
    if (body.document?.generationMetadata?.pageTargetResult?.outcome === 'BELOW_TARGET') {
      expect(body.terminalStatus).toBe('NEEDS_REVIEW');
    }
    expect(body.terminalStatus ?? 'NEEDS_REVIEW').not.toBe('COMPLETED');
  });
});
