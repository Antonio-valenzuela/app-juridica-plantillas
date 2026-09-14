import { prepareUniversalDocumentForExport, validateForExport } from './exportGuards';
import {
  verifyCompatibilityMaterialization,
  verifyFinalDocumentExportability,
} from './finalDocumentMaterializationGate';
import { materializePreparedFinalDocument } from './finalDocumentMaterialization';
import type { LawyerProfile } from '../workspace/lawyerProfileTypes';
import { DEFAULT_LAWYER_PROFILE } from '../workspace/lawyerProfileTypes';
import {
  resolvePdfPageProfile,
  type PdfPageProfile,
} from './exportPageProfiles';
import type { GenerationTrace } from './generationTrace';
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
import type { UniversalLegalDocument } from './types';

export type { ExportArtifact } from './exportArtifactTypes';

/** The PDF renderer consumes the same semantic model as the DOCX renderer. */
export interface PdfRenderOptions {
  format: 'pdf';
  pageProfile: PdfPageProfile;
  lawyerProfile: LawyerProfile;
}

export class PdfRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfRenderError';
  }
}

export class PdfExportError extends Error {
  readonly code = 'PDF_EXPORT_FAILED';

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PdfExportError';
  }
}

/**
 * Generador PDF 1.4 manual, sin dependencias de conversión.
 *
 * El renderer binario no conoce UniversalLegalDocument ni vuelve a construir
 * contenido: recibe únicamente el ExportRenderModel ya verificado. La
 * codificación WinAnsi/cp1252 y la paginación son detalles técnicos del PDF.
 */

/* ── Codificación WinAnsi (cp1252) ───────────────────────────────────────── */

const WIN_ANSI_MAP: Record<string, string> = {
  '\u20AC': '\x80', '\u201A': '\x82', '\u0192': '\x83', '\u201E': '\x84',
  '\u2026': '\x85', '\u2020': '\x86', '\u2021': '\x87', '\u02C6': '\x88',
  '\u2030': '\x89', '\u0160': '\x8A', '\u2039': '\x8B', '\u0152': '\x8C',
  '\u017D': '\x8E', '\u2018': '\x91', '\u2019': '\x92', '\u201C': '\x93',
  '\u201D': '\x94', '\u2022': '\x95', '\u2013': '\x96', '\u2014': '\x97',
  '\u02DC': '\x98', '\u2122': '\x99', '\u0161': '\x9A', '\u203A': '\x9B',
  '\u0153': '\x9C', '\u017E': '\x9D', '\u0178': '\x9F', '\u00A0': ' ',
  '\u2192': '->', '\u2190': '<-', '\u2265': '>=', '\u2264': '<=',
  '\u2212': '-', '\u2011': '-', '\u2010': '-', '\u2500': '-', '\u2501': '-',
  '\u2502': '|', '\u25CF': '\u2022', '\u25AA': '\u2022', '\u25A0': '\u2022',
  '\u2713': '', '\u2714': '', '\u2717': 'x', '\u2718': 'x',
  '\u200B': '', '\uFEFF': '', '\u200E': '', '\u200F': '',
};

function encodeWinAnsi(text: string): Buffer {
  let output = '';
  for (const character of text) {
    const mapped = WIN_ANSI_MAP[character];
    if (mapped !== undefined) {
      output += mapped;
      continue;
    }
    const code = character.codePointAt(0) || 63;
    // A standard Type1 WinAnsi font cannot represent this code point. The
    // established PDF engine omits it instead of emitting a misleading '?'.
    if (code <= 0xFF && !(code >= 0x7F && code <= 0x9F)) output += character;
  }
  return Buffer.from(output, 'latin1');
}

function escapePdfLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/* ── Fuentes estándar ────────────────────────────────────────────────────── */

const FONTS = [
  { key: 'F1', base: 'Times-Roman' },
  { key: 'F2', base: 'Times-Bold' },
  { key: 'F3', base: 'Times-Italic' },
  { key: 'F4', base: 'Times-BoldItalic' },
  { key: 'F5', base: 'Helvetica' },
  { key: 'F6', base: 'Helvetica-Bold' },
] as const;

const SUPPORTED_ROLES: ReadonlySet<RenderParagraph['role']> = new Set([
  'TITLE',
  'BODY',
  'LIST',
  'SIGNATURE',
  'HEADER',
  'FOOTER',
  'SPACER',
]);

