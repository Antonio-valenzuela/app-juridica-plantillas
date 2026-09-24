import type { DocumentElement, DocumentElementType } from '@/lib/legal-engine/documentIndex';
import { buildDocumentIndex } from '@/lib/legal-engine/documentIndex';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
import { createSourceProvenance } from './provenance';
import type { ExtractionMethod, SourceProvenance } from './types';

export interface SourceUnit {
  unitId: string;
  sourceId: string;
  sourceName?: string;
  sourceType?: string;
  kind: 'PAGE' | 'HEADING' | 'PARAGRAPH' | 'LINE' | 'TABLE' | 'SIGNATURE' | 'HEADER' | 'OTHER';
  text: string;
  page?: number;
  section?: string;
  paragraphIndex?: number;
  elementIndex?: number;
  order: number;
  tableRows?: string[][];
  provenance: SourceProvenance;
}

function sourceUnitKind(type: DocumentElementType): SourceUnit['kind'] {
  switch (type) {
    case 'heading':
      return 'HEADING';
    case 'paragraph':
      return 'PARAGRAPH';
    case 'table':
      return 'TABLE';
    case 'signature':
      return 'SIGNATURE';
    case 'header':
    case 'footer':
      return 'HEADER';
    case 'list':
      return 'LINE';
    case 'page_number':
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

function extractionMethod(type: DocumentElementType): ExtractionMethod {
  switch (type) {
    case 'heading':
      return 'HEADING';
    case 'list':
      return 'BULLET_LIST';
    case 'table':
      return 'TABLE';
    case 'paragraph':
      return 'PARAGRAPH';
    default:
      return 'PATTERN';
  }
}

function confidenceFromElement(element: DocumentElement, fallback: number): number {
  const value = element.confidence ?? fallback;
  return value > 1 ? value / 100 : value;
}

function sourceText(source: UploadedSourceDocument): string {
  if (typeof source.extractedText === 'string') return source.extractedText;
  if (typeof source.content === 'string') return source.content;
  return source.pages?.map((page) => page.text || '').join('\n\n') || '';
}

function mapElement(
  element: DocumentElement,
  source: UploadedSourceDocument,
  sourceIndexConfidence: number,
  order: number,
  paragraphIndex: number,
  section?: string,
): SourceUnit {
  const kind = sourceUnitKind(element.type);
  const excerpt = element.text.trim();
  const extraction = source.sourceQuality?.ocrUsed ? 'OCR' as const : extractionMethod(element.type);
  return {
    unitId: `${source.id}:element:${element.order}`,
    sourceId: source.id,
    ...(source.filename || source.name ? { sourceName: source.filename || source.name } : {}),
    ...(source.type ? { sourceType: source.type } : {}),
    kind,
    text: element.text,
    page: element.pageNumber,
    ...(section ? { section } : {}),
    ...(kind === 'PARAGRAPH' ? { paragraphIndex } : {}),
    elementIndex: element.order,
    order,
    provenance: createSourceProvenance({
      sourceId: source.id,
      sourceType: source.type,
      sourceName: source.filename || source.name,
      page: element.pageNumber,
      section,
      paragraphIndex: kind === 'PARAGRAPH' ? paragraphIndex : undefined,
      elementIndex: element.order,
      excerpt,
      extractionMethod: extraction,
      confidence: confidenceFromElement(element, sourceIndexConfidence),
      inferenceLevel: 'LITERAL',
    }),
  };
}

function fallbackPageUnit(source: UploadedSourceDocument, order: number): SourceUnit | undefined {
  const text = sourceText(source).trim();
  if (!text) return undefined;
  return {
    unitId: `${source.id}:page:1`,
    sourceId: source.id,
    ...(source.filename || source.name ? { sourceName: source.filename || source.name } : {}),
    ...(source.type ? { sourceType: source.type } : {}),
    kind: 'PAGE',
    text,
    page: source.pages?.[0]?.page ?? 1,
    order,
    provenance: createSourceProvenance({
      sourceId: source.id,
      sourceType: source.type,
      sourceName: source.filename || source.name,
      page: source.pages?.[0]?.page ?? 1,
      excerpt: text,
      extractionMethod: source.sourceQuality?.ocrUsed ? 'OCR' : 'PARAGRAPH',
      confidence: 0.3,
      inferenceLevel: 'LITERAL',
    }),
  };
}

export function buildSourceUnits(
  sources: UploadedSourceDocument[],
  options: { referenceText?: string } = {},
): SourceUnit[] {
  const units: SourceUnit[] = [];
  let order = 0;

  for (const source of sources) {
    const index = buildDocumentIndex([source], options);
    let currentSection: string | undefined;
    let paragraphIndex = 0;

    for (const element of index.elements) {
      if (element.type === 'heading') currentSection = element.text.trim();
      if (element.type === 'paragraph') paragraphIndex += 1;
      units.push(mapElement(element, source, index.confidence, order++, paragraphIndex, currentSection));
    }

    if (index.elements.length === 0) {
      const fallback = fallbackPageUnit(source, order);
      if (fallback) {
        units.push(fallback);
        order += 1;
      }
    }
  }

  return units;
}
