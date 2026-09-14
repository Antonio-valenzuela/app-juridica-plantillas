import type { RawSourceItem, SourceName } from "@/lib/sources/types";

export const DOCUMENT_TAXONOMY = [
  "Constitución",
  "Ley",
  "Código",
  "Reglamento",
  "Decreto",
  "Reforma",
  "Acuerdo",
  "Circular",
  "Aviso",
  "Resolución",
  "Sentencia",
  "Jurisprudencia",
  "Tesis aislada",
  "Convenio",
  "Norma oficial",
  "Tarifa",
  "Tipo de cambio",
  "Información administrativa",
  "Otro",
  "Sin clasificar",
  "Revisión requerida",
] as const;

export type DocumentTaxonomy = (typeof DOCUMENT_TAXONOMY)[number];

export type NormalizedItem = {
  source: SourceName;
  sourceId: string;
  title: string;
  url: string;
  canonicalUrl: string;
  published: Date;
  publicationDate?: Date | null;
  lastReformDate?: Date | null;
  retrievedAt: Date;
  summary: string | null;
  tipo: string | null;
  tema: string | null;
  impacto: "alto" | "medio" | "bajo" | null;
  keywordsHit: string[];
  rawRef: string | null;
  raw: Record<string, unknown> | null;
  qualityStatus?: "valid" | "suspicious";
  qualityReasons?: string[];
};

export function normalizeUnicode(value: string) {
  return value.normalize("NFC");
}

export function cleanText(value?: string | null) {
  return normalizeUnicode(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripHtml(html: string) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

export function filterNoise(text: string): string {
  if (!text) return text;
  return text
    .replace(/Inicio\s*\|\s*Contacto\s*\|\s*Ayuda/gi, "")
    .replace(/Ejemplar de hoy\s*\|\s*Búsqueda/gi, "")
    .replace(/Derechos Reservados/gi, "")
    .replace(/404 Not Found/gi, "")
    .replace(/Please login to continue/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveTaxonomy(
  rawTipo: string | null | undefined,
  hasVerifiableLegalEvidence: boolean = false,
  title?: string
): DocumentTaxonomy {
  const normalizedTitle = (title || "").toLowerCase();
  
  // Specific checks for administrative/financial items
  if (normalizedTitle.includes("saldos") || normalizedTitle.includes("fideicomiso") || normalizedTitle.includes("mandato")) {
    return "Información administrativa";
  }
  if (normalizedTitle.includes("tipo de cambio") || normalizedTitle.includes("udis")) {
    return "Tipo de cambio";
  }

  if (!rawTipo) return "Sin clasificar";

  const normalized = rawTipo.trim().toLowerCase();
  
  if (!hasVerifiableLegalEvidence && (normalized === "ley" || normalized === "vigente")) {
    return "Revisión requerida";
  }

  const exactMatch = DOCUMENT_TAXONOMY.find(
    (t) => t.toLowerCase() === normalized
  );
  if (exactMatch) return exactMatch;

  if (normalized.includes("ley")) return "Ley";
  if (normalized.includes("código") || normalized.includes("codigo")) return "Código";
  if (normalized.includes("acuerdo")) return "Acuerdo";
  if (normalized.includes("decreto")) return "Decreto";
  if (normalized.includes("reglamento")) return "Reglamento";
  if (normalized.includes("aviso")) return "Aviso";
  if (normalized.includes("resolución") || normalized.includes("resolucion")) return "Resolución";
  if (normalized.includes("circular")) return "Circular";
  if (normalized.includes("norma oficial") || normalized.includes("nom")) return "Norma oficial";
  if (normalized.includes("convenio")) return "Convenio";
  if (normalized.includes("tarifa")) return "Tarifa";
  
  return "Sin clasificar";
}

export function canonicalizeUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.searchParams.sort();
  return parsed.toString();
}

export function parseMxDate(raw: string): Date | null {
  const text = cleanText(raw).toLowerCase();
  const numeric = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (numeric) {
    const d = new Date(
      Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]))
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const spanish = text.match(
    /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i
  );
  if (!spanish) return null;

  const months: Record<string, number> = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11,
  };
  const month = months[spanish[2].normalize("NFC")];
  if (month === undefined) return null;

  const d = new Date(Date.UTC(Number(spanish[3]), month, Number(spanish[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toSidofDate(date: Date) {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  return `${day}-${month}-${year}`;
}

export function normalizeRawItem(item: RawSourceItem): NormalizedItem {
  const title = filterNoise(cleanText(item.title));
  const summary = item.summary ? filterNoise(cleanText(item.summary)).slice(0, 2000) : null;
  const canonicalUrl = canonicalizeUrl(item.canonicalUrl || item.url);
  if (!(item.published instanceof Date) || Number.isNaN(item.published.getTime())) {
    throw new Error('La fecha jurídica de publicación no está verificada.');
  }

  return {
    source: item.source,
    sourceId: cleanText(item.sourceId),
    title,
    url: item.url,
    canonicalUrl,
    published: item.published,
    publicationDate: item.publicationDate ?? null,
    lastReformDate: item.lastReformDate ?? null,
    retrievedAt: new Date(),
    summary,
    tipo: resolveTaxonomy(item.tipo, !!item.qualityStatus && item.qualityStatus === "valid", title),
    tema: item.tema ? cleanText(item.tema).toLowerCase() : null,
    impacto: item.impacto || null,
    keywordsHit: item.keywordsHit || [],
    rawRef: item.rawRef || item.sourceId || null,
    raw: item.raw || null,
    qualityStatus: item.qualityStatus,
    qualityReasons: item.qualityReasons,
  };
}