function assertPageProfile(profile: PdfPageProfile): void {
  if (!profile || profile.unit !== 'pt') {
    throw new PdfRenderError('PDF requiere un PdfPageProfile resuelto en puntos.');
  }
  if (!Number.isFinite(profile.width) || !Number.isFinite(profile.height)
    || profile.width <= 0 || profile.height <= 0) {
    throw new PdfRenderError('PDF requiere dimensiones de página finitas y positivas.');
  }
  const margins = profile.margins;
  if (!margins || ![margins.top, margins.right, margins.bottom, margins.left]
    .every((value) => Number.isFinite(value) && value >= 0)) {
    throw new PdfRenderError('PDF requiere márgenes finitos y no negativos.');
  }
  if (margins.left + margins.right >= profile.width
    || margins.top + margins.bottom >= profile.height) {
    throw new PdfRenderError('PDF requiere un área útil positiva.');
  }
}

function assertModel(model: ExportRenderModel): void {
  if (!model || model.schemaVersion !== 'fase7-v1'
    || typeof model.documentId !== 'string' || typeof model.title !== 'string') {
    throw new PdfRenderError('ExportRenderModel inválido para PDF.');
  }
  if (!Array.isArray(model.header) || !Array.isArray(model.sections)
    || !Array.isArray(model.footer)) {
    throw new PdfRenderError('ExportRenderModel requiere header, sections y footer como arreglos.');
  }
  for (const section of model.sections) {
    if (!section || !Array.isArray(section.paragraphs)) {
      throw new PdfRenderError('Cada sección del ExportRenderModel requiere paragraphs como arreglo.');
    }
  }
}

function assertParagraphShape(
  paragraph: RenderParagraph,
  placement: 'BODY' | 'HEADER' | 'FOOTER',
): void {
  if (!SUPPORTED_ROLES.has(paragraph.role)) {
    throw new PdfExportError(`PDF role is not supported: ${String(paragraph.role)}.`);
  }
  if (placement === 'HEADER' && paragraph.role !== 'HEADER') {
    throw new PdfExportError(`El párrafo ${paragraph.id} no puede entrar al header con rol ${paragraph.role}.`);
  }
  if (placement === 'FOOTER' && paragraph.role !== 'FOOTER') {
    throw new PdfExportError(`El párrafo ${paragraph.id} no puede entrar al footer con rol ${paragraph.role}.`);
  }
  if (typeof paragraph.id !== 'string' || typeof paragraph.text !== 'string'
    || !paragraph.style || !paragraph.provenance) {
    throw new PdfExportError(`El párrafo ${paragraph.id || '<unknown>'} no tiene la forma requerida.`);
  }
}

function runsForParagraph(paragraph: RenderParagraph): readonly RenderRun[] {
  if (!Array.isArray(paragraph.runs)) {
    throw new PdfExportError(`El párrafo ${paragraph.id} no contiene runs válidos.`);
  }
  const runs = paragraph.runs.map((run) => {
    if (!run || typeof run.text !== 'string') {
      throw new PdfExportError(`El párrafo ${paragraph.id} contiene un run inválido.`);
    }
    return run;
  });
  if (runs.map((run) => run.text).join('') !== paragraph.text) {
    throw new PdfExportError(`El párrafo ${paragraph.id} no coincide con la concatenación de sus runs.`);
  }
  return runs;
}

function parsePt(size: unknown, fallback: number): number {
  if (typeof size !== 'string') return fallback;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(size);
  if (!match) return fallback;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 200) return fallback;
  return match[2]?.toLowerCase() === 'px' ? value * 0.75 : value;
}

function parseLineHeight(lineHeight: unknown): number {
  if (typeof lineHeight !== 'string') return 1.45;
  const value = Number.parseFloat(lineHeight);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 4) : 1.45;
}

function isBold(style: RenderParagraph['style'], run?: RenderRun): boolean {
  if (run?.bold !== undefined) return run.bold;
  return style.fontWeight === '700' || style.fontWeight === 'bold';
}

function isItalic(style: RenderParagraph['style'], run?: RenderRun): boolean {
  if (run?.italic !== undefined) return run.italic;
  return style.fontStyle === 'italic';
}

