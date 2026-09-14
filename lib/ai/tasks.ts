import type { LegalAiAnalysis, LegalAiInput, LegalMatter } from "./types";

export type AiTask =
  | "legal_text_analysis"
  | "legal_image_analysis"
  | "recent_context_search"
  | "alert_matching"
  | "weekly_digest";

export type AlertMatchResult = {
  matched: boolean;
  score: number;
  reasons: string[];
  matchedKeywords: string[];
};

export type WeeklyDigestResult = {
  title: string;
  periodStart: string;
  periodEnd: string;
  totalDocuments: number;
  highImpactCount: number;
  matters: Record<string, number>;
  highlights: string[];
  recommendations: string[];
};

export type AnalyzeLegalImageInput = {
  imageUrl?: string;
  mimeType?: string;
  context?: string;
};

export type AnalyzeLegalImageResult = {
  ok: boolean;
  reason: "vision_not_configured" | "not_implemented";
  provider: string;
};

export type RecentContextInput = {
  query: string;
  matter?: LegalMatter | string | null;
  limit?: number;
};

export type RecentContextResult = {
  results: {
    title: string;
    url?: string;
    source?: string;
    publishedAt?: string;
    snippet?: string;
  }[];
  provider: "none" | "gemini_grounding" | "tavily" | "serpapi";
};

export type AlertMatchInput = {
  ruleText: string;
  matter?: LegalMatter | string | null;
  keywords?: string[];
  entities?: string[];
  affectedSectors?: string[];
  documentTitle: string;
  documentSummary?: string | null;
  aiAnalysis?: LegalAiAnalysis;
};

export type WeeklyDigestDocument = {
  title: string;
  summary?: string | null;
  matter?: string | null;
  impactLevel?: string | null;
  source?: string | null;
  publishedAt?: Date | string | null;
};

export type AnalyzeLegalTextInput = LegalAiInput;
