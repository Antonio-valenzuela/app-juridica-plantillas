import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type DocumentNode } from '@/lib/legal-engine/types';
import { paginateDocument } from '@/app/machotes/components/documentPagination';

describe('paginateDocument', () => {
  it('splits a long single-section generated document into multiple pages', () => {
    const sourceText = 'argumento jurídico con hechos, norma y aplicación. '.repeat(1200);
    const section: DocumentNode = {
      id: 'sec-1',
      type: 'custom',
      title: 'Apartado 1',
      order: 1,
      content: [
        {
          id: 'block-1',
          layer: 'GENERATED_ARGUMENT',
          text: sourceText,
        },
      ],
      children: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: true,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    const document = createEmptyDocument({
      sections: [section],
      originalPageCount: 1,
    });

    const pages = paginateDocument(document, 1750);
    const renderedText = pages
      .flatMap((page) => page.sections)
      .flatMap((pageSection) => pageSection.blocks)
      .map(({ block }) => block.text)
      .join('');

    expect(pages.length).toBeGreaterThan(1);
    expect(renderedText).toBe(sourceText);
    expect(pages.every((page) => page.sections.every(({ section: pageSection }) => pageSection.id === 'sec-1'))).toBe(true);
  });

  it('splits a massive single section named sec-page-1 into multiple pages instead of trapping as 1 page', () => {
    const sourceText = 'DEMANDA O CONTESTACIÓN EXTENSA CON HECHOS Y DERECHO. '.repeat(1500); // ~80,000 chars
    const section: DocumentNode = {
      id: 'sec-page-1',
      type: 'header',
      title: 'Página 1',
      order: 1,
      content: [
        {
          id: 'blk-1',
          layer: 'USER_POSITION',
          text: sourceText,
        },
      ],
      children: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    };
    const document = createEmptyDocument({
      sections: [section],
      originalPageCount: 1,
    });

    const pages = paginateDocument(document, 1750);
    expect(pages.length).toBeGreaterThan(40);
    expect(pages.map((p) => p.pageNumber)).toEqual(Array.from({ length: pages.length }, (_, i) => i + 1));
  });

  it('preserves 1:1 page mapping when uploaded document has multiple sections within page capacity', () => {
    const sections: DocumentNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `sec-page-${i + 1}`,
      type: i === 0 ? 'header' : 'argument',
      title: `Página ${i + 1}`,
      order: i + 1,
      content: [
        {
          id: `blk-${i + 1}`,
          layer: 'USER_POSITION',
          text: `Texto breve de la página física ${i + 1} del documento fuente. `.repeat(10), // ~600 chars
        },
      ],
      children: [],
      isRepeatable: false,
      isEditable: true,
      isGenerated: false,
      isManuallyEdited: false,
      variables: [],
      validationErrors: [],
      validationWarnings: [],
    }));

    const document = createEmptyDocument({
      sections,
      originalPageCount: 5,
    });

    const pages = paginateDocument(document, 1750);
    expect(pages.length).toBe(5);
    expect(pages[0].sections[0].section.id).toBe('sec-page-1');
    expect(pages[4].sections[0].section.id).toBe('sec-page-5');
  });
});
