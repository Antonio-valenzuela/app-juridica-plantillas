import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { resolveDocxPageProfile, resolvePdfPageProfile } from '@/lib/legal-engine/exportPageProfiles';
import { renderDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { PdfExportError, renderPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type {
  ExportRenderModel,
  RenderParagraph,
} from '@/lib/legal-engine/finalDocumentMaterializationTypes';
import {
  extractWordDocumentParagraphs,
  normalizeDocxText,
  readDocxPackage,
} from '../helpers/docxPackageReader';

function paragraph(
  id: string,
  text: string,
  role: RenderParagraph['role'] = 'BODY',
  manualEdit = false,
): RenderParagraph {
  return {
    id,
    text,
    runs: [{ text }],
    role,
    style: {},
    orderPath: [1],
    keepNext: false,
    keepTogether: false,
    pageBreakBefore: false,
    provenance: {
      documentId: 'doc-parity-task5',
      verificationMode: 'RICH_ASSEMBLY',
      sectionId: 'section-parent',
      blockId: id,
      coverageItemIds: [`coverage-${id}`],
      legalIssueIds: [`issue-${id}`],
      sourceDocumentIds: [`source-${id}`],
      sourceRefs: [`source-${id}|1||${text}`],
      manualEdit,
    },
  };
}

function semanticModel(): ExportRenderModel {
  const repeated = 'Misma redacción legítima con identidad distinta.';
  return {
    schemaVersion: 'fase7-v1',
    documentId: 'doc-parity-task5',
    documentType: 'escrito_libre',
    title: 'Título no agregado por los renderers',
    header: [],
    sections: [
      {
        id: 'section-parent',
        title: 'Título padre no re-renderizado',
        type: 'argument',
        depth: 0,
        orderPath: [1],
        paragraphs: [
          paragraph('block-title', 'HECHOS', 'TITLE'),
          paragraph('block-parent', 'Texto padre con áéíóú, ñ, ü y signos jurídicos.'),
        ],
      },
      {
        id: 'section-child',
        parentId: 'section-parent',
        title: 'Título hijo no re-renderizado',
        type: 'argument',
        depth: 1,
        orderPath: [1, 1],
        paragraphs: [
          paragraph('block-child', 'Contenido anidado preservado.'),
          paragraph('block-repeat-a', repeated),
          paragraph('block-repeat-b', repeated),
          paragraph('block-manual', 'Texto manual preservado exactamente.', 'BODY', true),
        ],
      },
    ],
    footer: [],
    documentFingerprint: 'document-fingerprint-task5',
    materializationFingerprint: 'materialization-fingerprint-task5',
  };
}

function docxOptions() {
  return {
    format: 'docx' as const,
    pageProfile: resolveDocxPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

function pdfOptions() {
  return {
    format: 'pdf' as const,
    pageProfile: resolvePdfPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfModule = eval('require')('pdf-parse');
  const PDFParse = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse);
  const parsed = await new PDFParse({ data: new Uint8Array(bytes) }).getText();
  return (parsed.pages || []).map((page: { text?: string }) => page.text || '').join('\n');
}

function normalizePdfSemanticText(text: string): string {
  return text
    .replace(/Página\s+\d+\s+de\s+\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function modelBodyText(model: ExportRenderModel): string {
  return model.sections
    .flatMap((section) => section.paragraphs)
    .map((entry) => entry.text)
    .join('\n');
}

describe('FASE 7 Task 5 — DOCX/PDF semantic parity', () => {
  it('preserves intentional newline characters as Word line-break elements', async () => {
    const baseModel = semanticModel();
    const model: ExportRenderModel = {
      ...baseModel,
      sections: baseModel.sections.map((section, index) => index === 0
        ? { ...section, paragraphs: [...section.paragraphs, paragraph('block-lines', 'PRIMERO. Línea uno.\nSEGUNDO. Línea dos.')] }
        : section),
    };

    const artifact = await renderDocx(model, docxOptions());
    const docxPackage = await readDocxPackage(artifact.bytes);
    const documentXml = await docxPackage.readText('word/document.xml');

    expect(documentXml.match(/<w:br(?:\s[^>]*)?\s*\/>/g) || []).toHaveLength(1);
  });

  it('keeps manually broken paragraphs left aligned in DOCX and PDF', async () => {
    const baseModel = semanticModel();
    const multiline = paragraph(
      'block-manual-lines',
      'PRIMERO. La parte actora afirma que la relación inició en la fecha descrita, extremo que requiere una postura expresa del abogado antes de incorporarse como hecho admitido.\nSEGUNDO. La respuesta a este punto queda pendiente.',
    );
    const model: ExportRenderModel = {
      ...baseModel,
      sections: [{
        ...baseModel.sections[0]!,
        paragraphs: [multiline],
      }],
    };

    const [docxArtifact, pdfArtifact] = await Promise.all([
      renderDocx(model, docxOptions()),
      renderPdf(model, pdfOptions()),
    ]);
    const docxPackage = await readDocxPackage(docxArtifact.bytes);
    const documentXml = await docxPackage.readText('word/document.xml');
    const multilineParagraph = Array.from(documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g))
      .find(([xml]) => xml?.includes('PRIMERO.'))?.[0];
    const pdfContent = Buffer.from(pdfArtifact.bytes).toString('latin1');

    expect(multilineParagraph).toBeDefined();
    expect(multilineParagraph).toContain('<w:jc w:val="left"/>');
    expect(pdfContent).not.toMatch(/\sTw\b/);
  });

  it('omits semantic section headings when their section has no rendered content', async () => {
    const baseModel = semanticModel();
    const emptySection: ExportRenderModel = {
      ...baseModel,
      sections: [{
        ...baseModel.sections[0]!,
        id: 'empty-section',
        title: 'SECCIÓN SIN DESARROLLO',
        paragraphs: [],
      }],
    };
    const [docxArtifact, pdfArtifact] = await Promise.all([
      renderDocx(emptySection, docxOptions()),
      renderPdf(emptySection, pdfOptions()),
    ]);
    const docxPackage = await readDocxPackage(docxArtifact.bytes);
    const docxText = extractWordDocumentParagraphs(await docxPackage.readText('word/document.xml')).join('\n');
    const pdfText = await extractPdfText(pdfArtifact.bytes);

    expect(docxText).not.toContain('SECCIÓN SIN DESARROLLO');
    expect(pdfText).not.toContain('SECCIÓN SIN DESARROLLO');
  });

  it('DOCX and PDF consume the same ordered semantic model', async () => {
    const sharedModel = semanticModel();
    const before = structuredClone(sharedModel);
    const [docxArtifact, pdfArtifact] = await Promise.all([
      renderDocx(sharedModel, docxOptions()),
      renderPdf(sharedModel, pdfOptions()),
    ]);

    expect(sharedModel).toEqual(before);
    expect(docxArtifact.format).toBe('docx');
    expect(pdfArtifact.format).toBe('pdf');
    expect(modelBodyText(sharedModel)).toBe([
      'HECHOS',
      'Texto padre con áéíóú, ñ, ü y signos jurídicos.',
      'Contenido anidado preservado.',
      'Misma redacción legítima con identidad distinta.',
      'Misma redacción legítima con identidad distinta.',
      'Texto manual preservado exactamente.',
    ].join('\n'));
    expect(sharedModel.sections.flatMap((section) => section.paragraphs).map((entry) => ({
      id: entry.id,
      provenance: entry.provenance,
    }))).toHaveLength(6);

    const pdfSource = readFileSync('lib/legal-engine/exportPdfUniversal.ts', 'utf8');
    expect(pdfSource).toContain('ExportRenderModel');
    expect(pdfSource).not.toMatch(/materializeFor(?:Docx|Pdf)/);
  });

  it('keeps PDF semantic text, order and provenance parity with DOCX', async () => {
    const sharedModel = semanticModel();
    const [docxArtifact, pdfArtifact] = await Promise.all([
      renderDocx(sharedModel, docxOptions()),
      renderPdf(sharedModel, pdfOptions()),
    ]);
    const docxPackage = await readDocxPackage(docxArtifact.bytes);
    const docxText = extractWordDocumentParagraphs(await docxPackage.readText('word/document.xml')).join('\n');
    const pdfText = await extractPdfText(pdfArtifact.bytes);

    expect(normalizeDocxText(docxText).replace(/\s+/g, ' ').trim())
      .toBe(normalizePdfSemanticText(pdfText));
    expect(sharedModel.sections.map((section) => section.id)).toEqual(['section-parent', 'section-child']);
    expect(sharedModel.sections.flatMap((section) => section.paragraphs.map((entry) => entry.id))).toEqual([
      'block-title',
      'block-parent',
      'block-child',
      'block-repeat-a',
      'block-repeat-b',
      'block-manual',
    ]);
    expect(sharedModel.sections.flatMap((section) => section.paragraphs).map((entry) => entry.provenance.blockId))
      .toEqual(['block-title', 'block-parent', 'block-child', 'block-repeat-a', 'block-repeat-b', 'block-manual']);
    expect(sharedModel.sections.flatMap((section) => section.paragraphs).filter((entry) => entry.text === 'Misma redacción legítima con identidad distinta.')).toHaveLength(2);
    expect(sharedModel.sections[1]?.paragraphs[3]?.provenance.manualEdit).toBe(true);
  });

  it('does not fall back to HTML Chromium or legacy when PDF rendering fails', async () => {
    const sourceModel = semanticModel();
    const invalidModel: ExportRenderModel = {
      ...sourceModel,
      sections: sourceModel.sections.map((section, sectionIndex) => sectionIndex === 0
        ? {
          ...section,
          paragraphs: section.paragraphs.map((entry, paragraphIndex) => paragraphIndex === 0
            ? { ...entry, role: 'UNSUPPORTED' as RenderParagraph['role'] }
            : entry),
        }
        : section),
    };

    await expect(renderPdf(invalidModel, pdfOptions())).rejects.toMatchObject({
      name: 'PdfExportError',
      code: 'PDF_EXPORT_FAILED',
    });
    expect(PdfExportError).toBeDefined();

    const pdfSource = readFileSync('lib/legal-engine/exportPdfUniversal.ts', 'utf8');
    expect(pdfSource).not.toMatch(/generatePrintHtml|Chromium|RenderedDocument|exportToDocx|external converter/i);
  });
});
