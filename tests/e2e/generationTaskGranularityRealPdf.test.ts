import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { runGenerationPipeline, type PipelineInput } from '@/lib/legal-engine/pipeline';

const REAL_PDF = 'data/uploads/templates/1787377598439-0129000036717288006AST.PDF';

describe('E2E real PDF: source compatibility gate', () => {
  it('blocks a demanda de amparo from reaching a recurso de revisión provider', async () => {
    const extraction = await extractPdfTextServer(readFileSync(REAL_PDF));
    const source = createSourceDocument({
      id: 'real-pdf-e2e-source',
      filename: REAL_PDF.split('/').pop() || REAL_PDF,
      type: 'pdf',
      pages: extraction.pages.map((page) => ({
        page: page.pageNumber,
        text: page.text,
        chars: page.text.length,
      })),
      sourceValidated: true,
    });
    const provider = vi.fn();

    await expect(runGenerationPipeline({
      userInstruction: 'Preparar el recurso de revisión en amparo directo únicamente con la fuente real.',
      sourceDocuments: [source],
      selectedDocumentType: 'recurso_revision_amparo_directo',
      documentTypeLabel: 'Recurso de revisión en amparo directo',
      matter: 'constitucional',
      jurisdiction: 'federal',
      traceOptions: { enabled: true },
      issueProviderInvoker: provider as PipelineInput['issueProviderInvoker'],
    })).rejects.toThrow(/SOURCE_DOCUMENT_INCOMPATIBLE[\s\S]*DEMANDA_AMPARO_DIRECTO[\s\S]*SENTENCIA_AMPARO_DIRECTO/);
    expect(provider).not.toHaveBeenCalled();
  }, 120000);
});
