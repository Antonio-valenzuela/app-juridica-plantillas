import { stableResearchId } from './legal-research/canonical';
import type { ContentBlock, DocumentNode, SourceReference } from './types';
import { DRAFT_EXPORT_NOTICE } from './exportModes';
import type {
  ExportRenderModel,
  RenderParagraph,
  RenderProvenance,
  RenderSection,
  RenderRun,
  VerifiedCompatibilityInput,
  VerifiedMaterializationInput,
} from './finalDocumentMaterializationTypes';

type ParagraphRegion = 'BODY' | 'HEADER' | 'FOOTER';

function orderedNodes(nodes: readonly DocumentNode[]): readonly DocumentNode[] {
  return nodes
    .map((node, sourceIndex) => ({ node, sourceIndex }))
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.node.order) ? left.node.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.node.order) ? right.node.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder
        || left.node.id.localeCompare(right.node.id)
        || left.sourceIndex - right.sourceIndex;
    })
    .map(({ node }) => node);
}

function sourceReferenceIdentity(source: SourceReference): string {
  return [
    source.documentId,
    source.page,
    source.paragraph,
    source.textSnippet,
  ].map((value) => value === undefined ? '' : String(value)).join('|');
}

function blockRole(sectionType: string, block: ContentBlock): RenderParagraph['role'] {
  if (sectionType === 'header' || sectionType === 'page-header') return 'HEADER';
  if (sectionType === 'page-footer' || sectionType === 'footer') return 'FOOTER';
  if (sectionType === 'signature' || sectionType === 'closing') return 'SIGNATURE';
  if (block.generationRequirement === 'DETERMINISTIC' && sectionType === 'petition') return 'LIST';
  return 'BODY';
}

function paragraphRegion(sectionType: string, inherited: ParagraphRegion): ParagraphRegion {
  if (sectionType === 'header' || sectionType === 'page-header') return 'HEADER';
  if (sectionType === 'page-footer' || sectionType === 'footer') return 'FOOTER';
  return inherited;
}

function renderRun(block: ContentBlock): RenderRun {
  const style = block.style;
  const bold = style?.fontWeight === 'bold' || style?.fontWeight === '700';
  const italic = style?.fontStyle === 'italic';
  const underline = typeof style?.textDecoration === 'string'
    && style.textDecoration.toLowerCase().includes('underline');
  return {
    text: block.text,
    ...(bold ? { bold: true } : {}),
    ...(italic ? { italic: true } : {}),
    ...(underline ? { underline: true } : {}),
  };
}

function renderProvenance(
  documentId: string,
  verificationMode: VerifiedMaterializationInput['verificationMode'],
  sectionId: string,
  parentSectionId: string | undefined,
  block: ContentBlock,
): RenderProvenance {
  const sources = Array.isArray(block.sources) ? block.sources : [];
  return {
    documentId,
    verificationMode,
    sectionId,
    ...(parentSectionId ? { parentSectionId } : {}),
    blockId: block.id,
    generationTaskId: block.generationTaskId || block.taskId,
    coverageItemIds: [...(block.coverageItemIds || [])],
    legalIssueIds: [...(block.legalIssueIds || [])],
    sourceDocumentIds: sources.map((source) => source.documentId),
    sourceRefs: sources.map(sourceReferenceIdentity),
    manualEdit: block.isManuallyEdited === true,
  };
}

function renderParagraph(
  documentId: string,
  verificationMode: VerifiedMaterializationInput['verificationMode'],
  section: DocumentNode,
  parentSectionId: string | undefined,
  sectionOrderPath: readonly number[],
  block: ContentBlock,
  blockIndex: number,
): RenderParagraph {
  return {
    id: block.id,
    text: block.text,
    runs: [renderRun(block)],
    role: blockRole(section.type, block),
    style: { ...(block.style || {}) },
    orderPath: [...sectionOrderPath, blockIndex],
    keepNext: false,
    keepTogether: section.type === 'signature' || section.type === 'closing',
    pageBreakBefore: false,
    provenance: renderProvenance(documentId, verificationMode, section.id, parentSectionId, block),
  };
}

/** Renglones que sí corren en el encabezado de cada página: el número de expediente/toca. */
const RUNNING_HEADER_LINE = /^\s*(?:expediente|exp\.|toca)\b/i;

/**
 * El rubro de un escrito («C. JUEZ… PRESENTE.», asunto, expediente) NO es un encabezado de página.
 * El destinatario y el asunto se imprimen una sola vez al inicio del cuerpo; solo el número de
 * expediente corre en el encabezado de cada hoja (junto al rótulo de borrador).
 */
