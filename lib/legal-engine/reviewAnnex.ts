import type { UniversalLegalDocument } from './types';
import { extractMaterialLegalCitations, normalizeLegalCitation, type MaterialLegalCitation } from './materialLegalCitations';
import { INLINE_VERIFICATION_MARKER, META_TEXT_RULES } from './writingContract';

/**
 * Anexo de revisión para el abogado.
 *
 * El cuerpo del escrito solo contiene el escrito. Todo lo que es nota para el abogado —comentarios
 * estratégicos, riesgos, marcadores de verificación, citas que no pudieron verificarse— se separa del texto y
 * se conserva aquí, fuera del escrito. Una cita no verificada se OMITE del cuerpo (nunca se deja marcada ahí) y
 * se lista para que el abogado la verifique antes de incorporarla.
 *
 * Fail-closed: mientras el anexo tenga elementos pendientes, el documento no puede exportarse como FINAL.
 */

export interface ReviewAnnex {
  version: 1;
  /** Comentarios estratégicos o de riesgo que el redactor escribió dentro del texto. */
  notes: Array<{ section: string; text: string }>;
  /** Citas (artículos, tesis, órganos) que no constan en fuente verificada y se omitieron del cuerpo. */
  unverifiedCitations: Array<{ section: string; citation: string; omitted: string }>;
  /** Desarrollos o fundamentos que quedaron pendientes de verificar. */
  pendingItems: Array<{ section: string; text: string }>;
  /** Encabezados, firmas o «lugar y fecha» que el redactor escribió dentro de otra sección y se retiraron. */
  removedStructure: Array<{ section: string; kind: 'HEADING' | 'SIGNATURE' | 'PLACE_DATE'; excerpt: string }>;
  /** Hallazgos del validador del contrato que no pudieron corregirse automáticamente. */
  unresolvedFindings: Array<{ code: string; section?: string; message: string }>;
}

export function emptyReviewAnnex(): ReviewAnnex {
  return { version: 1, notes: [], unverifiedCitations: [], pendingItems: [], removedStructure: [], unresolvedFindings: [] };
}

export function reviewAnnexHasItems(annex: ReviewAnnex | undefined): boolean {
  if (!annex) return false;
  return annex.notes.length + annex.unverifiedCitations.length + annex.pendingItems.length + annex.unresolvedFindings.length > 0;
}

export function reviewAnnexCounts(annex: ReviewAnnex | undefined) {
  return {
    notes: annex?.notes.length ?? 0,
    unverifiedCitations: annex?.unverifiedCitations.length ?? 0,
    pendingItems: annex?.pendingItems.length ?? 0,
    removedStructure: annex?.removedStructure.length ?? 0,
    unresolvedFindings: annex?.unresolvedFindings.length ?? 0,
  };
}

/* ── utilidades de texto ──────────────────────────────────────────────────── */

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const excerpt = (value: string, max = 220) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value).trim();

/** Divide un párrafo en oraciones sin romper abreviaturas jurídicas frecuentes. */
export function splitSentences(paragraph: string): string[] {
  const protectedText = paragraph.replace(/\b(art|arts|fr|frac|núm|num|no|lic|sra|sr|dr|dra|c|cc|ed|vol|p|pp|inc|fracc)\./gi, '$1\u0000');
  return protectedText
    .split(/(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"“(\[0-9])/)
    .map((sentence) => sentence.replace(/\u0000/g, '.'))
    .filter((sentence) => sentence.length > 0);
}

const NEW_VERIFICATION_MARKER = /\[\s*NO\s+VERIFICADO\s*:\s*([^\]]*)\]/gi;
const PENDING_DEVELOPMENT_MARKER = /\[\s*(?:PENDIENTE\s+DE\s+DESARROLLO|PENDIENTE\s+DE\s+REVISI[ÓO]N|REQUIERE\s+REVISI[ÓO]N|REQUIERE\s+DESARROLLO(?:\s+JUR[ÍI]DICO)?|POR\s+VERIFICAR)\b[^\]]*\]/gi;
const LOOSE_PENDING_TAIL = /\s*\((?:cita\s+pendiente|pendiente\s+de\s+fundamentaci[oó]n|pendiente\s+de\s+verificaci[oó]n)\)/gi;