function fontFor(
  style: RenderParagraph['style'],
  role: RenderParagraph['role'],
  run?: RenderRun,
): { key: string; bold: boolean } {
  const bold = isBold(style, run);
  const italic = isItalic(style, run);
  if (bold && italic) return { key: 'F4', bold: true };
  if (bold) return { key: 'F2', bold: true };
  if (italic) return { key: 'F3', bold: false };
  if (role === 'HEADER' || role === 'FOOTER') return { key: 'F5', bold: false };
  return { key: 'F1', bold: false };
}

function paragraphSize(paragraph: RenderParagraph): number {
  const fallback = paragraph.role === 'TITLE' ? 13
    : paragraph.role === 'HEADER' || paragraph.role === 'FOOTER' ? 10
      : 12;
  return parsePt(paragraph.style.fontSize, fallback);
}

// Times has variable glyph widths; this conservative estimate only controls
// pagination and wrapping, never changes the semantic text emitted.
const CHAR_FACTOR = 0.5;
const COMPATIBILITY_TRAILING_KEEP_LINES = 36;
function estimateWidth(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? CHAR_FACTOR + 0.03 : CHAR_FACTOR);
}

interface StyledToken {
  text: string;
  size: number;
  fontKey: string;
  bold: boolean;
}

interface PlacedFragment {
  text: string;
  fontKey: string;
  size: number;
}

interface PlacedLine {
  fragments: PlacedFragment[];
  x: number;
  y: number;
  justifyGapThousandths?: number;
}

interface PageContent {
  lines: PlacedLine[];
}

function paragraphTokens(paragraph: RenderParagraph): StyledToken[] {
  const runs = runsForParagraph(paragraph);
  const size = paragraphSize(paragraph);
  const tokens: StyledToken[] = [];
  for (const run of runs) {
    const font = fontFor(paragraph.style, paragraph.role, run);
    const pieces = run.text.split(/(\n+)/);
    for (const piece of pieces) {
      if (/^\n+$/.test(piece)) {
        tokens.push({
          // A single LF is a physical line break. A paragraph separator is
          // kept as spacing rather than an extra empty rendered line.
          text: piece.length === 1 ? '\n' : '\f',
          size,
          fontKey: font.key,
          bold: font.bold,
        });
        continue;
      }
      const parts = piece.match(/\S+|\s+/g) || [];
      for (const part of parts) {
        tokens.push({ text: part, size, fontKey: font.key, bold: font.bold });
      }
    }
  }
  return tokens;
}

function lineFragments(
  tokens: readonly StyledToken[],
  maxWidth: number,
): { lines: PlacedFragment[][]; paragraphBreaks: number } {
  const lines: PlacedFragment[][] = [];
  let current: PlacedFragment[] = [];
  let currentWidth = 0;
  let paragraphBreaks = 0;

  const pushCurrent = () => {
    if (current.length > 0) lines.push(current);
    current = [];
    currentWidth = 0;
  };

  for (const token of tokens) {
    if (token.text === '\n') {
      pushCurrent();
      continue;
    }
    if (token.text === '\f') {
      pushCurrent();
      paragraphBreaks += 1;
      continue;
    }
    const width = estimateWidth(token.text, token.size, token.bold);
    const isWhitespace = /^\s+$/.test(token.text);
    if (isWhitespace && current.length === 0) continue;
    if (current.length > 0 && currentWidth + width > maxWidth && !isWhitespace) {
      pushCurrent();
    }
    if (current.length === 0 && width > maxWidth && !isWhitespace) {
      let remaining = token.text;
      while (remaining.length > 1 && estimateWidth(remaining, token.size, token.bold) > maxWidth) {
        let cut = remaining.length - 1;
        while (cut > 1 && estimateWidth(remaining.slice(0, cut), token.size, token.bold) > maxWidth) cut -= 1;
        lines.push([{ text: remaining.slice(0, cut), fontKey: token.fontKey, size: token.size }]);
        remaining = remaining.slice(cut);
      }
      if (remaining) {
        current.push({ text: remaining, fontKey: token.fontKey, size: token.size });
        currentWidth = estimateWidth(remaining, token.size, token.bold);
      }
      continue;
    }
    if (isWhitespace && current.length > 0 && currentWidth + width > maxWidth) continue;
    current.push({ text: token.text, fontKey: token.fontKey, size: token.size });
    currentWidth += width;
  }
  pushCurrent();
  return { lines, paragraphBreaks };
}

