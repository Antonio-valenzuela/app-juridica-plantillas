import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import { assembleLegalDraft } from '../lib/legal-engine/documentAssembly';
import { sanitizeLegalDocument } from '../lib/legal-engine/legalDocumentSanitizer';
import { measureRenderedDocumentPages } from '../lib/legal-engine/documentPageMetrics';
import type { UploadedSourceDocument } from '../lib/legal-engine/context';
import type { UniversalLegalDocument, ContentBlock } from '../lib/legal-engine/types';

async function main() {
  const pdfPath = path.resolve('data/uploads/templates/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const extracted = await extractDocument({ buffer: pdfBuffer, fileName: path.basename(pdfPath), mimeType: 'application/pdf' });
  const sourceDoc: UploadedSourceDocument = {
    id: 'source-pdf-real-800-2024',
    filename: path.basename(pdfPath),
    extractedText: extracted.text || '',
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({ page: p.page || i + 1, text: p.text || '', chars: p.chars || p.text?.length || 0 })),
  };
  const ca = reconstructCaseAnalysis([sourceDoc], 'Interponer recurso de revisión amparo directo');

  // Let's create a dummy doc with expansion blocks
  const mockBlock: ContentBlock = {
    id: 'blk-extended-expansion-sec-5-1',
    text: 'Argumentación sustantiva extensa de prueba '.repeat(300),
    layer: 'GENERATED_ARGUMENT',
    trustLevel: 'AI_INFERENCE',
    provenance: 'AI_GENERATED',
    generationStatus: 'generated',
    generationRequirement: 'AI_REQUIRED',
    isManuallyEdited: false,
    generatedBy: 'AI',
    provider: 'gemini',
    model: 'gemini-flash-lite-latest',
    generationId: 'gen-1',
    generationTaskId: 'extended-expansion-sec-5-1',
    generationTaskType: 'EXTENSION',
    issueDraftValidationStatus: 'VALID_NON_FINAL',
    revisionNumber: 0,
    fallbackReason: null,
    genericityClass: 'SPECIFIC',
  };

  console.log('Mock block word count:', mockBlock.text.split(/\s+/).length);
}

main().catch(console.error);
