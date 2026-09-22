import 'server-only';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from 'docx';
import type { GenerationTrace } from './generationTrace';
import { hashTraceText } from './generationTrace';
import { prepareUniversalDocumentForExport, validateForExport } from './exportGuards';
import {
  verifyCompatibilityMaterialization,
  verifyFinalDocumentExportability,
} from './finalDocumentMaterializationGate';
import { materializePreparedFinalDocument } from './finalDocumentMaterialization';
import type { UniversalLegalDocument } from './types';
import type { LawyerProfile } from '../workspace/lawyerProfileTypes';
import { DEFAULT_LAWYER_PROFILE } from '../workspace/lawyerProfileTypes';
import { resolveDocxPageProfile, type DocxPageProfile } from './exportPageProfiles';
import {
  createExportManifest,
  markExportManifestRecorded,
} from './exportArtifactTypes';
import type { ExportArtifact } from './exportArtifactTypes';
import type {
  ExportRenderModel,
  RenderParagraph,
  RenderRun,
  VerifiedMaterializationInput,
} from './finalDocumentMaterializationTypes';

export type { ExportArtifact } from './exportArtifactTypes';

export interface DocxRenderOptions {
  format: 'docx';
  pageProfile: DocxPageProfile;
  lawyerProfile: LawyerProfile;
}

export class DocxRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxRenderError';
  }
}

export class DocxSerializationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DocxSerializationError';
  }
}

const MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
const SUPPORTED_ROLES: ReadonlySet<RenderParagraph['role']> = new Set([
  'TITLE',
  'BODY',
  'LIST',
  'SIGNATURE',
  'HEADER',
  'FOOTER',
  'SPACER',
]);

function mapAlignment(alignment: RenderParagraph['style']['textAlign'], role: RenderParagraph['role']): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (alignment) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'left': return AlignmentType.LEFT;
    case 'justify': return AlignmentType.JUSTIFIED;
    default:
      if (role === 'TITLE') return AlignmentType.CENTER;
      if (role === 'HEADER') return AlignmentType.RIGHT;
      if (role === 'FOOTER') return AlignmentType.CENTER;
      return AlignmentType.JUSTIFIED;
  }
}

function safeFontFamily(fontFamily: unknown): string {
  if (typeof fontFamily !== 'string' || fontFamily.trim().length === 0 || fontFamily.length > 100) return 'Arial';
  return fontFamily;
}

function fontSizeInHalfPoints(fontSize: unknown, role: RenderParagraph['role']): number {
  const fallback = role === 'TITLE' ? 22 : 20;
  if (typeof fontSize !== 'string') return fallback;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:pt)?\s*$/i.exec(fontSize);
  if (!match) return fallback;
  const points = Number(match[1]);
  return Number.isFinite(points) && points > 0 && points <= 200 ? Math.round(points * 2) : fallback;
}

function lineSpacing(lineHeight: unknown): number {
  if (typeof lineHeight !== 'string') return 276;
  const value = Number.parseFloat(lineHeight);
  return Number.isFinite(value) && value >= 1 && value <= 4 ? Math.round(value * 240) : 276;
}

function sanitizeXmlText(text: string): string {
  let output = '';
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new DocxSerializationError('DOCX serialization cannot represent a lone high surrogate.');
      }
      output += text[index] + text[index + 1];
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new DocxSerializationError('DOCX serialization cannot represent a lone low surrogate.');
    }

    // XML 1.0 permits tab, LF and CR. Other C0 controls are technical noise
    // and are removed without touching substantive Unicode text.
    if ((code >= 0x00 && code <= 0x08) || (code >= 0x0b && code <= 0x0c) || (code >= 0x0e && code <= 0x1f)) {
      continue;
    }
    if (code === 0xfffe || code === 0xffff) continue;
    output += text[index];
  }
  return output;
}

function assertPageProfile(profile: DocxPageProfile): void {
  if (!profile || profile.unit !== 'twip') {
    throw new DocxRenderError('DOCX requiere un DocxPageProfile resuelto en twips.');
  }
  if (!Number.isFinite(profile.width) || !Number.isFinite(profile.height) || profile.width <= 0 || profile.height <= 0) {
    throw new DocxRenderError('DOCX requiere dimensiones de página finitas y positivas.');
  }
  const margins = profile.margins;
  if (!margins || ![margins.top, margins.right, margins.bottom, margins.left].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new DocxRenderError('DOCX requiere márgenes finitos y no negativos.');
  }
  if (margins.left + margins.right >= profile.width || margins.top + margins.bottom >= profile.height) {
    throw new DocxRenderError('DOCX requiere un área útil positiva.');
  }
}

