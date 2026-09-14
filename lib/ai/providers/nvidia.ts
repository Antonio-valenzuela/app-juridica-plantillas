import { fetch } from "undici";
import type { AIHealthResult, AIProvider, AIProviderResult, AIRequest } from "./types";
import { sanitizeAiError } from "./types";
import { getNvidiaModel as getChainNvidiaModel } from "../providerChain";

export interface NVIDIACompletionOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  outputSchema?: Record<string, unknown>;
}

export class NVIDIACompletionError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = "NVIDIACompletionError";
  }
}

export interface NVIDIACompletionResult {
  text: string;
  model: string;
  tokensUsed?: number;
  finishReason?: string;
  isTruncated?: boolean;
  httpStatus?: number;
  rawChars?: number;
  rawResponse?: unknown;
}

interface NVIDIAChatResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { total_tokens?: number };
}

export function getNvidiaModel(): string {
  return getChainNvidiaModel();
}

export async function generateNVIDIACompletion(
  options: NVIDIACompletionOptions
): Promise<NVIDIACompletionResult> {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  const baseUrl = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/+$/, "");
  const model = getNvidiaModel();
  const endpoint = `${baseUrl}/chat/completions`;
  const startMs = Date.now();

  if (!apiKey) {
    throw new Error("[NVIDIA Provider] NVIDIA_API_KEY no configurada.");
  }

  const messages = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: options.prompt });

  const controller = new AbortController();
  const configuredTimeout = Number(process.env.NVIDIA_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000 ? configuredTimeout : 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // PASO 2: logging sanitizado del request (sin secretos)
  const sanitizedRequestLog = {
    provider: "nvidia",
    baseUrl,
    endpoint,
    model,
    method: "POST",
    stream: false,
    responseFormat: options.outputSchema ? "json_schema" : "none",
    structuredOutput: !!options.outputSchema,
    NVIDIA_API_KEY_PRESENT: !!apiKey,
  };
  console.log(`[NVIDIA] REQUEST ${JSON.stringify(sanitizedRequestLog)}`);

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
        max_tokens: options.maxTokens ?? 2048,
        ...(options.outputSchema ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "nvidia_structured_output",
              strict: true,
              schema: options.outputSchema,
            },
          },
        } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const errText = await response.text();
      const sanitizedBody = errText.slice(0, 2000).replace(/nvapi-[^\s"']+/gi, "[REDACTED]").replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
      // PASO 3: conservar body real del 404 con contexto completo
      console.error(
        `[NVIDIA] NVIDIA_HTTP_ERROR ${JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          body: sanitizedBody,
          endpoint,
          model,
          latencyMs,
          NVIDIA_API_KEY_PRESENT: true,
        })}`
      );
      throw new NVIDIACompletionError(`[NVIDIA Provider] HTTP ${response.status}: ${errText}`, response.status);
    }

    // Éxito: log sanitizado
    console.log(
      `[NVIDIA] RESPONSE_OK ${JSON.stringify({ provider: "nvidia", model, endpoint, status: response.status, latencyMs })}`
    );

    let data: NVIDIAChatResponse;
    try {
      data = (await response.json()) as NVIDIAChatResponse;
    } catch (error: unknown) {
      throw new NVIDIACompletionError(
        `[NVIDIA Provider] Envelope JSON inválido: ${sanitizeAiError(error)}`,
        response.status,
      );
    }
    const rawText = data?.choices?.[0]?.message?.content || "";
    const text = rawText.trim();
    const finishReason = data?.choices?.[0]?.finish_reason || "stop";
    const isTruncated = finishReason === "length";

    if (!text) {
      throw new NVIDIACompletionError("[NVIDIA Provider] Respuesta vacía del modelo de NVIDIA Build.", response.status);
    }

    return {
      text,
      model,
      tokensUsed: data?.usage?.total_tokens || 0,
      finishReason,
      isTruncated,
      httpStatus: response.status,
      rawChars: rawText.length,
      rawResponse: data,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`[NVIDIA Provider] Timeout de ${timeoutMs}ms alcanzado en la llamada a NVIDIA Build.`);
    }
    throw error;
  }
}

export class NVIDIAProvider implements AIProvider {
  id = "nvidia" as const;

  async isAvailable(): Promise<boolean> {
    return !!process.env.NVIDIA_API_KEY?.trim();
  }

  async generate(request: AIRequest): Promise<AIProviderResult> {
    const startTime = Date.now();
    const model = getNvidiaModel();

    try {
      const res = await generateNVIDIACompletion({
        prompt: request.userMessage,
        systemPrompt: request.systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        outputSchema: request.outputSchema,
      });

      return {
        provider: "nvidia",
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
        warnings: res.isTruncated ? ['Generación truncada por límite de tokens (finish_reason: length).'] : undefined,
        providerRequested: "nvidia",
        providerActuallyUsed: "nvidia",
        fallbackReason: null,
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    } catch (error: unknown) {
      return {
        provider: "nvidia",
        model,
        success: false,
        content: "",
        latencyMs: Date.now() - startTime,
        errorCode: "NVIDIA_ERROR",
        warnings: [sanitizeAiError(error)],
        providerRequested: "nvidia",
        providerActuallyUsed: "nvidia",
        origin: "AI_GENERATED_LEGAL_CONTENT",
        isLegalAiContent: true,
      };
    }
  }

  async healthCheck(): Promise<AIHealthResult> {
    const configured = await this.isAvailable();
    const model = getNvidiaModel();

    if (!configured) {
      return {
        provider: "nvidia",
        configured: false,
        available: false,
        model,
        lastCheckAt: new Date().toISOString(),
        lastError: "NVIDIA_API_KEY no configurada",
      };
    }

    const start = Date.now();
    try {
      await generateNVIDIACompletion({
        prompt: "ping",
        maxTokens: 5,
      });

      return {
        provider: "nvidia",
        configured: true,
        available: true,
        model,
        lastCheckAt: new Date().toISOString(),
        latencyMs: Date.now() - start,
      };
    } catch (error: unknown) {
      return {
        provider: "nvidia",
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
