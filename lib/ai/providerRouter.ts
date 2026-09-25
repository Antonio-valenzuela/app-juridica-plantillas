import { GeminiProvider } from "./providers/gemini";
import { GroqProvider } from "./providers/groq";
import { NVIDIAProvider } from "./providers/nvidia";
import { LocalProvider } from "./providers/local";
import type {
  AIProviderId,
  AIProviderResult,
  AIRequest,
  LegalAIProvider,
} from "./providers/types";
import { sanitizeAiError } from "./providers/types";
import { getProviderChain } from "./providerChain";
import { trackAiUsage } from "./usageTracker";

export interface ProviderExecutionLog {
  provider: AIProviderId;
  model: string;
  durationMs: number;
  outputChars: number;
  success: boolean;
  fallbackReason: string | null;
}

export interface RouteResult {
  result: AIProviderResult;
  executionLogs: ProviderExecutionLog[];
}

function resolveRetryCount(request: AIRequest, providerId: AIProviderId): number {
  if (providerId === 'local') return 0;
  const configured = request.maxProviderRetries !== undefined
    ? request.maxProviderRetries
    : Number(process.env.AI_PROVIDER_RETRIES || 0);
  return Number.isFinite(configured) ? Math.min(2, Math.max(0, Math.round(configured))) : 0;
}

function isRetryableFailure(reason: string): boolean {
  // Sin Retry-After disponible en el contrato normalizado, un 429 pasa al
  // siguiente provider para no reenviar el mismo payload durante el TPM.
  return /TIMEOUT|HTTP_408|HTTP_5XX|HTTP_5\d\d|SERVER_ERROR/i.test(reason)
    && !/RATE_LIMIT|HTTP_429/i.test(reason);
}

