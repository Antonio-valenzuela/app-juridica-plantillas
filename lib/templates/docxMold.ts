/**
 * Molde visual DOCX: usa el .docx del abogado como base del documento nuevo.
 *
 * Se conserva el paquete completo (estilos, numeración, tema, fuentes, header/footer con sus
 * imágenes, sectPr con tamaño de página y márgenes), se vacía el cuerpo y se inserta SOLO el
 * contenido nuevo con los estilos de párrafo de la plantilla. Todo el procesamiento es local:
 * la plantilla nunca sale de este proceso.
 */
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { findCarryover, type CarryoverBlocklist } from './carryoverFilter';
import { sectionKindKey } from './sectionKind';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export class DocxMoldError extends Error {
  constructor(readonly code: 'DOCX_INVALID' | 'DOCX_EMPTY', message: string) {
    super(message);
    this.name = 'DocxMoldError';
  }
}

export interface MoldParagraph {
  role: 'title' | 'heading' | 'body' | 'closing' | 'signature';
  text: string;
  /** Título de la sección a la que pertenece: elige el estilo de esa sección en la plantilla. */
  sectionTitle?: string;
}

export interface MoldPage {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
}

export interface MoldTypography {
  fontName: string | null;
  fontSizePt: number;
  lineHeight: number;
}

export interface DocxMoldInspection {
  page: MoldPage;
  typography: MoldTypography;
  headerTexts: string[];
  footerTexts: string[];
  hasHeaderFooterImages: boolean;
  sectionTitles: string[];
  fidelity: 'EXACT';
}

export interface DocxMoldRenderResult {
  bytes: Uint8Array;
  warnings: string[];
  /** Textos de header/footer vaciados por contener datos de la plantilla anterior. */
  clearedHeaderFooter: string[];
}

type El = Element;

const parse = (xml: string): Document => new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
const serialize = (doc: Document): string => new XMLSerializer().serializeToString(doc as never);

function children(el: El | Node, local: string): El[] {
  const out: El[] = [];
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1 && (node as El).localName === local) out.push(node as El);
  }
  return out;
}

function descendants(el: El | Document, local: string): El[] {
  return Array.from((el as El).getElementsByTagNameNS(W, local)) as El[];
}

function attr(el: El | null | undefined, name: string): string | null {
  if (!el) return null;
  return el.getAttributeNS(W, name) ?? el.getAttribute(`w:${name}`);
}

function paragraphText(p: El): string {
  return descendants(p, 't').map((t) => t.textContent || '').join('');
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isHeadingParagraph(p: El): boolean {
  const text = paragraphText(p).trim();
  if (!text) return false;
  const style = attr(children(children(p, 'pPr')[0] || p, 'pStyle')[0], 'val') || '';
  if (/^(heading|titulo|título|title)/i.test(style)) return true;
  return wordCount(text) <= 12 && text === text.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(text);
}

interface ParagraphModel {
  pPr: El | null;
  rPr: El | null;
}

function modelOf(p: El): ParagraphModel {
  const pPr = children(p, 'pPr')[0] || null;
  const firstRun = children(p, 'r')[0];
  const rPr = firstRun ? children(firstRun, 'rPr')[0] || null : null;
  return { pPr, rPr };
}

interface LoadedMold {
  zip: JSZip;
  documentXml: Document;
  body: El;
  sectPr: El | null;
  defaultHeading: ParagraphModel | null;
  defaultBody: ParagraphModel | null;
  titleModel: ParagraphModel | null;
  closingModel: ParagraphModel | null;
  signatureModel: ParagraphModel | null;
  headingModels: Map<string, ParagraphModel>;
  bodyModels: Map<string, ParagraphModel>;
  sectionTitles: string[];
}

async function loadMold(bytes: Uint8Array | Buffer): Promise<LoadedMold> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxMoldError('DOCX_INVALID', 'El archivo no es un .docx válido.');
  }
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new DocxMoldError('DOCX_INVALID', 'El .docx no contiene word/document.xml.');
  const documentXml = parse(await documentFile.async('string'));
  const body = descendants(documentXml, 'body')[0];
  if (!body) throw new DocxMoldError('DOCX_INVALID', 'El .docx no tiene cuerpo.');

  const sectPrs = children(body, 'sectPr');
  const sectPr = sectPrs[sectPrs.length - 1] || null;
  const paragraphs = children(body, 'p').filter((p) => paragraphText(p).trim());
  if (paragraphs.length === 0) throw new DocxMoldError('DOCX_EMPTY', 'La plantilla .docx no tiene texto.');

  const headingModels = new Map<string, ParagraphModel>();
  const bodyModels = new Map<string, ParagraphModel>();
  const sectionTitles: string[] = [];
  const bodyFrequency = new Map<string, { count: number; model: ParagraphModel }>();
  let defaultHeading: ParagraphModel | null = null;
  let currentKey: string | null = null;

  for (const p of paragraphs) {
    const text = paragraphText(p).trim();
    if (isHeadingParagraph(p)) {
      currentKey = sectionKindKey(text);
      sectionTitles.push(text);
      const model = modelOf(p);
      if (!headingModels.has(currentKey)) headingModels.set(currentKey, model);
      defaultHeading ??= model;
      continue;
    }
    const model = modelOf(p);
    if (wordCount(text) >= 8) {
      const signature = model.pPr ? serialize(model.pPr as never) : '';
      const entry = bodyFrequency.get(signature);
      if (entry) entry.count += 1;
      else bodyFrequency.set(signature, { count: 1, model });
      if (currentKey && !bodyModels.has(currentKey)) bodyModels.set(currentKey, model);
    }
  }
  const mostCommon = [...bodyFrequency.values()].sort((a, b) => b.count - a.count)[0]?.model || null;
  const first = modelOf(paragraphs[0]);
  const last = modelOf(paragraphs[paragraphs.length - 1]);
  const closingParagraph = paragraphs.find((p) => /protesto lo necesario|atentamente/i.test(paragraphText(p)));

  return {
    zip,
    documentXml,
    body,
    sectPr,
    defaultHeading,
    defaultBody: mostCommon || modelOf(paragraphs.find((p) => !isHeadingParagraph(p)) || paragraphs[0]),
    titleModel: first,
    closingModel: closingParagraph ? modelOf(closingParagraph) : null,
    signatureModel: last,
    headingModels,
    bodyModels,
    sectionTitles,
  };
}

