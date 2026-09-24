/**
 * Universal Document Extraction Pipeline
 *
 * Handles extraction from any supported document format using a layered
 * fallback strategy:
 *
 *   ARCHIVO
 *   ↓ IDENTIFICAR TIPO
 *   ↓ EXTRACCIÓN NATIVA
 *   ↓ MEDIR CALIDAD
 *   ↓ ¿CALIDAD SUFICIENTE? → SÍ: READY | NO →
 *   ↓ OCR AUTOMÁTICO
 *   ↓ NUEVA EXTRACCIÓN
 *   ↓ MEDIR CALIDAD NUEVAMENTE → SÍ: READY | NO: NEEDS_MANUAL_REVIEW
 *
 * Never executes AI legal analysis on a document whose extraction has
 * not been validated (sourceValidated === false).
 */

import {
  computeDocumentQualityScore,
  DocumentQualityScore,
  extractPdfTextServer,
} from './pdfExtractor';
import {
  DocumentOCRProvider,
  ExtractionLog,
  OCRPageResult,
  getOCRProvider,
  ocrAvailable,
} from './ocrProviders';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import { markDocumentAsSource } from '@/lib/legal-engine/documentLifecycle';
import type { DocumentLifecycleMetadata } from '@/lib/legal-engine/documentLifecycle';

// ── Supported file types ───────────────────────────────────────────────────────

export type SupportedFileType =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'txt'
  | 'rtf'
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'image';

export type ExtractionMethod = 'native' | 'ocr' | 'fallback' | 'manual';

// ── Per-page document unit ─────────────────────────────────────────────────────

export interface DocumentPage {
  page: number;
  text: string;
  chars: number;
}

// ── Pipeline step for UI ───────────────────────────────────────────────────────

export type StepStatus = 'pending' | 'ok' | 'warn' | 'error' | 'running';

export interface ExtractionStep {
  step: number;
  label: string;
  /** true = completed successfully, false = failed/skipped */
  done: boolean;
  status: StepStatus;
  detail?: string;
}

// ── Final structured result ────────────────────────────────────────────────────

export interface ExtractionResult {
  /** Lifecycle identity of the received file; extraction never creates a template. */
  lifecycle?: DocumentLifecycleMetadata;
  /** Overall pipeline outcome */
  status: 'READY' | 'NEEDS_MANUAL_REVIEW' | 'FAILED';
  /** How text was ultimately obtained */
  extractionMethod: ExtractionMethod;
  /** Full concatenated text */
  text: string;
  /** Per-page breakdown */
  pages: DocumentPage[];
  /** Page count */
  pageCount: number;
  /** Characters in final text */
  textLength: number;
  /** Characters per page on average */
  avgCharsPerPage: number;
  /** Confidence 0-100 */
  confidence: number;
  /** Human-readable quality label */
  qualityLabel: string;
  /** Whether OCR was used */
  ocrUsed: boolean;
  /** Whether the source can be trusted for AI analysis */
  sourceValidated: boolean;
  sourceQualityStatus: 'READY' | 'NEEDS_SOURCE_REVIEW';
  /**
   * How the source was validated:
   * 'native-text' | 'ocr' | 'manual-text' | 'mixed' | 'unvalidated'
   */
  sourceValidationMethod: string;
  /** Final computed quality metrics */
  qualityScore: DocumentQualityScore;
  sourceQuality: {
    pageCount: number;
    characterCount: number;
    charactersPerPage: number;
    emptyPageRatio: number;
    extractionMethod: ExtractionMethod;
    ocrUsed: boolean;
    confidence: number;
  };
  /** Ordered steps for UI rendering */
  extractionSteps: ExtractionStep[];
  /** Non-fatal issues detected */
  warnings: string[];
  /** Detected MIME type */
  mimeType: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Total pipeline duration in ms */
  durationMs: number;
  /** Which OCR provider was used, if any */
  ocrProvider: string | null;
  /** Formal OCR lifecycle status (distinguishes NOT_CONFIGURED from AVAILABLE_AND_FAILED) */
  ocrStatus?: 'OCR_COMPLETED' | 'OCR_NOT_REQUIRED' | 'OCR_AVAILABLE_AND_FAILED' | 'OCR_PROVIDER_NOT_CONFIGURED';
}

