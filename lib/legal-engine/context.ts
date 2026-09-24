import type { DocumentPage, GeneratedSourceReference, UploadedSourceDocument } from './types';
import {
  markDocumentAsSource,
  markReferenceDocument,
  markTemplateEntity,
  type TemplateCreationIntent,
} from './documentLifecycle';
import { analyzePersonalTemplateText } from '@/lib/templates/personalTemplateBuilder';

export type DocumentSourceInput = Omit<UploadedSourceDocument, 'content' | 'extractedText'> & {
  content?: string;
  extractedText?: string;
  pages?: DocumentPage[];
  sourceValidated: boolean;
};

export interface ContextChunk {
  id: string;
  text: string;
  page: number;
  documentId: string;
  sourceName: string;
}

export interface GenerationContext {
  text: string;
  references: GeneratedSourceReference[];
  chunks: ContextChunk[];
}

export function createSourceDocument(source: DocumentSourceInput): UploadedSourceDocument {
  const pages = source.pages?.length ? source.pages : [{ page: 1, text: source.extractedText || source.content || '', chars: (source.extractedText || source.content || '').length }];
  const extractedText = pages.map((page) => page.text).join('\n\n');
  return markDocumentAsSource({ ...source, pages, extractedText, content: extractedText }, source.id);
}

export type ReferenceDocumentInput = Omit<UploadedSourceDocument, 'content' | 'extractedText' | 'pages' | 'sourceValidated'> & {
  content?: string;
  extractedText?: string;
  pages?: DocumentPage[];
  sourceValidated?: boolean;
};

/** Creates an isolated support document; it is never added to sourceDocuments. */
export function createReferenceDocument(reference: ReferenceDocumentInput): UploadedSourceDocument {
  const pages = reference.pages?.length
    ? reference.pages
    : [{
        page: 1,
        text: reference.extractedText || reference.content || '',
        chars: (reference.extractedText || reference.content || '').length,
      }];
  const extractedText = pages.map((page) => page.text).join('\n\n');
  return markReferenceDocument({ ...reference, pages, extractedText, content: extractedText }, reference.id);
}

export interface ExplicitTemplatePreparationOptions {
  title: string;
  creationIntent: TemplateCreationIntent;
  knownValues?: Record<string, string>;
}

/**
 * Builds a reusable template from sanitized text only. Source identity and
 * case-specific metadata are intentionally not copied into the result.
 */
export function prepareExplicitTemplate(
  source: Pick<UploadedSourceDocument, 'content' | 'extractedText' | 'pages'>,
  options: ExplicitTemplatePreparationOptions,
) {
  if (options.creationIntent !== 'EXPLICIT_TEMPLATE') {
    throw new TypeError('Creating a template requires EXPLICIT_TEMPLATE intent');
  }

  const rawText = source.pages?.length
    ? source.pages.map((page) => page.text).join('\n\n')
    : source.extractedText || source.content || '';
  const analysis = analyzePersonalTemplateText(rawText, {
    knownValues: options.knownValues,
    pageCount: source.pages?.length,
  });
  const structureJson = {
    ...analysis.structureJson,
    sourceMetadata: {
      pageCount: source.pages?.length,
      originalDataRemoved: true as const,
    },
  };

  return markTemplateEntity({
    id: `template-${crypto.randomUUID()}`,
    title: options.title.trim() || 'Plantilla reutilizable',
    content: analysis.parameterizedText,
    originalText: analysis.parameterizedText,
    parameterizedText: analysis.parameterizedText,
    category: analysis.category,
    documentType: analysis.documentType,
    documentTypeLabel: analysis.documentTypeLabel,
    sections: analysis.sections,
    variables: analysis.variables,
    removedData: analysis.removedData,
    styleHints: analysis.styleHints,
    structureJson,
  }, 'user');
}

export function requiresValidatedSources(sources: UploadedSourceDocument[]): boolean {
  // Fail closed: legacy/persisted sources without an explicit validation
  // result must not enter legal generation as if they were ready.
  return sources.some((source) => source.sourceValidated !== true || source.sourceQualityStatus === 'NEEDS_SOURCE_REVIEW');
}

function headingForPage(page: DocumentPage): string {
  const line = page.text.split(/\r?\n/).find((candidate) => candidate.trim().length > 3 && candidate.trim().length < 160);
  return page.heading || line?.trim() || 'Sin encabezado detectado';
}

