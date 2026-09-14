import { prisma } from "../prisma";
import { Prisma } from "@prisma/client";

export async function trackAiUsage(params: {
  requestId: string;
  provider: string;
  model: string | null;
  strategy: string | null;
  fallbackRank: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
  route: string | null;
  mode: string | null;
}) {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        requestId: params.requestId,
        provider: params.provider,
        model: params.model,
        strategy: params.strategy,
        fallbackRank: params.fallbackRank,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        totalTokens: params.totalTokens,
        estimatedCost: params.estimatedCost != null ? new Prisma.Decimal(params.estimatedCost.toFixed(6)) : null,
        latencyMs: params.latencyMs,
        success: params.success,
        errorCode: params.errorCode,
        route: params.route,
        mode: params.mode,
      }
    });

    // Update AI Provider Health
    const now = new Date();

    if (params.success) {
      await prisma.aiProviderHealth.upsert({
        where: { provider: params.provider },
        update: {
          consecutiveFailures: 0,
          lastSuccessAt: now,
          lastErrorCode: null,
          disabledUntil: null,
        },
        create: {
          provider: params.provider,
          consecutiveFailures: 0,
          lastSuccessAt: now,
        }
      });
    } else {
      // Find current consecutive failures to calculate if we need to disable it
      const currentHealth = await prisma.aiProviderHealth.findUnique({
        where: { provider: params.provider }
      });
      const currentFailures = (currentHealth?.consecutiveFailures || 0) + 1;
      const disabledUntil = currentFailures >= 3 ? new Date(now.getTime() + 5 * 60 * 1000) : null;

      await prisma.aiProviderHealth.upsert({
        where: { provider: params.provider },
        update: {
          consecutiveFailures: currentFailures,
          lastFailureAt: now,
          lastErrorCode: params.errorCode || "unknown_error",
          disabledUntil,
        },
        create: {
          provider: params.provider,
          consecutiveFailures: 1,
          lastFailureAt: now,
          lastErrorCode: params.errorCode || "unknown_error",
          disabledUntil,
        }
      });
    }
  } catch (err) {
    console.error("[trackAiUsage] Error saving usage tracking event:", err);
  }
}
export type { Prisma };
