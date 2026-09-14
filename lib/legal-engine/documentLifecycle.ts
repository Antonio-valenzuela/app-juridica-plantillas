import { extractUnresolvedFieldMarkers } from './pendingFields';

export const DOCUMENT_ENTITY_KINDS = [
  'SOURCE_DOCUMENT',
  'DRAFT',
  'FINAL_DOCUMENT',
  'TEMPLATE',
  'REFERENCE_DOCUMENT',
] as const;

export type DocumentEntityKind = (typeof DOCUMENT_ENTITY_KINDS)[number];
export type TemplateOriginClass = 'system' | 'user' | 'legacy' | 'test_demo';
export type TemplateCreationIntent = 'EXPLICIT_TEMPLATE';
export type DocumentReadiness = 'DRAFT' | 'REVIEW_REQUIRED' | 'READY_TO_EXPORT';
export type DocumentExportState = DocumentReadiness | 'FINAL_DOCUMENT';

export interface ExplicitLifecycleTransition {
  explicit: true;
}

export interface DocumentLifecycleMetadata {
  entityKind: DocumentEntityKind;
  readiness?: DocumentReadiness;
  originClass?: TemplateOriginClass;
  creationIntent?: TemplateCreationIntent;
  sourceId?: string;
}

export const LIFECYCLE_METADATA_KEY = '__juridicoRadar';

type MarkedDocument<T extends object> = T & {
  [LIFECYCLE_METADATA_KEY]: DocumentLifecycleMetadata;
  lifecycle: DocumentLifecycleMetadata;
};

type PersistableTemplateOriginClass = Exclude<TemplateOriginClass, 'legacy'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isDocumentEntityKind(value: unknown): value is DocumentEntityKind {
  return typeof value === 'string' && (DOCUMENT_ENTITY_KINDS as readonly string[]).includes(value);
}

function isTemplateOriginClass(value: unknown): value is TemplateOriginClass {
  return value === 'system' || value === 'user' || value === 'legacy' || value === 'test_demo';
}

function isAllowedTemplateOriginClass(
  value: unknown,
): value is PersistableTemplateOriginClass {
  return value === 'system' || value === 'user' || value === 'test_demo';
}

function parseDocumentLifecycleMetadata(value: unknown): DocumentLifecycleMetadata | null {
  if (!isRecord(value) || !isDocumentEntityKind(value.entityKind)) return null;

  const allowedKeys = ['entityKind', 'readiness', 'originClass', 'creationIntent', 'sourceId', 'version'];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return null;

  if (hasOwn(value, 'version') && (typeof value.version !== 'number'
    || !Number.isSafeInteger(value.version) || value.version < 1)) {
    return null;
  }

  const originClass = value.originClass;
  if (originClass !== undefined && !isTemplateOriginClass(originClass)) return null;

  const creationIntent = value.creationIntent;
  if (creationIntent !== undefined && creationIntent !== 'EXPLICIT_TEMPLATE') return null;

  const sourceId = value.sourceId;
  if (sourceId !== undefined && typeof sourceId !== 'string') return null;

  const readiness = value.readiness;
  if (readiness !== undefined
    && readiness !== 'DRAFT'
    && readiness !== 'REVIEW_REQUIRED'
    && readiness !== 'READY_TO_EXPORT') return null;

  return {
    entityKind: value.entityKind,
    ...(readiness !== undefined ? { readiness } : {}),
    ...(originClass !== undefined ? { originClass } : {}),
    ...(creationIntent !== undefined ? { creationIntent } : {}),
    ...(sourceId !== undefined ? { sourceId } : {}),
  };
}

function lifecycleRepresentations(value: unknown): unknown[] {
  if (!isRecord(value)) return [];

  const representations: unknown[] = [];
  if (hasOwn(value, LIFECYCLE_METADATA_KEY)) representations.push(value[LIFECYCLE_METADATA_KEY]);
  if (hasOwn(value, 'lifecycle')) representations.push(value.lifecycle);
  return representations;
}

