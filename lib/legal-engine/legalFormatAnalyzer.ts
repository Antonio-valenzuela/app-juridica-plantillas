import { runFastMode } from '@/lib/ai/orchestrator';

/**
 * CAPA 1 — Análisis estructural con NVIDIA (vía orquestador existente).
 * La IA SOLO clasifica estructura; jamás devuelve prosa, Markdown ni HTML.
 * La aplicación (legalFormatter.ts) aplica el formato visual determinísticamente.
 */

export type LegalFormatElementType =
  | 'title'
  | 'section'
  | 'subheading'
  | 'paragraph'
  | 'quote'
  | 'enumeration'
  | 'table'
  | 'petition'
  | 'signature'
  | 'internal_note';

export const LEGAL_FORMAT_ELEMENT_TYPES: readonly LegalFormatElementType[] = [
  'title', 'section', 'subheading', 'paragraph', 'quote', 'enumeration', 'table', 'petition', 'signature', 'internal_note',
];

export interface LegalFormatParty {
  role: string;
  name: string;
}

export interface LegalFormatElement {
  type: LegalFormatElementType;
  number?: string;
  heading?: string;
  text?: string;
  items?: string[];
  rows?: string[][];
  level?: number;
}

export interface LegalFormatHeaderData {
  authority?: string;
  caseNumber?: string;
  matter?: string;
  court?: string;
}

export interface LegalFormatAnalysis {
  documentType: string;
  title: string;
  header: LegalFormatHeaderData;
  parties: LegalFormatParty[];
  sections: LegalFormatElement[];
  warnings: string[];
  source: 'ai' | 'fallback';
}

const SYSTEM_PROMPT =
  'Actúas como analista estructural de documentos jurídicos mexicanos. No debes reescribir el contenido. Debes identificar jerarquía, secciones, citas, listas, tablas, firmas, encabezados y otros elementos estructurales. Devuelve exclusivamente JSON válido.';

function buildUserPrompt(text: string): string {
  return `Analiza la ESTRUCTURA del siguiente escrito jurídico mexicano y devuelvese EXCLUSIVAMENTE un objeto JSON válido con esta forma exacta:

{
  "documentType": "snake_case_del_tipo_de_escrito",
  "title": "TÍTULO PRINCIPAL DEL DOCUMENTO",
  "header": {
    "authority": "autoridad destinataria o vacío",
    "caseNumber": "expediente o vacío",
    "matter": "asunto o juicio o vacío",
    "court": "tribunal o vacío"
  },
  "parties": [{ "role": "quejoso|tercero_interesado|autoridad|actor|demandado", "name": "nombre textual" }],
  "sections": [
    { "type": "title", "text": "...", "level": 1 },
    { "type": "section", "number": "I", "heading": "TEXTO DEL ENCABEZADO", "level": 1 },
    { "type": "subheading", "number": "1.", "heading": "...", "level": 2 },
    { "type": "paragraph", "text": "...", "level": 0 },
    { "type": "quote", "text": "...", "level": 0 },
    { "type": "enumeration", "items": ["...", "..."] },
    { "type": "table", "rows": [["col1", "col2"], ["...", "..."]] },
    { "type": "petition", "heading": "PETITORIOS", "level": 1 },
    { "type": "signature", "text": "...", "level": 0 },
    { "type": "internal_note", "text": "...", "level": 0 }
  ]
}

REGLAS ESTRICTAS:
1. Los valores "text", "heading" e "items" deben ser COPIAS LITERALES del documento. NO resumas, NO corrijas, NO reescribas.
2. Tipos permitidos SOLO: title, section, subheading, paragraph, quote, enumeration, table, petition, signature, internal_note.
3. Notas editoriales tipo "Nota de elaboración, a suprimir..." → type "internal_note".
4. Citas textuales largas y transcripciones de resoluciones → type "quote".
5. Series PRIMERO./SEGUNDO./(i)/(ii)/numerales → agrupa cada serie como un solo elemento "enumeration" con items literales.
6. Si no hay tabla real, NO inventes el elemento table.
7. Conserva numeraciones originales exactas (ej. "XVI.").
8. Sin Markdown, sin HTML, sin comentarios. SOLO el objeto JSON.

DOCUMENTO:
${text}`;
}

function extractJsonBlock(raw: string): string {
  const cleaned = raw.replace(/```json/gi, '```').trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : '';
}

function sanitizeStringArray(value: unknown, maxItems = 60): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
}

function sanitizeElement(raw: any): LegalFormatElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '').trim() as LegalFormatElementType;
  if (!LEGAL_FORMAT_ELEMENT_TYPES.includes(type)) return null;

  const el: LegalFormatElement = { type };
  if (typeof raw.number === 'string' && raw.number.trim()) el.number = raw.number.trim().slice(0, 24);
  if (typeof raw.heading === 'string' && raw.heading.trim()) el.heading = raw.heading.trim().slice(0, 300);
  if (typeof raw.text === 'string' && raw.text.trim()) el.text = raw.text.trim().slice(0, 20000);
  if (Array.isArray(raw.items)) el.items = sanitizeStringArray(raw.items);
  if (Array.isArray(raw.rows)) {
    el.rows = raw.rows
      .filter((r: unknown): r is string[] => Array.isArray(r))
      .map((r: unknown[]) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()).slice(0, 12))
      .filter((r: string[]) => r.some((c) => c.length > 0))
      .slice(0, 80);
  }
  const level = Number(raw.level);
  el.level = Number.isFinite(level) ? Math.max(0, Math.min(3, Math.round(level))) : 0;

  // Un elemento debe traer contenido literal; si viene vacío se descarta (no inventar).
  const hasContent = Boolean(el.text || el.heading || (el.items && el.items.length > 0) || (el.rows && el.rows.length > 0));
  return hasContent ? el : null;
}