function twipAttr(el: El | null | undefined, name: string, fallback: number): number {
  const value = Number(attr(el, name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path);
  return file ? parse(await file.async('string')) : null;
}

function readTypography(styles: Document | null): MoldTypography {
  let fontName: string | null = null;
  let halfPoints = 24;
  let line = 240;
  if (styles) {
    const defaults = descendants(styles, 'docDefaults')[0];
    const apply = (rPr: El | undefined, pPr: El | undefined) => {
      const fonts = rPr ? children(rPr, 'rFonts')[0] : undefined;
      fontName = attr(fonts, 'ascii') || attr(fonts, 'hAnsi') || fontName;
      const size = rPr ? Number(attr(children(rPr, 'sz')[0], 'val')) : NaN;
      if (Number.isFinite(size) && size > 0) halfPoints = size;
      const spacing = pPr ? children(pPr, 'spacing')[0] : undefined;
      const lineValue = Number(attr(spacing, 'line'));
      if (Number.isFinite(lineValue) && lineValue > 0 && (attr(spacing, 'lineRule') || 'auto') === 'auto') line = lineValue;
    };
    if (defaults) {
      const rPrDefault = children(defaults, 'rPrDefault')[0];
      const pPrDefault = children(defaults, 'pPrDefault')[0];
      apply(rPrDefault && children(rPrDefault, 'rPr')[0], pPrDefault && children(pPrDefault, 'pPr')[0]);
    }
    const normal = descendants(styles, 'style').find((s) => attr(s, 'type') === 'paragraph' && attr(s, 'default') === '1');
    if (normal) apply(children(normal, 'rPr')[0], children(normal, 'pPr')[0]);
  }
  return { fontName, fontSizePt: halfPoints / 2, lineHeight: Math.round((line / 240) * 100) / 100 };
}

async function headerFooterTexts(zip: JSZip, kind: 'header' | 'footer'): Promise<{ texts: string[]; images: boolean }> {
  const texts: string[] = [];
  let images = false;
  const pattern = new RegExp(`^word/${kind}\\d*\\.xml$`);
  for (const path of Object.keys(zip.files).filter((name) => pattern.test(name))) {
    const xml = await readXml(zip, path);
    if (!xml) continue;
    const text = descendants(xml, 't').map((t) => t.textContent || '').join(' ').trim();
    if (text) texts.push(text);
    if (descendants(xml, 'drawing').length > 0 || descendants(xml, 'pict').length > 0) images = true;
  }
  return { texts, images };
}

export async function inspectDocxMold(bytes: Uint8Array | Buffer): Promise<DocxMoldInspection> {
  const mold = await loadMold(bytes);
  const pgSz = mold.sectPr ? children(mold.sectPr, 'pgSz')[0] : undefined;
  const pgMar = mold.sectPr ? children(mold.sectPr, 'pgMar')[0] : undefined;
  const width = twipAttr(pgSz, 'w', 12240);
  const height = twipAttr(pgSz, 'h', 15840);
  const header = await headerFooterTexts(mold.zip, 'header');
  const footer = await headerFooterTexts(mold.zip, 'footer');
  return {
    page: {
      width,
      height,
      orientation: attr(pgSz, 'orient') === 'landscape' || width > height ? 'landscape' : 'portrait',
      margins: {
        top: twipAttr(pgMar, 'top', 1440),
        right: twipAttr(pgMar, 'right', 1440),
        bottom: twipAttr(pgMar, 'bottom', 1440),
        left: twipAttr(pgMar, 'left', 1440),
      },
    },
    typography: readTypography(await readXml(mold.zip, 'word/styles.xml')),
    headerTexts: header.texts,
    footerTexts: footer.texts,
    hasHeaderFooterImages: header.images || footer.images,
    sectionTitles: mold.sectionTitles,
    fidelity: 'EXACT',
  };
}

function buildParagraph(doc: Document, model: ParagraphModel | null, text: string): El {
  const p = doc.createElementNS(W, 'w:p') as unknown as El;
  if (model?.pPr) {
    const pPr = model.pPr.cloneNode(true) as El;
    for (const stale of children(pPr, 'sectPr')) pPr.removeChild(stale);
    p.appendChild(pPr);
  }
  const lines = text.split('\n');
  const run = doc.createElementNS(W, 'w:r') as unknown as El;
  if (model?.rPr) run.appendChild(model.rPr.cloneNode(true));
  lines.forEach((line, index) => {
    if (index > 0) run.appendChild(doc.createElementNS(W, 'w:br') as unknown as El);
    const t = doc.createElementNS(W, 'w:t') as unknown as El;
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.appendChild(doc.createTextNode(line));
    run.appendChild(t);
  });
  p.appendChild(run);
  return p;
}

function modelFor(mold: LoadedMold, paragraph: MoldParagraph): ParagraphModel | null {
  const key = paragraph.sectionTitle ? sectionKindKey(paragraph.sectionTitle) : '';
  switch (paragraph.role) {
    case 'title': return mold.titleModel;
    case 'heading': return mold.headingModels.get(key) || mold.defaultHeading || mold.defaultBody;
    case 'closing': return mold.closingModel || mold.signatureModel || mold.defaultBody;
    case 'signature': return mold.signatureModel || mold.defaultBody;
    default: return (key && mold.bodyModels.get(key)) || mold.defaultBody;
  }
}

const COMMENT_PARTS = /^word\/(comments\w*|people)\.xml$/;

async function stripResidualParts(zip: JSZip): Promise<void> {
  // Comentarios y datos personalizados de la plantilla anterior no deben viajar en el paquete.
  const removed: string[] = [];
  for (const path of Object.keys(zip.files)) {
    if (COMMENT_PARTS.test(path) || path === 'docProps/custom.xml') {
      zip.remove(path);
      removed.push(path);
    }
  }
  if (removed.length === 0) return;
  const names = new Set(removed.map((path) => path.split('/').pop()!));
  for (const relsPath of ['word/_rels/document.xml.rels', '_rels/.rels']) {
    const rels = await readXml(zip, relsPath);
    if (!rels) continue;
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const target = (rel.getAttribute('Target') || '').split('/').pop() || '';
      if (names.has(target)) rel.parentNode?.removeChild(rel);
    }
    zip.file(relsPath, serialize(rels));
  }
  const types = await readXml(zip, '[Content_Types].xml');
  if (types) {
    for (const override of Array.from(types.getElementsByTagName('Override'))) {
      const part = (override.getAttribute('PartName') || '').replace(/^\//, '');
      if (removed.includes(part)) override.parentNode?.removeChild(override);
    }
    zip.file('[Content_Types].xml', serialize(types));
  }
}

async function stripNotes(zip: JSZip): Promise<void> {
  for (const [path, tag] of [['word/footnotes.xml', 'footnote'], ['word/endnotes.xml', 'endnote']] as const) {
    const xml = await readXml(zip, path);
    if (!xml) continue;
    for (const note of descendants(xml, tag)) {
      if (!attr(note, 'type')) note.parentNode?.removeChild(note);
    }
    zip.file(path, serialize(xml));
  }
}

async function scrubCoreProperties(zip: JSZip): Promise<void> {
  const file = zip.file('docProps/core.xml');
  if (!file) return;
  let xml = await file.async('string');
  for (const tag of ['dc:title', 'dc:subject', 'dc:description', 'cp:keywords']) {
    xml = xml.replace(new RegExp(`<${tag}(\\s[^>]*)?>[\\s\\S]*?</${tag}>`, 'g'), `<${tag}$1></${tag}>`);
  }
  zip.file('docProps/core.xml', xml);
}

async function cleanHeadersAndFooters(zip: JSZip, blocklist: CarryoverBlocklist | undefined, cleared: string[]): Promise<void> {
  for (const path of Object.keys(zip.files).filter((name) => /^word\/(header|footer)\d*\.xml$/.test(name))) {
    const xml = await readXml(zip, path);
    if (!xml) continue;
    let changed = false;
    if (blocklist) {
      for (const t of descendants(xml, 't')) {
        const text = t.textContent || '';
        if (text.trim() && findCarryover(text, blocklist).length > 0) {
          cleared.push(text.trim());
          t.textContent = '';
          changed = true;
        }
      }
    }
    if (changed) zip.file(path, serialize(xml));
  }
}

/**
 * Genera un .docx con el diseño de la plantilla y SOLO el contenido recibido.
 * `blocklist` limpia además header/footer de datos de la plantilla anterior.
 */
export async function renderWithDocxMold(
  templateBytes: Uint8Array | Buffer,
  content: MoldParagraph[],
  options: { blocklist?: CarryoverBlocklist } = {},
): Promise<DocxMoldRenderResult> {
  const mold = await loadMold(templateBytes);
  const { documentXml, body } = mold;

  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === 1 && (child as El).localName === 'sectPr' && child === mold.sectPr) continue;
    body.removeChild(child);
  }
  for (const paragraph of content) {
    const node = buildParagraph(documentXml, modelFor(mold, paragraph), paragraph.text);
    if (mold.sectPr) body.insertBefore(node, mold.sectPr);
    else body.appendChild(node);
  }
  mold.zip.file('word/document.xml', serialize(documentXml));

  const cleared: string[] = [];
  await cleanHeadersAndFooters(mold.zip, options.blocklist, cleared);
  await stripResidualParts(mold.zip);
  await stripNotes(mold.zip);
  await scrubCoreProperties(mold.zip);

  const warnings: string[] = [];
  if (cleared.length > 0) {
    warnings.push(`Se vaciaron ${cleared.length} texto(s) del encabezado o pie por contener datos de la plantilla anterior; revísalos.`);
  }
  const bytes = await mold.zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, warnings, clearedHeaderFooter: cleared };
}

