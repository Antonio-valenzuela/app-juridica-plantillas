/**
 * documentIndex.ts — NIVEL 2: Índice Estructural Reutilizable
 *
 * Construye UNA SOLA VEZ por documento toda la información estructurada
 * necesaria para que parser, planner y generador no tengan que reconstruir
 * contexto página por página.
 *
 * Reutiliza tipos existentes (DocumentPage, UploadedSourceDocument) y los
 * extiende sin duplicar lógica de extracción.
 */
import type { DocumentPage, UploadedSourceDocument } from './types';

// ── Elementos estructurales finos del documento ─────────────────────────────
export type DocumentElementType =
  | 'heading'
  | 'paragraph'
  | 'page_number'
  | 'header'
  | 'footer'
  | 'signature'
  | 'table'
  | 'list'
  | 'unknown';

export interface DocumentElement {
  type: DocumentElementType;
  text: string;
  pageNumber: number;
  order: number;
  confidence?: number;
}

// ── Índice estructural completo ────────────────────────────────────────────
export interface DocumentIndex {
  pages: DocumentPage[];
  elements: DocumentElement[];
  headings: DocumentElement[];
  paragraphs: DocumentElement[];
  pageNumbers: DocumentElement[];
  signatures: DocumentElement[];
  tables: DocumentElement[];
  /** Entidades nombradas detectadas (sin IA) */
  entities: string[];
  /** Fechas en el documento */
  dates: string[];
  /** Números de expediente / amparo / toca */
  caseNumbers: string[];
  /** Autoridades mencionadas */
  authorities: string[];
  /** Citas de jurisprudencia / tesis */
  citations: string[];
  /** Referencias legales (artículos, leyes) */
  legalReferences: string[];
  /** Texto completo concatenado */
  fullText: string;
  /** Cantidad de páginas */
  pageCount: number;
  /** Fuente origen (id) */
  sourceId: string;
  /** Score de confianza del índice */
  confidence: number;
}

// ── Helpers determinísticos ─────────────────────────────────────────────────

function isPageNumber(text: string): boolean {
  const t = text.trim();
  if (/^[-–—\s]*\d{1,4}\s*[-–—]*$/.test(t) && t.length <= 8) return true;
  if (/^p[áa]gina\s*\d+/i.test(t) && t.length < 30) return true;
  if (/^-?\s*\d+\s*-?$/.test(t) && t.replace(/[^0-9]/g, '').length <= 4) return true;
  return false;
}

function isSignatureElement(text: string): boolean {
  const t = text.trim();
  if (/^_{3,}/.test(t)) return true;
  if (/^FIRMA$/i.test(t)) return true;
  if (/^A T E N T A M E N T E$/i.test(t)) return true;
  // ── Firma/validación electrónica (furniture técnico de la fuente) ──
  // Línea compuesta SOLO por el término (los pies FIREL reales traen variantes
  // standalone: "FIRMANTE", "Cadena", "OCSP", "TSP").
  if (/^\s*(?:FIRMANTE(?:\(S\))?|CADENA|OCSP|TSP|FIREL|REVOCACI[ÓO]N|DATOS\s+ESTAMPILLADOS|NO\.?\s*SERIE|N[ÚU]MERO\s+DE\s+SERIE)\s*[.:]?\s*$/i.test(t)) return true;
  // Acrónimos del pie FIREL: nunca inician prosa jurídica real.
  if (/^(OCSP|TSP|FIREL)\b/i.test(t) && t.length < 200) return true;
  // Labels verbales: se exige el dos puntos de campo para no capturar
  // prosa legítima ("Revocación del permiso…", "Cadena de custodia…").
  if (/^(?:FIRMANTE(?:\(S\))?|REVOCACI[ÓO]N|DATOS\s+ESTAMPILLADOS|NO\.?\s*DE?\s*SERIE|N[ÚU]MERO\s+(?:DE\s+)?SERIE|CADENA(?:\s+(?:DE|DEL)\s+(?:CERTIFICACI[ÓO]N|CERTIFICADO))?)\s*:/i.test(t)) return true;
  if (/^PROTESTO LO NECESARIO/i.test(t) && t.length < 80) return false; // closing, handled separately but not pure signature
  if (t.length < 60 && /^[A-ZÁÉÍÓÚÑ ]{6,60}$/.test(t) && t.split(' ').length >= 2 && t.split(' ').length <= 5) {
    // posible nombre aislado seguido de firma — se detecta por contexto de blockPlanner, aquí solo si viene aislado
    return false;
  }
  return false;
}