// ── Quality threshold ──────────────────────────────────────────────────────────

/** Minimum avgCharsPerPage to consider native extraction sufficient */
const NATIVE_QUALITY_THRESHOLD = 80;
/** Minimum total characters to consider a document valid */
const MIN_TEXT_LENGTH = 150;
/** Below this confidence score, recommend OCR */
const CONFIDENCE_THRESHOLD_OCR = 50;

// ── Helpers ────────────────────────────────────────────────────────────────────

function detectFileType(
  fileName: string,
  mimeType: string
): { ext: string; mimeType: string } {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  // Normalize mimeType for images
  let resolvedMime = mimeType;
  if (!resolvedMime && ['jpg', 'jpeg'].includes(ext)) resolvedMime = 'image/jpeg';
  if (!resolvedMime && ext === 'png') resolvedMime = 'image/png';
  if (!resolvedMime && ext === 'pdf') resolvedMime = 'application/pdf';
  if (!resolvedMime && ext === 'docx')
    resolvedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!resolvedMime && ext === 'doc') resolvedMime = 'application/msword';
  if (!resolvedMime && ext === 'txt') resolvedMime = 'text/plain';
  if (!resolvedMime && ext === 'rtf') resolvedMime = 'application/rtf';
  return { ext, mimeType: resolvedMime };
}

/**
 * Enhanced quality detection — goes beyond simple text.length.
 * Detects: empty pages, low density, corrupt chars, repeated fragments,
 * header-only documents, and illegible content.
 */
export function assessExtractionQuality(
  text: string,
  pageCount: number
): {
  sufficient: boolean;
  reason: string;
  warnings: string[];
  emptyPages: number;
} {
  const warnings: string[] = [];
  const clean = (text || '').trim();
  const totalChars = clean.length;
  const pages = Math.max(1, pageCount);
  const avg = totalChars / pages;

  // 1. No text at all
  if (totalChars === 0) {
    return { sufficient: false, reason: 'Sin texto extraíble', warnings, emptyPages: pages };
  }

  // 2. Trivially short (e.g., only metadata/headers)
  if (totalChars < MIN_TEXT_LENGTH) {
    warnings.push(`Texto muy corto: ${totalChars} caracteres para ${pages} página(s).`);
    return { sufficient: false, reason: 'Texto insuficiente (posible PDF escaneado)', warnings, emptyPages: pages - 1 };
  }

  // 3. Average chars per page too low
  if (avg < NATIVE_QUALITY_THRESHOLD) {
    warnings.push(`Promedio bajo: ${Math.round(avg)} caracteres/página. Esperado ≥ ${NATIVE_QUALITY_THRESHOLD}.`);
    return {
      sufficient: false,
      reason: `Densidad insuficiente (${Math.round(avg)} chars/página — posible PDF escaneado)`,
      warnings,
      emptyPages: Math.round(pages * 0.5),
    };
  }

  // 4. Excessive illegible / non-printable characters (> 15%)
  const illegalChars = (clean.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g) || []).length;
  const illegalRatio = illegalChars / totalChars;
  if (illegalRatio > 0.15) {
    warnings.push(`Texto con ${Math.round(illegalRatio * 100)}% de caracteres ilegibles/corruptos.`);
    return { sufficient: false, reason: 'Texto con caracteres corruptos', warnings, emptyPages: 0 };
  }

  // 5. Highly repeated content (text copied > 5 times → likely garbage)
  const firstChunk = clean.slice(0, 100);
  if (firstChunk.length > 20) {
    const repeatCount = (clean.split(firstChunk).length - 1);
    if (repeatCount > 5) {
      warnings.push('Texto muy repetitivo: posible extracción defectuosa.');
      return { sufficient: false, reason: 'Texto repetido (extracción defectuosa)', warnings, emptyPages: 0 };
    }
  }

  // 6. Only uppercase single letters / fragmented (OCR artifact)
  const wordLike = (clean.match(/[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{3,}/g) || []).length;
  const charCount = totalChars;
  if (charCount > 500 && wordLike / charCount < 0.02) {
    warnings.push('Texto muy fragmentado: posible PDF con capa de texto corrupta.');
    return { sufficient: false, reason: 'Texto fragmentado (posible PDF híbrido corrupto)', warnings, emptyPages: 0 };
  }

  // Count actually empty page-blocks
  const pageBlocks = clean.split(/\f|\n{5,}/);
  const emptyPages = pageBlocks.filter((b) => b.trim().length < 30).length;
  if (emptyPages > pages * 0.5) {
    warnings.push(`${emptyPages} de ${pages} página(s) están vacías o casi vacías.`);
  }

  return { sufficient: true, reason: 'Extracción nativa suficiente', warnings, emptyPages };
}

