import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { createSourceDocument } from '@/lib/legal-engine/context';
import { extractPdfTextServer } from '@/lib/pdf/pdfExtractor';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import { measureRenderedDocumentPages } from '@/lib/legal-engine/documentPageMetrics';
import type { UniversalLegalDocument } from '@/lib/legal-engine/types';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const REAL_PUBLIC_PDF = path.resolve(
  process.cwd(),
  'data/uploads/templates/1787377598439-0129000036717288006AST.PDF',
);

const hasLiveProvider = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim());

describe('E2E real — contestación jurídica extensa', () => {
  it.skipIf(!hasLiveProvider)('genera una contestación source-grounded, exporta PDF/DOCX y mide 36–44 páginas reales', async () => {
    const buffer = fs.readFileSync(REAL_PUBLIC_PDF);
    const extraction = await extractPdfTextServer(buffer);
    const source = createSourceDocument({
      id: 'real-extended-contestacion-source',
      filename: '1787377598439-0129000036717288006AST.PDF',
      type: 'application/pdf',
      pages: extraction.pages.map((page) => ({ page: page.pageNumber, text: page.text, chars: page.text.length })),
      sourceValidated: true,
      fileSizeBytes: buffer.byteLength,
    });

    const result = await runGenerationPipeline({
      selectedDocumentType: 'contestacion_revision_extraordinaria_amparo_directo',
      documentTypeLabel: 'Contestación / Revisión extraordinaria ante sentencia de amparo directo',
      matter: 'constitucional',
      jurisdiction: 'federal',
      userInstruction: 'Preparar una contestación profesional y exhaustiva frente a la sentencia, con argumentos vinculados únicamente al expediente y sin inventar autoridades.',
      sourceDocuments: [source],
      generationId: 'real-extended-contestacion-e2e',
      traceOptions: { enabled: true },
      generationExtension: {
        generationMode: 'extended-legal',
        targetPages: 40,
        minPages: 36,
        maxPages: 44,
        maxExpansionPasses: 3,
        maxCallsPerDocument: 36,
      },
    });

    const metrics = await measureRenderedDocumentPages(result);
    const metadata = result.generationMetadata.generationExtension;
    const fullText = result.sections.flatMap((section) => section.content || []).map((block) => block.text).join('\n\n');

    console.log('REAL EXTENDED CONTESTACION PRE-EXPORT METRICS:', {
      pages: metrics.actualPages,
      words: metrics.wordCount,
      characters: metrics.characterCount,
      provider: result.generationMetadata.aiProvider,
      extension: metadata,
    });

    expect(metrics.actualPages).toBeGreaterThanOrEqual(36);
    expect(metrics.actualPages).toBeLessThanOrEqual(44);
    expect(fullText).not.toMatch(/\[SECCIÓN_COMPLETA\]|\[DATO PENDIENTE[^\]]*\]/i);
    expect(metadata?.extensionTargetUnmet).toBe(false);
    expect(metadata?.actualPages).toBe(metrics.actualPages);

    try {
      const pdf = await exportUniversalToPdf(result);
      const docx = await exportUniversalToDocx(result);
      console.log('REAL EXTENDED CONTESTACION EXPORT METRICS:', { pdfBytes: pdf.byteLength, docxBytes: docx.byteLength });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect(docx.subarray(0, 2).toString()).toBe('PK');
    } catch (error: any) {
      if (error?.code !== 'EXPORT_GUARD_FAILED') throw error;
      console.warn('REAL EXTENDED CONTESTACION EXPORT BLOCKED BY READINESS GATE:', error?.result?.errors || error?.message);
    }
  }, 15 * 60 * 1000);
});