function isHeaderFooter(text: string, _pageNumber: number): boolean {
  const t = text.trim();
  if (t.length > 120) return false;
  if (/^(EXPEDIENTE|TOCA|AMPARO|JUICIO)\s*[:\s]/i.test(t) && t.length < 80) return true;
  if (/^(PODER JUDICIAL|SUPREMA CORTE|TRIBUNAL COLEGIADO|JUZGADO DE DISTRITO)/i.test(t)) return false; // es heading real
  return false;
}

function isTechnicalPdfMetadataField(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && (
    /^[0-9a-f]{24,}$/i.test(normalized) ||
    /^\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2}$/.test(normalized) ||
    /^[^\p{L}\p{N}]{2,}$/u.test(normalized)
  );
}

function isTechnicalPdfMetadataFooter(text: string): boolean {
  const tabbedLines = text.split(/\r?\n/).filter((line) => line.includes('\t'));
  if (tabbedLines.length === 0) return false;

  const hasStrongMetadataField = tabbedLines.some((line) =>
    line.split('\t').some((field) =>
      /^[0-9a-f]{24,}$/i.test(field.trim()) ||
      /^\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}:\d{2}$/.test(field.trim())
    )
  );
  if (!hasStrongMetadataField) return false;

  return tabbedLines.every((line) =>
    line.split('\t').filter(Boolean).every(isTechnicalPdfMetadataField)
  );
}

function splitElementsFromPage(page: DocumentPage, pageIndex: number, globalOrder: { n: number }): DocumentElement[] {
  const elements: DocumentElement[] = [];
  if (!page.text) return elements;

  // Split por párrafos dobles y líneas; detectar encabezados jurídicos incluso dentro de párrafos mixtos
  const LEGAL_HEADING_RE = /(?:CONCEPTO\s+DE\s+VIOLACI[ÓO]N|AGRAVIO|ANTECEDENTES|CONSIDERANDO|CONSIDERACIONES|ESTUDIO|RESUELVE|RESOLUTIVOS|RESULTANDO|PRUEBAS|PETITORIOS|PROTESTO|FIRMA|H\.\s*(?:SEGUNDO\s+)?TRIBUNAL|SUPREMA\s+CORTE|JUZGADO\s+DE\s+DISTRITO)/i;
  const rawParagraphs = page.text.split(/\n\s*\n/).filter(Boolean);
  const chunks: string[] = [];
  for (const para of rawParagraphs) {
    if (para.length > 1500 && !LEGAL_HEADING_RE.test(para)) {
      chunks.push(para.trim());
    } else {
      const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const hasLegalHeading = lines.some((l) => LEGAL_HEADING_RE.test(l) && l.length < 140);
        const allShort = lines.every((l) => l.length < 60);
        if (allShort || hasLegalHeading) {
          // Preserve a heading with its wrapped legal argument body. Lists
          // remain line-oriented; legal prose must not be truncated at wraps.
          if (hasLegalHeading && !allShort && page.text.includes('\t') && !isTechnicalPdfMetadataFooter(page.text)) {
            chunks.push(para.trim());
          } else if (hasLegalHeading && lines.some((line) => /\b(?:CONCEPTO\s+DE\s+VIOLACI[ÓO]N|AGRAVIO)\b/i.test(line))) {
            chunks.push(para.trim());
          } else {
            for (const l of lines) chunks.push(l);
          }
          continue;
        }
      }
      chunks.push(para.trim());
    }
  }

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    let type: DocumentElementType = 'paragraph';

    if (isPageNumber(chunk)) type = 'page_number';
    else if (isSignatureElement(chunk)) type = 'signature';
    else if (isHeaderFooter(chunk, page.page)) type = 'header';
    else if (chunk.length < 120 && /^[A-ZÁÉÍÓÚÑ0-9\s\.\-:(),]{5,90}$/.test(chunk) && !chunk.includes('. ') && chunk === chunk.toUpperCase()) {
      // posible heading en mayúsculas
      type = 'heading';
    } else if (chunk.startsWith('|') || (chunk.includes('\t') && !isTechnicalPdfMetadataFooter(chunk))) type = 'table';

    elements.push({
      type,
      text: chunk,
      pageNumber: page.page ?? pageIndex + 1,
      order: globalOrder.n++,
      confidence: 95,
    });
  }

  return elements;
}

