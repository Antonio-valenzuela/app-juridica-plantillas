import { stableResearchId } from './legal-research/canonical';
import type { ContentBlock, DocumentNode, SourceReference } from './types';
import type {
  ExportRenderModel,
  RenderParagraph,
  RenderProvenance,
  RenderSection,
  RenderRun,
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

      if (region === 'HEADER') header.push(...paragraphs);
      else if (region === 'FOOTER') footer.push(...paragraphs);
      else sections.push(renderSection);

      visit(section.children || [], section.id, depth + 1, sectionOrderPath, region);
    });
  };

  visit(input.document.sections, undefined, 0, [], 'BODY');

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