export function buildAutoContext(source: UploadedSourceDocument, maxChars = 1200): ContextChunk[] {
  const pages = source.pages?.length ? source.pages : [{ page: 1, text: source.extractedText || source.content || '', chars: (source.extractedText || source.content || '').length }];
  const sourceName = source.filename || source.name || 'Documento sin nombre';
  const result: ContextChunk[] = [];
  for (const page of pages) {
    const prefix = `Documento: ${sourceName}\nPágina: ${page.page}\nContexto: ${headingForPage(page)}\n\n`;
    const paragraphs = page.text.split(/\n\s*\n/).filter(Boolean);
    let current = '';
    for (const paragraph of paragraphs.length ? paragraphs : [page.text]) {
      if (current && current.length + paragraph.length > maxChars) {
        result.push({ id: `${source.id}:${page.page}:${result.length}`, text: prefix + current.trim(), page: page.page, documentId: source.id, sourceName });
        current = paragraph;
      } else current += `${current ? '\n\n' : ''}${paragraph}`;
    }
    if (current.trim()) result.push({ id: `${source.id}:${page.page}:${result.length}`, text: prefix + current.trim(), page: page.page, documentId: source.id, sourceName });
  }
  return result;
}

function score(query: string, chunk: ContextChunk): number {
  const terms = query.toLocaleLowerCase('es-MX').match(/[\p{L}\p{N}]{4,}/gu) || [];
  const text = chunk.text.toLocaleLowerCase('es-MX');
  return terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0) + Math.min(chunk.text.length / 10_000, 0.2);
}

export function buildGenerationContext(input: { instruction: string; sources: UploadedSourceDocument[]; sectionTitle?: string; limit?: number }): GenerationContext {
  const chunks = input.sources.flatMap((source) => buildAutoContext(source));
  const query = `${input.instruction} ${input.sectionTitle || ''}`;
  const selected = chunks.map((chunk) => ({ chunk, score: score(query, chunk) })).sort((a, b) => b.score - a.score).slice(0, input.limit || 6);
  return {
    text: selected.map(({ chunk }) => chunk.text).join('\n\n---\n\n'),
    chunks: selected.map(({ chunk }) => chunk),
    references: selected.map(({ chunk, score: relevance }) => ({ documentId: chunk.documentId, page: chunk.page, textSnippet: chunk.text.slice(0, 500), score: relevance, sourceType: 'SOURCE_FACT' })),
  };
}

/**
 * NUEVO: Contexto por bloque jurídico que REUTILIZA el índice ya construido.
 * Evita reconstruir el contexto completo sección por sección.
 * Cada bloque recibe solo el contexto relevante (hechos, normas, texto del bloque).
 */
export function buildBlockGenerationContext(
  block: { title: string; text: string; kind: string; context?: { facts?: string[]; norms?: string[]; jurisprudence?: string[] } },
  index: { fullText: string; elements: Array<{ text: string; pageNumber: number }>; pages: Array<{ page: number; text: string }>; caseNumbers?: string[]; authorities?: string[]; citations?: string[]; legalReferences?: string[]; sourceId: string },
  caseAnalysis?: { proceduralTimeline: Array<{ date: string; event: string }>; caseTheory?: { factualTheory: string; legalTheory: string; constitutionalTheory: string } }
): GenerationContext {
  // Reutilizar scoring pero con query enriquecido del bloque
  const blockQuery = `${block.title} ${block.kind} ${block.text.slice(0, 500)} ${block.context?.norms?.join(' ') || ''} ${caseAnalysis?.caseTheory?.constitutionalTheory || ''}`;

  // Construir chunks una sola vez desde el índice (no desde sources página por página)
  const pseudoSource: UploadedSourceDocument = {
    id: index.sourceId,
    filename: 'documento-indexado',
    pages: index.pages as any,
    extractedText: index.fullText,
    sourceValidated: true,
  } as UploadedSourceDocument;

  const chunks = buildAutoContext(pseudoSource, 1600);
  const selected = chunks.map((chunk) => ({ chunk, score: score(blockQuery, chunk) })).sort((a, b) => b.score - a.score).slice(0, 6);

  // Priorizar también fragmentos que contienen jurisprudencia/normas relevantes al bloque
  const extraRefs: GeneratedSourceReference[] = [];
  if (block.context?.jurisprudence && block.context.jurisprudence.length > 0) {
    extraRefs.push(...block.context.jurisprudence.slice(0, 2).map((j, i) => ({
      documentId: index.sourceId,
      textSnippet: j.slice(0, 500),
      score: 2.5,
      sourceType: 'SOURCE_FACT' as const,
    })));
  }

  return {
    text: selected.map(({ chunk }) => chunk.text).join('\n\n---\n\n'),
    chunks: selected.map(({ chunk }) => chunk),
    references: [
      ...selected.map(({ chunk, score: relevance }) => ({ documentId: chunk.documentId, page: chunk.page, textSnippet: chunk.text.slice(0, 500), score: relevance, sourceType: 'SOURCE_FACT' as const })),
      ...extraRefs,
    ],
  };
}
