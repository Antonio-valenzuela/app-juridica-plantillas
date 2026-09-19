import { fetch } from "undici";
import type { AIHealthResult, AIProviderResult, AIRequest, LegalAIProvider } from "./types";
import { redactSecrets, sanitizeAiError } from "./types";

export interface GeminiCompletionOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export class GeminiCompletionError extends Error {
  constructor(message: string, readonly httpStatus?: number, readonly code?: string) {
    super(message);
    this.name = "GeminiCompletionError";
  }
}

export interface GeminiCompletionResult {
  text: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
  isTruncated?: boolean;
  httpStatus?: number;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

export function resolveGeminiOutputTokenLimit(requested?: number): number {
  const configured = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 8192);
  const safeCeiling = Number.isFinite(configured) ? Math.min(8192, Math.max(1024, Math.round(configured))) : 8192;
  const requestedSafe = Number.isFinite(requested) ? Math.round(requested as number) : 4096;
  return Math.min(safeCeiling, Math.max(256, requestedSafe));
}

/** Gemini uses a JSON-Schema subset and rejects OpenAI-only keywords. */
export function sanitizeGeminiResponseSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(schema)) return schema.map((item) => sanitizeGeminiResponseSchema(item as Record<string, unknown>)) as unknown as Record<string, unknown>;
  if (!schema || typeof schema !== 'object') return schema;
  const unsupported = new Set(['additionalProperties', '$schema', '$id', 'title', 'default', 'examples']);
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !unsupported.has(key))
      .map(([key, value]) => [
        key,
        value && typeof value === 'object'
          ? (Array.isArray(value)
            ? value.map((item) => item && typeof item === 'object' ? sanitizeGeminiResponseSchema(item as Record<string, unknown>) : item)
            : sanitizeGeminiResponseSchema(value as Record<string, unknown>))
          : value,
      ]),
  );
}

export async function generateGeminiCompletion(
  options: GeminiCompletionOptions
): Promise<GeminiCompletionResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = getGeminiModel();
  const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/models/${model}:generateContent`;
  const startMs = Date.now();

  if (!apiKey) {
    throw new GeminiCompletionError("[Gemini Provider] GEMINI_API_KEY no configurada.", undefined, "NO_API_KEY");
  }

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (options.conversationHistory && options.conversationHistory.length > 0) {
    for (const msg of options.conversationHistory) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: options.prompt }],
  });

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: resolveGeminiOutputTokenLimit(options.maxTokens),
      ...(options.outputSchema ? {
        responseMimeType: "application/json",
        responseSchema: sanitizeGeminiResponseSchema(options.outputSchema),
      } : {}),
    },
  };

  if (options.systemPrompt?.trim()) {
    payload.systemInstruction = {
      parts: [{ text: options.systemPrompt.trim() }],
    };
  }

  const controller = new AbortController();
  const configuredTimeout = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const sanitizedRequestLog = {
    provider: "gemini",
    endpoint,
    model,
    method: "POST",
    structuredOutput: !!options.outputSchema,
    GEMINI_API_KEY_PRESENT: true,
  };
  console.log(`[GEMINI] REQUEST ${JSON.stringify(sanitizedRequestLog)}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const errText = await response.text();
      const sanitizedBody = redactSecrets(errText.slice(0, 2000));
      console.error(
        `[GEMINI] GEMINI_HTTP_ERROR ${JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          body: sanitizedBody,
          endpoint,
          model,
          latencyMs,
          GEMINI_API_KEY_PRESENT: true,
        })}`
      );
      throw new GeminiCompletionError(
        `[Gemini Provider] HTTP ${response.status}: ${sanitizedBody}`,
        response.status,
        response.status === 429 ? "RATE_LIMIT" : response.status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"
      );
    }

    const data = (await response.json()) as any;
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const rawText = parts.map((p: any) => p.text || "").filter(Boolean).join("");
    const text = rawText.trim();
    const finishReason = candidate?.finishReason || "STOP";
    const isTruncated = finishReason === "MAX_TOKENS";

    if (!text) {
      throw new GeminiCompletionError(
        "[Gemini Provider] Respuesta vacía del modelo Gemini.",
        response.status,
        "EMPTY_RESPONSE"
      );
    }

    console.log(
      `[GEMINI] RESPONSE_OK ${JSON.stringify({
        provider: "gemini",
        model,
        endpoint,
        status: response.status,
        outputChars: text.length,
        latencyMs,
      })}`
    );

    return {
      text,
      model,
      tokensUsed: data?.usageMetadata?.totalTokenCount || 0,
      finishReason,
      isTruncated,
      httpStatus: response.status,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiCompletionError(
        `[Gemini Provider] Timeout de ${timeoutMs}ms alcanzado en la llamada a Gemini.`,
        408,
        "TIMEOUT"
      );
    }
    throw error;
  }
}

export class GeminiProvider implements LegalAIProvider {
  readonly id = "gemini" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.GEMINI_API_KEY?.trim());
  }

  async generate(request: AIRequest): Promise<AIProviderResult> {
    const startTime = Date.now();
    const model = getGeminiModel();

    try {
      const res = await generateGeminiCompletion({
        prompt: request.userMessage,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        outputSchema: request.outputSchema,
        conversationHistory: request.conversationHistory,
      });

      return {
        provider: "gemini",
        model: res.model,
        success: true,
        content: res.text,
        finishReason: res.finishReason,
        isTruncated: res.isTruncated,
        latencyMs: Date.now() - startTime,
        usage: {
          promptTokens: null,
          completionTokens: null,
          totalTokens: res.tokensUsed || null,
        },
        warnings: res.isTruncated ? ["Generación truncada por límite de tokens."] : undefined,
        providerRequested: "gemini",
        providerActuallyUsed: "gemini",
        fallbackReason: null,
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    } catch (error: unknown) {
      const sanitized = sanitizeAiError(error);
      const code = error instanceof GeminiCompletionError ? error.code || "GEMINI_ERROR" : "GEMINI_ERROR";
      return {
        provider: "gemini",
        model,
        success: false,
        content: "",
        latencyMs: Date.now() - startTime,
        errorCode: code,
        warnings: [sanitized],
        providerRequested: "gemini",
        providerActuallyUsed: "gemini",
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    }
  }

  async healthCheck(): Promise<AIHealthResult> {
    const configured = await this.isAvailable();
    const model = getGeminiModel();

    if (!configured) {
      return {
        provider: "gemini",
        configured: false,
        available: false,
        model,
        lastCheckAt: new Date().toISOString(),
        lastError: "GEMINI_API_KEY no configurada",
      };
    }

    const start = Date.now();
    try {
      await generateGeminiCompletion({
        prompt: "ping",
        maxTokens: 5,
      });

      return {
        provider: "gemini",
        configured: true,
        available: true,
        model,
        lastCheckAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        provider: "gemini",
        configured: true,
        available: false,
        model,
        lastCheckAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
        lastError: sanitizeAiError(error),
      };
    }
  }
}