function indentPoints(style: RenderParagraph['style'], size: number): number {
  const match = typeof style.indent === 'string'
    ? /([\d.]+)\s*(em|pt)?/i.exec(style.indent)
    : null;
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return 0;
  return match[2]?.toLowerCase() === 'pt' ? value : value * size;
}

function lineWidth(line: readonly PlacedFragment[]): number {
  return line.reduce((sum, fragment) => sum + estimateWidth(
    fragment.text,
    fragment.size,
    fragment.fontKey === 'F2' || fragment.fontKey === 'F4',
  ), 0);
}

function lineHasWhitespace(line: readonly PlacedFragment[]): boolean {
  return line.some((fragment) => /\s/.test(fragment.text));
}

function paragraphLines(
  paragraph: RenderParagraph,
  contentWidth: number,
): { lines: PlacedLine[]; lineHeight: number; spacingAfter: number } {
  const size = paragraphSize(paragraph);
  const lineHeight = size * parseLineHeight(paragraph.style.lineHeight);
  const indent = indentPoints(paragraph.style, size);
  const width = Math.max(1, contentWidth - indent);
  const wrapped = paragraph.role === 'SPACER'
    ? { lines: [], paragraphBreaks: 0 }
    : lineFragments(paragraphTokens(paragraph), width);
  const fragments = wrapped.lines;
  const align = paragraph.style.textAlign
    || (paragraph.role === 'TITLE' ? 'center'
      : paragraph.role === 'HEADER' ? 'right'
        : paragraph.role === 'FOOTER' ? 'center' : 'justify');
  const lines = fragments.map((line, index) => {
    const widthUsed = lineWidth(line);
    const extra = width - widthUsed;
    let x = indent;
    let justifyGapThousandths: number | undefined;
    if (align === 'center') x = indent + Math.max(0, extra / 2);
    if (align === 'right') x = indent + Math.max(0, extra);
    if (align === 'justify' && index < fragments.length - 1 && extra > 0 && lineHasWhitespace(line)) {
      const wordGapCount = line.reduce((count, fragment) => count + (fragment.text.match(/ /g) || []).length, 0);
      if (wordGapCount > 0) justifyGapThousandths = -(extra / wordGapCount) * 1000 / size;
    }
    return {
      fragments: [...line],
      x,
      y: 0,
      justifyGapThousandths,
    };
  });
  return {
    lines,
    lineHeight,
    spacingAfter: (paragraph.role === 'SPACER' ? size * 0.6 : 6)
      + wrapped.paragraphBreaks * size * 0.6,
  };
}

function bodyParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return model.sections.flatMap((section) => section.paragraphs);
}

function allParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return [...model.header, ...bodyParagraphs(model), ...model.footer];
}

function closingHeight(paragraphs: readonly RenderParagraph[], contentWidth: number): number {
  return paragraphs.reduce((total, paragraph) => {
    const layout = paragraphLines(paragraph, contentWidth);
    return total + Math.max(layout.lineHeight, layout.lines.length * layout.lineHeight) + layout.spacingAfter;
  }, 0) * 1.25;
}

