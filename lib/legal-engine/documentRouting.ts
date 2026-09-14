import {
  DocumentTemplates,
  DocumentRoutingError,
  type DocumentTemplate,
  resolveTemplateByExplicitLabel,
} from './documentTemplates';
import { getDocumentTypeByValue } from '@/lib/legal-taxonomy';
import { getCatalogDocument } from '@/lib/catalog/legalCatalog';
import { classifyIntent, NEEDS_DOCUMENT_TYPE_SELECTION } from './classifier';
import { normalizeSourceDocumentType, UNKNOWN_SOURCE_DOCUMENT_TYPE, type SourceDocumentTypeValue } from './sourceDocumentTypes';
import { getCanonicalOutputFilename } from './outputFilename';

export type DocumentRoutingErrorCode =
  | 'UNKNOWN_DOCUMENT_TYPE'
  | 'NEEDS_DOCUMENT_TYPE_SELECTION'
  | 'MISSING_STRATEGY'
  | 'MISSING_TEMPLATE_MAPPING'
  | 'DOCUMENT_TYPE_NOT_IMPLEMENTED'
  | 'INCOMPATIBLE_DOCUMENT_ROUTE';

export type DocumentRoutingTemplateSource =
  | 'CANONICAL_ID'
  | 'EXPLICIT_LABEL'
  | 'INFERRED_ID'
  | 'SAFE_FALLBACK';

export interface DocumentRoutingResolution {
  selectedDocumentType?: string;
  sourceDocumentType: SourceDocumentTypeValue;
  resolvedStrategy: string;
  resolvedTemplate: string;
  template: DocumentTemplate;
  templateSource: DocumentRoutingTemplateSource;
  fallbackUsed: boolean;
  outputFilename: string;
}

export interface ResolveDocumentRoutingInput {
  selectedDocumentType?: string;
  inferredDocumentType?: string;
  documentTypeLabel?: string;
  sourceDocumentType?: string;
  outputFilename?: string;
}

/**
 * Estos valores de la taxonomía describen una familia, no un escrito generable.
 * Nunca deben traducirse silenciosamente a una demanda inicial.
 */
const NON_CANONICAL_GENERABLE_IDS = new Set(['amparo_directo', 'amparo_indirecto']);

