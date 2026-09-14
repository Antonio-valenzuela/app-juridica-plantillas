export type AiMode = "empty_search_assistant" | "rag" | "classification" | "summary" | "general";

export const providerCapabilities: Record<AiMode, string[]> = {
  // NVIDIA ONLY: solo nvidia + local determinístico
  empty_search_assistant: ["nvidia", "local"],
  rag: ["nvidia", "local"],
  classification: ["nvidia", "local"],
  summary: ["nvidia", "local"],
  general: ["nvidia", "local"],
};

export function getAllowedProvidersForMode(mode: string): string[] {
  const normalizedMode = (mode || "general").toLowerCase() as AiMode;
  if (normalizedMode in providerCapabilities) {
    return providerCapabilities[normalizedMode];
  }
  return providerCapabilities.general;
}