function buildPageLayout(model: ExportRenderModel, profile: PdfPageProfile): PageContent[] {
  const pageWidth = profile.width;
  const pageHeight = profile.height;
  const left = profile.margins.left;
  const right = profile.margins.right;
  const top = pageHeight - profile.margins.top;
  const bottom = profile.margins.bottom;
  const contentWidth = pageWidth - left - right;
  const body = bodyParagraphs(model);
  const paragraphs = allParagraphs(model);
  const firstSignatureIndex = paragraphs.findIndex((paragraph) => paragraph.role === 'SIGNATURE');
  const signatureParagraphs = firstSignatureIndex >= 0
    ? paragraphs.slice(firstSignatureIndex).filter((paragraph) => paragraph.role === 'SIGNATURE')
    : [];
  const signatureHeight = signatureParagraphs.length > 0
    ? closingHeight(signatureParagraphs, contentWidth)
    : 0;
  const signatureFits = signatureHeight > 0 && signatureHeight <= top - bottom;

  const pages: PageContent[] = [{ lines: [] }];
  let current = pages[0]!;
  let cursorY = top;
  let previousRole: RenderParagraph['role'] | undefined;
  let signatureReserved = false;
  let compatibilityTrailingReserved = false;

  const newPage = () => {
    current = { lines: [] };
    pages.push(current);
    cursorY = top;
    previousRole = undefined;
  };
  const ensureHeight = (height: number) => {
    if (current.lines.length > 0 && cursorY - height < bottom) newPage();
  };

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const placement = paragraphIndex < model.header.length
      ? 'HEADER'
      : paragraphIndex >= model.header.length + body.length ? 'FOOTER' : 'BODY';
    assertParagraphShape(paragraph, placement);
    const layout = paragraphLines(paragraph, contentWidth);
    const paragraphHeight = Math.max(layout.lineHeight, layout.lines.length * layout.lineHeight)
      + layout.spacingAfter;

    if (paragraph.pageBreakBefore && current.lines.length > 0) newPage();
    if (paragraph.role === 'SIGNATURE' && !signatureReserved && signatureFits) {
      signatureReserved = true;
      ensureHeight(signatureHeight);
    }

    const spaceBefore = previousRole === undefined ? 0
      : paragraph.role === 'TITLE' ? 8 : 4;
    if (spaceBefore > 0) cursorY -= spaceBefore;
    if (paragraph.keepTogether || paragraph.role === 'SIGNATURE') ensureHeight(paragraphHeight);

    if (layout.lines.length === 0) {
      cursorY -= paragraphHeight;
      previousRole = paragraph.role;
      return;
    }

    for (const line of layout.lines) {
      const isCompatibilityTail = paragraph.provenance.verificationMode === 'COMPATIBILITY'
        && paragraphIndex === paragraphs.length - 1;
      const lineIndex = layout.lines.indexOf(line);
      if (isCompatibilityTail && !compatibilityTrailingReserved
        && lineIndex >= Math.max(0, layout.lines.length - COMPATIBILITY_TRAILING_KEEP_LINES)) {
        const trailingHeight = (layout.lines.length - lineIndex) * layout.lineHeight;
        if (trailingHeight <= top - bottom) {
          ensureHeight(trailingHeight);
          compatibilityTrailingReserved = true;
        }
      }
      ensureHeight(layout.lineHeight);
      current.lines.push({
        ...line,
        x: left + line.x,
        y: cursorY,
      });
      cursorY -= layout.lineHeight;
    }
    cursorY -= layout.spacingAfter;
    previousRole = paragraph.role;
  });

  return pages;
}

/* ── Constructor de streams binario-seguro ───────────────────────────────── */

class StreamBuilder {
  private parts: Buffer[] = [];

  push(text: string): void {
    this.parts.push(encodeWinAnsi(text));
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts);
  }
}

