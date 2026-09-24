import { UniversalLegalDocument, DocumentNode, ContentBlock, ValidationIssue } from './types';
import { stripTrustMarkers } from './trustLayer';
import { normalizeMarkdownFormatting, normalizeTitleText, looksLikeHeading } from './markdownNormalizer';
import { extractUnresolvedFieldMarkers, normalizeUnresolvedFieldMarkers } from './pendingFields';
import { stripTransientAuditTrace } from './generationTraceSanitizer';

export type PlaceholderKind = 'INTENTIONAL_ANONYMIZATION' | 'TECHNICAL_UNRESOLVED' | 'USER_REQUIRED_MISSING';

export interface ClassifiedPlaceholder {
  marker: string;
  kind: PlaceholderKind;
}

export function classifyPlaceholder(token: string): PlaceholderKind {
  if (/^\[DATO\s*ANONIMIZADO/i.test(token) || /^\*\*\*\*\*+/.test(token)) {
    return 'INTENTIONAL_ANONYMIZATION';
  }
  if (/^\{\{/i.test(token) || /^\$\{/i.test(token) || /\bundefined\b|\bnull\b|\[object\s+Object\]/i.test(token)) {
    return 'TECHNICAL_UNRESOLVED';
  }
  return 'USER_REQUIRED_MISSING';
}

export interface SanitizeReport {
  removedPrompts: number;
  removedMetadata: number;
  removedCrypto: number;
  removedWatermarks: number;
  removedDuplicates: number;
  placeholdersFound: string[];
  classifiedPlaceholders?: ClassifiedPlaceholder[];
  truncatedWarnings: ValidationIssue[];
  coherenceWarnings: ValidationIssue[];
  partsWarnings: ValidationIssue[];
  proofreadingApplied: number;
}

// Los encabezados internos del pipeline se detectan con INTERNAL_HEADER_LINE_RE
// (ver stripPrompts): barrido de una sola fase que elimina el header Y su contenido.

const METADATA_PATTERNS = [
  /^\s*Documento:\s*documento-indexado\s*$/gim,
  /^\s*P[áa]gina:\s*\d+\s*$/gim,
  // Paginación heredada de machotes/archivos anteriores (ej. "Página 1 de 21", "Pág. 6 de 21", "PÁGINA 1", "Página 1 / 21")
  // Exige inicio de línea y fin de línea para JAMÁS tocar referencias legítimas en prosa como "véase página 20 del expediente"
  /^\s*[-–—•]?\s*p[áa]g(?:ina)?\.?\s*\d+\s*(?:de|\/)\s*\d+\s*[-–—]?\s*$/gim,
  /^\s*p[áa]gina\s*\d+\s*$/gim,
  /^\s*p[áa]g\.\s*\d+\s*$/gim,
  /^\s*P[ÁA]GINA\s+\d+\s*$/gm,
  /^\s*[-–—•]?\s*(?:foja|folio)\s*\d+(?:\s*(?:de|\/)\s*\d+)?\s*[-–—]?\s*$/gim,
  // Notas de elaboración / redacción interna a suprimir
  /^\s*(?:#{1,6}\s*)?nota\s+(?:de\s+elaboraci[óo]n|editorial|interna|al\s+redactor)[\s:,].*$/gim,
  /^\s*a\s+suprimir\s+antes\s+de\s+la\s+presentaci[óo]n\s+definitiva.*$/gim,
  // Ecos de recuperación RAG impresos por el modelo ("Contexto: …",
  // "Fragmento(s):", "Fuente:", "Documento: sentencia.pdf Página 3").
  /^\s*(?:Contexto|Fragmentos?|Referencias?|Fuente[s]?|Documentos?)\s*:\s*.*$/gim,
  /^\s*provider:\s*\w+.*/gim,
  /^\s*aiUsed:\s*(true|false).*/gim,
  /^\s*pipeline\s*:.*/gim,
  /^\s*generation\s*:.*/gim,
  /^\s*document-index\s*:.*/gim,
  /^\s*section\s*:.*/gim,
  /^\s*block\s*:.*/gim,
  /^\s*trace\s*:.*/gim,
  /^\s*X-Export-Method.*$/gim,
];

const WATERMARK_PATTERNS = [
  /^\s*PJF\s*-\s*Versi[óo]n\s+P[úu]blica\s*$/gim,
  /^\s*-\s*\d{1,3}\s*-\s*$/gim,
  // Folio convertido a viñeta por normalizeMarkdownFormatting ("- 13 -" → "• 13 -")
  /^\s*[•]\s*\d{1,3}\s*-?\s*$/gm,
  /^\s*\d{1,3}\s*-\s*$/gm,
  /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}:\d{2}\s*$/gim,
  /^\s*Versi[óo]n\s+P[úu]blica.*$/gim,
];

const PLACEHOLDER_PATTERNS = [
  /\{\{\s*[A-Za-z0-9_áéíóúñÁÉÍÓÚÑ]+\s*\}\}/g,
  /\$\{[a-zA-Z0-9_]+\}/g,
  /\[(?:REQUIERE|PENDIENTE|DATO\s*PENDIENTE|POR\s*DEFINIR|TODO|TBD|FIXME)[^\]]*\]/gi,
  // <variable> but not HTML? keep simple
];

const CRYPTO_HEX_RE = /^\s*([0-9a-fA-F]{2}[\s]*){16,}\s*$/gm;
const BASE64_LONG_RE = /^\s*[A-Za-z0-9+/=]{40,}\s*$/gm;

// ── Firma/validación electrónica (metadata técnica de la fuente, NO jurídica) ──
// Línea compuesta SOLO por el término (los pies FIREL reales usan variantes
// standalone: "FIRMANTE", "Cadena", "OCSP", "TSP"). El match exacto de línea
// jamás alcanza prosa jurídica normal.
const ESIGN_STANDALONE_RE =
  /^\s*(?:FIRMANTE(?:\(S\))?|CADENA|OCSP|TSP|FIREL|REVOCACI[ÓO]N|DATOS\s+ESTAMPILLADOS|NO\.?\s*SERIE|N[ÚU]MERO\s+DE\s+SERIE)\s*[.:]?\s*$/i;
// Acrónimos: nunca inician una oración jurídica real → se eliminan como label.
const ESIGN_ACRONYM_RE = /^\s*(?:OCSP|TSP|FIREL|SELLOS\s+DIGITALES|BYTES\s+HEXADECIMALES)\b/i;
// Labels verbales: se exige el dos puntos de campo ("label:") para NO tocar
// prosa legítima que empiece con la misma palabra (p. ej. "Cadena de custodia…").
const ESIGN_LABEL_RE =
  /^\s*(?:FIRMANTE(?:\(S\))?|REVOCACI[ÓO]N|DATOS\s+ESTAMPILLADOS|NO\.?\s*DE?\s*SERIE|N[ÚU]MERO\s+(?:DE\s+)?SERIE|CADENA(?:\s+(?:DE|DEL)\s+(?:CERTIFICACI[ÓO]N|CERTIFICADO))?)\s*:/i;

const TYPO_MAP: Record<string,string> = {
  'ACMITIENDO': 'admitiendo',
  'acmitiendo': 'admitiendo',
  'PRUBAS': 'pruebas',
  'PRUERAS': 'pruebas',
  'SINDO': 'siendo',
  'sindo': 'siendo',
  'ACRIDITADAS': 'acreditadas',
  'acriditadas': 'acreditadas',
  'acriditada': 'acreditada',
  'VEINTISEIS': 'veintiséis',
  'veintiseis': 'veintiséis',
  'VEINTIDOS': 'veintidós',
  'veintidos': 'veintidós',
};

function normalizeForDup(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:¡!¿?()"\-—–]/g, '')
    .trim();
}

function containsCryptoGarbage(text: string): boolean {
  const trimmed = text.trim();
  // Regexes module-level con flag /g: resetear lastIndex antes de cada .test()
  // (estado compartido entre llamadas producía detección no determinística).
  CRYPTO_HEX_RE.lastIndex = 0;
  BASE64_LONG_RE.lastIndex = 0;
  if (CRYPTO_HEX_RE.test(trimmed) || BASE64_LONG_RE.test(trimmed)) return true;
  // Vocabulario de validación electrónica: encabezado/label → eliminar SIEMPRE,
  // sin exigir cadena base64 larga (la regla anterior conservaba líneas cortas
  // y provocaba la fuga P5 de FIRMANTE / No. Serie / OCSP / TSP / Revocación).
  if (ESIGN_STANDALONE_RE.test(trimmed)) return true;
  if (ESIGN_ACRONYM_RE.test(trimmed) && trimmed.length < 200) return true;
  if (ESIGN_LABEL_RE.test(trimmed)) return true;
  if (/OCSP|TSP|FIREL|XIWmAIi8zT9/i.test(trimmed) && /[A-Za-z0-9+/=]{20,}/.test(trimmed)) return true;
  // long hex string
  if (/^[0-9a-f]{40,}$/i.test(trimmed)) return true;
  return false;
}

function proofreadText(text: string): { out: string, count: number } {
  let out = text;
  let count = 0;
  for (const [wrong, correct] of Object.entries(TYPO_MAP)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'g');
    const matches = out.match(re);
    if (matches) count += matches.length;
    out = out.replace(re, correct);
  }
  return { out, count };
}

/**
 * Detecta una LÍNEA que funciona como ENCABEZADO interno del pipeline.
 * Detección de label al inicio de línea (con Markdown residual tolerado),
 * NO substring arbitrario: el texto jurídico que solo MENCIONE estos
 * términos dentro de una oración no coincide.
 */
const INTERNAL_HEADER_LINE_RE =
  /^\s*(?:#{1,6}\s*)?(?:OBJETIVO\s+DEL\s+BLOQUE|TIPO\s+DE\s+BLOQUE|CONTEXTO\s+ANTERIOR|CONTEXTO\s+POSTERIOR|TEOR[ÍI]A\s+DEL\s+CASO|HECHOS\s+RELEVANTES\s+PARA\s+ESTE\s+BLOQUE|TEXTO\s+ORIGINAL\s+DEL\s+BLOQUE|CONTENIDO\s+ORIGINAL\s+DEL\s+BLOQUE|FRAGMENTOS\s+DEL\s+EXPEDIENTE(?:\s+RECUPERADOS)?|REGLAS\s+OBLIGATORIAS|INSTRUCCI[ÓO]N\s+ADICIONAL|INSTRUCCIONES\s+DE\s+DEFENSA\s+DEL\s+ABOGADO|INSTRUCCIONES\s*:|APORTACIONES\s+DEL\s+ABOGADO|BASE\s+DEL\s+AN[ÁA]LISIS\s+JUR[ÍI]DICO|CONFIGURACI[ÓO]N\s+DEL\s+AN[ÁA]LISIS|NORMAS\s+Y\s+PAR[ÁA]METRO|JURISPRUDENCIA\s+RELEVANTE|SALIDA\s+ESPERADA|FORMATO\s+DE\s+SALIDA|AN[ÁA]LISIS\s+INTERNO|ESTRATEGIA\s+INTERNA|NOTA\s+INTERNA|(?:SYSTEM|USER|ASSISTANT)\s*:)\s*/i;

function isInternalHeaderLine(line: string): boolean {
  return INTERNAL_HEADER_LINE_RE.test(line);
}

/**
 * Eliminación SOLO de metadata interna del pipeline sobre texto suelto.
 * Usada por el fallback de emergencia cuando `sanitizeLegalDocument` falla:
 * garantiza que ninguna salida llegue sin el filtro de etiquetas internas.
 * Normaliza Markdown ANTES de barrer (los headers "### OBJETIVO…" deben
 * quedar reconocibles), mismo orden que `sanitizeBlockText`.
 */
export function stripInternalPromptMetadata(raw: string): string {
  if (!raw) return raw;
  return stripPrompts(normalizeMarkdownFormatting(raw)).out;
}

function stripPrompts(text: string): { out: string, removed: number } {
  // Barrido de UNA SOLA FASE, línea a línea: cuando una línea es un encabezado
  // interno del pipeline (mecanismo `skipping`), se descarta EL ENCABEZADO Y
  // TODO el contenido contiguo colocado debajo de él. La línea VACÍA cierra la
  // zona interna (la prosa jurídica posterior queda intacta); cualquier otro
  // encabezado interno posterior re-activa el salto por sí mismo.
  const lines = text.split('\n');
  const kept: string[] = [];
  let skipping = false;
  let skippedRun = 0;
  let removed = 0;
  for (const line of lines) {
    if (isInternalHeaderLine(line)) {
      skipping = true;
      skippedRun = 0;
      removed++;
      continue;
    }
    if (skipping) {
      const trimmed = line.trim();
      if (!trimmed) {
        // Fin del bloque interno: aquí termina el contenido bajo el header.
        skipping = false;
        skippedRun = 0;
        continue;
      }
      // Frontera dura: arranca un bloque/sección jurídico real dentro del
      // mismo párrafo (rúbrica en mayúsculas o enumeración forense).
      if (
        looksLikeHeading(trimmed) ||
        /^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[EÉ]PTIMO|OCTAVO|NOVENO|D[EÉ]CIMO)[.\s\-–—:]/i.test(trimmed)
      ) {
        skipping = false;
        skippedRun = 0;
        kept.push(line);
        continue;
      }
      // Válvula anti-desastre: jamás engullir más de 60 líneas consecutivas.
      skippedRun++;
      removed++;
      if (skippedRun >= 60) skipping = false;
      continue;
    }
    if (/^\s*\d+\.\s*No inventes/i.test(line) || /^\s*Escribe el bloque completo/i.test(line)) {
      removed++;
      continue;
    }
    kept.push(line);
  }
  return { out: kept.join('\n'), removed };
}

function stripMetadata(text: string): { out: string, removed: number } {
  let out = text;
  let removed = 0;
  for (const re of METADATA_PATTERNS) {
    const m = out.match(re);
    if (m) removed += m.length;
    out = out.replace(re, '');
  }
  return { out, removed };
}

function stripWatermarks(text: string): { out: string, removed: number } {
  let out = text;
  let removed = 0;
  for (const re of WATERMARK_PATTERNS) {
    const m = out.match(re);
    if (m) removed += m.length;
    out = out.replace(re, '');
  }
  return { out, removed };
}

function handlePlaceholders(text: string): { out: string; found: string[]; classified: ClassifiedPlaceholder[] } {
  const found: string[] = [];
  const classified: ClassifiedPlaceholder[] = [];
  let out = text;
  for (const re of PLACEHOLDER_PATTERNS) {
    const m = out.match(re);
    if (m) {
      found.push(...m);
      for (const token of m) {
        classified.push({ marker: token, kind: 'TECHNICAL_UNRESOLVED' });
      }
    }
    out = out.replace(re, (token) =>
      /^\[(?:REQUIERE|PENDIENTE|DATO\s*PENDIENTE|POR\s*DEFINIR)/i.test(token) ? token : '________'
    );
  }
  // Los marcadores jurídicos permanecen visibles para que el gate pueda
  // bloquearlos, pero siempre se reportan en forma canónica.
  const unresolvedMarkers = extractUnresolvedFieldMarkers(out);
  for (const item of unresolvedMarkers) {
    found.push(item.marker);
    classified.push({
      marker: item.marker,
      kind: item.kind === 'ANONYMIZED' ? 'INTENTIONAL_ANONYMIZATION' : 'USER_REQUIRED_MISSING',
    });
  }
  const datoRe = /\[NO ESPECIFICADO\]|\[PENDIENTE\]|\[CAMPO REQUERIDO\]/gi;
  const dm = out.match(datoRe);
  if (dm) {
    found.push(...dm);
    for (const token of dm) {
      classified.push({ marker: token, kind: 'USER_REQUIRED_MISSING' });
    }
  }
  // Do not strip DATO PENDIENTE here — leave visible for validation but sanitize later for export if needed
  return { out, found, classified };
}

/**
 * Convierte estructuras tabulares o pseudotabulares delimitadas por pipes o tabuladores
 * en bloques estructurados legibles (jerarquía forense) cuando una tabla no pueda
 * preservarse con columnas gráficas completas, evitando líneas angostas verticales.
 */
export function formatTabularStructures(text: string): string {
  if (!text || (!text.includes('|') && !text.includes('\t'))) return text;

  const lines = text.split('\n');
  const hasPipes = lines.filter((l) => l.includes('|')).length >= 2;
  const hasTabs = lines.filter((l) => l.includes('\t')).length >= 2;
  if (!hasPipes && !hasTabs) return text;

  const parsedRows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Ignorar líneas separadoras de markdown puro como |---|---|
    if (/^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes('-')) continue;
    if (hasPipes && trimmed.includes('|')) {
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      if (cells.length >= 2) {
        parsedRows.push(cells);
      }
    } else if (hasTabs && trimmed.includes('\t')) {
      const cells = trimmed
        .split('\t')
        .map((c) => c.trim());
      if (cells.length >= 2) {
        parsedRows.push(cells);
      }
    }
  }

  if (parsedRows.length < 2) return text;

  const headers = parsedRows[0];
  const dataRows = parsedRows.slice(1);

  const structuredBlocks: string[] = [];
  for (const row of dataRows) {
    const titleCol = row[0] || '';
    const fields: string[] = [];
    for (let i = 1; i < row.length; i++) {
      const headerLabel = headers[i] || `Columna ${i + 1}`;
      const val = row[i] || '';
      if (val) {
        fields.push(`**${headerLabel}:** ${val}`);
      }
    }
    const blockTitle = titleCol.startsWith('###')
      ? titleCol
      : (/^(?:[A-ZÁÉÍÓÚÑa-záéíóúñ]+|\d+[\.\)])\b/i.test(titleCol) ? `### ${titleCol}` : `**${titleCol}**`);
    structuredBlocks.push(`${blockTitle}\n${fields.join('\n')}`);
  }

  if (structuredBlocks.length > 0) {
    return structuredBlocks.join('\n\n');
  }

  return text;
}

function sanitizeBlockText(raw: string): { sanitized: string; stats: { prompts:number; metadata:number; watermarks:number; crypto:number; placeholders:string[]; classifiedPlaceholders:ClassifiedPlaceholder[]; proofreading:number } } {
  let text = stripTrustMarkers(raw);
  // Markdown de la IA (**)…**, ###, viñetas) → texto limpio. DEBE ejecutarse
  // ANTES de stripPrompts para que encabezados como "### OBJETIVO DEL BLOQUE:"
  // queden reconocibles. Preserva líneas/corridas de redacción (*****).
  text = normalizeMarkdownFormatting(text);
  text = normalizeUnresolvedFieldMarkers(text);
  text = formatTabularStructures(text);
  const p = stripPrompts(text);
  text = p.out;
  const m = stripMetadata(text);
  text = m.out;
  const w = stripWatermarks(text);
  text = w.out;
  // Crypto garbage: remove entire line if matches
  const lines = text.split('\n');
  const keptLines: string[] = [];
  let cryptoRemoved = 0;
  for (const line of lines) {
    if (containsCryptoGarbage(line)) { cryptoRemoved++; continue; }
    // Also hex dump detection inside line
    if (/([0-9a-fA-F]{2}\s+){8,}/.test(line) && line.replace(/[^0-9a-fA-F]/gi,'').length > 32) { cryptoRemoved++; continue; }
    keptLines.push(line);
  }
  text = keptLines.join('\n');
  const ph = handlePlaceholders(text);
  text = ph.out;
  const pr = proofreadText(text);
  text = pr.out;
  // Collapse 3+ blank lines and trim
  text = text.replace(/\n{4,}/g, '\n\n\n').replace(/[ \t]+\n/g, '\n').trim();
  // Normalize symbols: remove decorative lines (guiones/hash/underscores).
  // OJO: las corridas de ASTERISCOS NO se eliminan aquí — son datos redactados
  // del expediente y deben preservarse (las maneja normalizeMarkdownFormatting).
  text = text.replace(/^[-#_]{4,}\s*$/gm, '').replace(/^#{3,}\s*/gm, '').replace(/^[→▶▪■●]+\s*/gm, '• ');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return {
    sanitized: text,
    stats: { prompts: p.removed, metadata: m.removed, watermarks: w.removed, crypto: cryptoRemoved, placeholders: ph.found, classifiedPlaceholders: ph.classified, proofreading: pr.count },
  };
}

function dedupParagraphs(blocks: ContentBlock[]): { deduped: ContentBlock[]; removed: number } {
  const seen = new Set<string>();
  const deduped: ContentBlock[] = [];
  let removed = 0;
  for (const b of blocks) {
    const paras = b.text.split(/\n\s*\n/);
    const filteredParas: string[] = [];
    for (const para of paras) {
      const norm = normalizeForDup(para);
      if (!norm || norm.length < 10) { filteredParas.push(para); continue; }
      if (seen.has(norm)) { removed++; continue; }
      seen.add(norm);
      filteredParas.push(para);
    }
    const dedupedText = filteredParas.join('\n\n');
    deduped.push({ ...b, text: dedupedText });
  }
  return { deduped, removed };
}

function detectTruncated(text: string, doc: UniversalLegalDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const paras = text.split(/\n\s*\n/);
  for (const para of paras) {
    const trimmed = para.trim();
    if (trimmed.length > 40 && trimmed.length < 300 && !/[.!?:"”»]$/.test(trimmed) && !/^\s*(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|I\.|II\.|1\.)/i.test(trimmed)) {
      // Check if continuation exists in next block? if so, don't flag
      // Simple heuristic: ends with lowercase word fragment
      if (/[a-záéíóúñ]{3,}$/.test(trimmed) && !trimmed.endsWith('"')) {
        issues.push({ checkId: 'truncated_paragraph', message: `Posible fragmento truncado: "${trimmed.slice(0,80)}..."` });
      }
    }
  }
  return issues;
}

function validateCoherence(doc: UniversalLegalDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const dt: string = doc.documentType || '';
  const titles = (doc.sections || []).map(s=>s.title.toUpperCase()).join(' ');
  // Check mixing incompatible natures
  const hasAmparoDirecto = /AMPARO DIRECTO/.test(titles);
  const hasAmparoIndirecto = /AMPARO INDIRECTO/.test(titles);
  const hasLaboral = /LABORAL/.test(titles) || doc.matter === 'laboral';
  const hasRevision = /REVISI[ÓO]N/.test(titles);
  if (dt.includes('amparo_directo') && hasAmparoIndirecto && !hasAmparoDirecto) {
    issues.push({ checkId: 'via_inconsistency', message: 'INCONSISTENCIA DE VÍA PROCESAL: tipo amparo directo vs contenido de amparo indirecto' });
  }
  if (dt.includes('contestacion') && hasRevision) {
    issues.push({ checkId: 'via_inconsistency', message: 'INCONSISTENCIA DE VÍA PROCESAL: contestación vs recurso de revisión' });
  }
  return issues;
}

function validateParts(doc: UniversalLegalDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // Guardas defensivas: documentos legacy restaurados de BD o payloads
  // externos pueden carecer de parties/documentType sin que eso deba tumbar el export.
  const parties = doc.parties || {};
  const dateLike = /^\s*(El\s+)?\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}\s*$/i;
  const cargoLike = /Ante el Instituto|Secretario de Acuerdos|Testigo|Cargo/i;
  for (const [key, val] of Object.entries(parties)) {
    if (!val) continue;
    const v = String(val).trim();
    if (dateLike.test(v)) issues.push({ checkId: `part_invalid_${key}`, message: `Parte "${key}" parece una fecha, no un nombre: "${v}"` });
    if (cargoLike.test(v) && v.length < 80) issues.push({ checkId: `part_invalid_${key}`, message: `Parte "${key}" parece un cargo/autoridad ambigua: "${v}"` });
    if (v.length > 120) issues.push({ checkId: `part_invalid_${key}`, message: `Parte "${key}" excesivamente larga, posible extracción errónea` });
  }
  return issues;
}

export interface SanitizeOptions {
  /**
   * Cuando false, NO elimina bloques ni secciones duplicadas.
   * Uso principal: exportador PDF, donde el documento ya fue validado
   * (validateFormattingIntegrity) y perder contenido repetido legítimo
   * (fórmulas, considerandos idénticos) alteraría el documento final.
   * Default true para mantener compatibilidad con todos los llamadores existentes.
   */
  dedupeBlocks?: boolean;
}

export function sanitizeLegalDocument(doc: UniversalLegalDocument, options?: SanitizeOptions): { document: UniversalLegalDocument; report: SanitizeReport } {
  const dedupeBlocks = options?.dedupeBlocks !== false;
  const report: SanitizeReport = {
    removedPrompts: 0, removedMetadata: 0, removedCrypto: 0, removedWatermarks: 0, removedDuplicates: 0,
    placeholdersFound: [], classifiedPlaceholders: [], truncatedWarnings: [], coherenceWarnings: [], partsWarnings: [], proofreadingApplied: 0,
  };

  // Clone doc shallow
  const sanitized: UniversalLegalDocument = {
    ...doc,
    sections: doc.sections.map((sec): DocumentNode => {
      // Sanitize each block
      const sanitizedBlocks: ContentBlock[] = sec.content.map((block) => {
        const { sanitized: clean, stats } = sanitizeBlockText(block.text);
        report.removedPrompts += stats.prompts;
        report.removedMetadata += stats.metadata;
        report.removedWatermarks += stats.watermarks;
        report.removedCrypto += stats.crypto;
        report.placeholdersFound.push(...stats.placeholders);
        if (stats.classifiedPlaceholders && stats.classifiedPlaceholders.length > 0) {
          report.classifiedPlaceholders = report.classifiedPlaceholders || [];
          report.classifiedPlaceholders.push(...stats.classifiedPlaceholders);
        }
        report.proofreadingApplied += stats.proofreading;

        // Encabezado jurídico implícito ("PRUEBAS", "CONTESTACIÓN", "RESUELVE"):
        // un bloque de un solo párrafo en mayúsculas se marca en NEGRITA a nivel
        // de estilo para que editor, DOCX y PDF lo jerarquicen consistentemente.
        const singlePara = clean.trim();
        const styleBold =
          (block.style?.fontWeight === 'bold' || block.style?.fontWeight === '700') ||
          (singlePara.length > 0 && !singlePara.includes('\n\n') && looksLikeHeading(singlePara.split('\n')[0] || ''));

        return {
          ...block,
          text: clean,
          style: styleBold ? { ...(block.style || {}), fontWeight: 'bold' } : block.style,
        };
      });
      // Dedup paragraphs across blocks of same section
      const { deduped, removed } = dedupeBlocks ? dedupParagraphs(sanitizedBlocks) : { deduped: sanitizedBlocks, removed: 0 };
      report.removedDuplicates += removed;

      // Filter out empty blocks (no text after sanitization) but keep at least one if section would become empty
      const nonEmpty = deduped.filter(b => b.text.trim().length > 0);
      const finalBlocks = nonEmpty.length > 0 ? nonEmpty : deduped;

      // Título de sección sin sintaxis Markdown (los títulos viajan aparte del texto).
      return { ...sec, title: normalizeTitleText(sec.title || ''), content: finalBlocks };
    }),
  };

  // Document-wide duplicate section detection (normalized title+content)
  if (dedupeBlocks) {
    const seenSections = new Set<string>();
    const dedupedSections: DocumentNode[] = [];
    for (const sec of sanitized.sections) {
      const secKey = normalizeForDup(sec.title + ' ' + sec.content.map(b=>b.text).join(' ')).slice(0,300);
      if (secKey.length < 20) { dedupedSections.push(sec); continue; }
      if (seenSections.has(secKey)) {
        report.removedDuplicates++;
        continue;
      }
      seenSections.add(secKey);
      dedupedSections.push(sec);
    }
    sanitized.sections = dedupedSections;
  }

  // Remove sections that are only watermarks/empty after sanitization
  sanitized.sections = sanitized.sections.filter(sec => {
    const allText = sec.content.map(b=>b.text).join(' ').trim();
    // Conservar la sección vacía permite que el quality gate la marque como
    // incompleta; eliminarla aquí convertiría una salida incompleta en una
    // salida aparentemente válida.
    if (!allText) return true;
    if (/^\s*PJF.*Versi[óo]n.*$/i.test(allText) && allText.length < 60) return false;
    if (/^\s*-\s*\d+\s*-\s*$/.test(allText)) return false;
    return true;
  });

  // VALIDACIÓN ESTRUCTURAL: fusionar secciones CONSECUTIVAS con título idéntico
  // (evita "PRUEBAS / PRUEBAS", "DEMANDA\nDEMANDA"). El contenido de la segunda
  // se anexa a la primera: nunca se pierde texto, solo se elimina la duplicidad.
  const mergedByTitle: DocumentNode[] = [];
  for (const sec of sanitized.sections) {
    const prev = mergedByTitle[mergedByTitle.length - 1];
    if (prev && normalizeForDup(prev.title) === normalizeForDup(sec.title) && prev.title.trim()) {
      prev.content = [...prev.content, ...sec.content];
      report.removedDuplicates++;
      continue;
    }
    mergedByTitle.push(sec);
  }
  sanitized.sections = mergedByTitle;

  // Detect truncated
  const allText = sanitized.sections.map(s=>s.content.map(b=>b.text).join('\n\n')).join('\n\n');
  report.truncatedWarnings = detectTruncated(allText, sanitized);

  // Validate coherence
  report.coherenceWarnings = validateCoherence(sanitized);
  report.partsWarnings = validateParts(sanitized);

  // Deduplicate placeholders list
  report.placeholdersFound = Array.from(new Set(report.placeholdersFound));

  sanitized.updatedAt = new Date().toISOString();
  return { document: sanitized, report };
}

export function getSanitizeSummary(report: SanitizeReport): string {
  return `Sanitizado: prompts ${report.removedPrompts}, metadata ${report.removedMetadata}, crypto ${report.removedCrypto}, marcas ${report.removedWatermarks}, duplicados ${report.removedDuplicates}, typos ${report.proofreadingApplied}, placeholders ${report.placeholdersFound.length}`;
}

// Boundary explícito para rutas de persistencia: el trace se conserva como
// artefacto de desarrollo/auditoría, pero no se escribe dentro del borrador.
export { stripTransientAuditTrace };
