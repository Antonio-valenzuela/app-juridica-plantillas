import { stableResearchId } from './legal-research/canonical';
import type { DocxPageProfile, PdfPageProfile } from './exportPageProfiles';
import type { ExportRenderModel, RenderParagraph } from './finalDocumentMaterializationTypes';

export type ExportFormat = 'docx' | 'pdf';
export type ExportPageProfile = DocxPageProfile | PdfPageProfile;
export type ExportTraceStatus = 'RECORDED' | 'NOT_AVAILABLE';

export interface ExportManifest {
  schemaVersion: 'fase7-v1';
  format: ExportFormat;
  documentFingerprint: string;
  materializationFingerprint: string;
  exportFingerprint: string;
  pageProfileId: string;
  sectionCount: number;
  paragraphCount: number;
  omittedParagraphCount: number;
  renderedBlockIds: readonly string[];
  omittedBlockIds: readonly string[];
  traceStatus: ExportTraceStatus;
}

export interface ExportArtifact {
  format: ExportFormat;
  mediaType: string;
  fileName: string;
  bytes: Uint8Array;
  manifest: ExportManifest;
}

export interface ExportManifestInput {
  model: ExportRenderModel;
  format: ExportFormat;
  pageProfile: ExportPageProfile;
  traceStatus?: ExportTraceStatus;
}

const EXPORT_RENDERER_VERSION = 'fase7-export-v1';

function modelParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return [
    ...model.header,
    ...model.sections.flatMap((section) => section.paragraphs),
    ...model.footer,
  ];
}

function blockId(paragraph: RenderParagraph): string {
  return paragraph.provenance.blockId || paragraph.id;
}

function isOmitted(paragraph: RenderParagraph): boolean {
  return paragraph.text.trim().length === 0;
}

export function createExportFingerprint(input: Pick<ExportManifestInput, 'model' | 'format' | 'pageProfile'>): string {
  return stableResearchId('export', {
    rendererVersion: EXPORT_RENDERER_VERSION,
    schemaVersion: input.model.schemaVersion,
    materializationFingerprint: input.model.materializationFingerprint,
    format: input.format,
    pageProfile: {
      id: input.pageProfile.id,
      unit: input.pageProfile.unit,
      width: input.pageProfile.width,
      height: input.pageProfile.height,
      margins: { ...input.pageProfile.margins },
      source: input.pageProfile.source,
    },
  });
}

export function createExportManifest(input: ExportManifestInput): ExportManifest {
  const paragraphs = modelParagraphs(input.model);
  const omitted = paragraphs.filter(isOmitted);
  const rendered = paragraphs.filter((paragraph) => !isOmitted(paragraph));
  return {
    schemaVersion: 'fase7-v1',
    format: input.format,
    documentFingerprint: input.model.documentFingerprint,
    materializationFingerprint: input.model.materializationFingerprint,
    exportFingerprint: createExportFingerprint(input),
    pageProfileId: input.pageProfile.id,
    sectionCount: input.model.sections.length,
    paragraphCount: paragraphs.length,
    omittedParagraphCount: omitted.length,
    renderedBlockIds: rendered.map(blockId),
    omittedBlockIds: omitted.map(blockId),
    traceStatus: input.traceStatus || 'NOT_AVAILABLE',
  };
}

export function markExportManifestRecorded(manifest: ExportManifest): ExportManifest {
  return {
    ...manifest,
    renderedBlockIds: [...manifest.renderedBlockIds],
    omittedBlockIds: [...manifest.omittedBlockIds],
    traceStatus: 'RECORDED',
  };
}
