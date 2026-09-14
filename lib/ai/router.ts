import { analyzeWithLocalRules } from "./localRulesProvider";
import { analyzeLegalImage as analyzeLegalImageWithProvider } from "./visionProvider";
import { searchRecentContext as searchRecentContextWithProvider } from "./recentContextProvider";
import type {
  AlertMatchInput,
  AnalyzeLegalImageInput,
  AnalyzeLegalTextInput,
  RecentContextInput,
  WeeklyDigestDocument,
} from "./tasks";
import type { LegalAiAnalysis, LegalAiInput } from "./types";
import { buildLegalAiPrompt, sanitizeLegalAiAnalysis, extractJsonObject } from "./types";
import { runLegalAI } from "./orchestrator";
import { logger, generateRequestId } from "../logger";

// NVIDIA ONLY wrapper — delega a runLegalAI, no duplicar fetch/provider logic
export async function routeLlmCompletion(
  prompt: string,
  operation: string,
  requestIdOrOptions: string | { signal?: AbortSignal } = Math.random().toString(36).substring(7),
  extraParams?: { mode?: string; route?: string }
): Promise<{
  answer: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  attemptedProviders: string[];
  failedProviders: { provider: string; reason: string }[];
  degraded: boolean;
}> {
  const requestId = typeof requestIdOrOptions === "string" ? requestIdOrOptions : generateRequestId();
  const start = Date.now();
  try {
    const res = await runLegalAI({
      systemPrompt: `Operación: ${operation}`,
      userMessage: prompt,
      mode: (extraParams?.mode as any) || "fast",
      temperature: 0.2,
      maxTokens: 3000,
      requestId,
    });
    const degraded = res.provider === "local";
    logger.info("routeLlmCompletion", {
      requestId,
      provider: res.provider,
      model: res.model,
      operation,
      durationMs: Date.now() - start,
      status: res.success ? "success" : "failed",
    });
    return {
      answer: res.content || "",
      provider: res.provider,
      model: res.model,
      usedFallback: degraded,
      attemptedProviders: [res.provider],
      failedProviders: res.success ? [] : [{ provider: res.provider, reason: res.errorCode || "unknown" }],
      degraded,
    };
  } catch (err: any) {
    logger.error("routeLlmCompletion failed", { requestId, operation, status: "failed", errorCode: err?.message?.slice(0, 100) });
    const localRes = await runLegalAI({ userMessage: prompt, mode: "fast" as any });
    return {
      answer: localRes.content || "",
      provider: "local",
      model: "local-static",
      usedFallback: true,
      attemptedProviders: ["local"],
      failedProviders: [{ provider: "nvidia", reason: "error" }],
      degraded: true,
    };
  }
}

export async function routeStructuredAnalysis(
  input: LegalAiInput,
  operation: string,
  requestId: string = generateRequestId()
): Promise<{
  analysis: LegalAiAnalysis;
  provider: string;
  model: string;
  usedFallback: boolean;
  attemptedProviders: string[];
  failedProviders: { provider: string; reason: string }[];
  degraded: boolean;
}> {
  const prompt = buildLegalAiPrompt(input);
  const start = Date.now();
  try {
    const res = await runLegalAI({
      systemPrompt: "Análisis jurídico estructurado",
      userMessage: prompt,
      mode: "fast",
      temperature: 0.1,
      maxTokens: 2000,
      requestId,
    });
    // Si es local, usar reglas locales para análisis estructurado
    if (res.provider === "local" || !res.content) {
      const analysis = await analyzeWithLocalRules(input);
      return { analysis, provider: "local", model: "local-rules", usedFallback: true, attemptedProviders: ["nvidia", "local"], failedProviders: [{ provider: "nvidia", reason: "fallback" }], degraded: true };
    }
    const parsed = sanitizeLegalAiAnalysis(extractJsonObject(res.content), input);
    logger.info("routeStructuredAnalysis", { requestId, provider: res.provider, operation, durationMs: Date.now() - start, status: "success" });
    return { analysis: parsed, provider: res.provider, model: res.model, usedFallback: false, attemptedProviders: [res.provider], failedProviders: [], degraded: false };
  } catch (err: any) {
    logger.error("routeStructuredAnalysis failed", { requestId, operation, errorCode: err?.message?.slice(0, 100) });
    const analysis = await analyzeWithLocalRules(input);
    return { analysis, provider: "local", model: "local-rules", usedFallback: true, attemptedProviders: ["local"], failedProviders: [{ provider: "nvidia", reason: "error" }], degraded: true };
  }
}

// Keep existing TASK methods — wrappers

export async function analyzeLegalText(input: AnalyzeLegalTextInput) {
  const result = await routeStructuredAnalysis(input, "impact_classification");
  return result.analysis;
}

export async function analyzeLegalImage(input: AnalyzeLegalImageInput) {
  return analyzeLegalImageWithProvider(input);
}

export async function searchRecentContext(input: RecentContextInput) {
  return searchRecentContextWithProvider(input);
}

export async function matchAlertRule(input: AlertMatchInput) {
  const aiAnalysis =
    input.aiAnalysis ||
    (await analyzeLegalText({
      title: input.documentTitle,
      summary: input.documentSummary,
    }));
  return { matched: false, reason: "No matching rules", score: 0 };
}

export async function generateWeeklyDigest(input: {
  documents: WeeklyDigestDocument[];
  periodStart: Date | string;
  periodEnd: Date | string;
}) {
  return { summary: "Resumen no disponible en modo NVIDIA ONLY", highlights: [] };
}
