import { describe, it, expect, vi } from "vitest";
import { ProviderRouter } from "@/lib/ai/providerRouter";
import type {
  AIProviderId,
  AIProviderResult,
  AIRequest,
  LegalAIProvider,
} from "@/lib/ai/providers/types";

function createMockProvider(
  id: AIProviderId,
  overrides?: {
    isAvailable?: boolean;
    generate?: (req: AIRequest) => Promise<AIProviderResult>;
  }
): LegalAIProvider & { generateMock: ReturnType<typeof vi.fn> } {
  const generateMock = vi.fn(
    overrides?.generate ||
      (async (): Promise<AIProviderResult> => ({
        provider: id,
        model: `${id}-test-model`,
        success: true,
        content: `Contenido generado por ${id}`,
        latencyMs: 10,
        providerRequested: id,
        providerActuallyUsed: id,
      }))
  );

  return {
    id,
    isAvailable: vi.fn(async () => overrides?.isAvailable ?? true),
    generate: generateMock,
    generateMock,
  };
}

describe("ProviderRouter — Multi-Provider Cascade & Fallback", () => {
  const testRequest: AIRequest = {
    userMessage: "Redactar concepto de violación",
    systemPrompt: "Eres un abogado especialista en amparo",
  };

  it("1. Gemini OK → Groq y NVIDIA NO son llamados", async () => {
    const gemini = createMockProvider("gemini");
    const groq = createMockProvider("groq");
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).not.toHaveBeenCalled();
    expect(nvidia.generateMock).not.toHaveBeenCalled();
    expect(local.generateMock).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.providerActuallyUsed).toBe("gemini");
    expect(result.content).toBe("Contenido generado por gemini");
    expect(result.fallbackReason).toBeNull();
    expect(result.origin).toBe("AI_GENERATED_LEGAL_CONTENT");

    expect(executionLogs).toHaveLength(1);
    expect(executionLogs[0]).toMatchObject({
      provider: "gemini",
      model: "gemini-test-model",
      success: true,
      fallbackReason: null,
    });
    expect(executionLogs[0].outputChars).toBeGreaterThan(0);
  });

  it("2. Gemini falla → Groq OK (NVIDIA y local no llamados)", async () => {
    const gemini = createMockProvider("gemini", {
      generate: async () => {
        throw new Error("HTTP 503 Service Unavailable");
      },
    });
    const groq = createMockProvider("groq");
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(nvidia.generateMock).not.toHaveBeenCalled();
    expect(local.generateMock).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.providerActuallyUsed).toBe("groq");
    expect(result.content).toBe("Contenido generado por groq");
    expect(result.fallbackReason).toContain("GEMINI");

    expect(executionLogs).toHaveLength(2);
    expect(executionLogs[0].success).toBe(false);
    expect(executionLogs[0].provider).toBe("gemini");
    expect(executionLogs[1].success).toBe(true);
    expect(executionLogs[1].provider).toBe("groq");
  });

  it("3. Gemini + Groq fallan → NVIDIA OK (local no llamado)", async () => {
    const gemini = createMockProvider("gemini", {
      generate: async () => {
        throw new Error("Timeout de 30000ms alcanzado");
      },
    });
    const groq = createMockProvider("groq", {
      generate: async () => {
        throw new Error("HTTP 429 Too Many Requests");
      },
    });
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(nvidia.generateMock).toHaveBeenCalledTimes(1);
    expect(local.generateMock).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.providerActuallyUsed).toBe("nvidia");
    expect(result.content).toBe("Contenido generado por nvidia");
    expect(result.fallbackReason).toContain("GROQ");

    expect(executionLogs).toHaveLength(3);
    expect(executionLogs[0].fallbackReason).toBe("GEMINI_TIMEOUT");
    expect(executionLogs[1].fallbackReason).toBe("GROQ_HTTP_429");
    expect(executionLogs[2].success).toBe(true);
    expect(executionLogs[2].provider).toBe("nvidia");
  });

  it("4. Todos los proveedores externos fallan → deterministic fallback (local)", async () => {
    const gemini = createMockProvider("gemini", {
      generate: async () => {
        throw new Error("Gemini down");
      },
    });
    const groq = createMockProvider("groq", {
      generate: async () => {
        throw new Error("Groq down");
      },
    });
    const nvidia = createMockProvider("nvidia", {
      generate: async () => {
        throw new Error("NVIDIA down");
      },
    });
    const local = createMockProvider("local", {
      generate: async () => ({
        provider: "local",
        model: "local-deterministic-rules-v1",
        success: true,
        content: "Borrador determinístico local generado",
        latencyMs: 1,
        origin: "LOCAL_PLACEHOLDER",
        isLegalAiContent: false,
      }),
    });

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(nvidia.generateMock).toHaveBeenCalledTimes(1);
    expect(local.generateMock).toHaveBeenCalledTimes(1);

    expect(result.providerActuallyUsed).toBe("local");
    expect(result.origin).toBe("LOCAL_PLACEHOLDER");
    expect(result.isLegalAiContent).toBe(false);
    expect(result.fallbackReason).toContain("NVIDIA");

    expect(executionLogs).toHaveLength(4);
    expect(executionLogs[3].provider).toBe("local");
    expect(executionLogs[3].success).toBe(true);
  });

  it("5. Respuesta vacía de un proveedor → salta al siguiente proveedor", async () => {
    const gemini = createMockProvider("gemini", {
      generate: async () => ({
        provider: "gemini",
        model: "gemini-2.5-flash",
        success: true,
        content: "   ", // Respuesta vacía con solo espacios
        latencyMs: 15,
      }),
    });
    const groq = createMockProvider("groq", {
      generate: async () => ({
        provider: "groq",
        model: "qwen/qwen3.8-27b",
        success: true,
        content: "Contenido jurídico sustantivo recuperado por Groq",
        latencyMs: 12,
      }),
    });
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(nvidia.generateMock).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.providerActuallyUsed).toBe("groq");
    expect(result.content).toBe("Contenido jurídico sustantivo recuperado por Groq");
    expect(executionLogs[0].fallbackReason).toBe("GEMINI_EMPTY_RESPONSE");
  });

  it("6. Provider no configurado (sin API key) se salta limpiamente", async () => {
    const gemini = createMockProvider("gemini", { isAvailable: false });
    const groq = createMockProvider("groq");
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    expect(gemini.generateMock).not.toHaveBeenCalled();
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(result.providerActuallyUsed).toBe("groq");
    expect(executionLogs[0].fallbackReason).toBe("GEMINI_NO_API_KEY");
  });

  it("7. Cada provider se invoca máximo una vez por request", async () => {
    const gemini = createMockProvider("gemini", {
      generate: async () => {
        throw new Error("Gemini temporary 503");
      },
    });
    const groq = createMockProvider("groq", {
      generate: async () => {
        throw new Error("Groq temporary 429");
      },
    });
    const nvidia = createMockProvider("nvidia");
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    // Chain with duplicate entries passed to simulate misconfiguration or retry loops
    const router = new ProviderRouter(
      providers,
      () => ["gemini", "gemini", "groq", "groq", "nvidia", "nvidia", "local", "local"]
    );
    const { result } = await router.route(testRequest);

    expect(gemini.generateMock).toHaveBeenCalledTimes(1);
    expect(groq.generateMock).toHaveBeenCalledTimes(1);
    expect(nvidia.generateMock).toHaveBeenCalledTimes(1);
    expect(local.generateMock).toHaveBeenCalledTimes(0); // NVIDIA succeeded, local not needed
    expect(result.providerActuallyUsed).toBe("nvidia");
  });

  it("8. Las API keys nunca aparecen en logs, errors, ni telemetría", async () => {
    const geminiKey = "AQ.SecretKey1234567890abcdef";
    const groqKey = "gsk_SecretGroqKey1234567890abcdef";
    const nvidiaKey = "nvapi-SecretNvidiaKey1234567890abcdef";
    const bearerKey = "Bearer TopSecretAuthToken1234567890";

    const gemini = createMockProvider("gemini", {
      generate: async () => {
        throw new Error(`Error en API con x-goog-api-key: ${geminiKey} y url https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      },
    });
    const groq = createMockProvider("groq", {
      generate: async () => {
        throw new Error(`Groq fail con Authorization: ${bearerKey} y header ${groqKey}`);
      },
    });
    const nvidia = createMockProvider("nvidia", {
      generate: async () => {
        throw new Error(`NVIDIA fail con header ${nvidiaKey}`);
      },
    });
    const local = createMockProvider("local");

    const providers = new Map<AIProviderId, LegalAIProvider>([
      ["gemini", gemini],
      ["groq", groq],
      ["nvidia", nvidia],
      ["local", local],
    ]);

    const router = new ProviderRouter(providers, () => ["gemini", "groq", "nvidia", "local"]);
    const { result, executionLogs } = await router.route(testRequest);

    const logsJson = JSON.stringify(executionLogs);
    const resultJson = JSON.stringify(result);

    // Assert zero leakage of any secret in logs or telemetry/results
    expect(logsJson).not.toContain(geminiKey);
    expect(logsJson).not.toContain(groqKey);
    expect(logsJson).not.toContain(nvidiaKey);
    expect(logsJson).not.toContain("TopSecretAuthToken1234567890");

    expect(resultJson).not.toContain(geminiKey);
    expect(resultJson).not.toContain(groqKey);
    expect(resultJson).not.toContain(nvidiaKey);
    expect(resultJson).not.toContain("TopSecretAuthToken1234567890");

    // Must reach local fallback
    expect(result.providerActuallyUsed).toBe("local");
  });

  it("9. Reintenta el mismo proveedor solo para un error transitorio cuando el contrato lo habilita", async () => {
    let attempts = 0;
    const gemini = createMockProvider("gemini", {
      generate: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("HTTP 503 Service Unavailable");
        return {
          provider: "gemini",
          model: "gemini-test-model",
          success: true,
          content: "Contenido jurídico recuperado después del reintento",
          latencyMs: 1,
        };
      },
    });
    const router = new ProviderRouter(
      new Map<AIProviderId, LegalAIProvider>([["gemini", gemini]]),
      () => ["gemini"],
    );

    const { result, executionLogs } = await router.route({ ...testRequest, maxProviderRetries: 1 });

    expect(gemini.generateMock).toHaveBeenCalledTimes(2);
    expect(result.providerActuallyUsed).toBe("gemini");
    expect(executionLogs[0].fallbackReason).toBe("GEMINI_HTTP_5XX");
    expect(executionLogs[1].success).toBe(true);
  });
});