const SIGNATURE_PARAGRAPH = /^(?:protesto\s+lo\s+necesario|atentamente|\[?\s*firma\b|abogad[oa]s?\s+postulantes?\b|_{6,}$)/i;
const PLACE_DATE_PARAGRAPH = /^(?:lugar\s+y\s+fecha\b|en\s+(?:la\s+)?(?:ciudad\s+de\s+)?[A-ZÁÉÍÓÚÑ][\p{L} ]{2,40},\s+(?:a\s+)?\d{1,2}\s+de\s+\p{L}+|en\s+(?:la\s+)?(?:ciudad\s+de\s+)?[A-ZÁÉÍÓÚÑ][\p{L} ]{2,40},\s+a\s+\p{L}+\s+de\s+\p{L}+)/iu;

export interface SeparationContext {
  /** Títulos de todas las secciones del documento (para detectar encabezados anidados). */
  sectionTitles: readonly string[];
  /** Tipo de la sección que contiene el texto. */
  sectionType: string;
  sectionTitle: string;
  /**
   * Texto de las fuentes y de la ficha: lo único que respalda citas de artículos, tesis y órganos. Si se
   * indica, una cita específica que no conste ahí se omite del cuerpo y se lista en el anexo.
   */
  supportText?: string;
}

export interface SeparationResult {
  text: string;
  changed: boolean;
}

const STRUCTURAL_SECTION_TYPES = new Set(['closing', 'signature', 'header']);

const isSpecificCitation = (citation: MaterialLegalCitation) => Boolean(citation.articleText)
  || /\bart[ií]culos?\s+\d|\bart\.\s*\d|\b(?:registro\s+digital|tesis|jurisprudencia|precedente)\b/i.test(citation.text);
const isSupportedCitation = (citation: MaterialLegalCitation, supportNorm: string) =>
  citation.aliases.map(normalizeLegalCitation).some((alias) => Boolean(alias) && supportNorm.includes(alias));

/** Aplica la separación a un bloque de texto y vuelca lo retirado en el anexo. */
export function separateReviewMaterialFromText(text: string, annex: ReviewAnnex, context: SeparationContext): SeparationResult {
  if (!text.trim()) return { text, changed: false };
  const section = context.sectionTitle;
  const titleKeys = new Set(context.sectionTitles.map(fold).filter(Boolean));
  const structural = STRUCTURAL_SECTION_TYPES.has(context.sectionType);
  const supportNorm = context.supportText === undefined ? undefined : normalizeLegalCitation(context.supportText);
  const out: string[] = [];
  let changed = false;
  let skipSignatureLines = 0;
  // Tras un encabezado de OTRA sección, lo que sigue es el escrito reiniciándose dentro de esta sección.
  let dropRest = false;
  const dropped: string[] = [];
  const ownKey = fold(section.replace(/[:.\s]+$/, ''));

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (dropRest) { if (line) dropped.push(line); changed = true; continue; }
    if (!line) { out.push(''); continue; }

    // Aviso interno «sección pendiente de redacción»: es una nota para el abogado, no texto del escrito.
    if (/^\[DATO\s+PENDIENTE\s*\/\s*GENERACI[ÓO]N\s+PENDIENTE\s+DE\s+REVISI[ÓO]N\]/i.test(line) || /^Apartado\s+[«"].+[»"]\s+pendiente\s+de\s+redacci[óo]n\b/i.test(line)) {
      annex.pendingItems.push({ section, text: 'La sección quedó pendiente de redacción: desarróllala con información respaldada en el expediente.' });
      changed = true;
      continue;
    }

    // Firma tras un encabezado anidado: se retiran las líneas de firma que siguen.
    if (skipSignatureLines > 0 && !structural) {
      if (line.length <= 90 && !/[.:;]$/.test(line)) { skipSignatureLines -= 1; changed = true; annex.removedStructure.push({ section, kind: 'SIGNATURE', excerpt: excerpt(line) }); continue; }
      skipSignatureLines = 0;
    }

    // Encabezado anidado: la línea es el título de otra sección (o de la propia, repetido).
    // (El título de la propia sección repetido al inicio también sobra: el título se imprime aparte.)
    const key = fold(line.replace(/[:.\s]+$/, ''));
    if (!structural && line.length <= 90 && titleKeys.has(key)) {
      changed = true;
      annex.removedStructure.push({ section, kind: 'HEADING', excerpt: excerpt(line) });
      if (key !== ownKey) dropRest = true;
      else if (/^firma\b/.test(key)) skipSignatureLines = 4;
      continue;
    }

    if (!structural && SIGNATURE_PARAGRAPH.test(line)) {
      changed = true;
      annex.removedStructure.push({ section, kind: 'SIGNATURE', excerpt: excerpt(line) });
      continue;
    }
    if (!structural && PLACE_DATE_PARAGRAPH.test(line) && line.length < 160) {
      changed = true;
      annex.removedStructure.push({ section, kind: 'PLACE_DATE', excerpt: excerpt(line) });
      continue;
    }

    const kept: string[] = [];
    for (let sentence of splitSentences(line)) {
      const original = sentence;

      // Meta-texto: comentario sobre el propio escrito o consejo al abogado.
      const meta = META_TEXT_RULES.find((rule) => rule.pattern.test(sentence));
      if (meta) {
        annex.notes.push({ section, text: excerpt(original) });
        changed = true;
        continue;
      }

      // Cita específica sin respaldo en las fuentes: se omite la oración y se lista.
      if (supportNorm !== undefined) {
        const unsupported = extractMaterialLegalCitations(sentence).filter((citation) => isSpecificCitation(citation) && !isSupportedCitation(citation, supportNorm));
        if (unsupported.length) {
          for (const citation of unsupported) annex.unverifiedCitations.push({ section, citation: excerpt(citation.text, 160), omitted: excerpt(original) });
          changed = true;
          continue;
        }
      }

      // Cita no verificada: se omite la oración completa del cuerpo y se lista.
      NEW_VERIFICATION_MARKER.lastIndex = 0;
      const unverified = [...sentence.matchAll(NEW_VERIFICATION_MARKER)];
      if (unverified.length) {
        for (const match of unverified) annex.unverifiedCitations.push({ section, citation: excerpt(match[1].trim(), 160), omitted: excerpt(original.replace(NEW_VERIFICATION_MARKER, '').trim() || original) });
        changed = true;
        continue;
      }

      // Desarrollo o fundamento pendiente: se retira el marcador y se lista.
      PENDING_DEVELOPMENT_MARKER.lastIndex = 0;
      const pending = [...sentence.matchAll(PENDING_DEVELOPMENT_MARKER)];
      if (pending.length) {
        for (const match of pending) annex.pendingItems.push({ section, text: excerpt(match[0].replace(/^\[|\]$/g, '').trim(), 200) });
        sentence = sentence.replace(PENDING_DEVELOPMENT_MARKER, ' ');
        changed = true;
      }
      const withoutTail = sentence.replace(LOOSE_PENDING_TAIL, '');
      if (withoutTail !== sentence) { sentence = withoutTail; changed = true; }
      const modified = sentence !== original;
      sentence = sentence.replace(/\s{2,}/g, ' ').trim();
      // Restos cortos que deja un marcador retirado («, » o «y»): solo si la oración cambió.
      if (!sentence || (modified && sentence.length < 12 && !/[.!?]$/.test(sentence))) continue;
      kept.push(sentence);
    }
    if (kept.length) out.push(kept.join(' '));
    else changed = true;
  }

  if (dropped.length) annex.removedStructure.push({ section, kind: 'HEADING', excerpt: `Texto posterior retirado: ${excerpt(dropped.join(' '), 400)}` });

  // Compacta líneas en blanco consecutivas.
  const compact = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: compact, changed: changed || compact !== text.trim() };
}