function assertExistingLifecycleMetadataIsReadable(value: unknown): void {
  if (!isRecord(value)) return;

  const canonicalPresent = hasOwn(value, LIFECYCLE_METADATA_KEY);
  const topLevelPresent = hasOwn(value, 'lifecycle');
  if (!canonicalPresent && !topLevelPresent) return;

  const canonical = canonicalPresent
    ? parseDocumentLifecycleMetadata(value[LIFECYCLE_METADATA_KEY])
    : null;
  const topLevel = topLevelPresent
    ? parseDocumentLifecycleMetadata(value.lifecycle)
    : null;

  if ((canonicalPresent && canonical === null) || (topLevelPresent && topLevel === null)) {
    throw new TypeError('Existing document lifecycle metadata is invalid');
  }
  if (canonical && topLevel && !sameLifecycleMetadata(canonical, topLevel)) {
    throw new TypeError('Existing document lifecycle metadata is conflicting');
  }
}

function sameLifecycleMetadata(
  left: DocumentLifecycleMetadata,
  right: DocumentLifecycleMetadata,
): boolean {
  return left.entityKind === right.entityKind
    && left.readiness === right.readiness
    && left.originClass === right.originClass
    && left.creationIntent === right.creationIntent
    && left.sourceId === right.sourceId;
}

function normalizeLifecycleExtra(
  extra: unknown,
): Omit<DocumentLifecycleMetadata, 'entityKind'> {
  if (extra === undefined) return {};
  if (!isRecord(extra)) throw new TypeError('Document lifecycle extra metadata must be an object');

  const { entityKind: _ignoredEntityKind, readiness, originClass, creationIntent, sourceId } = extra;
  if (readiness !== undefined
    && readiness !== 'DRAFT'
    && readiness !== 'REVIEW_REQUIRED'
    && readiness !== 'READY_TO_EXPORT') {
    throw new TypeError(`Invalid document readiness: ${String(readiness)}`);
  }
  if (originClass !== undefined && !isTemplateOriginClass(originClass)) {
    throw new TypeError(`Invalid template origin class: ${String(originClass)}`);
  }
  if (creationIntent !== undefined && creationIntent !== 'EXPLICIT_TEMPLATE') {
    throw new TypeError(`Invalid template creation intent: ${String(creationIntent)}`);
  }
  if (sourceId !== undefined && typeof sourceId !== 'string') {
    throw new TypeError('Document lifecycle sourceId must be a string');
  }

  return {
    ...(readiness !== undefined ? { readiness } : {}),
    ...(originClass !== undefined ? { originClass } : {}),
    ...(creationIntent !== undefined ? { creationIntent } : {}),
    ...(sourceId !== undefined ? { sourceId } : {}),
  };
}

function withDocumentReadiness<T extends object>(value: T, readiness: DocumentReadiness): T {
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = { ...value };
  const generationMetadata = value.generationMetadata;
  if (isRecord(generationMetadata)) {
    next.generationMetadata = { ...generationMetadata, readiness };
  }
  if (value.status === 'draft' || value.status === 'generated' || value.status === 'reviewed' || value.status === 'final') {
    next.status = readiness === 'READY_TO_EXPORT' ? 'reviewed' : 'draft';
  }
  return next as T;
}

function hasUniversalDocumentShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Array.isArray(value.sections) && isRecord(value.generationMetadata);
}

function assertQualityGateAllowsTransition(value: unknown): void {
  if (!hasUniversalDocumentShape(value)) return;

  const qualityGate = isRecord(value.qualityGate) ? value.qualityGate : null;
  if (qualityGate && (qualityGate.passed === false || qualityGate.canMarkAsFinal === false)) {
    throw new TypeError('No se puede marcar READY_TO_EXPORT: el quality gate requiere revisión');
  }

  const validation = isRecord(value.validation) ? value.validation : null;
  if (validation?.isValid === false) {
    throw new TypeError('No se puede marcar READY_TO_EXPORT: la validación documental falló');
  }

  const generationMetadata = value.generationMetadata;
  const preflight = isRecord(generationMetadata)
    && isRecord(generationMetadata.preflight)
    ? generationMetadata.preflight
    : null;
  if (preflight?.status !== undefined && preflight.status !== 'READY') {
    throw new TypeError('No se puede marcar READY_TO_EXPORT: el preflight requiere revisión');
  }
  assertCommercialDocumentGates(value, 'READY_TO_EXPORT');
}