// ── Native extractors per file type ───────────────────────────────────────────

async function extractNative(
  buffer: Buffer,
  ext: string,
  mimeType: string
): Promise<{ text: string; pageCount: number; pages: DocumentPage[]; warnings: string[] }> {
  const warnings: string[] = [];

  // PDF
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    try {
      const result = await extractPdfTextServer(buffer);
      const normalizedText = normalizeLegalDocumentText(result.text);
      const pages: DocumentPage[] = result.pages.map((p) => ({
        page: p.pageNumber,
        text: normalizeLegalDocumentText(p.text),
        chars: normalizeLegalDocumentText(p.text).length,
      }));
      return { text: normalizedText, pageCount: result.numpages, pages, warnings };
    } catch (err: any) {
      warnings.push(`PDF nativo: ${err.message}`);
      return { text: '', pageCount: 1, pages: [], warnings };
    }
  }

  // DOCX
  if (
    ext === 'docx' ||
    ext === 'doc' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/msword'
  ) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeLegalDocumentText(result.value || '');
      const pageCount = Math.max(1, Math.ceil(text.length / 2000));
      const pages: DocumentPage[] = [{ page: 1, text, chars: text.length }];
      return { text, pageCount, pages, warnings };
    } catch (err: any) {
      warnings.push(`DOCX extraction: ${err.message}`);
      return { text: '', pageCount: 1, pages: [], warnings };
    }
  }

  // TXT
  if (ext === 'txt' || mimeType.includes('text/plain')) {
    const text = normalizeLegalDocumentText(buffer.toString('utf-8'));
    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.length / 3000)),
      pages: [{ page: 1, text, chars: text.length }],
      warnings,
    };
  }

  // RTF — strip markup
  if (ext === 'rtf' || mimeType === 'application/rtf') {
    const raw = buffer.toString('latin1');
    const text = normalizeLegalDocumentText(raw.replace(/\\[a-z]+\d*\s?|[{}]/g, ' ').replace(/\s{2,}/g, ' '));
    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.length / 2000)),
      pages: [{ page: 1, text, chars: text.length }],
      warnings,
    };
  }

  // Images — native has no text
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png'].includes(ext)) {
    return { text: '', pageCount: 1, pages: [], warnings: ['Imagen: sin texto nativo, requiere OCR.'] };
  }

  throw new Error(`Formato no soportado: .${ext} (${mimeType})`);
}

// ── Main pipeline ──────────────────────────────────────────────────────────────

export interface ExtractDocumentInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Runs the full universal extraction pipeline with automatic OCR fallback.
 * Returns a fully structured ExtractionResult for use by the API and UI.
 */