function assertModel(model: ExportRenderModel): void {
  if (!model || model.schemaVersion !== 'fase7-v1' || typeof model.documentId !== 'string') {
    throw new DocxRenderError('ExportRenderModel inválido para DOCX.');
  }
  if (!Array.isArray(model.header) || !Array.isArray(model.sections) || !Array.isArray(model.footer)) {
    throw new DocxRenderError('ExportRenderModel requiere header, sections y footer como arreglos.');
  }
}

function runsForParagraph(paragraph: RenderParagraph): readonly RenderRun[] {
  if (!Array.isArray(paragraph.runs)) {
    throw new DocxRenderError(`El párrafo ${paragraph.id} no contiene runs válidos.`);
  }
  if (typeof paragraph.text !== 'string') {
    throw new DocxRenderError(`El párrafo ${paragraph.id} no contiene texto válido.`);
  }

  const normalizedText = sanitizeXmlText(paragraph.text);
  const normalizedRuns = paragraph.runs.map((run) => {
    if (!run || typeof run.text !== 'string') {
      throw new DocxRenderError(`El párrafo ${paragraph.id} contiene un run inválido.`);
    }
    return { ...run, text: sanitizeXmlText(run.text) };
  });
  const runText = normalizedRuns.map((run) => run.text).join('');
  if (normalizedText !== runText) {
    throw new DocxRenderError(`El párrafo ${paragraph.id} no coincide con la concatenación de sus runs.`);
  }
  return normalizedRuns;
}

function renderParagraph(paragraph: RenderParagraph, placement: 'BODY' | 'HEADER' | 'FOOTER'): Paragraph {
  if (!SUPPORTED_ROLES.has(paragraph.role)) {
    throw new DocxRenderError(`Rol DOCX no soportado: ${String(paragraph.role)}.`);
  }
  if (placement === 'HEADER' && paragraph.role !== 'HEADER') {
    throw new DocxRenderError(`El párrafo ${paragraph.id} no puede entrar al header con rol ${paragraph.role}.`);
  }
  if (placement === 'FOOTER' && paragraph.role !== 'FOOTER') {
    throw new DocxRenderError(`El párrafo ${paragraph.id} no puede entrar al footer con rol ${paragraph.role}.`);
  }

  const runs = runsForParagraph(paragraph);
  const style = paragraph.style || {};
  const children = paragraph.role === 'SPACER'
    ? []
    : runs.map((run) => new TextRun({
      text: run.text,
      font: safeFontFamily(style.fontFamily),
      size: fontSizeInHalfPoints(style.fontSize, paragraph.role),
      bold: run.bold === true,
      italics: run.italic === true,
      underline: run.underline === true ? { type: UnderlineType.SINGLE } : undefined,
    }));

  return new Paragraph({
    children,
    includeIfEmpty: true,
    heading: paragraph.role === 'TITLE' ? HeadingLevel.HEADING_2 : undefined,
    alignment: mapAlignment(style.textAlign, paragraph.role),
    spacing: { after: paragraph.role === 'SPACER' ? 80 : 120, line: lineSpacing(style.lineHeight) },
    keepNext: paragraph.keepNext,
    keepLines: paragraph.keepTogether,
    pageBreakBefore: paragraph.pageBreakBefore,
    indent: paragraph.role === 'LIST' ? { left: 360, hanging: 260 } : undefined,
  });
}

function renderParagraphs(paragraphs: readonly RenderParagraph[], placement: 'BODY' | 'HEADER' | 'FOOTER'): Paragraph[] {
  return paragraphs.map((paragraph) => renderParagraph(paragraph, placement));
}

function modelBodyParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return model.sections.flatMap((section) => section.paragraphs);
}

function buildDocx(model: ExportRenderModel, options: DocxRenderOptions): Document {
  const body = renderParagraphs(modelBodyParagraphs(model), 'BODY');
  const header = renderParagraphs(model.header, 'HEADER');
  const footer = renderParagraphs(model.footer, 'FOOTER');

  return new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width: options.pageProfile.width,
            height: options.pageProfile.height,
          },
          margin: options.pageProfile.margins,
        },
      },
      headers: { default: new Header({ children: header }) },
      footers: { default: new Footer({ children: footer }) },
      children: body.length > 0 ? body : [new Paragraph({ children: [], includeIfEmpty: true })],
    }],
  });
}