function normalize(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizedSourceDocumentType(value?: string): SourceDocumentTypeValue {
  return normalizeSourceDocumentType(value) || UNKNOWN_SOURCE_DOCUMENT_TYPE;
}

function outputFilename(value: string | undefined, template: DocumentTemplate): string {
  const requested = String(value || template.tipo);
  const incompatibleWithPostSentence = template.tipo === 'contestacion_revision_extraordinaria_amparo_directo'
    && /demanda\s+(?:de\s+)?amparo\s+(?:directo|indirecto)/i.test(requested);
  const base = String(incompatibleWithPostSentence ? template.etiquetas[0] || template.tipo : requested)
    .trim()
    .replace(/\.(docx|pdf)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim() || template.tipo;
  return `${base}.docx`;
}

function knownDocumentType(id: string): boolean {
  return Boolean(getCatalogDocument(id) || getDocumentTypeByValue(id) || DocumentTemplates[id]);
}

function throwRoutingError(code: DocumentRoutingErrorCode, message: string): never {
  throw new DocumentRoutingError(code, message);
}

function safeFreeWritingFallback(input: ResolveDocumentRoutingInput): DocumentRoutingResolution {
  const template = DocumentTemplates.escrito_libre;
  return {
    sourceDocumentType: normalizedSourceDocumentType(input.sourceDocumentType),
    resolvedStrategy: template.tipo,
    resolvedTemplate: template.tipo,
    template,
    templateSource: 'SAFE_FALLBACK',
    fallbackUsed: true,
    outputFilename: outputFilename(input.outputFilename, template),
  };
}

/**
 * Resuelve una sola ruta documental. Un ID explícito siempre tiene precedencia
 * sobre texto de la fuente, clasificación automática y rótulos derivados.
 *
 * El registro de DocumentTemplates es también el registro de estrategia:
 * cuando el ID existe allí, estrategia y plantilla deben ser exactamente el
 * mismo ID canónico. Si no existe, se aborta; no se adivina otra demanda.
 */
export function resolveDocumentRouting(input: ResolveDocumentRoutingInput): DocumentRoutingResolution {
  const requestedSelected = normalize(input.selectedDocumentType);
  const selectedEntry = getCatalogDocument(requestedSelected);
  const selected = selectedEntry?.kind === 'LEGACY_ALIAS'
    ? selectedEntry.targetId
    : selectedEntry?.kind === 'DOCUMENT_TYPE'
      ? selectedEntry.id
      : requestedSelected;
  const inferred = normalize(input.inferredDocumentType);
  const selectionRequiredId = normalize(NEEDS_DOCUMENT_TYPE_SELECTION);
  const labelClassification = input.documentTypeLabel ? classifyIntent(input.documentTypeLabel) : null;

  if (
    selected === selectionRequiredId
    || inferred === selectionRequiredId
    || (!selected && labelClassification?.documentType === NEEDS_DOCUMENT_TYPE_SELECTION)
  ) {
    return throwRoutingError(
      'NEEDS_DOCUMENT_TYPE_SELECTION',
      'NEEDS_DOCUMENT_TYPE_SELECTION: seleccione el subtipo canónico de la demanda civil o mercantil antes de generar.',
    );
  }

  if (selected) {
    const catalogEntry = getCatalogDocument(selected);
    if (NON_CANONICAL_GENERABLE_IDS.has(selected)) {
      return throwRoutingError(
        'UNKNOWN_DOCUMENT_TYPE',
        `UNKNOWN_DOCUMENT_TYPE: "${selected}" es una familia genérica y no un ID documental generable; seleccione un tipo canónico explícito.`,
      );
    }
    if (!knownDocumentType(selected)) {
      return throwRoutingError(
        'UNKNOWN_DOCUMENT_TYPE',
        `UNKNOWN_DOCUMENT_TYPE: no existe un tipo documental canónico registrado para "${selected}".`,
      );
    }
    const template = DocumentTemplates[selected];
    if (!template) {
      return throwRoutingError(
        'DOCUMENT_TYPE_NOT_IMPLEMENTED',
        `DOCUMENT_TYPE_NOT_IMPLEMENTED: el tipo canónico "${selected}" no tiene strategy/template generable. MISSING_TEMPLATE_MAPPING`,
      );
    }
    return {
      selectedDocumentType: selected,
      sourceDocumentType: normalizedSourceDocumentType(input.sourceDocumentType),
      resolvedStrategy: template.tipo,
      resolvedTemplate: template.tipo,
      template,
      templateSource: 'CANONICAL_ID',
      fallbackUsed: false,
      outputFilename: getCanonicalOutputFilename(selected),
    };
  }

  // Compatibilidad legacy: un rótulo explícito puede resolver un tipo ya
  // soportado, pero jamás puede sobreescribir un selectedDocumentType.
  const normalizedLabel = normalize(input.documentTypeLabel).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalizedLabel === 'amparo directo' || normalizedLabel === 'amparo indirecto') {
    return throwRoutingError(
      'UNKNOWN_DOCUMENT_TYPE',
      `UNKNOWN_DOCUMENT_TYPE: "${input.documentTypeLabel}" es una familia genérica; se requiere un ID canónico de escrito.`,
    );
  }
  const byLabel = resolveTemplateByExplicitLabel(input.documentTypeLabel);
  if (byLabel) {
    return {
      sourceDocumentType: normalizedSourceDocumentType(input.sourceDocumentType),
      resolvedStrategy: byLabel.tipo,
      resolvedTemplate: byLabel.tipo,
      template: byLabel,
      templateSource: 'EXPLICIT_LABEL',
      fallbackUsed: false,
      outputFilename: getCanonicalOutputFilename(byLabel.tipo),
    };
  }

  if (inferred) {
    // Las clasificaciones históricas desconocidas conservan el fallback seguro
    // cuando no hubo selección explícita. Las familias genéricas son distintas:
    // no se pueden convertir en una demanda ni siquiera por compatibilidad.
    if (NON_CANONICAL_GENERABLE_IDS.has(inferred)) {
      return throwRoutingError(
        'UNKNOWN_DOCUMENT_TYPE',
        `UNKNOWN_DOCUMENT_TYPE: el clasificador produjo "${inferred}", que no es un ID documental generable.`,
      );
    }
    if (!knownDocumentType(inferred)) return safeFreeWritingFallback(input);
    const inferredEntry = getCatalogDocument(inferred);
    if (inferredEntry && (inferredEntry.kind === 'FAMILY' || inferredEntry.status !== 'IMPLEMENTED')) {
      return throwRoutingError(
        'DOCUMENT_TYPE_NOT_IMPLEMENTED',
        `DOCUMENT_TYPE_NOT_IMPLEMENTED: el tipo canónico "${inferred}" está catalogado, pero aún no tiene strategy/template generable.`,
      );
    }
    const template = DocumentTemplates[inferred];
    if (!template) return safeFreeWritingFallback(input);
    return {
      sourceDocumentType: normalizedSourceDocumentType(input.sourceDocumentType),
      resolvedStrategy: template.tipo,
      resolvedTemplate: template.tipo,
      template,
      templateSource: 'INFERRED_ID',
      fallbackUsed: false,
      outputFilename: getCanonicalOutputFilename(template.tipo),
    };
  }

  return safeFreeWritingFallback(input);
}