function assertCommercialDocumentGates(value: Record<string, unknown>, target: 'READY_TO_EXPORT' | 'FINAL_DOCUMENT'): void {
  if (value.documentType !== 'demanda_ejecutiva_mercantil') return;
  const metadata = value.generationMetadata as Record<string, unknown>;
  const preflight = isRecord(metadata.preflight) ? metadata.preflight : null;
  const qualityGate = isRecord(value.qualityGate) ? value.qualityGate : null;
  const caseContext = isRecord(value.caseContext) ? value.caseContext : null;
  const context = caseContext && isRecord(caseContext.commercialEnforcement)
    ? caseContext.commercialEnforcement
    : null;
  if (!context || !preflight || preflight.status !== 'READY' || !qualityGate
    || qualityGate.passed !== true || qualityGate.canMarkAsFinal !== true) {
    throw new TypeError('No se puede marcar ' + target + ': la demanda ejecutiva mercantil requiere contexto, preflight READY y quality gate aprobado');
  }
}

function markDocumentEntityInternal<T extends object>(
  value: T,
  entityKind: DocumentEntityKind,
  extra: Omit<DocumentLifecycleMetadata, 'entityKind'> = {},
): MarkedDocument<T> {
  if (!isRecord(value)) {
    throw new TypeError('Document lifecycle value must be an object');
  }
  assertExistingLifecycleMetadataIsReadable(value);

  if (!isDocumentEntityKind(entityKind)) {
    throw new TypeError(`Invalid document entity kind: ${String(entityKind)}`);
  }

  const normalizedExtra = normalizeLifecycleExtra(extra);
  if (entityKind !== 'DRAFT' && normalizedExtra.readiness !== undefined) {
    throw new TypeError('Document readiness solo puede aplicarse a entidades DRAFT');
  }
  if (
    entityKind === 'TEMPLATE'
    && (!isAllowedTemplateOriginClass(normalizedExtra.originClass)
      || normalizedExtra.creationIntent !== 'EXPLICIT_TEMPLATE')
  ) {
    throw new TypeError(
      'TEMPLATE entities require originClass system, user, or test_demo and creationIntent EXPLICIT_TEMPLATE',
    );
  }

  const metadata = { ...normalizedExtra, entityKind };
  return {
    ...value,
    [LIFECYCLE_METADATA_KEY]: metadata,
    lifecycle: metadata,
  } as MarkedDocument<T>;
}

export function markDocumentEntity<T extends object>(
  value: T,
  entityKind: DocumentEntityKind,
  extra: Omit<DocumentLifecycleMetadata, 'entityKind'> = {},
): MarkedDocument<T> {
  if (entityKind === 'FINAL_DOCUMENT') {
    throw new TypeError('FINAL_DOCUMENT requiere una transición explícita del ciclo de vida');
  }
  return markDocumentEntityInternal(value, entityKind, extra);
}

function assertEntityCanBeMarked(
  value: unknown,
  target: DocumentEntityKind,
  allowedExisting: DocumentEntityKind[],
): void {
  const current = readDocumentLifecycle(value)?.entityKind;
  if (current && current !== target && !allowedExisting.includes(current)) {
    throw new TypeError(`Cannot change document lifecycle from ${current} to ${target}`);
  }
}

