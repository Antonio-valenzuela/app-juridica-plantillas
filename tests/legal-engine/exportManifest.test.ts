import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@/lib/legal-engine/types';
import { DEFAULT_LAWYER_PROFILE } from '@/lib/workspace/lawyerProfileTypes';
import { createGenerationTraceContext } from '@/lib/legal-engine/generationTrace';
import { resolveDocxPageProfile, resolvePdfPageProfile } from '@/lib/legal-engine/exportPageProfiles';
import { renderDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { renderPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type {
  ExportRenderModel,
  RenderParagraph,
} from '@/lib/legal-engine/finalDocumentMaterializationTypes';

function paragraph(id: string, text: string): RenderParagraph {
  return {
    id,
    text,
    runs: [{ text }],
    role: 'BODY',
    style: {},
    orderPath: [1, Number(id.replace(/\D/g, '') || 1)],
    keepNext: false,
    keepTogether: false,
    pageBreakBefore: false,
    provenance: {
      documentId: 'manifest-document',
      verificationMode: 'RICH_ASSEMBLY',
      sectionId: id === 'block-3' ? 'section-2' : 'section-1',
      blockId: id,
      coverageItemIds: [`coverage-${id}`],
      legalIssueIds: [`issue-${id}`],
      sourceDocumentIds: [],
      sourceRefs: [],
      manualEdit: id === 'block-2',
    },
  };
}

function model(): ExportRenderModel {
  return {
    schemaVersion: 'fase7-v1',
    documentId: 'manifest-document',
    documentType: 'escrito_libre',
    title: 'Manifest document',
    header: [],
    sections: [
      {
        id: 'section-1',
        title: 'SECTION ONE',
        type: 'facts',
        depth: 0,
        orderPath: [1],
        paragraphs: [
          paragraph('block-1', 'Primer contenido materializado.'),
          paragraph('block-2', 'Contenido manual materializado.'),
        ],
      },
      {
        id: 'section-2',
        title: 'SECTION TWO',
        type: 'argument',
        depth: 0,
        orderPath: [2],
        paragraphs: [paragraph('block-3', 'Segundo contenido materializado.')],
      },
    ],
    footer: [],
    documentFingerprint: 'document-fingerprint-manifest',
    materializationFingerprint: 'materialization-fingerprint-manifest',
  };
}

function docxOptions() {
  return {
    format: 'docx' as const,
    pageProfile: resolveDocxPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

function pdfOptions(profile = resolvePdfPageProfile()) {
  return {
    format: 'pdf' as const,
    pageProfile: profile,
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  };
}

describe('FASE 7 Task 6 — export manifest and fingerprints', () => {
  it('records model and export manifest fingerprints and counts', async () => {
    const sharedModel = model();
    const first = await renderDocx(sharedModel, docxOptions());
    const second = await renderDocx(sharedModel, docxOptions());

    expect(first.manifest).toMatchObject({
      schemaVersion: 'fase7-v1',
      format: 'docx',
      documentFingerprint: sharedModel.documentFingerprint,
      materializationFingerprint: sharedModel.materializationFingerprint,
      pageProfileId: resolveDocxPageProfile().id,
      sectionCount: 2,
      paragraphCount: 3,
      omittedParagraphCount: 0,
      renderedBlockIds: ['block-1', 'block-2', 'block-3'],
      omittedBlockIds: [],
      traceStatus: 'NOT_AVAILABLE',
    });
    expect(first.manifest).toEqual(second.manifest);

    const context = createGenerationTraceContext({
      generationId: 'manifest-trace',
      doc: createEmptyDocument({ id: 'manifest-trace-document' }),
      options: { enabled: true, now: () => new Date(0) },
    });
    context.recordExportManifest(first.manifest);
    expect(context.trace.exportManifest).toMatchObject({
      ...first.manifest,
      traceStatus: 'RECORDED',
    });
  });

  it('does not place binary bytes or base64 payloads in trace', async () => {
    const artifact = await renderPdf(model(), pdfOptions());
    const context = createGenerationTraceContext({
      generationId: 'manifest-binary-trace',
      doc: createEmptyDocument({ id: 'manifest-binary-document' }),
      options: { enabled: true, now: () => new Date(0) },
    });
    context.recordExportManifest(artifact.manifest);

    const binaryValues: unknown[] = [];
    const visit = (value: unknown): void => {
      if (value instanceof Uint8Array) binaryValues.push(value);
      if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(visit);
      }
    };
    visit(context.trace);

    expect(binaryValues).toEqual([]);
    expect(context.trace.exportManifest).not.toHaveProperty('bytes');
    expect(JSON.stringify(context.trace)).not.toContain(Buffer.from(artifact.bytes).toString('base64'));
    expect(JSON.stringify(context.trace)).not.toContain('word/document.xml');
  });

  it('separates renderer-independent materialization and renderer-specific export fingerprints', async () => {
    const sharedModel = model();
    const docx = await renderDocx(sharedModel, docxOptions());
    const docxAgain = await renderDocx(sharedModel, docxOptions());
    const pdf = await renderPdf(sharedModel, pdfOptions());
    const alternatePdfProfile = resolvePdfPageProfile({
      serverOption: {
        id: 'pdf-letter-alternate',
        unit: 'pt',
        width: 600,
        height: 800,
        margins: { top: 60, right: 60, bottom: 60, left: 60 },
      },
    });
    const alternatePdf = await renderPdf(sharedModel, pdfOptions(alternatePdfProfile));

    expect(docx.manifest.materializationFingerprint).toBe(sharedModel.materializationFingerprint);
    expect(pdf.manifest.materializationFingerprint).toBe(sharedModel.materializationFingerprint);
    expect(alternatePdf.manifest.materializationFingerprint).toBe(sharedModel.materializationFingerprint);
    expect(docx.manifest.exportFingerprint).not.toBe(pdf.manifest.exportFingerprint);
    expect(docx.manifest.exportFingerprint).toBe(docxAgain.manifest.exportFingerprint);
    expect(pdf.manifest.exportFingerprint).not.toBe(alternatePdf.manifest.exportFingerprint);
  });
});