function serializePdf(pages: readonly PageContent[], profile: PdfPageProfile): Buffer {
  const chunks: Buffer[] = [];
  let fileSize = 0;
  const push = (chunk: Buffer) => {
    chunks.push(chunk);
    fileSize += chunk.length;
  };
  const pushStr = (text: string) => push(Buffer.from(text, 'latin1'));
  const objectMap = new Map<number, Buffer>();

  // 1 Catalog, 2 Pages, 3..8 fonts, then one page/content pair per page.
  const fontIds: Record<string, number> = {};
  let nextId = 3;
  for (const font of FONTS) fontIds[font.key] = nextId++;
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  }
  const catalogId = 1;
  const pagesId = 2;

  objectMap.set(catalogId, Buffer.from(
    `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`,
    'latin1',
  ));
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(' ');
  objectMap.set(pagesId, Buffer.from(
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`,
    'latin1',
  ));

  for (const font of FONTS) {
    const id = fontIds[font.key];
    objectMap.set(id, Buffer.from(
      `${id} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /${font.base} /Encoding /WinAnsiEncoding >>\nendobj\n`,
      'latin1',
    ));
  }

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const stream = new StreamBuilder();
    for (const line of pages[pageIndex]!.lines) {
      let cursorX = line.x;
      for (const fragment of line.fragments) {
        const escaped = escapePdfLiteral(fragment.text);
        const fontKey = FONTS.some((font) => font.key === fragment.fontKey) ? fragment.fontKey : 'F1';
        stream.push(`BT /${fontKey} ${fragment.size} Tf 1 0 0 1 ${cursorX.toFixed(2)} ${line.y.toFixed(2)} Tm `);
        stream.push(`(${escaped}) Tj ET\n`);
        cursorX += estimateWidth(
          fragment.text,
          fragment.size,
          fontKey === 'F2' || fontKey === 'F4',
        );
        if (line.justifyGapThousandths !== undefined && / /.test(fragment.text)) {
          cursorX += -(line.justifyGapThousandths / 1000) * fragment.size;
        }
      }
    }

    const footer = `Página ${pageIndex + 1} de ${pages.length}`;
    const footerSize = 9;
    const footerWidth = estimateWidth(footer, footerSize, false);
    const footerX = (profile.width - footerWidth) / 2;
    const footerY = Math.max(20, profile.margins.bottom / 2);
    stream.push(`BT /F5 ${footerSize} Tf 1 0 0 1 ${footerX.toFixed(2)} ${footerY.toFixed(2)} Tm (${escapePdfLiteral(footer)}) Tj ET\n`);

    const streamBuffer = stream.toBuffer();
    const contentId = contentObjectIds[pageIndex]!;
    objectMap.set(contentId, Buffer.concat([
      Buffer.from(`${contentId} 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n`, 'latin1'),
      streamBuffer,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
    ]));

    const pageId = pageObjectIds[pageIndex]!;
    const resources = FONTS.map((font) => `/${font.key} ${fontIds[font.key]} 0 R`).join(' ');
    objectMap.set(pageId, Buffer.from(
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${profile.width} ${profile.height}] /Contents ${contentId} 0 R /Resources << /Font << ${resources} >> >> >>\nendobj\n`,
      'latin1',
    ));
  }

  pushStr('%PDF-1.4\n%âãÏÓ');
  const offsets: number[] = [];
  const sortedIds = Array.from(objectMap.keys()).sort((left, right) => left - right);
  for (const id of sortedIds) {
    offsets[id] = fileSize;
    push(objectMap.get(id)!);
  }
  const startXref = fileSize;
  const maxId = sortedIds[sortedIds.length - 1]!;
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  pushStr(xref);

  return Buffer.concat(chunks);
}

export async function renderPdf(
  model: ExportRenderModel,
  options: PdfRenderOptions,
): Promise<ExportArtifact> {
  try {
    assertModel(model);
    if (!options || options.format !== 'pdf') {
      throw new PdfRenderError('PDF requiere opciones de renderer con format="pdf".');
    }
    assertPageProfile(options.pageProfile);
    if (!options.lawyerProfile || typeof options.lawyerProfile !== 'object') {
      throw new PdfRenderError('PDF requiere un LawyerProfile de presentación resuelto.');
    }

    const bytes = serializePdf(buildPageLayout(model, options.pageProfile), options.pageProfile);
    if (!bytes || bytes.length < 800 || bytes.subarray(0, 4).toString() !== '%PDF') {
      throw new Error('PDF serializer returned an invalid document.');
    }
    const artifactBytes = new Uint8Array(bytes.byteLength);
    artifactBytes.set(bytes);
    return {
      format: 'pdf',
      mediaType: 'application/pdf',
      fileName: 'document.pdf',
      bytes: artifactBytes,
      manifest: createExportManifest({
        model,
        format: 'pdf',
        pageProfile: options.pageProfile,
        traceStatus: 'NOT_AVAILABLE',
      }),
    };
  } catch (error) {
    if (error instanceof PdfExportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new PdfExportError(`PDF export failed: ${message}`, error);
  }
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
export const exportUniversalToPdf = async (
  docData: UniversalLegalDocument,
  trace?: GenerationTrace,
): Promise<Buffer> => {
  const prepared = await prepareUniversalDocumentForExport(docData);
  const exportValidation = validateForExport(prepared.document);
  const verified = verifiedInputForPreparedDocument(prepared.document, exportValidation);
  const model = materializePreparedFinalDocument(verified);
  const artifact = await renderPdf(model, {
    format: 'pdf',
    pageProfile: resolvePdfPageProfile(),
    lawyerProfile: DEFAULT_LAWYER_PROFILE,
  });
  if (trace) trace.exportManifest = markExportManifestRecorded(artifact.manifest);
  return Buffer.from(artifact.bytes);
};