/**
 * Separa el material de revisión de TODO el escrito. No toca bloques editados por el abogado ni el texto
 * literal de la fuente. Idempotente.
 */
export function separateReviewMaterial(doc: UniversalLegalDocument, annex: ReviewAnnex, options: { supportText?: string } = {}): number {
  const sectionTitles = (doc.sections || []).map((section) => section.title);
  let touched = 0;
  for (const section of doc.sections || []) {
    for (const block of section.content || []) {
      if (!block.text || block.isManuallyEdited || block.generatedBy === 'USER' || block.generatedBy === 'SOURCE_DIRECT') continue;
      const result = separateReviewMaterialFromText(block.text, annex, { sectionTitles, sectionType: section.type, sectionTitle: section.title, supportText: options.supportText });
      if (result.changed) { block.text = result.text; touched += 1; }
    }
    // Un bloque que quedó vacío (p. ej. el aviso de «pendiente de redacción») no se conserva si la sección tiene más texto.
    if ((section.content || []).some((block) => (block.text || '').trim())) {
      section.content = (section.content || []).filter((block) => (block.text || '').trim() || block.isManuallyEdited);
    }
  }
  return touched;
}

/** Quita duplicados idénticos que dejan varias pasadas. */
export function dedupeReviewAnnex(annex: ReviewAnnex): ReviewAnnex {
  const uniq = <T,>(items: T[], key: (item: T) => string) => items.filter((item, index) => items.findIndex((other) => key(other) === key(item)) === index);
  return {
    ...annex,
    notes: uniq(annex.notes, (item) => `${item.section}|${item.text}`),
    unverifiedCitations: uniq(annex.unverifiedCitations, (item) => `${item.section}|${item.citation}|${item.omitted}`),
    pendingItems: uniq(annex.pendingItems, (item) => `${item.section}|${item.text}`),
    removedStructure: uniq(annex.removedStructure, (item) => `${item.section}|${item.kind}|${item.excerpt}`),
    unresolvedFindings: uniq(annex.unresolvedFindings, (item) => `${item.code}|${item.section ?? ''}|${item.message}`),
  };
}