const DATE_RE = /(\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi;
const CASE_RE = /\b(\d{1,6}\s*[\/\-]\s*\d{2,4}(?:-[A-Z0-9]+)?)\b/g;
const AUTHORITY_RE = /(?:TRIBUNAL COLEGIADO|JUZGADO DE DISTRITO|SUPREMA CORTE|JUNTA ESPECIAL|SALA\s+(?:SUPERIOR|REGIONAL)|H\.\s*TRIBUNAL)[^\n]{0,80}/gi;
const CITATION_RE = /(?:tesis|jurisprudencia|registro digital|sem\.?\s*jud\.?)[^\n]{0,100}/gi;
const LEGAL_REF_RE = /art[íi]culo\s+\d+[^\n]{0,50}(?:constituci[óo]n|ley\s+de\s+amparo|c[óo]digo|ley\s+federal)/gi;

function extractWithPattern(text: string, pattern: RegExp): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags);
  while ((m = re.exec(text)) !== null) {
    const v = m[0].trim();
    if (v.length > 3 && v.length < 200) out.add(v);
    if (out.size > 40) break;
  }
  return Array.from(out);
}

// ── Constructor principal ───────────────────────────────────────────────────

export function buildDocumentIndex(
  sources: UploadedSourceDocument[],
  options: { referenceText?: string } = {}
): DocumentIndex {
  const allPages: DocumentPage[] = [];
  const sourceId = sources[0]?.id || 'reference';

  for (const src of sources) {
    if (src.pages && src.pages.length > 0) {
      for (const p of src.pages) {
        allPages.push({ page: p.page, text: p.text || '', chars: p.chars ?? (p.text || '').length } as DocumentPage);
      }
    } else if (src.extractedText || src.content) {
      const t = (src.extractedText || src.content || '') as string;
      allPages.push({ page: 1, text: t, chars: t.length } as DocumentPage);
    }
  }

  if (options.referenceText && options.referenceText.trim().length > 100) {
    // El texto de referencia se trata como una página virtual adicional, no duplica páginas reales
    // Se incluye solo para enriquecer citas/referencias del índice sin fragmentar la paginación
  }

  const fullTextFromSources = allPages.map((p) => p.text).join('\n\n');
  const fullText = options.referenceText
    ? `${fullTextFromSources}\n\n--- REFERENCIA ---\n\n${options.referenceText.slice(0, 12000)}`
    : fullTextFromSources;

  const globalOrder = { n: 0 };
  const elements: DocumentElement[] = [];
  for (let i = 0; i < allPages.length; i++) {
    elements.push(...splitElementsFromPage(allPages[i], i, globalOrder));
  }

  const headings = elements.filter((e) => e.type === 'heading');
  const paragraphs = elements.filter((e) => e.type === 'paragraph');
  const pageNumbers = elements.filter((e) => e.type === 'page_number');
  const signatures = elements.filter((e) => e.type === 'signature');
  const tables = elements.filter((e) => e.type === 'table');

  const dates = extractWithPattern(fullText, DATE_RE);
  const caseNumbers = extractWithPattern(fullText, CASE_RE);
  const authorities = extractWithPattern(fullText, AUTHORITY_RE);
  const citations = extractWithPattern(fullText, CITATION_RE);
  const legalReferences = extractWithPattern(fullText, LEGAL_REF_RE);
  const entities: string[] = []; // reservado para NER futuro sin IA

  const confidence = fullText.length > 500 ? 90 : fullText.length > 100 ? 65 : 30;

  return {
    pages: allPages,
    elements,
    headings,
    paragraphs,
    pageNumbers,
    signatures,
    tables,
    entities,
    dates,
    caseNumbers,
    authorities,
    citations,
    legalReferences,
    fullText,
    pageCount: allPages.length,
    sourceId,
    confidence,
  };
}
