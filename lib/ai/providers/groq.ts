import { fetch } from "undici";
import type { AIHealthResult, AIProviderResult, AIRequest, LegalAIProvider } from "./types";
import { redactSecrets, sanitizeAiError } from "./types";

export interface GroqCompletionOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export class GroqCompletionError extends Error {
  constructor(message: string, readonly httpStatus?: number, readonly code?: string) {
    super(message);
    this.name = "GroqCompletionError";
  }
}

export interface GroqCompletionResult {
  text: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
  isTruncated?: boolean;
  httpStatus?: number;
}

interface GroqChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { total_tokens?: number };
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b";
}

export function resolveGroqOutputTokenLimit(requested?: number): number {
  // The default free/on-demand tier currently enforces roughly 1000 output
  // tokens per minute. An explicit env override is allowed for paid tiers.
  const configured = Number(process.env.GROQ_MAX_OUTPUT_TOKENS || 1000);
  const safeCeiling = Number.isFinite(configured) ? Math.min(8192, Math.max(256, Math.round(configured))) : 1000;
  const requestedSafe = Number.isFinite(requested) ? Math.round(requested as number) : 2048;
  return Math.min(safeCeiling, Math.max(256, requestedSafe));
}

export async function generateGroqCompletion(
  options: GroqCompletionOptions
): Promise<GroqCompletionResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = getGroqModel();
  const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const startMs = Date.now();

  if (!apiKey) {
    throw new GroqCompletionError("[Groq Provider] GROQ_API_KEY no configurada.", undefined, "NO_API_KEY");
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (options.systemPrompt?.trim()) {
    messages.push({ role: "system", content: options.systemPrompt.trim() });
  }
  if (options.conversationHistory && options.conversationHistory.length > 0) {
    for (const msg of options.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: "user", content: options.prompt });

  const controller = new AbortController();
  const configuredTimeout = Number(process.env.GROQ_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const sanitizedRequestLog = {
    provider: "groq",
    endpoint,
    model,
    method: "POST",
    structuredOutput: !!options.outputSchema,
    GROQ_API_KEY_PRESENT: true,
  };
  console.log(`[GROQ] REQUEST ${JSON.stringify(sanitizedRequestLog)}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: resolveGroqOutputTokenLimit(options.maxTokens),
        ...(options.outputSchema ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const errText = await response.text();
      const sanitizedBody = redactSecrets(errText.slice(0, 2000));
      console.error(
        `[GROQ] GROQ_HTTP_ERROR ${JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          body: sanitizedBody,
          endpoint,
          model,
          latencyMs,
          GROQ_API_KEY_PRESENT: true,
        })}`
      );
      throw new GroqCompletionError(
        `[Groq Provider] HTTP ${response.status}: ${sanitizedBody}`,
        response.status,
        response.status === 429 ? "RATE_LIMIT" : response.status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"
      );
    }

    let data: GroqChatResponse;
    try {
      data = (await response.json()) as GroqChatResponse;
    } catch (error: unknown) {
      throw new GroqCompletionError(
        `[Groq Provider] Envelope JSON inválido: ${sanitizeAiError(error)}`,
        response.status,
        "INVALID_JSON"
      );
    }

    const rawText = data?.choices?.[0]?.message?.content || "";
    const text = rawText.trim();
    const finishReason = data?.choices?.[0]?.finish_reason || "stop";
    const isTruncated = finishReason === "length";

    if (!text) {
      throw new GroqCompletionError(
        "[Groq Provider] Respuesta vacía del modelo Groq.",
        response.status,
        "EMPTY_RESPONSE"
      );
    }

    console.log(
      `[GROQ] RESPONSE_OK ${JSON.stringify({
        provider: "groq",
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
      tokensUsed: data?.usage?.total_tokens || 0,
      finishReason,
      isTruncated,
      httpStatus: response.status,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new GroqCompletionError(
        `[Groq Provider] Timeout de ${timeoutMs}ms alcanzado en la llamada a Groq.`,
        408,
        "TIMEOUT"
      );
    }
    throw error;
  }
}

export class GroqProvider implements LegalAIProvider {
  readonly id = "groq" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.GROQ_API_KEY?.trim());
  }

  async generate(request: AIRequest): Promise<AIProviderResult> {
    const startTime = Date.now();
    const model = getGroqModel();

    try {
      const res = await generateGroqCompletion({
        prompt: request.userMessage,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        outputSchema: request.outputSchema,
        conversationHistory: request.conversationHistory,
      });

      return {
        provider: "groq",
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
        providerRequested: "groq",
        providerActuallyUsed: "groq",
        fallbackReason: null,
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    } catch (error: unknown) {
      const sanitized = sanitizeAiError(error);
      const code = error instanceof GroqCompletionError ? error.code || "GROQ_ERROR" : "GROQ_ERROR";
      return {
        provider: "groq",
        model,
        success: false,
        content: "",
        latencyMs: Date.now() - startTime,
        errorCode: code,
        warnings: [sanitized],
        providerRequested: "groq",
        providerActuallyUsed: "groq",
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    }
  }

  async healthCheck(): Promise<AIHealthResult> {
    const configured = await this.isAvailable();
    const model = getGroqModel();

    if (!configured) {
      return {
        provider: "groq",
        configured: false,
        available: false,
        model,
        lastCheckAt: new Date().toISOString(),
        lastError: "GROQ_API_KEY no configurada",
      };
    }

    const start = Date.now();
    try {
      await generateGroqCompletion({
        prompt: "ping",
        maxTokens: 5,
      });

      return {
        provider: "groq",
        configured: true,
        available: true,
        model,
        lastCheckAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        provider: "groq",
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