/** Texto plano del anexo (para descargar o copiar), claramente separado del escrito. */
export function formatReviewAnnex(annex: ReviewAnnex, title = 'ANEXO DE REVISIÓN PARA EL ABOGADO'): string {
  const lines: string[] = [title, 'No forma parte del escrito. Revísalo antes de presentarlo.', ''];
  const block = (heading: string, items: string[]) => {
    if (!items.length) return;
    lines.push(heading, ...items.map((item, index) => `${index + 1}. ${item}`), '');
  };
  block('CITAS Y FUNDAMENTOS NO VERIFICADOS (omitidos del escrito; verifícalos en fuente oficial antes de incorporarlos)',
    annex.unverifiedCitations.map((item) => `[${item.section}] ${item.citation} — oración omitida: «${item.omitted}»`));
  block('DESARROLLOS PENDIENTES', annex.pendingItems.map((item) => `[${item.section}] ${item.text}`));
  block('NOTAS Y RIESGOS (el redactor los escribió como parte del texto; no corresponden al escrito)', annex.notes.map((item) => `[${item.section}] ${item.text}`));
  block('HALLAZGOS SIN RESOLVER', annex.unresolvedFindings.map((item) => `${item.code}${item.section ? ` [${item.section}]` : ''}: ${item.message}`));
  block('ESTRUCTURA RETIRADA (encabezados, firmas o «lugar y fecha» repetidos dentro de otra sección)', annex.removedStructure.map((item) => `[${item.section}] ${item.kind}: ${item.excerpt}`));
  if (lines.length <= 3) lines.push('Sin elementos pendientes.');
  return lines.join('\n').trimEnd();
}

export { INLINE_VERIFICATION_MARKER };