function assertLegalDocumentCanBeFinal(value: unknown): void {
  // ProfessionalTemplate y otras entidades no documentales también pueden
  // tener un campo `sections`; solo aplicamos este gate al contrato completo
  // de UniversalLegalDocument.
  if (!isRecord(value) || !Array.isArray(value.sections) || !isRecord(value.generationMetadata)) return;

  const sections = value.sections as Array<Record<string, unknown>>;
  const text = sections
    .flatMap((section) => Array.isArray(section.content) ? section.content : [])
    .map((block) => String((block as Record<string, unknown>).text || ''))
    .join('\n');
  const unresolved = extractUnresolvedFieldMarkers(text);
  const caseContext = isRecord(value.caseContext) ? value.caseContext : null;
  const missingFields = [
    ...(Array.isArray(value.missingFields) ? value.missingFields : []),
    ...(caseContext && Array.isArray(caseContext.missingFields) ? caseContext.missingFields : []),
  ].filter(Boolean);
  const anonymizedFields = [
    ...(Array.isArray(value.anonymizedFields) ? value.anonymizedFields : []),
    ...(caseContext && Array.isArray(caseContext.anonymizedFields) ? caseContext.anonymizedFields : []),
  ].filter(Boolean);
  const qualityGate = isRecord(value.qualityGate) ? value.qualityGate : null;
  const preflight = isRecord((value.generationMetadata as Record<string, unknown>).preflight)
    ? (value.generationMetadata as Record<string, unknown>).preflight as Record<string, unknown>
    : null;
  const preflightMissing = preflight && Array.isArray(preflight.missingFields)
    ? preflight.missingFields
    : [];
  const hasPetition = sections.some((section) => section.type === 'petition'
    && Array.isArray(section.content)
    && section.content.some((block) => String((block as Record<string, unknown>).text || '').trim()));
  const invalidSections = sections.some((section) => Array.isArray(section.validationErrors) && section.validationErrors.length > 0);
  const hasDraftingNotes = /(?:nota\s+(?:de\s+elaboraci[óo]n|editorial|interna)|a\s+suprimir\s+antes\s+de\s+la\s+presentaci[óo]n)/i.test(text);

  if (sections.length === 0 || !text.trim() || !hasPetition || invalidSections
    || unresolved.length > 0 || missingFields.length > 0 || anonymizedFields.length > 0
    || (preflight && preflight.status !== 'READY') || preflightMissing.length > 0
    || hasDraftingNotes) {
    throw new TypeError('No se puede marcar FINAL_DOCUMENT: el documento tiene datos pendientes, notas de elaboración, campos anonimizados o contenido incompleto');
  }
  if (qualityGate && qualityGate.canMarkAsFinal === false) {
    throw new TypeError('No se puede marcar FINAL_DOCUMENT: el quality gate no lo permite');
  }
  if (qualityGate && qualityGate.passed === false) {
    throw new TypeError('No se puede marcar FINAL_DOCUMENT: el quality gate requiere revisión');
  }
  assertCommercialDocumentGates(value as Record<string, unknown>, 'FINAL_DOCUMENT');
}

/** Marks a newly received/uploaded document as a source without mutating it. */
export function markDocumentAsSource<T extends object>(
  value: T,
  sourceId?: string,
): MarkedDocument<T> {
  assertEntityCanBeMarked(value, 'SOURCE_DOCUMENT', ['SOURCE_DOCUMENT']);
  return markDocumentEntity(value, 'SOURCE_DOCUMENT', sourceId ? { sourceId } : {});
}

/** Marks a generated or persisted working document as a draft without mutating it. */
export function markDocumentAsDraft<T extends object>(
  value: T,
): MarkedDocument<T> {
  assertEntityCanBeMarked(value, 'DRAFT', ['DRAFT']);
  return markDocumentEntity(value, 'DRAFT');
}

/** Marks a complete draft as requiring professional review after a failed gate. */
export function markDocumentAsReviewRequired<T extends object>(
  value: T,
): MarkedDocument<T> {
  assertEntityCanBeMarked(value, 'DRAFT', ['DRAFT']);
  const next = withDocumentReadiness(value, 'REVIEW_REQUIRED');
  return markDocumentEntityInternal(next, 'DRAFT', { readiness: 'REVIEW_REQUIRED' });
}

/**
 * Explicitly promotes a draft to the only pre-export readiness state.
 * The binary exporters still re-run the complete common guard.
 */
export function markDocumentAsReadyToExport<T extends object>(
  value: T,
  transition?: ExplicitLifecycleTransition,
): MarkedDocument<T> {
  if (!transition || transition.explicit !== true) {
    throw new TypeError('READY_TO_EXPORT requiere una transición explícita del ciclo de vida');
  }
  assertEntityCanBeMarked(value, 'DRAFT', ['DRAFT']);
  assertQualityGateAllowsTransition(value);
  assertLegalDocumentCanBeFinal(value);
  const next = withDocumentReadiness(value, 'READY_TO_EXPORT');
  return markDocumentEntityInternal(next, 'DRAFT', { readiness: 'READY_TO_EXPORT' });
}

/** Marks a document used only as structural or stylistic support. */
export function markReferenceDocument<T extends object>(
  value: T,
  sourceId?: string,
): MarkedDocument<T> {
  assertEntityCanBeMarked(value, 'REFERENCE_DOCUMENT', ['REFERENCE_DOCUMENT']);
  return markDocumentEntity(value, 'REFERENCE_DOCUMENT', sourceId ? { sourceId } : {});
}

