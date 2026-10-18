import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderRouter } from '@/lib/ai/providerRouter';
import type { AIProviderId, AIRequest, AIProviderResult, LegalAIProvider } from '@/lib/ai/providers/types';

// Los proveedores reales usan `fetch` de undici (no el global): se espían ambos.
const undiciFetch = vi.hoisted(() => ({ spy: null as null | ((...args: unknown[]) => Promise<Response>) }));
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: (...args: unknown[]) => (undiciFetch.spy ? undiciFetch.spy(...args) : Promise.reject(new Error('undici sin espía'))),
}));

/**
 * Sin consentimiento explícito no debe intentarse NINGUNA solicitud externa: ni el proveedor principal,
 * ni reintentos, ni proveedores alternativos, ni rutas de respaldo, ni el OCR/parser externo.
 * Todo es sintético: expediente inventado, claves falsas («test-fake-…») y proveedores simulados.
 */
const SYNTHETIC_CASE = 'EXPEDIENTE SINTÉTICO 0000/2099. Parte actora: PERSONA FICTICIA UNO. Hecho 1: dato inventado para pruebas.';
const EXTERNAL_HOSTS = /groq\.com|nvidia\.com|googleapis\.com|generativelanguage|openai\.com|ilovepdf\.com/i;

function fakeProvider(id: AIProviderId, calls: string[]): LegalAIProvider {
  return {
    id,
    isAvailable: async () => true,
    generate: async (request: AIRequest): Promise<AIProviderResult> => {
      calls.push(id);
      // Los externos fallan de forma reintentable para forzar la cadena de respaldo completa.
      if (id !== 'local') return { provider: id, model: 'simulado', success: false, content: '', latencyMs: 1, errorCode: 'SIMULATED_FAILURE', retryable: true };
      return { provider: id, model: 'local-simulado', success: true, content: `local:${request.userMessage.length}`, latencyMs: 1 };
    },
  };
}

function routerWithCalls() {
  const calls: string[] = [];
  const providers = new Map<AIProviderId, LegalAIProvider>((['gemini', 'groq', 'nvidia', 'local'] as AIProviderId[]).map((id) => [id, fakeProvider(id, calls)]));
  return { calls, router: new ProviderRouter(providers, () => ['groq', 'nvidia', 'gemini', 'local']) };
}

describe('router: el consentimiento corta toda la cadena externa', () => {
  for (const optIn of [undefined, false, 'true', 1, {}] as unknown[]) {
    it(`externalProviderOptIn=${JSON.stringify(optIn)} → solo local, sin reintentos ni respaldos externos`, async () => {
      const { calls, router } = routerWithCalls();
      await router.route({ userMessage: SYNTHETIC_CASE, purpose: 'LEGAL_GENERATION', externalProviderOptIn: optIn as boolean });
      expect(calls).toEqual(['local']);
    });
  }

  it('control positivo: con consentimiento explícito sí recorre los externos', async () => {
    const { calls, router } = routerWithCalls();
    await router.route({ userMessage: SYNTHETIC_CASE, purpose: 'LEGAL_GENERATION', externalProviderOptIn: true });
    expect(calls.filter((id) => id !== 'local').length).toBeGreaterThan(0);
  });
});

describe('proveedores reales con fetch simulado: cero solicitudes externas sin consentimiento', () => {
  const fetchSpy = vi.fn(async (_input: unknown, _init?: unknown) => new Response(JSON.stringify({ error: "simulado" }), { status: 500 }));
  const saved: Record<string, string | undefined> = {};
  const keys = ['GROQ_API_KEY', 'NVIDIA_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER_CHAIN'];

  beforeEach(() => {
    for (const key of keys) saved[key] = process.env[key];
    // Claves FALSAS: si el bloqueo fallara, la solicitud llegaría al espía, nunca a la red.
    process.env.GROQ_API_KEY = 'test-fake-groq';
    process.env.NVIDIA_API_KEY = 'test-fake-nvidia';
    process.env.GEMINI_API_KEY = 'test-fake-gemini';
    process.env.AI_PROVIDER_CHAIN = 'groq,nvidia,gemini,local';
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
    undiciFetch.spy = fetchSpy as never;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    undiciFetch.spy = null;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  });

  const externalCalls = () => fetchSpy.mock.calls.filter(([url]) => EXTERNAL_HOSTS.test(String(url)));

  it('runLegalAI (chat, asistente, edición) sin bandera → ninguna solicitud externa', async () => {
    const { runLegalAI } = await import('@/lib/ai/orchestrator');
    await runLegalAI({ userMessage: SYNTHETIC_CASE, purpose: 'LEGAL_GENERATION' });
    expect(externalCalls()).toHaveLength(0);
  });

  it('control positivo: con consentimiento el proveedor real sí intenta salir (y el espía lo intercepta)', async () => {
    const { runLegalAI } = await import('@/lib/ai/orchestrator');
    await runLegalAI({ userMessage: SYNTHETIC_CASE, purpose: 'LEGAL_GENERATION', externalProviderOptIn: true });
    expect(externalCalls().length).toBeGreaterThan(0);
  });

  it('parser Nemotron: una imagen sin consentimiento no se transmite (aunque haya clave)', async () => {
    const { parseDocumentWithNemotron } = await import('@/lib/ai/nemotronParser');
    const result = await parseDocumentWithNemotron({ buffer: Buffer.from('imagen-sintetica'), fileName: 'escaneo-sintetico.png', mimeType: 'image/png' });
    expect(result).toMatchObject({ ok: false, reason: 'not_consented' });
    expect(externalCalls()).toHaveLength(0);
  });

  it('parser Nemotron: un PDF se normaliza en local, sin solicitudes', async () => {
    const { parseDocumentWithNemotron } = await import('@/lib/ai/nemotronParser');
    await parseDocumentWithNemotron({ buffer: Buffer.from('%PDF-sintetico'), fileName: 'sintetico.pdf', mimeType: 'application/pdf', pages: [{ pageNumber: 1, text: SYNTHETIC_CASE }] });
    expect(externalCalls()).toHaveLength(0);
  });

  it('control positivo: con consentimiento explícito la imagen sí intentaría salir', async () => {
    const { parseDocumentWithNemotron } = await import('@/lib/ai/nemotronParser');
    await parseDocumentWithNemotron({ buffer: Buffer.from('imagen-sintetica'), fileName: 'escaneo-sintetico.png', mimeType: 'image/png', externalProviderOptIn: true });
    expect(externalCalls().length).toBeGreaterThan(0);
  });

  it('el OCR externo de PDF (iLovePDF) no se selecciona aunque se configure', async () => {
    const saved = process.env.OCR_PROVIDER;
    process.env.OCR_PROVIDER = 'ilovepdf';
    try {
      const { getOCRProvider } = await import('@/lib/pdf/ocrProviders');
      expect(getOCRProvider().constructor.name).toBe('DisabledOCRProvider');
    } finally {
      if (saved === undefined) delete process.env.OCR_PROVIDER; else process.env.OCR_PROVIDER = saved;
    }
  });
});