function recordProviderUsage(request: AIRequest, log: ProviderExecutionLog, fallbackRank: number, usage?: AIProviderResult['usage']): void {
  // Las pruebas de routing usan providers mockeados y no deben abrir una
  // conexión Prisma externa; la telemetría real se conserva en runtime.
  if (process.env.NODE_ENV === 'test') return;
  void trackAiUsage({
    requestId: request.requestId || `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: log.provider,
    model: log.model || null,
    strategy: request.taskType || null,
    fallbackRank,
    inputTokens: usage?.promptTokens ?? null,
    outputTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    estimatedCost: usage?.estimatedCost ?? null,
    latencyMs: log.durationMs,
    success: log.success,
    errorCode: log.success ? null : log.fallbackReason,
    route: 'providerRouter',
    mode: request.mode || null,
  });
}

export class ProviderRouter {
  private providers: Map<AIProviderId, LegalAIProvider>;
  private getChainFn: () => string[];

  constructor(
    customProviders?: Map<AIProviderId, LegalAIProvider>,
    getChainFn: () => string[] = getProviderChain
  ) {
    this.getChainFn = getChainFn;
    if (customProviders) {
      this.providers = customProviders;
    } else {
      this.providers = new Map<AIProviderId, LegalAIProvider>([
        ["gemini", new GeminiProvider()],
        ["groq", new GroqProvider()],
        ["nvidia", new NVIDIAProvider()],
        ["local", new LocalProvider()],
      ]);
    }
  }

  getProvider(id: AIProviderId): LegalAIProvider | undefined {
    return this.providers.get(id);
  }

  async route(request: AIRequest): Promise<RouteResult> {
    const chain = this.getChainFn();
    const logs: ProviderExecutionLog[] = [];
    let lastFailureReason: string | null = null;
    const requestedProvider = (chain[0] as AIProviderId) || "gemini";
    const attemptedProviders = new Set<AIProviderId>();

    for (const [fallbackRank, providerIdStr] of chain.entries()) {
      const providerId = providerIdStr as AIProviderId;
      if (attemptedProviders.has(providerId)) {
        continue;
      }
      attemptedProviders.add(providerId);

      const provider = this.providers.get(providerId);
      if (!provider) {
        continue;
      }

      const isLocal = providerId === "local";

      // 1. Availability check (API key configured)
      if (!isLocal) {
        let available = false;
        try {
          available = await provider.isAvailable();
        } catch {
          available = false;
        }

        if (!available) {
          const reason = `${providerId.toUpperCase()}_NO_API_KEY`;
          lastFailureReason = reason;
          const unavailableLog = {
            provider: providerId,
            model: "none",
            durationMs: 0,
            outputChars: 0,
            success: false,
            fallbackReason: reason,
          } satisfies ProviderExecutionLog;
          logs.push(unavailableLog);
          recordProviderUsage(request, unavailableLog, fallbackRank);
          console.warn(
            `[ProviderRouter] Provider "${providerId}" no disponible (sin API key), pasando al siguiente.`
          );
          continue;
        }
      }

      // 2. Execution attempt
      const maxAttempts = 1 + resolveRetryCount(request, providerId);
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const startMs = Date.now();
        console.log(`[GenerationLifecycle] jobId=${request.requestId || ''} phase=provider state=processing progress= provider=${providerId} attempt=${attempt + 1} durationMs=0`);
        try {
          const res = await provider.generate(request);
        const durationMs = Date.now() - startMs;
        const outputChars = res.content ? res.content.length : 0;
        const trimmedLength = (res.content || "").trim().length;
        const hasContent = res.success && trimmedLength > 0;

        if (hasContent) {
          // Successful generation with non-empty content
          const successLog = {
            provider: providerId,
            model: res.model,
            durationMs,
            outputChars,
            success: true,
            fallbackReason: null,
          } satisfies ProviderExecutionLog;
          logs.push(successLog);
          recordProviderUsage(request, successLog, fallbackRank, res.usage);

          console.log(
            `[ProviderRouter] SUCCESS ${JSON.stringify({
              provider: providerId,
              model: res.model,
              durationMs,
              outputChars,
              success: true,
            })}`
          );
          console.log(`[GenerationLifecycle] jobId=${request.requestId || ''} phase=provider state=processing progress= provider=${providerId} attempt=${attempt + 1} durationMs=${durationMs}`);

          return {
            result: {
              ...res,
              providerRequested: requestedProvider,
              providerActuallyUsed: providerId,
              fallbackReason: lastFailureReason,
              origin: isLocal ? "LOCAL_PLACEHOLDER" : "AI_GENERATED_LEGAL_CONTENT",
              isLegalAiContent: !isLocal,
              latencyMs: durationMs,
              warnings: isLocal
                ? [
                    ...(res.warnings || []),
                    `Fallback local: ${requestedProvider} no disponible o falló. fallbackReason=${lastFailureReason || "unknown"}`,
                  ]
                : res.warnings,
            },
            executionLogs: logs,
          };
        }

        // Response empty or success === false
        const rawWarn = (res.warnings?.[0] || res.errorCode || "").toString();
        let failureReason =
          res.errorCode ||
          (trimmedLength === 0
            ? `${providerId.toUpperCase()}_EMPTY_RESPONSE`
            : `${providerId.toUpperCase()}_ERROR`);
        if (rawWarn.includes("HTTP 404") || rawWarn.includes("404")) {
          failureReason = `${providerId.toUpperCase()}_HTTP_404`;
        } else if (rawWarn.includes("HTTP 410") || rawWarn.includes("410")) {
          failureReason = `${providerId.toUpperCase()}_HTTP_410`;
        }
        lastFailureReason = failureReason;

        const failureLog = {
          provider: providerId,
          model: res.model,
          durationMs,
          outputChars: 0,
          success: false,
          fallbackReason: failureReason,
        } satisfies ProviderExecutionLog;
        logs.push(failureLog);
        recordProviderUsage(request, failureLog, fallbackRank, res.usage);

        console.warn(
          `[ProviderRouter] FALLBACK ${JSON.stringify({
            provider: providerId,
            model: res.model,
            durationMs,
            success: false,
            fallbackReason: failureReason,
          })}`
        );
        console.log(`[GenerationLifecycle] jobId=${request.requestId || ''} phase=provider state=processing progress= provider=${providerId} attempt=${attempt + 1} durationMs=${durationMs}`);
        if (attempt + 1 < maxAttempts && isRetryableFailure(failureReason)) continue;
        break;
        } catch (err: unknown) {
          const durationMs = Date.now() - startMs;
          const sanitized = sanitizeAiError(err);
          const failureReason = sanitized.toLowerCase().includes("timeout")
            ? `${providerId.toUpperCase()}_TIMEOUT`
            : sanitized.includes("404")
            ? `${providerId.toUpperCase()}_HTTP_404`
            : sanitized.includes("410")
            ? `${providerId.toUpperCase()}_HTTP_410`
            : sanitized.includes("429")
            ? `${providerId.toUpperCase()}_HTTP_429`
            : sanitized.includes("50")
            ? `${providerId.toUpperCase()}_HTTP_5XX`
            : `${providerId.toUpperCase()}_EXCEPTION`;
          lastFailureReason = failureReason;

          const exceptionLog = {
            provider: providerId,
            model: "unknown",
            durationMs,
            outputChars: 0,
            success: false,
            fallbackReason: failureReason,
          } satisfies ProviderExecutionLog;
          logs.push(exceptionLog);
          recordProviderUsage(request, exceptionLog, fallbackRank);

          console.warn(
            `[ProviderRouter] EXCEPTION ${JSON.stringify({
              provider: providerId,
              durationMs,
              success: false,
              fallbackReason: failureReason,
              detail: sanitized.slice(0, 150),
            })}`
          );
          console.log(`[GenerationLifecycle] jobId=${request.requestId || ''} phase=provider state=processing progress= provider=${providerId} attempt=${attempt + 1} durationMs=${durationMs}`);
          if (attempt + 1 < maxAttempts && isRetryableFailure(failureReason)) continue;
          break;
        }
      }
    }

    // 3. Last resort: Deterministic local fallback
    let localRes: AIProviderResult;
    if (!attemptedProviders.has("local")) {
      attemptedProviders.add("local");
      const fallbackLocal = this.providers.get("local") || new LocalProvider();
      localRes = await fallbackLocal.generate(request);
      const localLog = {
        provider: "local",
        model: localRes.model || "local-deterministic-rules-v1",
        durationMs: 0,
        outputChars: localRes.content?.length || 0,
        success: true,
        fallbackReason: null,
      } satisfies ProviderExecutionLog;
      logs.push(localLog);
      recordProviderUsage(request, localLog, chain.length, localRes.usage);
    } else {
      localRes = {
        provider: "local",
        model: "local-deterministic-rules-v1",
        success: true,
        content: "FALLBACK_DETERMINISTICO_LOCAL",
        latencyMs: 0,
        origin: "LOCAL_PLACEHOLDER",
        isLegalAiContent: false,
      };
    }
    const resolvedFallbackReason = lastFailureReason || "ALL_PROVIDERS_EXHAUSTED";
    return {
      result: {
        ...localRes,
        providerRequested: requestedProvider,
        providerActuallyUsed: "local",
        fallbackReason: resolvedFallbackReason,
        origin: "LOCAL_PLACEHOLDER",
        isLegalAiContent: false,
        warnings: [
          ...(localRes.warnings || []),
          `Fallback local: ${requestedProvider} no disponible o falló. fallbackReason=${resolvedFallbackReason}`,
        ],
      },
      executionLogs: logs,
    };
  }
}

// Singleton router instance for production use
export const defaultProviderRouter = new ProviderRouter();