/**
 * Promotes a draft only after the caller has supplied an explicit transition.
 * Saving or generating a document never calls this helper implicitly.
 */
export function markDocumentAsFinal<T extends object>(
  value: T,
  transition?: ExplicitLifecycleTransition,
): MarkedDocument<T> {
  if (!transition || transition.explicit !== true) {
    throw new TypeError('FINAL_DOCUMENT requiere una transición explícita del ciclo de vida');
  }
  const current = readDocumentLifecycle(value)?.entityKind;
  if (current !== 'DRAFT') {
    throw new TypeError('FINAL_DOCUMENT can only be reached explicitly from DRAFT');
  }
  if (hasUniversalDocumentShape(value) && readDocumentExportReadiness(value) !== 'READY_TO_EXPORT') {
    throw new TypeError('FINAL_DOCUMENT requiere que el documento esté READY_TO_EXPORT');
  }
  assertLegalDocumentCanBeFinal(value);
  return markDocumentEntityInternal(value, 'FINAL_DOCUMENT');
}

/** Reads the explicit state used by export guards without inferring readiness from source data. */
export function readDocumentExportReadiness(value: unknown): DocumentExportState | null {
  if (!isRecord(value)) return null;

  const lifecycle = readDocumentLifecycle(value);
  if (lifecycle?.entityKind === 'FINAL_DOCUMENT') return 'FINAL_DOCUMENT';
  if (lifecycle?.entityKind === 'DRAFT' && lifecycle.readiness) return lifecycle.readiness;

  // A serialized generationMetadata value is not an authorization to export.
  // READY_TO_EXPORT must be written through the lifecycle transition above.
  if (lifecycle?.entityKind === 'DRAFT') return 'DRAFT';
  if (lifecycle) return null;

  const generationMetadata = value.generationMetadata;
  if (isRecord(generationMetadata)) {
    const readiness = generationMetadata.readiness;
    if (readiness === 'DRAFT' || readiness === 'REVIEW_REQUIRED' || readiness === 'READY_TO_EXPORT') {
      return readiness;
    }
  }

  return null;
}

export function readDocumentLifecycle(value: unknown): DocumentLifecycleMetadata | null {
  if (!isRecord(value)) return null;

  const canonicalPresent = hasOwn(value, LIFECYCLE_METADATA_KEY);
  const topLevelPresent = hasOwn(value, 'lifecycle');
  if (!canonicalPresent && !topLevelPresent) return null;

  const canonical = canonicalPresent
    ? parseDocumentLifecycleMetadata(value[LIFECYCLE_METADATA_KEY])
    : null;
  const topLevel = topLevelPresent
    ? parseDocumentLifecycleMetadata(value.lifecycle)
    : null;

  if ((canonicalPresent && canonical === null) || (topLevelPresent && topLevel === null)) {
    return null;
  }
  if (canonical && topLevel && !sameLifecycleMetadata(canonical, topLevel)) return null;

  return canonical ?? topLevel;
}

export function readDocumentEntityKind(value: unknown): DocumentEntityKind | null {
  return readDocumentLifecycle(value)?.entityKind ?? null;
}

export function markTemplateEntity<T extends object>(
  value: T,
  originClass: PersistableTemplateOriginClass,
): MarkedDocument<T> {
  assertExistingLifecycleMetadataIsReadable(value);

  if (lifecycleRepresentations(value).length > 0) {
    throw new TypeError('Cannot mark an already marked document as a TEMPLATE');
  }

  return markDocumentEntity(value, 'TEMPLATE', {
    originClass,
    creationIntent: 'EXPLICIT_TEMPLATE',
  });
}

export function canCreateTemplate(input: unknown): boolean {
  return isRecord(input)
    && input.entityKind === 'TEMPLATE'
    && input.creationIntent === 'EXPLICIT_TEMPLATE';
}

export function isPersistableLocalTemplate(value: unknown): boolean {
  const lifecycle = readDocumentLifecycle(value);
  return lifecycle?.entityKind === 'TEMPLATE'
    && isAllowedTemplateOriginClass(lifecycle.originClass)
    && lifecycle.creationIntent === 'EXPLICIT_TEMPLATE';
}