export async function renderDocx(
  model: ExportRenderModel,
  options: DocxRenderOptions,
): Promise<ExportArtifact> {
  assertModel(model);
  if (!options || options.format !== 'docx') {
    throw new DocxRenderError('DOCX requiere opciones de renderer con format="docx".');
  }
  assertPageProfile(options.pageProfile);
  if (!options.lawyerProfile || typeof options.lawyerProfile !== 'object') {
    throw new DocxRenderError('DOCX requiere un LawyerProfile de presentación resuelto.');
  }

  try {
    const docx = buildDocx(model, options);
    const buffer = await Packer.toBuffer(docx);
    if (!buffer || buffer.length < 500 || buffer.subarray(0, 2).toString() !== 'PK') {
      throw new Error('DOCX serializer returned an invalid package.');
    }
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    return {
      format: 'docx',
      mediaType: MEDIA_TYPE,
      fileName: 'document.docx',
      bytes,
      manifest: createExportManifest({
        model,
        format: 'docx',
        pageProfile: options.pageProfile,
        traceStatus: 'NOT_AVAILABLE',
      }),
    };
  } catch (error) {
    if (error instanceof DocxSerializationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new DocxSerializationError(`DOCX serialization failed: ${message}`, error);
  }
}

function traceParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return [
    ...model.header,
    ...model.sections.flatMap((section) => section.paragraphs),
    ...model.footer,
  ];
}

function recordTrace(
  trace: GenerationTrace,
  model: ExportRenderModel,
  bytes: Uint8Array,
  manifest: ExportArtifact['manifest'],
): void {
  const paragraphs = traceParagraphs(model);
  const styleCounts: Record<string, number> = {};
  if (!trace.assemblyMetadata) {
    (trace as any).assemblyMetadata = {
      plannedSectionIds: [],
      generatedSectionIds: [],
      renderedSectionIds: [],
      paragraphs: [],
    };
  } else if (!Array.isArray(trace.assemblyMetadata.paragraphs)) {
    trace.assemblyMetadata.paragraphs = [];
  }
  paragraphs.forEach((paragraph, paragraphIndex) => {
    styleCounts[paragraph.role] = (styleCounts[paragraph.role] || 0) + 1;
    trace.assemblyMetadata.paragraphs.push({
      paragraphIndex,
      sectionId: paragraph.provenance.sectionId,
      blockId: paragraph.provenance.blockId,
      generationTaskId: paragraph.provenance.generationTaskId,
      coverageItemIds: [...paragraph.provenance.coverageItemIds],
      textHash: hashTraceText(paragraph.text.trim()),
      styleCategory: paragraph.role,
      rendered: paragraph.text.trim().length > 0,
      omissionReason: paragraph.text.trim().length > 0 ? undefined : 'EMPTY_OUTPUT',
    });
  });
  trace.exportMetadata = {
    status: 'success',
    format: 'docx',
    byteLength: bytes.byteLength,
    bufferHash: hashTraceText(Buffer.from(bytes).toString('base64')),
    paragraphCount: paragraphs.length,
    styleCounts,
  };
  trace.exportManifest = markExportManifestRecorded(manifest);
}

function verifiedInputForPreparedDocument(
  document: UniversalLegalDocument,
  exportValidation: ReturnType<typeof validateForExport>,
): VerifiedMaterializationInput {
  const candidate = document as UniversalLegalDocument & {
    documentAssemblyResult?: unknown;
    documentAssemblyQualityGate?: unknown;
  };
  if (candidate.documentAssemblyResult !== undefined || candidate.documentAssemblyQualityGate !== undefined) {
    return verifyFinalDocumentExportability({ document, exportValidation });
  }

  return verifyCompatibilityMaterialization({ document, exportValidation });
}

/**
 * Public compatibility signature. Preparation and verification happen here;
 * the binary renderer itself receives only ExportRenderModel and options.
 */
export const exportUniversalToDocx = async (
  docData: UniversalLegalDocument,
  lawyerProfile: LawyerProfile = DEFAULT_LAWYER_PROFILE,
  trace?: GenerationTrace,
): Promise<Buffer> => {
  const prepared = await prepareUniversalDocumentForExport(docData);
  const exportValidation = validateForExport(prepared.document);
  const verified = verifiedInputForPreparedDocument(prepared.document, exportValidation);
  const model = materializePreparedFinalDocument(verified);
  const artifact = await renderDocx(model, {
    format: 'docx',
    pageProfile: resolveDocxPageProfile(),
    lawyerProfile,
  });
  const auditTrace = trace || prepared.document.generationMetadata.auditTrace;
  if (auditTrace) recordTrace(auditTrace, model, artifact.bytes, artifact.manifest);
  return Buffer.from(artifact.bytes);
};
