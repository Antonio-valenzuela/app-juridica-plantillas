import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { SourceDocumentIncompatibleError } from '@/lib/legal-engine/sourceOutputCompatibility';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';

const REAL_PUBLIC_PDF = path.resolve(
  process.cwd(),
  'data/uploads/templates/1787377598439-0129000036717288006AST.PDF',
);

describe('E2E Real PDF — Source compatibility for Recurso de Revisión', () => {
  it('blocks the real 27-page demanda before drafting a recurso de revisión', async () => {
    expect(fs.existsSync(REAL_PUBLIC_PDF)).toBe(true);

    const buffer = fs.readFileSync(REAL_PUBLIC_PDF);
    const extraction = await extractPdfTextServer(buffer);
    expect(extraction.pages.length).toBeGreaterThanOrEqual(25);

    const source = createSourceDocument({
      id: 'real-sanitized-amparo-sentence',
      filename: '1787377598439-0129000036717288006AST.PDF',
      type: 'application/pdf',
      pages: extraction.pages.map((p) => ({
        page: p.pageNumber,
        text: p.text,
        chars: p.text.length,
      })),
      sourceValidated: true,
      fileSizeBytes: buffer.byteLength,
    });

    await expect(runGenerationPipeline({
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'laboral',
      jurisdiction: 'federal',
      userInstruction: 'Interponer recurso de revisión en amparo directo fundado en omisión de análisis de convencionalidad y constitucionalidad.',
      sourceDocuments: [source],
      generationId: 'real-pdf-e2e-gate-check',
      traceOptions: { enabled: true },
    })).rejects.toBeInstanceOf(SourceDocumentIncompatibleError);
  }, 90000);
});
