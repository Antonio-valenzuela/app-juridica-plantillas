export type AiMode = "empty_search_assistant" | "rag" | "classification" | "summary" | "general";

export const providerCapabilities: Record<AiMode, string[]> = {
  empty_search_assistant: ["gemini", "groq", "nvidia", "local"],
  rag: ["gemini", "groq", "nvidia", "local"],
  classification: ["gemini", "groq", "nvidia", "local"],
  summary: ["gemini", "groq", "nvidia", "local"],
  general: ["gemini", "groq", "nvidia", "local"],
};

export function getAllowedProvidersForMode(mode: string): string[] {
  const normalizedMode = (mode || "general").toLowerCase() as AiMode;
  if (normalizedMode in providerCapabilities) {
    return providerCapabilities[normalizedMode];
  }
  return providerCapabilities.general;
}