function splitRubroParagraph(paragraph: RenderParagraph): { running?: RenderParagraph; addressee?: RenderParagraph } {
  const lines = paragraph.text.split(/\n/);
  const running = lines.filter((line) => RUNNING_HEADER_LINE.test(line));
  const addressee = lines.filter((line) => !RUNNING_HEADER_LINE.test(line) && line.trim());
  const withText = (text: string, role: RenderParagraph['role'], suffix: string): RenderParagraph => ({
    ...paragraph,
    id: `${paragraph.id}${suffix}`,
    text,
    runs: paragraph.runs.length === 1 ? [{ ...paragraph.runs[0], text }] : [{ text }],
    role,
    style: role === 'BODY' ? { ...paragraph.style, textAlign: 'left' } : paragraph.style,
  });
  return {
    ...(running.length > 0 ? { running: withText(running.join('\n'), 'HEADER', '-running') } : {}),
    ...(addressee.length > 0 ? { addressee: withText(addressee.join('\n'), 'BODY', '-addressee') } : {}),
  };
}

function materializationDocumentFingerprint(input: VerifiedMaterializationInput): string {
  if (input.verificationMode === 'RICH_ASSEMBLY') return input.assembly.trace.outputFingerprint;
  return stableResearchId('document', {
    documentId: input.document.id,
    documentType: input.document.documentType,
    title: input.document.title,
  });
}

export function materializePreparedFinalDocument(
  input: VerifiedMaterializationInput,
): ExportRenderModel {
  const header: RenderParagraph[] = [];
  const sections: RenderSection[] = [];
  const footer: RenderParagraph[] = [];

  const visit = (
    nodes: readonly DocumentNode[],
    parentSectionId: string | undefined,
    depth: number,
    parentOrderPath: readonly number[],
    inheritedRegion: ParagraphRegion,
  ): void => {
    orderedNodes(nodes).forEach((section) => {
      const sectionOrderPath = [...parentOrderPath, section.order];
      const region = paragraphRegion(section.type, inheritedRegion);
      const paragraphs = section.content.map((block, blockIndex) => renderParagraph(
          input.document.id,
          input.verificationMode,
          section,
          parentSectionId,
          sectionOrderPath,
          block,
          blockIndex,
        ));
      const renderSection: RenderSection = {
        id: section.id,
        ...(parentSectionId ? { parentId: parentSectionId } : {}),
        title: section.title,
        type: section.type,
        depth,
        orderPath: sectionOrderPath,
        paragraphs,
      };

      if (region === 'HEADER' && section.type === 'header') {
        // Rubro del escrito: destinatario/asunto una vez en el cuerpo; expediente en el encabezado corriente.
        const addressees: RenderParagraph[] = [];
        for (const paragraph of paragraphs) {
          const split = splitRubroParagraph(paragraph);
          if (split.running) header.push(split.running);
          if (split.addressee) addressees.push(split.addressee);
        }
        if (addressees.length > 0) {
          sections.push({ ...renderSection, title: '', paragraphs: addressees });
        }
      }
      else if (region === 'HEADER') header.push(...paragraphs);
      else if (region === 'FOOTER') footer.push(...paragraphs);
      else sections.push(renderSection);

      visit(section.children || [], section.id, depth + 1, sectionOrderPath, region);
    });
  };

  visit(input.document.sections, undefined, 0, [], 'BODY');

  if (input.document.generationMetadata.exportMode === 'DRAFT') {
    header.unshift({
      id: `draft-export-notice-${input.document.id}`,
      text: input.document.generationMetadata.exportNotice || DRAFT_EXPORT_NOTICE,
      runs: [{ text: input.document.generationMetadata.exportNotice || DRAFT_EXPORT_NOTICE, bold: true }],
      role: 'HEADER',
      style: { fontWeight: 'bold', textAlign: 'center' },
      orderPath: [-1],
      keepNext: true,
      keepTogether: true,
      pageBreakBefore: false,
      provenance: {
        documentId: input.document.id,
        verificationMode: input.verificationMode,
        coverageItemIds: [],
        legalIssueIds: [],
        sourceDocumentIds: [],
        sourceRefs: [],
        manualEdit: false,
      },
    });
  }

  const semanticPayload = {
    documentId: input.document.id,
    documentType: input.document.documentType,
    title: input.document.title,
    header,
    sections,
    footer,
  };
  const materializationFingerprint = stableResearchId('materialization', semanticPayload);

  return {
    schemaVersion: 'fase7-v1',
    documentId: input.document.id,
    documentType: input.document.documentType,
    title: input.document.title,
    header,
    sections,
    footer,
    documentFingerprint: materializationDocumentFingerprint(input),
    materializationFingerprint,
  };
}

/**
 * Render preview used only by the extended-generation page budget.
 * It deliberately does not bypass final export gates; those still run in
 * exportUniversalToPdf/exportUniversalToDocx. This helper only materializes
 * the same semantic model so page measurement cannot diverge from rendering.
 */
export function materializeDocumentForPageMeasurement(
  document: import('./types').UniversalLegalDocument,
): ExportRenderModel {
  return materializePreparedFinalDocument({
    verificationMode: 'COMPATIBILITY',
    document,
    compatibility: {
      status: 'COMPATIBLE',
      compatibilityStatus: 'NO_SOURCE_REQUIRED',
      selectedDocumentType: document.documentType,
    },
    exportValidation: {} as VerifiedCompatibilityInput['exportValidation'],
    lifecycleValid: true,
    requiredStructuralChecksPass: true,
  });
}