/** Fallback 100% determinístico: párrafos literales, sin IA. Garantiza preservación total. */
export function buildFallbackAnalysis(text: string): LegalFormatAnalysis {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0);

  const sections: LegalFormatElement[] = paragraphs.map((p) => ({ type: 'paragraph' as const, text: p, level: 0 }));
  return {
    documentType: 'escrito_juridico',
    title: '',
    header: {},
    parties: [],
    sections,
    warnings: ['Análisis estructural con IA no disponible; se aplicó formato básico preservando el texto íntegro.'],
    source: 'fallback',
  };
}

/**
 * Analiza la estructura del escrito. Devuelve análisis saneado; ante fallo de IA
 * retorna el fallback determinístico (nunca lanza hacia el llamador).
 */
export async function analyzeLegalDocumentFormatting(
  text: string,
  options?: { timeoutMs?: number }
): Promise<{ analysis: LegalFormatAnalysis; aiUsed: boolean; provider?: string; model?: string; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { analysis: buildFallbackAnalysis(''), aiUsed: false, error: 'EMPTY_TEXT' };
  }

  const timeoutMs = options?.timeoutMs || Number(process.env.FORMAT_ANALYSIS_AI_TIMEOUT_MS) || 90000;

  try {
    const aiPromise = runFastMode({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserPrompt(trimmed.slice(0, Number(process.env.FORMAT_ANALYSIS_MAX_CHARS) || 24000)),
      mode: 'fast',
      temperature: 0.1,
      maxTokens: 6000,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de análisis estructural (${timeoutMs}ms)`)), timeoutMs)
    );

    const res = await Promise.race([aiPromise, timeoutPromise]);
    if (!res.success || !res.content) {
      return { analysis: buildFallbackAnalysis(trimmed), aiUsed: false, error: 'AI_NO_CONTENT' };
    }

    const jsonBlock = extractJsonBlock(res.content);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonBlock);
    } catch {
      return { analysis: buildFallbackAnalysis(trimmed), aiUsed: true, provider: res.provider, error: 'AI_INVALID_JSON' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { analysis: buildFallbackAnalysis(trimmed), aiUsed: true, provider: res.provider, error: 'AI_INVALID_JSON' };
    }

    const rawSections = Array.isArray(parsed.sections) ? parsed.sections : [];
    const elements = rawSections
      .map(sanitizeElement)
      .filter((e: LegalFormatElement | null): e is LegalFormatElement => e !== null);

    // Cobertura mínima: si la IA devolvió casi nada frente al tamaño real, usar fallback.
    const coveredChars = elements.reduce(
      (acc: number, e: LegalFormatElement) => acc + (e.text?.length || 0) + (e.items || []).join(' ').length,
      0
    );
    if (elements.length === 0 || coveredChars < trimmed.length * 0.5) {
      return {
        analysis: buildFallbackAnalysis(trimmed),
        aiUsed: true,
        provider: res.provider,
        model: res.model,
        error: 'AI_LOW_COVERAGE',
      };
    }

    const header = parsed.header && typeof parsed.header === 'object' ? parsed.header : {};
    const parties = Array.isArray(parsed.parties)
      ? parsed.parties
          .filter((p: any) => p && typeof p.role === 'string' && typeof p.name === 'string' && p.name.trim())
          .map((p: any) => ({ role: String(p.role).trim().slice(0, 60), name: String(p.name).trim().slice(0, 300) }))
          .slice(0, 12)
      : [];

    const analysis: LegalFormatAnalysis = {
      documentType: typeof parsed.documentType === 'string' && parsed.documentType.trim()
        ? parsed.documentType.trim().slice(0, 120)
        : 'escrito_juridico',
      title: typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 300) : '',
      header: {
        authority: typeof header.authority === 'string' ? header.authority.trim().slice(0, 300) : undefined,
        caseNumber: typeof header.caseNumber === 'string' ? header.caseNumber.trim().slice(0, 160) : undefined,
        matter: typeof header.matter === 'string' ? header.matter.trim().slice(0, 300) : undefined,
        court: typeof header.court === 'string' ? header.court.trim().slice(0, 300) : undefined,
      },
      parties,
      sections: elements,
      warnings: [],
      source: 'ai',
    };

    return { analysis, aiUsed: true, provider: res.provider, model: res.model };
  } catch (err: any) {
    console.warn('[legalFormatAnalyzer] Falló IA, usando fallback determinístico:', err?.message);
    return { analysis: buildFallbackAnalysis(trimmed), aiUsed: false, error: err?.message || 'AI_FAILED' };
  }
}
