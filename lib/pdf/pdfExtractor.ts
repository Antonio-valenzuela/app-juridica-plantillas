import Tesseract from 'tesseract.js';
import { normalizeLegalDocumentText } from '@/lib/text/normalizeLegalDisplayText';
import { markDocumentAsSource } from '@/lib/legal-engine/documentLifecycle';
import type { DocumentLifecycleMetadata } from '@/lib/legal-engine/documentLifecycle';

export interface DocumentQualityScore {
  textLength: number;
  pageCount: number;
  avgCharsPerPage: number;
  emptyPages: number;
  ocrUsed: boolean;
  confidence: number;
  status: 'READY' | 'NEEDS_OCR' | 'LOW_QUALITY' | 'FAILED';
  qualityLabel: string;
}

export interface ExtractedPdfContent {
  lifecycle?: DocumentLifecycleMetadata;
  text: string;
  numpages: number;
  info?: any;
  needsOcr: boolean;
  qualityScore: DocumentQualityScore;
  pages: Array<{ pageNumber: number; text: string }>;
}

export function computeDocumentQualityScore(
  text: string,
  pageCount: number = 1,
  ocrUsed: boolean = false
): DocumentQualityScore {
  const clean = (text || "").trim();
  const textLength = clean.length;
  const pages = Math.max(1, pageCount);
  const avgCharsPerPage = Math.round(textLength / pages);

  const keywords = [
    'considerando', 'por tanto', 'quejoso', 'demandado', 'actor', 'demandante',
    'juzgado', 'tribunal', 'juicio', 'amparo', 'expediente', 'notifíquese',
    'resuelve', 'autos', 'promovente', 'magistrado', 'artículo', 'ley de amparo',
    'constitución', 'sentencia', 'acuerda'
  ];
  const lower = clean.toLowerCase();
  const matchedKeywords = keywords.filter((kw) => lower.includes(kw)).length;

  let confidence = Math.min(100, Math.round((textLength / (pages * 400)) * 50 + (matchedKeywords / 4) * 50));
  if (confidence < 25 && textLength > 100) confidence = 55;
  if (textLength === 0) confidence = 0;

  let status: DocumentQualityScore['status'] = 'READY';
  let qualityLabel = 'Alta (Excelente)';

  if (textLength === 0) {
    status = 'FAILED';
    qualityLabel = 'Sin texto extraíble';
  } else if (avgCharsPerPage < 50 || textLength < 150) {
    status = 'NEEDS_OCR';
    qualityLabel = 'Media (PDF escaneado / Texto limitado)';
  } else if (confidence < 50) {
    status = 'LOW_QUALITY';
    qualityLabel = 'Aceptable (Revisión recomendada)';
  }

  return {
    textLength,
    pageCount: pages,
    avgCharsPerPage,
    emptyPages: 0,
    ocrUsed,
    confidence,
    status,
    qualityLabel,
  };
}

export async function extractPdfTextServer(buffer: Buffer): Promise<ExtractedPdfContent> {
  if (!buffer || buffer.length === 0) {
    throw new Error("El archivo PDF está vacío o corrupto.");
  }

  // Maximum size 15MB check
  if (buffer.length > 15 * 1024 * 1024) {
    throw new Error("El archivo excede el tamaño máximo permitido de 15MB.");
  }

  try {
    const pdfModule = eval('require')('pdf-parse');
    const PDFParse = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse);
    const pdfFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;

    let totalText = "";
    let numpages = 1;
    let info: any = undefined;
    let pages: Array<{ pageNumber: number; text: string }> = [];

    if (typeof PDFParse === "function") {
      try {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        totalText = (result?.text || "").trim();
        info = (result as any)?.info;

        if (Array.isArray(result?.pages) && result.pages.length > 0) {
          numpages = result.pages.length;
          pages = result.pages.map((p: any, idx: number) => ({
            pageNumber: p.pageNumber || p.page || (idx + 1),
            text: (p.text || "").trim(),
          }));
        }
      } catch (e: any) {
        console.warn("[pdfExtractor] Class PDFParse failed, trying fallback function:", e?.message);
      }
    }

    if (!totalText && typeof pdfFn === "function") {
      try {
        const result = await pdfFn(buffer);
        totalText = (result?.text || "").trim();
        numpages = result?.numpages || 1;
        info = result?.info;
      } catch (e: any) {
        console.warn("[pdfExtractor] Fallback pdfFn failed:", e?.message);
      }
    }

    totalText = normalizeLegalDocumentText(totalText);
    pages = pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: normalizeLegalDocumentText(page.text),
    }));

    if (pages.length === 0 && totalText.length > 0) {
      const pageChunks = totalText.split(/\f|\n(?=Página \d+)/i);
      pages = Array.from({ length: numpages }, (_, i) => ({
        pageNumber: i + 1,
        text: (pageChunks[i] || totalText).trim(),
      }));
    }

    if (!totalText) {
      throw new Error("No se pudo extraer texto seleccionable del PDF.");
    }

    const averageCharsPerPage = totalText.length / Math.max(1, numpages);
    const needsOcr = averageCharsPerPage < 80;
    const qualityScore = computeDocumentQualityScore(totalText, numpages, false);

    return markDocumentAsSource({
      text: totalText,
      numpages,
      info,
      needsOcr,
      qualityScore,
      pages,
    });
  } catch (err: any) {
    console.error("[extractPdfTextServer Error]", err);
    throw new Error(`Error al procesar el archivo PDF: ${err.message || "Archivo no válido o protegido"}`);
  }
}

export const OCR_MAX_PAGES = 20;

export function ocrEnabled(): boolean {
  return process.env.OCR_ENABLED !== 'false';
}

export async function extractPdfTextWithOCR(buffer: Buffer): Promise<ExtractedPdfContent> {
  const result = await extractPdfTextServer(buffer);
  if (result.needsOcr && ocrEnabled()) {
    // We can't convert easily PDF to image server-side without native deps,
    // so we return the flag. Actual OCR of raw buffer happens with image files.
  }
  return result;
}

export async function extractImageTextOCR(buffer: Buffer, mimeType: string): Promise<{text: string, confidence: number}> {
  if (!ocrEnabled()) {
    return { text: '', confidence: 0 };
  }
  const worker = await Tesseract.createWorker('spa');
  const { data: { text, confidence } } = await worker.recognize(buffer);
  await worker.terminate();
  return { text, confidence };
}
