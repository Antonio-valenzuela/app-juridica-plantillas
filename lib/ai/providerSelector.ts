import { prisma } from "../prisma";
import { getAllowedProvidersForMode } from "./providerCapabilities";

export async function selectLeastUsedProvider(
  mode: string,
  route: string | null = null
): Promise<{ provider: string; strategy: string; usedFallbackNoKeys?: boolean }> {
  // 1. Get the allowed providers for this mode
  const allowed = getAllowedProvidersForMode(mode);

  // 2. Filter by actual API Key configuration — NVIDIA ONLY
  const configured = allowed.filter((prov) => {
    const p = prov.toLowerCase().trim();
    if (p === "nvidia") return !!process.env.NVIDIA_API_KEY?.trim();
    if (p === "local") return true;
    return false;
  });

  const nonLocalConfigured = configured.filter((p) => p.toLowerCase().trim() !== "local");

  if (nonLocalConfigured.length === 0) {
    console.warn("[AI Router] Fallback a 'local': ninguna API key configurada (NVIDIA_API_KEY)");
    return { provider: "local", strategy: "least-used", usedFallbackNoKeys: true };
  }

  if (configured.length === 1) {
    return { provider: configured[0], strategy: "least-used" };
  }

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 3. Consult health and lockout states
    const healthRecords = await prisma.aiProviderHealth.findMany({
      where: { provider: { in: configured } }
    });
    const healthMap = new Map(healthRecords.map((h) => [h.provider, h]));

    // Filter out disabled providers
    const healthyProviders = configured.filter((prov) => {
      const health = healthMap.get(prov);
      if (health && health.disabledUntil && health.disabledUntil > now) {
        return false;
      }
      return true;
    });

    const activeList = healthyProviders.length > 0 ? healthyProviders : configured;

    // 4. Query usage statistics in the last 24 hours
    const usageStats = await prisma.aiUsageEvent.groupBy({
      by: ["provider"],
      where: {
        provider: { in: activeList },
        createdAt: { gte: oneDayAgo },
        success: true
      },
      _count: { id: true },
      _sum: {
        totalTokens: true,
        estimatedCost: true
      }
    });

    const statsMap = new Map(usageStats.map((s) => [s.provider, s]));

    // Calculate score for each active provider: score = requests * 100 + tokens * 0.1 + cost * 10000
    let selected = activeList[0];
    let minScore = Infinity;

    for (const prov of activeList) {
      if (prov === "local") {
        // Local is a low priority fallback, give it a high baseline score in comparison
        const score = 1000000;
        if (score < minScore) {
          minScore = score;
          selected = prov;
        }
        continue;
      }

      const stat = statsMap.get(prov);
      const requests = stat?._count?.id || 0;
      const tokens = Number(stat?._sum?.totalTokens) || 0;
      const cost = Number(stat?._sum?.estimatedCost) || 0;

      const score = requests * 100 + tokens * 0.1 + cost * 10000;

      if (score < minScore) {
        minScore = score;
        selected = prov;
      }
    }

    return { provider: selected, strategy: "least-used" };
  } catch (err) {
    console.error("[providerSelector] Error selecting least used provider:", err);
    // Safe default to the first configured non-local provider if available
    const nonLocal = configured.find((p) => p !== "local");
    if (!nonLocal) {
      console.warn("[AI Router] Fallback a 'local': ninguna API key configurada (NVIDIA_API_KEY)");
      return { provider: "local", strategy: "fallback-default", usedFallbackNoKeys: true };
    }
    return { provider: nonLocal, strategy: "fallback-default" };
  }
}
