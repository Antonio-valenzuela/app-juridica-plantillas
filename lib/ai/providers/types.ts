export type AIProviderId = "nvidia" | "gemini" | "groq" | "openrouter" | "local";
export type AIResponseOrigin =
  | "AI_GENERATED_LEGAL_CONTENT"
  | "LOCAL_PLACEHOLDER"
  | "DETERMINISTIC_FALLBACK"
  | "USER"
  | "SOURCE_DIRECT";

export interface AIRequest {
  systemPrompt?: string;
  userMessage: string;
  mode?: "fast" | "deep";
  taskType?: string;
  legalContext?: Record<string, any>;
  retrievedSources?: Array<{
    id?: string;
    title: string;
    officialUrl?: string;
    sourceType?: string;
    snippet?: string;
  }>;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  outputSchema?: Record<string, any>;
  temperature?: number;
  maxTokens?: number;
  /** Reintentos opt-in por proveedor para timeouts, rate limits y 5xx. */
  maxProviderRetries?: number;
  requestId?: string;
}

export interface AIProviderResult {
  provider: AIProviderId;
  model: string;
  success: boolean;
  content: string;
  structuredOutput?: Record<string, any> | null;
  latencyMs: number;
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    estimatedCost?: number;
  };
  finishReason?: string;
  isTruncated?: boolean;
  errorCode?: string | null;
  retryable?: boolean;
  citations?: Array<{ title: string; url?: string | null; fuente?: string; materia?: string }>;
  warnings?: string[];
  providerRequested?: AIProviderId;
  providerActuallyUsed?: AIProviderId | "none";
  fallbackReason?: string | null;
  origin?: AIResponseOrigin;
  isLegalAiContent?: boolean;
}

export interface AIHealthResult {
  provider: AIProviderId;
  configured: boolean;
  available: boolean;
  model: string;
  lastCheckAt: string;
  latencyMs?: number;
  lastError?: string | null;
}

export interface LegalAIProvider {
  id: AIProviderId;
  isAvailable(): Promise<boolean>;
  generate(request: AIRequest): Promise<AIProviderResult>;
  healthCheck?(): Promise<AIHealthResult>;
}

export type AIProvider = LegalAIProvider;

export function redactSecrets(text: string): string {
  if (!text) return "";
  return text
    .replace(/([\?&]key=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/Authorization:\s*[^\s"']+/gi, "Authorization: [REDACTED]")
    .replace(/x-goog-api-key:\s*[^\s"']+/gi, "x-goog-api-key: [REDACTED]")
    .replace(/x-api-key:\s*[^\s"']+/gi, "x-api-key: [REDACTED]")
    .replace(/gsk_[a-zA-Z0-9_-]+/gi, "gsk_[REDACTED]")
    .replace(/nvapi-[a-zA-Z0-9_-]+/gi, "nvapi-[REDACTED]")
    .replace(/AIza[a-zA-Z0-9_-]+/gi, "AIza[REDACTED]")
    .replace(/AQ\.[a-zA-Z0-9_-]+/gi, "AQ.[REDACTED]")
    .replace(/sk-[a-zA-Z0-9_-]{20,}/gi, "sk-[REDACTED]");
}

export function sanitizeAiError(err: unknown): string {
  if (!err) return "Error desconocido";
  const msg = err instanceof Error ? err.message : String(err);
  return redactSecrets(msg).slice(0, 300);
}
