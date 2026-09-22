import type { ContentBlock, DocumentNode, UniversalLegalDocument } from '@/lib/legal-engine/types';

export interface PageBlockEntry {
  block: ContentBlock;
  /** ID del bloque real para conservar la edición sobre el documento fuente. */
  sourceBlockId: string;
  /** Rango del bloque real representado por este fragmento virtual. */
  sourceStart: number;
  sourceEnd: number;
}

export interface PageSectionEntry {
  section: DocumentNode;
  text: string;
  blocks: PageBlockEntry[];
}

export interface DocumentPageBreakdown {
  pageNumber: number;
  sections: PageSectionEntry[];
}

function fullBlockEntries(section: DocumentNode): PageBlockEntry[] {
  return section.content.map((block) => ({
    block,
    sourceBlockId: block.id,
    sourceStart: 0,
    sourceEnd: block.text.length,
  }));
}

function pageSectionText(blocks: PageBlockEntry[]): string {
  return blocks.map(({ block }) => block.text).join('\n\n');
}

function findChunkEnd(text: string, start: number, maxLength: number): number {
  const hardEnd = Math.min(text.length, start + maxLength);
  if (hardEnd >= text.length) return hardEnd;

  const minimumUsefulChunk = Math.max(1, Math.floor(maxLength * 0.6));
  const candidates = [
    text.lastIndexOf('\n', hardEnd - 1),
    text.lastIndexOf(' ', hardEnd - 1),
    text.lastIndexOf('\t', hardEnd - 1),
  ];
  const boundary = Math.max(...candidates);
  return boundary >= start + minimumUsefulChunk ? boundary + 1 : hardEnd;
}

function withSectionText(section: PageSectionEntry): PageSectionEntry {
  return { ...section, text: pageSectionText(section.blocks) };
}

/**
 * Builds the editor's physical-page model without changing the legal document.
 * A long section or block is represented by virtual fragments that retain the
 * original section/block IDs and source ranges for safe editing.
 */
export function paginateDocument(
  document: UniversalLegalDocument | null,
  charsPerPage: number
): DocumentPageBreakdown[] {
  if (!document) return [{ pageNumber: 1, sections: [] }];

  const pageCapacity = Math.max(1, Math.floor(charsPerPage));

  // If the document is composed of multiple pre-paginated sections (e.g. from an uploaded PDF)
  // where each section fits comfortably within a physical page (no oversized sections),
  // preserve that 1:1 topology.
  const hasPageSections =
    document.sections.length > 1 &&
    document.sections.every((section) => section.id.startsWith('sec-page-'));
  const allSectionsWithinCapacity =
    hasPageSections &&
    document.sections.every((section) => {
      const charCount = section.content.reduce((sum, b) => sum + (b.text?.length || 0), 0);
      return charCount <= pageCapacity * 1.35;
    });

  if (hasPageSections && allSectionsWithinCapacity) {
    return document.sections.map((section, index) => {
      const blocks = fullBlockEntries(section);
      return {
        pageNumber: index + 1,
        sections: [{ section, text: pageSectionText(blocks), blocks }],
      };
    });
  }

  const pages: DocumentPageBreakdown[] = [];
  let currentPageNumber = 1;
  let currentChars = 0;
  let currentSections: PageSectionEntry[] = [];

  const pushCurrentPage = () => {
    if (currentSections.length === 0) return;
    pages.push({
      pageNumber: currentPageNumber,
      sections: currentSections.map(withSectionText),
    });
    currentPageNumber += 1;
    currentChars = 0;
    currentSections = [];
  };

  const appendBlock = (section: DocumentNode, blockEntry: PageBlockEntry) => {
    const previous = currentSections[currentSections.length - 1];
    if (previous?.section.id === section.id) {
      previous.blocks.push(blockEntry);
      return;
    }
    currentSections.push({ section, text: '', blocks: [blockEntry] });
  };

  for (const section of document.sections) {
    if (section.id.startsWith('sec-page-') && currentSections.length > 0) {
      pushCurrentPage();
    }

    if (section.content.length === 0) {
      if (currentSections.length > 0 && currentChars + 220 > pageCapacity) pushCurrentPage();
      currentSections.push({ section, text: '', blocks: [] });
      currentChars += 220;
      continue;
    }

    for (const block of section.content) {
      if (block.text.length === 0) {
        appendBlock(section, {
          block,
          sourceBlockId: block.id,
          sourceStart: 0,
          sourceEnd: 0,
        });
        continue;
      }

      let offset = 0;
      while (offset < block.text.length) {
        if (currentSections.length > 0 && currentChars >= pageCapacity) pushCurrentPage();

        const available = Math.max(1, pageCapacity - currentChars);
        const end = findChunkEnd(block.text, offset, available);
        const chunk = block.text.slice(offset, end);
        const pageBlock: PageBlockEntry = {
          block: chunk === block.text ? block : { ...block, id: `${block.id}::page-${offset}`, text: chunk },
          sourceBlockId: block.id,
          sourceStart: offset,
          sourceEnd: end,
        };
        appendBlock(section, pageBlock);
        currentChars += chunk.length;
        offset = end;

        if (currentChars >= pageCapacity && offset < block.text.length) pushCurrentPage();
      }
    }
  }

  pushCurrentPage();
  return pages.length > 0 ? pages : [{ pageNumber: 1, sections: [] }];
}
