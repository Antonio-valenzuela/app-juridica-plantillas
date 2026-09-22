import fs from 'node:fs';
import path from 'node:path';
import { extractDocument } from '../lib/pdf/documentExtractor';
import { reconstructCaseAnalysis } from '../lib/legal-engine/caseAnalysis';
import { runGenerationPipeline } from '../lib/legal-engine/pipeline';
import { createDefaultResearchProviderRouter } from '../lib/legal-engine/legal-research/researchProviderRouter';
import { measureRenderedDocumentPages } from '../lib/legal-engine/documentPageMetrics';
import { sanitizeLegalDocument } from '../lib/legal-engine/legalDocumentSanitizer';

async function main() {
  const pdfPath = path.resolve('data/uploads/templates/1787377633126-Recurso_Revision_Amparo_Directo_800-2024_Version_Ampliada__1_.pdf');
  const pdfBuffer = fs.readFileSync(pdfPath);
  const extracted = await extractDocument({ buffer: pdfBuffer, fileName: path.basename(pdfPath), mimeType: 'application/pdf' });
  const sourceDoc = {
    id: 'source-pdf-real-800-2024',
    filename: path.basename(pdfPath),
    extractedText: extracted.text || '',
    sourceValidated: true,
    pages: (extracted.pages || []).map((p, i) => ({ page: p.page || i + 1, text: p.text || '', chars: p.chars || p.text?.length || 0 })),
  };

  const provider = createDefaultResearchProviderRouter();
  const doc = await runGenerationPipeline({
    sourceDocuments: [sourceDoc],
    userInstruction: 'Interponer recurso de revisión amparo directo 800/2024',
    legalResearchProvider: provider,
    expediente: '800/2024',
    generationExtension: {
      generationMode: 'extended',
      targetPages: 40,
      minPages: 36,
      maxPages: 44,
      targetWords: 16000,
      maxCallsPerDocument: 48,
      maxContinuationsPerSection: 6,
      maxExpansionPasses: 5,
      maxGeneratedTokens: 7000,
    },
  });

  const m1 = await measureRenderedDocumentPages(doc);
  const clean = sanitizeLegalDocument(doc, { dedupeBlocks: false }).document;
  const m2 = await measureRenderedDocumentPages(clean);

  console.log('MEASUREMENT COMPARISON:');
  console.log('m1 (direct doc):', m1);
  console.log('m2 (clean doc):', m2);
}

main().catch(console.error);