/**
 * Renderer boundary: section titles are semantic headings, not block text.
 * Both binary exporters use this projection so prepared models keep their
 * existing block fidelity while headings become visible in DOCX/PDF output.
 */
export function renderableBodyParagraphs(model: ExportRenderModel): readonly RenderParagraph[] {
  return model.sections.flatMap((section) => {
    if (!section.paragraphs.some((paragraph) => paragraph.role !== 'SPACER' && paragraph.text.trim().length > 0)) {
      return [];
    }
    const first = section.paragraphs[0];
    const heading: RenderParagraph = {
      id: `heading-${section.id}`,
      text: section.title,
      runs: [{ text: section.title, bold: true }],
      role: 'TITLE',
      headingLevel: section.depth === 0 ? 1 : 2,
      style: { fontWeight: 'bold' },
      orderPath: [...section.orderPath, -1],
      keepNext: true,
      keepTogether: true,
      pageBreakBefore: false,
      provenance: first?.provenance || {
        documentId: model.documentId,
        verificationMode: 'COMPATIBILITY',
        sectionId: section.id,
        coverageItemIds: [],
        legalIssueIds: [],
        sourceDocumentIds: [],
        sourceRefs: [],
        manualEdit: false,
      },
    };
    return [heading, ...section.paragraphs.flatMap(legalBodyParagraphs)];
  });
}

/** Sangría de primera línea del cuerpo del escrito (≈1.25 cm a 10–12 pt). */
const BODY_FIRST_LINE_INDENT = '3em';
/** Rótulo inicial que va en negritas: "HECHO 3.—", "PRESTACIÓN B).—", "CONTESTACIÓN:", "PRIMERO.", "PUNTOS PETITORIOS:". */
const LEAD_LABEL_RE = /^((?:HECHO|PRESTACI[ÓO]N|AGRAVIO|CONCEPTO\s+DE\s+VIOLACI[ÓO]N)\s+[0-9A-ZÁÉÍÓÚÑ]{1,6}\)?\.?\s*—|CONTESTACI[ÓO]N(?:\s*\([^)]{1,80}\))?:|(?:PRIMER[OA]?|SEGUND[OA]|TERCER[OA]?|CUART[OA]|QUINT[OA]|SEXT[OA]|S[ÉE]PTIM[OA]|OCTAV[OA]|NOVEN[OA]|D[ÉE]CIM[OA](?:\s+\w+)?)\s*\.-?|[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,/]{2,60}:)(?=\s|$)/;

function isUppercaseHeadingLine(line: string): boolean {
  const letters = line.match(/[A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g) || [];
  if (letters.length < 3 || line.length > 90 || LEAD_LABEL_RE.test(line)) return false;
  const upper = letters.filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
  return upper / letters.length >= 0.9;
}

/**
 * Formato forense del cuerpo, idéntico en DOCX y PDF: un bloque con saltos de
 * línea se divide en párrafos independientes, justificados y con sangría de
 * primera línea; los rótulos van en negritas y los subtítulos en mayúsculas en
 * negritas sin sangría. Así se evita justificar renglones con salto manual y el
 * escrito deja de exportarse como un único párrafo alineado a la izquierda.
 * Los bloques con formato propio (runs en negritas/cursivas, otra alineación o
 * sangría) se conservan sin cambios.
 */
function legalBodyParagraphs(paragraph: RenderParagraph): RenderParagraph[] {
  if (paragraph.role !== 'BODY') return [paragraph];
  const style = paragraph.style || {};
  if ((style.textAlign && style.textAlign !== 'justify') || style.indent || style.firstLineIndent) return [paragraph];
  if (paragraph.runs.some((run) => run.bold || run.italic || run.underline)) return [paragraph];
  const lines = paragraph.text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [paragraph];
  return lines.map((line, index) => {
    const heading = isUppercaseHeadingLine(line);
    const label = heading ? undefined : line.match(LEAD_LABEL_RE)?.[1];
    const runs: RenderParagraph['runs'] = heading
      ? [{ text: line, bold: true }]
      : label
        ? [{ text: label, bold: true }, ...(line.length > label.length ? [{ text: line.slice(label.length) }] : [])]
        : [{ text: line }];
    return {
      ...paragraph,
      id: lines.length === 1 ? paragraph.id : `${paragraph.id}:p${index + 1}`,
      text: line,
      runs,
      style: heading
        ? { ...style, textAlign: 'left', fontWeight: 'bold' }
        : { ...style, textAlign: 'justify', firstLineIndent: BODY_FIRST_LINE_INDENT },
      keepNext: heading || (index === lines.length - 1 ? paragraph.keepNext : false),
      pageBreakBefore: index === 0 ? paragraph.pageBreakBefore : false,
    };
  });
}
