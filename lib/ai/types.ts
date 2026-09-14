export type LegalMatter =
  | "fiscal"
  | "laboral"
  | "salud"
  | "ambiental"
  | "energia"
  | "financiero"
  | "administrativo"
  | "aduanal"
  | "comercio_exterior"
  | "proteccion_datos"
  | "otro";

export type LegalImpactLevel = "low" | "medium" | "high";

export type LegalAiProviderName = "local" | "nvidia";

export type LegalAiInput = {
  title: string;
  summary?: string | null;
  text?: string | null;
  sourceUrl?: string | null;
  publishedAt?: Date | string | null;
};

export type LegalAiAnalysis = {
  matter: LegalMatter;
  confidence: number;
  summary: string;
  entities: string[];
  affectedSectors: string[];
  impactLevel: LegalImpactLevel;
  keywords: string[];
  authority: string | null;
  relatedTopics: string[];
  explanation: string;
  sourceGrounding?: {
    title?: string;
    url?: string;
  }[];
};

export const LEGAL_MATTERS: readonly LegalMatter[] = [
  "fiscal",
  "laboral",
  "salud",
  "ambiental",
  "energia",
  "financiero",
  "administrativo",
  "aduanal",
  "comercio_exterior",
  "proteccion_datos",
  "otro",
] as const;

export function isLegalMatter(value: unknown): value is LegalMatter {
  return typeof value === "string" && LEGAL_MATTERS.includes(value as LegalMatter);
}

export function normalizeImpactLevel(value: unknown): LegalImpactLevel {
  const normalized = String(value || "").toLowerCase().trim();

  if (["high", "alto", "alta", "critical", "critico", "crítico"].includes(normalized)) {
    return "high";
  }

  if (["medium", "medio", "media", "moderado", "moderada"].includes(normalized)) {
    return "medium";
  }

  return "low";
}

export function clampConfidence(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0.35;
  return Math.max(0, Math.min(1, parsed));
}

export function asStringArray(value: unknown, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

export function extractJsonObject(raw: string) {
  const clean = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }

    throw new Error("AI provider did not return valid JSON");
  }
}

export function sanitizeLegalAiAnalysis(value: unknown, input?: LegalAiInput): LegalAiAnalysis {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const matter = isLegalMatter(raw.matter) ? raw.matter : "otro";
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim().slice(0, 2000)
      : buildFallbackSummary(input, matter);

  const groundingFromInput =
    input?.sourceUrl
      ? [
          {
            title: input.title,
            url: input.sourceUrl,
          },
        ]
      : undefined;

  const rawGrounding = Array.isArray(raw.sourceGrounding)
    ? raw.sourceGrounding
        .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
        .map((item) => ({
          title: typeof item.title === "string" ? item.title : undefined,
          url: typeof item.url === "string" ? item.url : undefined,
        }))
        .filter((item) => item.title || item.url)
        .slice(0, 5)
    : undefined;

  const rawAuthority = typeof raw.authority === "string" && raw.authority.trim()
    ? raw.authority.trim()
    : null;

  return {
    matter,
    confidence: clampConfidence(raw.confidence),
    summary,
    entities: asStringArray(raw.entities, 20),
    affectedSectors: asStringArray(raw.affectedSectors, 12),
    impactLevel: normalizeImpactLevel(raw.impactLevel),
    keywords: asStringArray(raw.keywords, 12),
    authority: rawAuthority === "null" || rawAuthority === "" ? null : rawAuthority,
    relatedTopics: asStringArray(raw.relatedTopics || raw.temasRelacionados || raw.related_topics, 10),
    explanation: typeof raw.explanation === "string" && raw.explanation.trim()
      ? raw.explanation.trim()
      : "",
    sourceGrounding: rawGrounding?.length ? rawGrounding : groundingFromInput,
  };
}

export function buildFallbackSummary(input: LegalAiInput | undefined, matter: LegalMatter) {
  const title = input?.title?.trim();
  if (title) {
    return `Publicación oficial relacionada con materia ${matter}: ${title}`;
  }

  return `Publicación oficial relacionada con materia ${matter}.`;
}

export function buildLegalAiPrompt(input: LegalAiInput) {
  const payload = {
    title: input.title,
    summary: input.summary || null,
    text: input.text ? input.text : null,
    sourceUrl: input.sourceUrl || null,
    publishedAt: input.publishedAt || null,
  };

  return [
    "Actúa como analista jurídico-regulatorio mexicano.",
    "Analiza el documento oficial y responde SOLO JSON válido.",
    "No inventes datos. Si falta evidencia, usa materia 'otro' y baja confianza.",
    "Bajo ninguna circunstancia inventes o mezcles datos no oficiales con el análisis.",
    "Si la autoridad no es clara o no hay evidencia textual, pon null en 'authority'. No uses 'SAT' u otra sigla a menos que aparezca explícitamente.",
    "",
    "Contrato JSON estricto:",
    "{",
    '  "matter": "fiscal|laboral|salud|ambiental|energia|financiero|administrativo|aduanal|comercio_exterior|proteccion_datos|otro",',
    '  "confidence": 0.0,',
    '  "summary": "resumen ejecutivo breve en español",',
    '  "entities": ["autoridades, leyes, organismos o sujetos relevantes"],',
    '  "affectedSectors": ["sectores afectados"],',
    '  "impactLevel": "low|medium|high",',
    '  "keywords": ["máximo 12 términos útiles"],',
    '  "authority": "siglas o nombre de la autoridad emisora del documento, o null si no se identifica claramente",',
    '  "relatedTopics": ["temas o materias legales relacionadas"],',
    '  "explanation": "explicación breve y sencilla del impacto de la norma",',
    '  "sourceGrounding": [{"title":"título fuente","url":"url fuente"}]',
    "}",
    "",
    "Documento:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export function getAiTimeoutMs() {
  const parsed = Number(process.env.AI_REQUEST_TIMEOUT_MS || 20000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
}
