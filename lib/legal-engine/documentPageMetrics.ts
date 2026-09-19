import { renderPdf } from './exportPdfUniversal';
import { resolvePdfPageProfile } from './exportPageProfiles';
import { materializeDocumentForPageMeasurement } from './finalDocumentMaterialization';
import { DEFAULT_LAWYER_PROFILE } from '../workspace/lawyerProfileTypes';
import type { UniversalLegalDocument } from './types';

export interface RenderedDocumentPageMetrics {
  actualPages: number;
  wordCount: number;
  characterCount: number;
  pdfBytes: number;
}

function countPdfPages(bytes: Uint8Array): number {
  const raw = Buffer.from(bytes).toString('latin1');
  // The local serializer emits one exact page object marker per rendered page.
  // Match the parent link so /Type /Pages is never counted as a page.
  const matches = raw.match(/\/Type \/Page \/Parent/g);
  return matches?.length || 0;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdfModule = eval('require')('pdf-parse') as any;
    const parser = new pdfModule.PDFParse({ data: bytes });
    const result = await parser.getText();
    return String(result?.text || '');
  } catch {
    return '';
  }
}

/**
 * Measures the actual serialized PDF layout, not a chars-per-page estimate.
 * This is intentionally separate from final export so an unmet target never
 * weakens export/readiness gates.
 */
export async function measureRenderedDocumentPages(
  document: UniversalLegalDocument,
): Promise<RenderedDocumentPageMetrics> {
  const model = materializeDocumentForPageMeasurement(document);
  const artifact = await renderPdf(model, {
    format: 'pdf',
    pageProfile: resolvePdfPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  });
  const bytes = new Uint8Array(artifact.bytes);
  const actualPages = countPdfPages(bytes);
  // pdf-parse may detach or consume the supplied ArrayBuffer in some Node
  // versions, so parse a copy and keep the serialized bytes intact for the
  // page count and byte-size evidence.
  const text = await extractPdfText(new Uint8Array(bytes));
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return {
    actualPages,
    wordCount,
    characterCount: text.length,
    pdfBytes: bytes.byteLength,
  };
}