/* ── Perfil para el PDF aproximado ───────────────────────────────────────── */

export interface MoldPdfSettings {
  pageProfile: { id: string; unit: 'pt'; width: number; height: number; margins: { top: number; right: number; bottom: number; left: number }; source: 'SERVER_OPTION' };
  fontSizePt: number;
  lineHeight: number;
  family: 'serif' | 'sans';
  fidelity: 'EXACT' | 'APPROXIMATE';
  warnings: string[];
}

const SANS_FONTS = /(arial|helvetica|calibri|verdana|tahoma|segoe|open sans|roboto|aptos)/i;

const pt = (twips: number) => Math.round((twips / 20) * 100) / 100;

/** Márgenes, tamaño, tipografía e interlineado del molde para el renderer PDF; avisa lo que no puede igualar. */
export function moldPdfSettings(inspection: DocxMoldInspection, fidelity: 'EXACT' | 'APPROXIMATE' = 'APPROXIMATE'): MoldPdfSettings {
  const { page, typography } = inspection;
  const warnings = ['El PDF aproxima el diseño de tu plantilla: iguala tamaño de página, márgenes, tamaño de letra e interlineado.'];
  const family: 'serif' | 'sans' = typography.fontName && SANS_FONTS.test(typography.fontName) ? 'sans' : 'serif';
  if (typography.fontName) {
    warnings.push(`El PDF usa ${family === 'sans' ? 'Helvetica' : 'Times'} en lugar de «${typography.fontName}».`);
  }
  if (inspection.hasHeaderFooterImages) warnings.push('El PDF no incluye las imágenes del membrete (logotipo) de tu plantilla; el Word sí las conserva.');
  return {
    pageProfile: {
      id: 'pdf-lawyer-mold',
      unit: 'pt',
      width: pt(page.width),
      height: pt(page.height),
      margins: { top: pt(page.margins.top), right: pt(page.margins.right), bottom: pt(page.margins.bottom), left: pt(page.margins.left) },
      source: 'SERVER_OPTION',
    },
    fontSizePt: typography.fontSizePt,
    lineHeight: typography.lineHeight,
    family,
    fidelity,
    warnings,
  };
}
