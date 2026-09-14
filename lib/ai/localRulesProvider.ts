import type { LegalAiAnalysis, LegalAiInput } from "./types";
import { sanitizeLegalAiAnalysis } from "./types";

/**
 * Fallback determinístico local — NVIDIA ONLY: solo se usa cuando NVIDIA no está disponible.
 * No simula IA externa, solo reglas locales.
 */
export async function analyzeWithLocalRules(input: LegalAiInput): Promise<LegalAiAnalysis> {
  return sanitizeLegalAiAnalysis(
    {
      matter: "otro",
      confidence: 0.35,
      summary: `Análisis local: ${input.title?.slice(0, 100) || "documento"} — sin IA externa, requiere verificación en fuentes oficiales.`,
      entities: [],
      affectedSectors: [],
      impactLevel: "low",
      keywords: [],
      authority: null,
      relatedTopics: [],
      explanation: "Resultado generado por reglas locales determinísticas. Verifica en DOF/SJF.",
    },
    input
  );
}