export async function extractDocument(
  input: ExtractDocumentInput
): Promise<ExtractionResult> {
  const pipelineStart = Date.now();
  const { buffer, fileName } = input;
  const { ext, mimeType } = detectFileType(fileName, input.mimeType);
  const fileSizeBytes = buffer.length;

  const steps: ExtractionStep[] = [];
  const warnings: string[] = [];
  let ocrProvider: string | null = null;

  // ── Step 1: File received ─────────────────────────────────────────────────
  steps.push({
    step: 1,
    label: `Archivo recibido: ${fileName} (${(fileSizeBytes / 1024).toFixed(1)} KB)`,
    done: true,
    status: 'ok',
  });

  // ── Step 2: Native extraction ─────────────────────────────────────────────
  steps.push({ step: 2, label: 'Extracción nativa…', done: false, status: 'running' });
  let nativeText = '';
  let pageCount = 1;
  let nativePages: DocumentPage[] = [];

  try {
    const nativeResult = await extractNative(buffer, ext, mimeType);
    nativeText = nativeResult.text;
    pageCount = nativeResult.pageCount;
    nativePages = nativeResult.pages;
    warnings.push(...nativeResult.warnings);

    steps[1] = {
      step: 2,
      label: `Extracción nativa: ${pageCount} página(s), ${nativeText.length.toLocaleString()} caracteres`,
      done: true,
      status: nativeText.length > 0 ? 'ok' : 'warn',
      detail: nativeText.length === 0 ? 'Sin texto seleccionable' : undefined,
    };
  } catch (err: any) {
    warnings.push(`Extracción nativa falló: ${err.message}`);
    steps[1] = {
      step: 2,
      label: 'Extracción nativa falló',
      done: false,
      status: 'error',
      detail: err.message,
    };
  }

  // ── Step 3: Quality assessment ────────────────────────────────────────────
  const nativeQuality = assessExtractionQuality(nativeText, pageCount);
  warnings.push(...nativeQuality.warnings);

  const nativeScore = computeDocumentQualityScore(nativeText, pageCount, false);
  steps.push({
    step: 3,
    label: nativeQuality.sufficient
      ? `Calidad nativa: ${nativeScore.confidence}% — ${nativeScore.qualityLabel}`
      : `Calidad insuficiente: ${nativeQuality.reason}`,
    done: nativeQuality.sufficient,
    status: nativeQuality.sufficient ? 'ok' : 'warn',
    detail: nativeQuality.sufficient ? undefined : nativeQuality.reason,
  });

  // ── Step 4: OCR (if native quality insufficient) ──────────────────────────
  let finalText = nativeText;
  let finalPages = nativePages;
  let ocrUsed = false;
  let ocrScore = nativeScore;
  let extractionMethod: ExtractionMethod = 'native';
  let ocrStatus: ExtractionResult['ocrStatus'] = 'OCR_NOT_REQUIRED';

  if (!nativeQuality.sufficient) {
    const canOCR = ocrAvailable(mimeType) || ocrAvailable('application/pdf');

    if (!canOCR) {
      ocrStatus = 'OCR_PROVIDER_NOT_CONFIGURED';
      steps.push({
        step: 4,
        label: 'No fue posible obtener texto suficiente del documento.',
        done: false,
        status: 'warn',
      });
    } else {
      steps.push({ step: 4, label: 'Reconociendo texto del documento escaneado…', done: false, status: 'running' });

      try {
        const provider: DocumentOCRProvider = getOCRProvider();
        ocrProvider = provider.name;

        const ocrResult = await provider.process({
          buffer,
          mimeType,
          language: 'spa',
          fileName,
        });

        if (ocrResult.text.trim().length > 0) {
          finalText = normalizeLegalDocumentText(ocrResult.text);
          finalPages = ocrResult.pages.map((p: OCRPageResult) => ({
            page: p.page,
            text: normalizeLegalDocumentText(p.text),
            chars: normalizeLegalDocumentText(p.text).length,
          }));
          pageCount = ocrResult.pageCount || pageCount;
          ocrUsed = true;
          ocrStatus = 'OCR_COMPLETED';
          extractionMethod = 'ocr';
          ocrScore = computeDocumentQualityScore(finalText, pageCount, true);
          warnings.push(...ocrResult.warnings);

          steps[3] = {
            step: 4,
            label: `OCR completado (${provider.name}): ${finalText.length.toLocaleString()} caracteres, confianza ${ocrResult.confidence}%`,
            done: true,
            status: ocrResult.confidence >= 70 ? 'ok' : 'warn',
          };
        } else {
          ocrStatus = 'OCR_AVAILABLE_AND_FAILED';
          warnings.push('No fue posible obtener texto suficiente del documento.');
        steps[3] = {
          step: 4,
          label: 'No fue posible obtener texto suficiente del documento.',
          done: false,
          status: 'error',
        };
          extractionMethod = 'fallback';
        }
      } catch (err: any) {
        ocrStatus = 'OCR_AVAILABLE_AND_FAILED';
        console.warn('[document-extractor] OCR local falló', {
          provider: ocrProvider,
          message: err?.message || 'error desconocido',
        });
        warnings.push('No fue posible obtener texto suficiente del documento.');
        steps[3] = {
          step: 4,
          label: 'No fue posible obtener texto suficiente del documento.',
          done: false,
          status: 'error',
        };
        extractionMethod = 'fallback';
      }
    }
  } else {
    // Native quality was sufficient — no OCR needed
    steps.push({
      step: 4,
      label: 'OCR: No requerido (extracción nativa suficiente)',
      done: true,
      status: 'ok',
    });
  }

  // ── Step 5: Post-OCR quality validation ───────────────────────────────────
  const finalQuality = assessExtractionQuality(finalText, pageCount);
  const finalScore = computeDocumentQualityScore(finalText, pageCount, ocrUsed);

  // Un proveedor OCR mock/test jamás puede acreditar una fuente verificada.
  const mockOcrUsed = ocrUsed && ocrProvider === 'mock';
  if (mockOcrUsed) {
    warnings.push('[MOCK OCR] El proveedor OCR configurado es de prueba (mock). La fuente NO se marca como verificada. Configura OCR_PROVIDER=ilovepdf con credenciales reales o =tesseract para OCR de producción.');
  }

  const sourceValidated = !mockOcrUsed && finalQuality.sufficient && finalScore.status === 'READY';
  const emptyPageRatio = finalPages.length > 0
    ? finalPages.filter((page) => page.chars < 30).length / Math.max(1, pageCount)
    : (finalText.trim() ? 0 : 1);
  let sourceValidationMethod = 'unvalidated';
  if (sourceValidated) {
    sourceValidationMethod = ocrUsed ? 'ocr' : 'native-text';
  }

  steps.push({
    step: 5,
    label: sourceValidated
      ? `Fuente validada para IA: ${pageCount} páginas, ${finalText.length.toLocaleString()} chars, ${finalScore.confidence}%`
      : mockOcrUsed
      ? 'Fuente NO verificada: el OCR usado es un proveedor mock de prueba (configura OCR real)'
      : `Fuente no validada: ${finalQuality.reason}`,
    done: sourceValidated,
    status: sourceValidated ? 'ok' : 'error',
    detail: sourceValidated ? undefined : mockOcrUsed ? 'Proveedor OCR de prueba no acredita verificación' : finalQuality.reason,
  });

  // ── Determine final status ────────────────────────────────────────────────
  let status: ExtractionResult['status'];
  if (sourceValidated) {
    status = 'READY';
  } else if (finalText.length > 0) {
    status = 'NEEDS_MANUAL_REVIEW';
  } else {
    status = 'FAILED';
  }

  // ── Produce structured extraction log (never logs secrets or content) ─────
  const log: ExtractionLog = {
    fileName,
    fileSizeBytes,
    mimeType,
    pageCount,
    method: extractionMethod,
    provider: ocrProvider,
    durationMs: Date.now() - pipelineStart,
    confidenceBefore: nativeScore.confidence,
    confidenceAfter: finalScore.confidence,
    qualityBefore: nativeScore.qualityLabel,
    qualityAfter: finalScore.qualityLabel,
    ocrUsed,
    errors: steps.filter((s) => s.status === 'error').map((s) => s.label),
    warnings: warnings.filter((w) => !w.includes('MOCK')),
  };
  console.log('[document-extractor]', JSON.stringify(log));

  return markDocumentAsSource({
    status,
    extractionMethod,
    text: finalText,
    pages: finalPages,
    pageCount,
    textLength: finalText.length,
    avgCharsPerPage: Math.round(finalText.length / Math.max(1, pageCount)),
    confidence: finalScore.confidence,
    qualityLabel: finalScore.qualityLabel,
    ocrUsed,
    sourceValidated,
    sourceQualityStatus: sourceValidated ? 'READY' : 'NEEDS_SOURCE_REVIEW',
    sourceValidationMethod,
    qualityScore: finalScore,
    sourceQuality: {
      pageCount,
      characterCount: finalText.length,
      charactersPerPage: finalText.length / Math.max(1, pageCount),
      emptyPageRatio,
      extractionMethod,
      ocrUsed,
      confidence: finalScore.confidence,
    },
    extractionSteps: steps,
    warnings: [...new Set(warnings)],
    mimeType,
    fileName,
    fileSizeBytes,
    durationMs: Date.now() - pipelineStart,
    ocrProvider,
    ocrStatus,
  }, fileName);
}
