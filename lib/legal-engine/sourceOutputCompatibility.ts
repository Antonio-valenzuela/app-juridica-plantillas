import { getCatalogDocument, LEGAL_CATALOG_REGISTRY, LEGACY_DOCUMENT_IDENTIFIER_IDS } from '@/lib/catalog/legalCatalog';
import type { SourceCompatibilityDeclaration } from '@/lib/catalog/legalCatalog';
import type { UploadedSourceDocument } from './types';
import {
  SOURCE_DOCUMENT_TYPES,
  NO_SOURCE_DOCUMENT,
  SOURCE_TYPE_UNKNOWN,
  UNKNOWN_SOURCE_DOCUMENT_TYPE,
  normalizeSourceDocumentType,
  sourceDocumentMatter,
  type InferredSourceDocumentType,
  type SourceDocumentType,
  type SourceDocumentTypeValue,
} from './sourceDocumentTypes';
import { isCivilMercantileResponseDocumentType } from './responseContext';
import { isCivilMercantileEvidenceArgumentDocumentType } from './evidenceArgumentContext';
import { isAmparoDocumentType } from './caseContext';

export { SOURCE_TYPE_UNKNOWN } from './sourceDocumentTypes';

export const SOURCE_DOCUMENT_INCOMPATIBLE = 'SOURCE_DOCUMENT_INCOMPATIBLE' as const;
export const EXTRACTION_INCOMPLETE = 'EXTRACTION_INCOMPLETE' as const;
export const MISSING_SOURCE_COMPATIBILITY_RULE = 'MISSING_SOURCE_COMPATIBILITY_RULE' as const;
export const DOCUMENT_TYPE_NOT_IMPLEMENTED = 'DOCUMENT_TYPE_NOT_IMPLEMENTED' as const;

export const SOURCE_COMPATIBILITY_STATUSES = [
  'EXPLICIT_COMPATIBILITY',
  'ACCEPTS_ANY_SOURCE_INTENTIONALLY',
  'NO_SOURCE_REQUIRED',
  'UNSUPPORTED_DOCUMENT_TYPE',
] as const;

export type SourceCompatibilityStatus = (typeof SOURCE_COMPATIBILITY_STATUSES)[number];

export const DEMAND_CONTESTATION_SOURCE_TYPES = SOURCE_DOCUMENT_TYPES.filter((type) =>
  sourceDocumentMatter(type) === 'CIVIL' || sourceDocumentMatter(type) === 'MERCANTIL',
) as SourceDocumentType[];

export const COMMERCIAL_ENFORCEMENT_SOURCE_TYPES = [
  'PAGARE',
  'TITULO_CREDITO',
  'CONVENIO_MERCANTIL',
  'DOCUMENTO_MERCANTIL_BASE',
  'REQUERIMIENTO_MERCANTIL',
  'ESTADO_CUENTA_MERCANTIL',
  'COMUNICACION_MERCANTIL',
  'PAGO_MERCANTIL',
  'DOCUMENTO_MERCANTIL_AUXILIAR',
] as const satisfies readonly SourceDocumentType[];

const COMMERCIAL_ENFORCEMENT_SOURCE_POLICY = explicitPolicy(
  'demanda_ejecutiva_mercantil',
  COMMERCIAL_ENFORCEMENT_SOURCE_TYPES,
  {
    sourceRequired: true,
    matterId: 'mercantil',
    procedureId: 'mercantil_ejecutivo',
    sourceRequirementLabel: 'documento base mercantil compatible',
    incompatibleMatterRules: [
      { matter: 'civil', reason: 'Una fuente civil no puede controlar una demanda ejecutiva mercantil.' },
      { matter: 'laboral', reason: 'Una fuente laboral no puede controlar una demanda ejecutiva mercantil.' },
      { matter: 'penal', reason: 'Una fuente penal no puede controlar una demanda ejecutiva mercantil.' },
      { matter: 'amparo', reason: 'Una fuente de amparo no puede controlar una demanda ejecutiva mercantil.' },
      { matter: 'administrativo', reason: 'Una fuente administrativa no puede controlar una demanda ejecutiva mercantil.' },
    ],
  },
);

export function getCommercialEnforcementSourceCompatibilityPolicy(): SourceOutputCompatibilityPolicy {
  return COMMERCIAL_ENFORCEMENT_SOURCE_POLICY;
}

export interface SourceAnalysisForCompatibility {
  numberedFacts?: unknown[];
  complaintFacts?: unknown[];
  sourceClaims?: unknown[];
  complaintClaims?: unknown[];
}

export interface SourceCompatibilityMatterRule {
  matter: string;
  reason: string;
}

export interface SourceOutputCompatibilityPolicy {
  selectedDocumentType: string;
  status: SourceCompatibilityStatus;
  matterId?: string;
  procedureId?: string;
  acceptedSourceTypes: readonly SourceDocumentType[];
  optionalSourceTypes: readonly SourceDocumentType[];
  sourceRequired: boolean;
  incompatibleMatterRules: readonly SourceCompatibilityMatterRule[];
  requiresFactAndClaimExtraction?: boolean;
  sourceRequirementLabel?: string;
}

export type SourceOutputCompatibilityRuleMap = Readonly<Record<string, SourceOutputCompatibilityPolicy>>;

export interface SourceOutputCompatibilityInput {
  selectedDocumentType?: string;
  sourceDocuments: UploadedSourceDocument[];
  sourceMatter?: string;
  sourceAnalysis?: SourceAnalysisForCompatibility;
}

export interface SourceOutputCompatibilityMetadata {
  selectedDocumentType: string;
  sourceDocumentType: SourceDocumentTypeValue;
  sourceMatter: string;
  requiredSourceTypes: string[];
  acceptedSourceTypes: string[];
  optionalSourceTypes: string[];
  sourceRequired: boolean;
  compatibilityStatus: SourceCompatibilityStatus;
}

export interface SourceOutputCompatibilityResult extends SourceOutputCompatibilityMetadata {
  status: 'COMPATIBLE' | 'NEEDS_INPUT' | 'NOT_APPLICABLE';
  code?: typeof EXTRACTION_INCOMPLETE | typeof SOURCE_TYPE_UNKNOWN;
  missingRequirements: string[];
  sources?: SourceCompatibilitySourceResult[];
}

export type SourceCompatibilitySourceStatus =
  | 'COMPATIBLE'
  | 'REFERENCE_ONLY'
  | 'NEEDS_INPUT'
  | 'INCOMPATIBLE';

export interface SourceCompatibilitySourceResult {
  id: string;
  sourceType: SourceDocumentTypeValue;
  sourceMatter: string;
  role: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE' | 'UNSPECIFIED';
  status: SourceCompatibilitySourceStatus;
  controlsOutput: boolean;
}

export class SourceDocumentIncompatibleError extends Error {
  readonly code = SOURCE_DOCUMENT_INCOMPATIBLE;
  readonly metadata: SourceOutputCompatibilityMetadata;

  constructor(metadata: SourceOutputCompatibilityMetadata) {
    super(formatSourceDocumentIncompatibilityMessage(metadata));
    this.name = 'SourceDocumentIncompatibleError';
    this.metadata = metadata;
  }
}

export class MissingSourceCompatibilityRuleError extends Error {
  readonly code = MISSING_SOURCE_COMPATIBILITY_RULE;
  readonly selectedDocumentType: string;

  constructor(selectedDocumentType: string) {
    super(`${MISSING_SOURCE_COMPATIBILITY_RULE}: no existe una regla explícita para "${selectedDocumentType}".`);
    this.name = 'MissingSourceCompatibilityRuleError';
    this.selectedDocumentType = selectedDocumentType;
  }
}

export class DocumentTypeNotImplementedError extends Error {
  readonly code = DOCUMENT_TYPE_NOT_IMPLEMENTED;
  readonly selectedDocumentType: string;

  constructor(selectedDocumentType: string) {
    super(`${DOCUMENT_TYPE_NOT_IMPLEMENTED}: "${selectedDocumentType}" no tiene strategy/template generable.`);
    this.name = 'DocumentTypeNotImplementedError';
    this.selectedDocumentType = selectedDocumentType;
  }
}

function normalize(value: string | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeId(value: string | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function sourceText(sourceDocuments: UploadedSourceDocument[]): string {
  return sourceDocuments
    .flatMap((source) => source.pages?.map((page) => page.text) || [source.extractedText || source.content || ''])
    .join('\n');
}

function classificationDocuments(sourceDocuments: UploadedSourceDocument[]): UploadedSourceDocument[] {
  const nonReference = sourceDocuments.filter((source) => sourceRoleFor(source) !== 'REFERENCE');
  if (nonReference.length === 0) return [];
  const primary = nonReference.filter((source) => sourceRoleFor(source) === 'PRIMARY');
  if (primary.length > 0) return primary;
  const supporting = nonReference.filter((source) => sourceRoleFor(source) === 'SUPPORTING');
  return supporting.length > 0 ? supporting : nonReference;
}

function matterLabel(value: string | undefined): string {
  const normalized = normalize(value);
  if (/mercantil/.test(normalized)) return 'MERCANTIL';
  if (/^(?:materia\s+)?laboral$/.test(normalized)) return 'LABORAL';
  if (/administrativ/.test(normalized)) return 'ADMINISTRATIVA';
  if (/familiar/.test(normalized)) return 'FAMILIAR';
  if (/civil/.test(normalized)) return 'CIVIL';
  if (/amparo|constitucional/.test(normalized)) return 'AMPARO';
  return value?.trim() ? value.trim().toUpperCase() : 'NO_IDENTIFICADA';
}

const LABOR_INDICATOR_PATTERNS: readonly RegExp[] = [
  /\blaboral(?:es)?\b/,
  /\btrabajador(?:a|es|as)?\b/,
  /\bpatron(?:es)?\b/,
  /\bdespid(?:o|io|ieron|e|en|ido|ida)\b/,
  /\bsalari(?:o|os)\b/,
  /\bprestacion(?:es)?\s+laboral(?:es)?\b/,
  /\bmateria\s+laboral\b/,
  /\brelacion\s+(?:laboral|de\s+trabajo)\b/,
  /\bcontrato\s+(?:individual\s+)?de\s+trabajo\b/,
  /\blaudo\b/,
];

function laborIndicatorScore(corpus: string): number {
  return LABOR_INDICATOR_PATTERNS.filter((pattern) => pattern.test(corpus)).length;
}

function laborMatterForCorpus(corpus: string, layout: string): boolean {
  const opening = layout.split('\n').slice(0, 20).join('\n').slice(0, 1200);
  const explicitLaborHeading =
    /\b(?:demanda|escrito\s+inicial)\b[^\n]{0,80}\blaboral(?:es)?\b/.test(opening)
    || /\bmateria\s+laboral\b/.test(opening);
  if (explicitLaborHeading) return true;
  const explicitNonLaborHeading = /\b(?:civil|mercantil|familiar|administrativ)\b/.test(opening);
  return !explicitNonLaborHeading && laborIndicatorScore(corpus) >= 2;
}

function normalizeWithLines(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

function hasPrimaryDemandStructure(corpus: string, layout: string): boolean {
  const opening = layout.split('\n').slice(0, 12).join('\n').slice(0, 600);
  const demandHeading = /(?:^|\n)\s*(?:demanda|escrito\s+inicial)(?:\s+(?:ordinaria|extraordinaria|de|laboral|civil|mercantil|contenciosa))?\b/.test(opening);
  if (!demandHeading) return false;
  const initiation = /\b(?:vengo\s+a\s+(?:demandar|promover|ejercer)|promuevo\s+(?:demanda|juicio)|interpongo\s+(?:demanda|accion)|demando)\b/.test(corpus);
  const pleadingStructure = /\b(?:hechos|puntos\s+petitorios|prestaciones|pretensiones)\b/.test(corpus);
  const forum = /\b(?:juez|juzgado)\s+de\b/.test(corpus) || /\bh\.\s*tribunal\b/.test(corpus);
  const substantiveMatter = laborIndicatorScore(corpus) >= 2 || /\b(?:civil|mercantil|familiar)\b/.test(opening);
  return initiation || pleadingStructure || forum || substantiveMatter;
}

export function inferSourceOutputType(
  sourceDocuments: UploadedSourceDocument[],
  sourceMatter?: string,
): InferredSourceDocumentType {
  const classifiedDocuments = classificationDocuments(sourceDocuments);
  const corpus = normalize(sourceText(classifiedDocuments));
  const layout = normalizeWithLines(sourceText(classifiedDocuments));
  const explicitType = classifiedDocuments
    .map((source) => source.classification?.sourceDocumentType || source.classification?.documentType)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  // Una clasificación explícita desconocida debe permanecer desconocida. No
  // se sustituye por una conjetura textual que pueda abrir otra ruta.
  if (explicitType) return normalizeSourceDocumentType(explicitType) || UNKNOWN_SOURCE_DOCUMENT_TYPE;
  const labor = laborMatterForCorpus(corpus, layout) || matterLabel(sourceMatter) === 'LABORAL';
  const mercantile = /mercantil|juicio\s+(?:ejecutivo|ordinario)\s+mercantil/.test(corpus);
  const familiar = /familiar|alimentos|divorcio|custodia/.test(corpus) || matterLabel(sourceMatter) === 'FAMILIAR';
  const civil = /\bcivil\b/.test(corpus) || matterLabel(sourceMatter) === 'CIVIL' || familiar;
  const hasInitialWriting = /escrito\s+inicial/.test(corpus);

  // La estructura primaria del escrito controla las menciones incidentales de
  // sentencias, ejecutorias o amparos citados dentro de una demanda.
  if (hasPrimaryDemandStructure(corpus, layout)) {
    const opening = layout.split('\n').slice(0, 12).join('\n').slice(0, 600);
    if (/\b(?:demanda|escrito\s+inicial)\b[^\n]{0,80}\bamparo\s+directo\b/.test(opening)
      || /\bjuicio\s+de\s+amparo\s+directo\b/.test(opening)) {
      return 'DEMANDA_AMPARO_DIRECTO';
    }
    if (/\b(?:demanda|escrito\s+inicial)\b[^\n]{0,80}\bamparo\b/.test(opening)) {
      return 'DEMANDA_AMPARO';
    }
    if (hasInitialWriting && labor) return 'ESCRITO_INICIAL_LABORAL';
    if (hasInitialWriting && mercantile) return 'ESCRITO_INICIAL_MERCANTIL';
    if (hasInitialWriting && civil) return 'ESCRITO_INICIAL_CIVIL';
    if (labor) return 'DEMANDA_LABORAL';
    if (mercantile) return 'DEMANDA_MERCANTIL';
    if (civil) return 'DEMANDA_CIVIL';
    return 'DEMANDA';
  }
  // Una simple referencia a un número de amparo dentro de una réplica no
  // convierte el escrito en una sentencia. La ruta de sentencia exige, además
  // del encabezado, señales documentales propias de una resolución.
  const hasAmparoDirectoHeading =
    /\bamparo\s+directo\s*[:\-]\s*\d/.test(corpus) ||
    /\bamparo\s+directo\s+n[uú]mero\b/.test(corpus) ||
    /\bjuicio\s+de\s+amparo\s+directo\b/.test(corpus);
  const hasAmparoResolutionMarkers = /\b(tribunal\s+colegiado|magistrado\s+ponente|secretar|visto|resultando|considerando|resolutiv)\b/.test(corpus);
  if (
    (hasAmparoDirectoHeading && hasAmparoResolutionMarkers) ||
    (/\bamparo\s+directo\b/.test(corpus) && hasAmparoResolutionMarkers)
  ) {
    return 'SENTENCIA_AMPARO_DIRECTO';
  }
  if (/\b(?:replica|réplica)\b/.test(corpus)) return 'REPLICA';
  if (/\bduplica\b/.test(corpus)) return 'DUPLICA';
  if (/contestacion\s+de\s+(?:la\s+)?demanda/.test(corpus)) return 'CONTESTACION_DEMANDA';
  if (/resolucion\s+administrativa|acto\s+administrativo/.test(corpus)) return 'RESOLUCION_ADMINISTRATIVA';

  if (/\b(sentencia|ejecutoria|resolucion)\b/.test(corpus)) {
    if (/\bamparo\s+directo\b/.test(corpus)) return 'SENTENCIA_AMPARO_DIRECTO';
    if (/\bamparo\b/.test(corpus)) return 'SENTENCIA_AMPARO';
    return 'SENTENCIA_O_RESOLUCION';
  }

  if (/\blaudo\b/.test(corpus)) return 'LAUDO';
  if (/\b(?:acuerdo|auto)\b/.test(corpus)) return 'ACUERDO';
  if (/acto\s+reclamado|acto\s+de\s+autoridad/.test(corpus)) return 'ACTO_DE_AUTORIDAD';
  if (/convenio\s+mercantil/.test(corpus)) return 'CONVENIO_MERCANTIL';
  if (/contrato\s+civil/.test(corpus)) return 'CONTRATO_CIVIL';
  if (/convenio\s+(?:civil|familiar|de\s+divorcio)|\bconvenio\b/.test(corpus)) return 'CONVENIO_CIVIL';
  if (/requerimiento\s+civil/.test(corpus)) return 'REQUERIMIENTO_CIVIL';
  if (/comunicaci[oó]n\s+civil/.test(corpus)) return 'COMUNICACION_CIVIL';
  if (/prueba\s+documental\s+civil/.test(corpus)) return 'PRUEBA_DOCUMENTAL_CIVIL';
  if (/documento\s+civil\s+auxiliar/.test(corpus)) return 'DOCUMENTO_CIVIL_AUXILIAR';
  if (/\bpagar[eé]\b/.test(corpus)) return 'PAGARE';
  if (/t[ií]tulo\s+de\s+cr[eé]dito/.test(corpus)) return 'TITULO_CREDITO';
  if (/estado\s+de\s+cuenta\s+mercantil/.test(corpus)) return 'ESTADO_CUENTA_MERCANTIL';
  if (/requerimiento\s+mercantil/.test(corpus)) return 'REQUERIMIENTO_MERCANTIL';
  if (/comunicaci[oó]n\s+mercantil/.test(corpus)) return 'COMUNICACION_MERCANTIL';
  if (/pago\s+mercantil/.test(corpus)) return 'PAGO_MERCANTIL';
  if (/documento\s+mercantil\s+auxiliar/.test(corpus)) return 'DOCUMENTO_MERCANTIL_AUXILIAR';

  const hasDemand = /\bdemanda\b/.test(corpus) || /\b(prestaciones|pretensiones|hechos)\b/.test(corpus);

  if (hasInitialWriting && labor) return 'ESCRITO_INICIAL_LABORAL';
  if (hasInitialWriting && mercantile) return 'ESCRITO_INICIAL_MERCANTIL';
  if (hasInitialWriting && civil) return 'ESCRITO_INICIAL_CIVIL';
  if (hasDemand && labor) return 'DEMANDA_LABORAL';
  if (hasDemand && mercantile) return 'DEMANDA_MERCANTIL';
  if (hasDemand && civil) return 'DEMANDA_CIVIL';
  if (/recurso|agravio/.test(corpus)) return 'RECURSO';
  return UNKNOWN_SOURCE_DOCUMENT_TYPE;
}

function inferSourceMatter(sourceType: InferredSourceDocumentType, corpus: string, fallback?: string, layout = corpus): string {
  if (sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE) return matterLabel(fallback);
  if (sourceDocumentMatter(sourceType as SourceDocumentType) === 'MERCANTIL') return 'MERCANTIL';
  if (/LABORAL/.test(sourceType) || laborMatterForCorpus(corpus, layout)) return 'LABORAL';
  if (/ADMINISTRATIVA/.test(sourceType) || /administrativ/.test(corpus)) return 'ADMINISTRATIVA';
  if (/familiar|alimentos|divorcio|custodia|patria\s+potestad/.test(corpus) || matterLabel(fallback) === 'FAMILIAR') return 'FAMILIAR';
  if (/SENTENCIA_AMPARO|^SENTENCIA/.test(sourceType)) {
    if (/mercantil/.test(corpus)) return 'MERCANTIL';
    if (/familiar|alimentos|divorcio|custodia/.test(corpus)) return 'FAMILIAR';
    if (/\bcivil\b/.test(corpus)) return 'CIVIL';
    return 'AMPARO';
  }
  if (sourceType.includes('MERCANTIL') || /mercantil/.test(corpus)) return 'MERCANTIL';
  if (sourceType.includes('CIVIL') || /\bcivil\b/.test(corpus)) return 'CIVIL';
  if (/AMPARO|ACTO_DE_AUTORIDAD/.test(sourceType) || /amparo|constitucional/.test(corpus)) return 'AMPARO';
  return matterLabel(fallback);
}

/**
 * Returns the substantive matter for the same source corpus used by the
 * compatibility gate. Document type and substantive matter are separate
 * dimensions: an amparo-directo resolution may arise from a labor case.
 */
export function inferSourceMatterForDocuments(
  sourceDocuments: UploadedSourceDocument[],
  sourceMatterFallback?: string,
): string {
  const sourceType = inferSourceOutputType(sourceDocuments, sourceMatterFallback);
  const classifiedDocuments = classificationDocuments(sourceDocuments);
  return inferSourceMatter(
    sourceType,
    normalize(sourceText(classifiedDocuments)),
    sourceMatterFallback,
    normalizeWithLines(sourceText(classifiedDocuments)),
  );
}

function explicitPolicy(
  selectedDocumentType: string,
  acceptedSourceTypes: readonly SourceDocumentType[],
  options: Partial<Pick<SourceOutputCompatibilityPolicy, 'matterId' | 'procedureId' | 'optionalSourceTypes' | 'sourceRequired' | 'incompatibleMatterRules' | 'requiresFactAndClaimExtraction' | 'sourceRequirementLabel'>> = {},
): SourceOutputCompatibilityPolicy {
  return {
    selectedDocumentType,
    status: 'EXPLICIT_COMPATIBILITY',
    matterId: options.matterId,
    procedureId: options.procedureId,
    acceptedSourceTypes,
    optionalSourceTypes: options.optionalSourceTypes || [],
    sourceRequired: options.sourceRequired ?? true,
    incompatibleMatterRules: options.incompatibleMatterRules || [],
    requiresFactAndClaimExtraction: options.requiresFactAndClaimExtraction,
    sourceRequirementLabel: options.sourceRequirementLabel,
  };
}

export const CIVIL_DEMAND_SOURCE_TYPES = [
  'CONTRATO_CIVIL',
  'CONVENIO_CIVIL',
  'REQUERIMIENTO_CIVIL',
  'COMUNICACION_CIVIL',
  'PRUEBA_DOCUMENTAL_CIVIL',
  'DOCUMENTO_CIVIL_AUXILIAR',
] as const satisfies readonly SourceDocumentType[];

const CIVIL_DEMAND_SOURCE_POLICY = explicitPolicy(
  'demanda_ordinaria_civil',
  CIVIL_DEMAND_SOURCE_TYPES,
  {
    sourceRequired: false,
    matterId: 'civil',
    procedureId: 'civil_declarativo',
    sourceRequirementLabel: 'fuente civil auxiliar compatible',
  },
);

export const CIVIL_DEMAND_SOURCE_COMPATIBILITY_RULES: SourceOutputCompatibilityRuleMap = Object.freeze({
  demanda_ordinaria_civil: CIVIL_DEMAND_SOURCE_POLICY,
});

export function getCivilDemandSourceCompatibilityPolicy(): SourceOutputCompatibilityPolicy {
  return CIVIL_DEMAND_SOURCE_POLICY;
}

function anySourcePolicy(selectedDocumentType: string): SourceOutputCompatibilityPolicy {
  return {
    selectedDocumentType,
    status: 'ACCEPTS_ANY_SOURCE_INTENTIONALLY',
    acceptedSourceTypes: [],
    optionalSourceTypes: [],
    sourceRequired: false,
    incompatibleMatterRules: [],
  };
}

function unsupportedPolicy(selectedDocumentType: string): SourceOutputCompatibilityPolicy {
  return {
    selectedDocumentType,
    status: 'UNSUPPORTED_DOCUMENT_TYPE',
    acceptedSourceTypes: [],
    optionalSourceTypes: [],
    sourceRequired: false,
    incompatibleMatterRules: [],
  };
}

function sourceRequirementLabelFor(id: string): string | undefined {
  return {
    contestacion_demanda: 'documento fuente de demanda',
    replica: 'contestación de demanda',
    duplica: 'réplica',
    demanda_laboral: 'constancia de no conciliación o documentación de la relación de trabajo',
    contestacion_demanda_laboral: 'documento fuente de demanda laboral',
    reconvencion_laboral: 'demanda laboral o contestación que origina la reconvención',
    contestacion_reconvencion_laboral: 'reconvención laboral o contestación previa',
    ampliacion_demanda_laboral: 'demanda laboral previa o hechos supervenientes',
    ofrecimiento_pruebas_laboral: 'demanda laboral o contestación que fija la litis',
    objecion_pruebas_laboral: 'pliego o auto de pruebas de la contraparte laboral',
    desahogo_prevencion_laboral: 'acuerdo o auto de prevención del tribunal laboral',
    alegatos_laborales: 'constancias del juicio laboral para alegatos de clausura',
    cumplimiento_laudo_sentencia_laboral: 'laudo o sentencia laboral a cumplimentar',
    ejecucion_sentencia_laboral: 'laudo firme o sentencia laboral en ejecución',
    demanda_amparo_directo_laboral: 'laudo o resolución laboral definitiva',
    demanda_amparo_indirecto_laboral: 'acto de autoridad o resolución intraprocesal laboral',
    demanda_amparo_indirecto: 'acto de autoridad o resolución impugnada',
    demanda_amparo_directo: 'sentencia definitiva, laudo o resolución que pone fin al juicio',
    recurso_revision_amparo_directo: 'sentencia de amparo directo impugnada',
    ampliacion_demanda_amparo: 'demanda de amparo e informe justificado o nuevo acto',
    amparo_adhesivo: 'demanda de amparo principal o sentencia favorable',
    solicitud_suspension_provisional: 'acto de autoridad reclamado y motivos de suspensión',
    solicitud_suspension_definitiva: 'informes previos y antecedentes de la suspensión',
    alegatos_amparo: 'informes justificados y constancias de amparo',
    recurso_revision_amparo: 'sentencia o resolución de amparo impugnada',
    recurso_queja_amparo: 'auto o proveído judicial recurrido',
    recurso_reclamacion_amparo: 'acuerdo de presidencia impugnado',
    recurso_inconformidad_amparo: 'auto que tiene por cumplida la ejecutoria',
    cumplimiento_ejecutoria_amparo: 'ejecutoria de amparo y constancias de cumplimiento',
    promocion_cumplimiento_amparo: 'ejecutoria de amparo y requerimientos incumplidos',
    manifestaciones_cumplimiento_amparo: 'acuerdo que da vista con informe de cumplimiento',
    contestacion_demanda_civil: 'documento fuente de demanda civil',
    contestacion_demanda_mercantil: 'documento fuente de demanda mercantil',
    contestacion_demanda_oral_civil: 'documento fuente de demanda oral civil',
    contestacion_demanda_arrendamiento: 'demanda civil y, en su caso, contrato de arrendamiento',
    reconvencion_civil: 'demanda o contestación civil que origina la reconvención',
    contestacion_reconvencion_civil: 'reconvención civil',
    reconvencion_mercantil: 'demanda o contestación mercantil que origina la reconvención',
    contestacion_reconvencion_mercantil: 'reconvención mercantil',
    excepciones_mercantiles: 'demanda o constancia mercantil controvertida',
    escrito_cumplimiento_sentencia: 'sentencia, resolución o laudo cuyo cumplimiento se manifiesta',
    contestacion_revision_extraordinaria_amparo_directo: 'sentencia o ejecutoria de amparo directo',
    demanda_ejecutiva_mercantil: 'documento base mercantil compatible',
    demanda_nulidad_administrativa: 'resolución administrativa impugnada',
    contestacion_nulidad_administrativa: 'demanda de nulidad administrativa',
    ampliacion_demanda_nulidad: 'contestación de demanda o constancias notificadas en juicio',
    contestacion_ampliacion_nulidad: 'ampliación de demanda de nulidad',
    alegatos_administrativos: 'constancias del juicio contencioso administrativo para alegatos de cierre',
    cumplimiento_sentencia_administrativa: 'sentencia definitiva contenciosa administrativa firme',
    recurso_administrativo: 'resolución administrativa o determinación impugnada',
    recurso_revision_administrativa: 'resolución o sentencia interlocutoria recurrida ante Sala Superior',
    solicitud_suspension_acto_administrativo: 'acto administrativo impugnado cuya suspensión se solicita',
    demanda_nulidad_fiscal: 'resolución determinante de crédito o liquidación fiscal impugnada',
    contestacion_nulidad_fiscal: 'demanda de nulidad fiscal',
    ampliacion_demanda_fiscal: 'contestación de demanda fiscal o constancias notificadas',
    contestacion_ampliacion_fiscal: 'ampliación de demanda fiscal',
    recurso_revocacion_fiscal: 'resolución o crédito fiscal recurrido en sede administrativa',
    recurso_revision_fiscal: 'sentencia fiscal definitiva impugnada en revisión fiscal',
    alegatos_fiscales: 'constancias del juicio de nulidad fiscal para alegatos de cierre',
    cumplimiento_sentencia_fiscal: 'sentencia fiscal definitiva firme a cumplimentar',
    solicitud_suspension_fiscal: 'crédito o determinación fiscal cuya suspensión se solicita',
    escritos_ante_autoridad_fiscal: 'antecedentes y fundamentos de la petición formal ante la autoridad fiscal',
    denuncia: 'relación de hechos con apariencia de delito o datos iniciales',
    querella: 'relación de hechos con apariencia de delito que agravian a la víctima',
    ampliacion_denuncia: 'denuncia previa, carpeta de investigación o hechos supervenientes',
    ampliacion_querella: 'querella previa, carpeta de investigación o hechos supervenientes',
    escrito_asesor_juridico: 'carpeta de investigación o acreditación de asesoría jurídica',
    escrito_defensa: 'carpeta de investigación, auto de vinculación o formulación de imputación',
    solicitud_actos_investigacion: 'carpeta de investigación o actuaciones ministeriales',
    solicitud_acceso_carpeta: 'carpeta de investigación y acreditación de calidad procesal',
    solicitud_copias_carpeta: 'carpeta de investigación o constancias solicitadas',
    solicitud_medida_proteccion: 'antecedentes de agresión, riesgo o carpeta de investigación',
    escrito_coadyuvancia: 'carpeta de investigación o escrito de acusación ministerial',
    apelacion_penal: 'resolución o auto recurrible del Juez de Control o Tribunal de Enjuiciamiento',
    revocacion_penal: 'decreto o auto de trámite impugnado en audiencia o por escrito',
    escrito_ejecucion_penal: 'carpeta de ejecución, sentencia condenatoria firme o constancia penitenciaria',
    // Agrario
    demanda_agraria: 'constancias parcelarias, títulos o antecedentes de posesión agraria',
    contestacion_demanda_agraria: 'demanda agraria notificada, auto de emplazamiento o cédula agraria',
    reconvencion_agraria: 'demanda agraria principal o contestación y antecedentes del conflicto',
    alegatos_agrarios: 'actuaciones del juicio agrario o acta de audiencia de ley ante el TUA',
    cumplimiento_sentencia_agraria: 'sentencia agraria definitiva firme o acuerdo de requerimiento',
    recurso_agrario: 'sentencia definitiva del Tribunal Unitario Agrario recurrible en revisión',
    // Inmobiliario
    promesa_compraventa_inmueble: 'datos de identificación del inmueble, antecedente de propiedad o precio',
    compraventa_inmueble: 'título de propiedad, folio real registral o boleta predial del inmueble',
    arrendamiento_inmueble: 'identificación del inmueble, condiciones de renta y datos de las partes',
    terminacion_arrendamiento: 'contrato de arrendamiento base o constancias de entrega de inmueble',
    requerimiento_pago_rentas: 'contrato de arrendamiento o recibos y estados de adeudo de rentas',
    aviso_terminacion: 'contrato de arrendamiento y término de vencimiento de vigencia',
    convenio_desocupacion: 'contrato de arrendamiento o título de posesión del inmueble',
    reconocimiento_adeudo_arrendamiento: 'contrato de arrendamiento y liquidación de adeudo consolidado',
    demanda_desocupacion: 'contrato de arrendamiento base y requerimientos previos de pago o aviso',
    // Corporativo (15 tipos)
    constitucion_sociedad: 'estatutos sociales propuestos, datos de socios fundadores o proyecto de acta constitutiva',
    modificacion_estatutos: 'estatutos sociales vigentes o acuerdos de asamblea a protocolizar',
    acta_asamblea_ordinaria: 'convocatoria, orden del día o minuta de asamblea ordinaria de accionistas',
    acta_asamblea_extraordinaria: 'convocatoria, orden del día o proyecto de reformas estatutarias',
    resoluciones_unanimidad: 'antecedentes societarios y resoluciones adoptadas fuera de asamblea',
    acta_consejo: 'convocatoria, lista de consejeros o acuerdos del consejo de administración',
    aumento_capital: 'acta de asamblea o estados financieros con aportaciones para futuros aumentos',
    reduccion_capital: 'acta de asamblea o balance que justifique el reembolso o absorción de pérdidas',
    cesion_partes_sociales: 'estatutos sociales o libro especial de socios y consentimiento de asamblea',
    compraventa_acciones: 'títulos de acciones, estatutos o autorización de adquisición de acciones',
    poderes: 'escritura constitutiva o nombramiento de órganos con facultades para delegar poder',
    revocacion_poder: 'escritura que contenga el poder otorgado cuya revocación se formaliza',
    convenio_accionistas: 'pactos parasociales, estatutos y derechos de sindicación o preferencia',
    acuerdo_confidencialidad: 'información técnica, operativa o comercial protegida como secreto',
    carta_intencion: 'términos preliminares de transacción, calendario y condiciones de due diligence',
    // Contractual (17 tipos)
    contrato_compraventa: 'especificación del bien mueble o derecho y contraprestación en dinero',
    contrato_arrendamiento: 'descripción del bien arrendado, vigencia y canon de renta pactado',
    contrato_prestacion_servicios: 'propuesta técnica de servicios, entregables y honorarios pactados',
    contrato_obra: 'planos, especificaciones del proyecto y presupuesto a precio alzado',
    contrato_mutuo: 'comprobante de entrega de dinero fungible o pagaré y términos de amortización',
    contrato_comodato: 'inventario del bien no fungible concedido en préstamo de uso gratuito',
    contrato_mandato: 'instrucciones de los actos jurídicos encomendados y facultades conferidas',
    contrato_comision: 'actos de comercio encomendados, provisión de fondos y porcentaje de comisión',
    contrato_distribucion: 'catálogo de productos, territorio asignado y políticas de precios de reventa',
    contrato_suministro: 'órdenes de compra periódicas, catálogo de insumos y condiciones de entrega',
    contrato_confidencialidad: 'definición de información reservada y compromisos de no divulgación',
    contrato_licencia: 'especificación de software o tecnología licenciada y regalías pactadas',
    convenio_transaccional: 'antecedentes del litigio o controversia y términos de mutuas concesiones',
    convenio_reconocimiento_adeudo: 'títulos de crédito, facturas vencidas o liquidación del adeudo',
    convenio_terminacion: 'contrato principal a extinguir y constancias de finiquito mutuo',
    convenio_modificatorio: 'contrato principal vigente y especificación de cláusulas a reformar',
    memorando_entendimiento: 'términos de entendimiento preliminar, alianza o proyecto conjunto',
    // Propiedad Intelectual (11 tipos)
    contrato_licencia_marca: 'título de registro marcario del IMPI y estándares de control de calidad',
    cesion_derechos_marca: 'título de registro o solicitud de marca ante el IMPI y precio convenido',
    licencia_derechos_autor: 'certificado de registro de obra ante INDAUTOR y modalidades de uso',
    cesion_derechos_autor: 'certificado de inscripción de INDAUTOR y contraprestación patrimonial',
    infraccion_propiedad_industrial: 'título de propiedad industrial y fe de hechos o muestras del producto infractor',
    recurso_propiedad_intelectual: 'resolución administrativa del IMPI impugnada y oficio notificado',
    solicitud_registro_marca: 'diseño o denominación del signo distintivo, clase de Niza y tarifa pagada',
    contestacion_impedimento: 'oficio de requisitos o anterioridades citado por el examinador del IMPI',
    oposicion_marca: 'solicitud publicada en la Gaceta de la Propiedad Industrial y marca anterior',
    nulidad_registro: 'título de registro marcario conculcado y pruebas de causal de nulidad',
    caducidad_registro: 'registro de marca impugnado por falta de uso y constancias de interés jurídico',
    // Trámites Generales de Juzgado (25 tipos)
    promocion_simple: 'auto, acuerdo o constancia de actuaciones para fundamentar la promoción',
    desahogo_prevencion: 'auto de prevención notificado y requerimientos a subsanar',
    cumplimiento_requerimiento: 'auto de requerimiento judicial notificado con apercibimiento',
    cumplimiento_prevencion: 'proveído preventivo y constancias de subsanación procesal',
    manifestaciones: 'acuerdo, traslado o informe respecto del cual se formulan manifestaciones',
    comparecencia: 'cédula de notificación, auto judicial o documento de apersonamiento',
    ratificacion: 'escrito, desistimiento o convenio presentado en autos a ratificar',
    solicitud_copias: 'actuaciones judiciales o expediente del cual se requieren copias simples',
    solicitud_copias_certificadas: 'actuaciones judiciales específicas cuya certificación se requiere',
    solicitud_acceso_expediente: 'expediente judicial y acreditación de profesionistas para consulta',
    solicitud_certificacion: 'cómputo de términos o resolución judicial materia de certificación',
    autorizacion_abogados: 'cédulas profesionales y datos de identificación de los profesionistas',
    revocacion_autorizados: 'nombres de los profesionistas y domicilios a revocar en el expediente',
    cambio_domicilio_procesal: 'nuevo domicilio procesal dentro de la demarcación jurisdiccional',
    senalamiento_correo: 'correo electrónico o usuario validado en la plataforma judicial',
    impulso_procesal: 'última actuación procesal y certificación de término fenecido',
    solicitud_acumulacion: 'demandas y autos iniciales de los juicios conexos a acumular',
    solicitud_archivo: 'resolución de término, convenio cumplido o constancia de caducidad',
    solicitud_desarchivo: 'datos de remisión al Archivo Judicial y justificación de reactivación',
    desistimiento: 'demanda o escrito inicial de la acción materia de desistimiento',
    allanamiento: 'demanda y traslado respecto de cuyas pretensiones se conforma el demandado',
    convenio_judicial: 'términos del arreglo transaccional y firmas de conformidad de las partes',
    aclaracion: 'auto o proveído judicial que contiene obscuridad o incongruencia',
    correccion_error: 'actuacion judicial que contiene el error material, mecanográfico o numérico',
    solicitud_devolucion_documentos: 'relación de documentos originales exhibidos con la demanda o contestación',
  }[id];
}

function normalizeSourceTypes(values: readonly string[] | undefined): SourceDocumentType[] {
  return Array.from(new Set((values || [])
    .map((value) => normalizeSourceDocumentType(value))
    .filter((value): value is SourceDocumentType => Boolean(value))));
}

function sourceTypesForOutput(
  selectedDocumentType: string,
  sourceTypes: readonly SourceDocumentType[],
): SourceDocumentType[] {
  const matter = selectedDocumentType === 'contestacion_demanda_civil'
    ? 'CIVIL'
    : selectedDocumentType === 'contestacion_demanda_mercantil'
      ? 'MERCANTIL'
      : selectedDocumentType === 'contestacion_demanda_laboral'
        ? 'LABORAL'
        : undefined;
  return matter
    ? sourceTypes.filter((sourceType) => sourceDocumentMatter(sourceType) === matter)
    : [...sourceTypes];
}

function catalogSourceCompatibility(id: string): SourceCompatibilityDeclaration | null {
  const entry = getCatalogDocument(id);
  if (entry && entry.kind !== 'LEGACY_ALIAS' && entry.sourceCompatibility) return entry.sourceCompatibility;
  return null;
}

function policyFromCatalogEntry(id: string): SourceOutputCompatibilityPolicy {
  const entry = getCatalogDocument(id);
  if (!entry) return unsupportedPolicy(id);
  if (entry?.kind === 'LEGACY_ALIAS') {
    const target = getCatalogDocument(entry.targetId);
    if (target?.kind === 'DOCUMENT_TYPE' && target.sourceCompatibility?.acceptsAnySource) return anySourcePolicy(id);
    return unsupportedPolicy(id);
  }
  if (entry.kind === 'FAMILY' || entry.status !== 'IMPLEMENTED') return unsupportedPolicy(id);
  const sourceCompatibility = catalogSourceCompatibility(id);
  if (!sourceCompatibility) return unsupportedPolicy(id);
  if (sourceCompatibility.acceptsAnySource) return anySourcePolicy(id);
  return explicitPolicy(id, sourceTypesForOutput(id, normalizeSourceTypes(sourceCompatibility.acceptedSourceTypes)), {
    matterId: entry.kind === 'DOCUMENT_TYPE' ? entry.areaId : undefined,
    procedureId: entry.kind === 'DOCUMENT_TYPE' ? entry.procedureId : undefined,
    optionalSourceTypes: sourceTypesForOutput(id, normalizeSourceTypes(sourceCompatibility.optionalSourceTypes)),
    sourceRequired: sourceCompatibility.sourceRequired,
    incompatibleMatterRules: (sourceCompatibility.incompatibleMatterIds || []).map((matter) => ({
      matter,
      reason: `La fuente de materia ${matter} no es compatible con ${id}.`,
    })),
    requiresFactAndClaimExtraction: sourceCompatibility.requiresFactAndClaimExtraction,
    sourceRequirementLabel: sourceRequirementLabelFor(id),
  });
}

/**
 * Registry único de compatibilidad. Las 33 entradas legacy se proyectan desde
 * el registry jurídico; los tipos sin strategy/template permanecen bloqueados.
 */
export const SOURCE_OUTPUT_COMPATIBILITY_RULES: SourceOutputCompatibilityRuleMap = Object.freeze(
  Object.fromEntries([
    ...LEGACY_DOCUMENT_IDENTIFIER_IDS,
    ...LEGAL_CATALOG_REGISTRY.documents
      .filter((entry) => entry.status === 'IMPLEMENTED')
      .map((entry) => entry.id),
  ].map((id) => [id, policyFromCatalogEntry(id)])) as SourceOutputCompatibilityRuleMap,
);

function isCanonicalDocumentType(id: string): boolean {
  const entry = getCatalogDocument(id);
  return Boolean(entry && entry.kind !== 'LEGACY_ALIAS');
}

export function getSourceOutputCompatibilityPolicy(
  selectedDocumentType: string,
  rules: SourceOutputCompatibilityRuleMap = SOURCE_OUTPUT_COMPATIBILITY_RULES,
): SourceOutputCompatibilityPolicy {
  const requestedSelected = normalizeId(selectedDocumentType);
  const selectedEntry = getCatalogDocument(requestedSelected);
  const selected = selectedEntry?.kind === 'LEGACY_ALIAS'
    ? selectedEntry.targetId
    : selectedEntry?.kind === 'DOCUMENT_TYPE'
      ? selectedEntry.id
      : requestedSelected;
  const policy = rules[selected];
  if (policy) return policy;

  if (!isCanonicalDocumentType(selected)) {
    const error = new Error(`UNKNOWN_DOCUMENT_TYPE: no existe un tipo documental canónico registrado para "${selected}".`);
    (error as Error & { code?: string }).code = 'UNKNOWN_DOCUMENT_TYPE';
    throw error;
  }

  const entry = getCatalogDocument(selected);
  if (entry?.kind === 'DOCUMENT_TYPE' && entry.status === 'IMPLEMENTED') {
    throw new MissingSourceCompatibilityRuleError(selected);
  }

  return unsupportedPolicy(selected);
}

function extractionRequirements(sourceAnalysis?: SourceAnalysisForCompatibility): string[] {
  if (!sourceAnalysis) return [];
  const facts = Boolean(sourceAnalysis.numberedFacts?.length || sourceAnalysis.complaintFacts?.length);
  const claims = Boolean(sourceAnalysis.sourceClaims?.length || sourceAnalysis.complaintClaims?.length);
  const missing: string[] = [];
  if (!facts) missing.push('hechos numerados de la demanda');
  if (!claims) missing.push('prestaciones o pretensiones de la demanda');
  return missing;
}

function metadataFor(
  policy: SourceOutputCompatibilityPolicy,
  sourceDocumentType: SourceDocumentTypeValue,
  sourceMatter: string,
): SourceOutputCompatibilityMetadata {
  return {
    selectedDocumentType: policy.selectedDocumentType,
    sourceDocumentType,
    sourceMatter,
    requiredSourceTypes: [...policy.acceptedSourceTypes],
    acceptedSourceTypes: [...policy.acceptedSourceTypes],
    optionalSourceTypes: [...policy.optionalSourceTypes],
    sourceRequired: policy.sourceRequired,
    compatibilityStatus: policy.status,
  };
}

function allowedSourceTypes(policy: SourceOutputCompatibilityPolicy): string[] {
  return Array.from(new Set([...policy.acceptedSourceTypes, ...policy.optionalSourceTypes]));
}

type CivilSourceRole = SourceCompatibilitySourceResult['role'];

function sourceRoleFor(source: UploadedSourceDocument): CivilSourceRole {
  const candidate = source.classification?.role || source.classification?.sourceRole || (source as { role?: string }).role;
  return candidate === 'PRIMARY' || candidate === 'SUPPORTING' || candidate === 'REFERENCE'
    ? candidate
    : 'UNSPECIFIED';
}

function evaluateCommercialSource(
  policy: SourceOutputCompatibilityPolicy,
  source: UploadedSourceDocument,
  sourceMatterFallback?: string,
): SourceCompatibilitySourceResult {
  const sourceType = inferSourceOutputType([source], sourceMatterFallback);
  const sourceCorpus = normalize(sourceText([source]));
  const sourceMatter = inferSourceMatter(sourceType, sourceCorpus, sourceMatterFallback);
  const role = sourceRoleFor(source);
  if (role === 'REFERENCE') return { id: source.id, sourceType, sourceMatter, role, status: 'REFERENCE_ONLY', controlsOutput: false };
  if (role === 'UNSPECIFIED') return { id: source.id, sourceType, sourceMatter, role, status: 'NEEDS_INPUT', controlsOutput: false };
  if (sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE) return { id: source.id, sourceType, sourceMatter, role, status: 'NEEDS_INPUT', controlsOutput: false };
  if (policy.incompatibleMatterRules.some((rule) => normalize(rule.matter) === normalize(sourceMatter))
    || !allowedSourceTypes(policy).includes(sourceType)) {
    return { id: source.id, sourceType, sourceMatter, role, status: 'INCOMPATIBLE', controlsOutput: true };
  }
  return { id: source.id, sourceType, sourceMatter, role, status: 'COMPATIBLE', controlsOutput: true };
}

function evaluateCivilSource(
  policy: SourceOutputCompatibilityPolicy,
  source: UploadedSourceDocument,
  sourceMatterFallback?: string,
): SourceCompatibilitySourceResult {
  const sourceType = inferSourceOutputType([source], sourceMatterFallback);
  const sourceCorpus = normalize(sourceText([source]));
  const sourceMatter = inferSourceMatter(sourceType, sourceCorpus, sourceMatterFallback);
  const role = sourceRoleFor(source);
  if (role === 'REFERENCE') {
    return {
      id: source.id,
      sourceType,
      sourceMatter,
      role,
      status: 'REFERENCE_ONLY',
      controlsOutput: false,
    };
  }
  if (role === 'UNSPECIFIED') {
    return {
      id: source.id,
      sourceType,
      sourceMatter,
      role,
      status: 'NEEDS_INPUT',
      controlsOutput: false,
    };
  }
  if (sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE) {
    return {
      id: source.id,
      sourceType,
      sourceMatter,
      role,
      status: 'NEEDS_INPUT',
      controlsOutput: false,
    };
  }
  if (
    policy.incompatibleMatterRules.some((rule) => normalize(rule.matter) === normalize(sourceMatter))
    || !allowedSourceTypes(policy).includes(sourceType)
  ) {
    return {
      id: source.id,
      sourceType,
      sourceMatter,
      role,
      status: 'INCOMPATIBLE',
      controlsOutput: true,
    };
  }
  return {
    id: source.id,
    sourceType,
    sourceMatter,
    role,
    status: 'COMPATIBLE',
    controlsOutput: true,
  };
}

export function evaluateSourceOutputCompatibility(
  input: SourceOutputCompatibilityInput,
  rules: SourceOutputCompatibilityRuleMap = SOURCE_OUTPUT_COMPATIBILITY_RULES,
): SourceOutputCompatibilityResult {
  const selectedDocumentType = normalizeId(input.selectedDocumentType);
  const classifiedDocuments = classificationDocuments(input.sourceDocuments);
  const corpus = normalize(sourceText(classifiedDocuments));
  const sourceDocumentType = inferSourceOutputType(classifiedDocuments, input.sourceMatter);
  const sourceMatter = inferSourceMatter(
    sourceDocumentType,
    corpus,
    input.sourceMatter,
    normalizeWithLines(sourceText(classifiedDocuments)),
  );
  const metadataSourceDocumentType = sourceDocumentType;

  if (!selectedDocumentType) {
    return {
      selectedDocumentType: '',
      sourceDocumentType: metadataSourceDocumentType,
      sourceMatter,
      requiredSourceTypes: [],
      acceptedSourceTypes: [],
      optionalSourceTypes: [],
      sourceRequired: false,
      compatibilityStatus: 'NO_SOURCE_REQUIRED',
      status: 'NOT_APPLICABLE',
      missingRequirements: [],
      sources: [],
    };
  }

  const policy = getSourceOutputCompatibilityPolicy(selectedDocumentType, rules);
  if (policy.status === 'UNSUPPORTED_DOCUMENT_TYPE') {
    throw new DocumentTypeNotImplementedError(selectedDocumentType);
  }

  const base = metadataFor(policy, metadataSourceDocumentType, sourceMatter);
  if (policy.status === 'ACCEPTS_ANY_SOURCE_INTENTIONALLY') {
    return { ...base, status: 'COMPATIBLE', missingRequirements: [], sources: [] };
  }

  if (input.sourceDocuments.length === 0) {
    const missingRequirements = policy.sourceRequired
      ? [policy.sourceRequirementLabel || 'documento fuente compatible']
      : [];
    return {
      ...base,
      sourceDocumentType: NO_SOURCE_DOCUMENT,
      sourceMatter: 'NO_IDENTIFICADA',
      status: missingRequirements.length > 0 ? 'NEEDS_INPUT' : 'COMPATIBLE',
      ...(missingRequirements.length > 0 ? { code: EXTRACTION_INCOMPLETE } : {}),
      missingRequirements,
      sources: [],
    };
  }

  if (policy.selectedDocumentType === 'demanda_ordinaria_civil' || policy.selectedDocumentType === 'demanda_ejecutiva_mercantil') {
    const evaluatedSources = policy.selectedDocumentType === 'demanda_ejecutiva_mercantil'
      ? input.sourceDocuments.map((source) => evaluateCommercialSource(policy, source, input.sourceMatter))
      : input.sourceDocuments.map((source) => evaluateCivilSource(policy, source, input.sourceMatter));
    const controlling = evaluatedSources.find((source) => source.role === 'PRIMARY')
      || evaluatedSources.find((source) => source.role === 'SUPPORTING');
    const incompatible = evaluatedSources.find((source) => source.status === 'INCOMPATIBLE');
    if (incompatible) {
      throw new SourceDocumentIncompatibleError(metadataFor(
        policy,
        incompatible.sourceType,
        incompatible.sourceMatter,
      ));
    }
    const missingRequirements = evaluatedSources
      .filter((source) => source.status === 'NEEDS_INPUT')
      .flatMap((source) => source.sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE
        ? ['source_type:' + source.id]
        : ['source_role:' + source.id]);
    const metadata = metadataFor(
      policy,
      controlling?.sourceType || NO_SOURCE_DOCUMENT,
      controlling?.sourceMatter || 'NO_IDENTIFICADA',
    );
    if (missingRequirements.length > 0) {
      return {
        ...metadata,
        status: 'NEEDS_INPUT',
        code: evaluatedSources.some((source) => source.sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE)
          ? SOURCE_TYPE_UNKNOWN
          : EXTRACTION_INCOMPLETE,
        missingRequirements,
        sources: evaluatedSources,
      };
    }
    const extractionMissing = policy.requiresFactAndClaimExtraction
      ? extractionRequirements(input.sourceAnalysis)
      : [];
    return {
      ...metadata,
      status: extractionMissing.length > 0 ? 'NEEDS_INPUT' : 'COMPATIBLE',
      ...(extractionMissing.length > 0 ? { code: EXTRACTION_INCOMPLETE } : {}),
      missingRequirements: extractionMissing,
      sources: evaluatedSources,
    };
  }

  // Contestations, reconventions and mercantile exceptions use the same
  // source-role contract as the professional demand flows: REFERENCE never
  // controls the output and an omitted role is never promoted to PRIMARY.
  const isSpecializedResponse = (isCivilMercantileResponseDocumentType(policy.selectedDocumentType)
    || isCivilMercantileEvidenceArgumentDocumentType(policy.selectedDocumentType))
    && policy.selectedDocumentType !== 'contestacion_demanda_civil'
    && policy.selectedDocumentType !== 'contestacion_demanda_mercantil';
  if (isSpecializedResponse) {
    const evaluate = policy.matterId === 'mercantil' ? evaluateCommercialSource : evaluateCivilSource;
    const evaluatedSources = input.sourceDocuments.map((source) => evaluate(policy, source, input.sourceMatter));
    const incompatible = evaluatedSources.find((source) => source.status === 'INCOMPATIBLE');
    if (incompatible) {
      throw new SourceDocumentIncompatibleError(metadataFor(policy, incompatible.sourceType, incompatible.sourceMatter));
    }
    const controlling = evaluatedSources.find((source) => source.role === 'PRIMARY')
      || evaluatedSources.find((source) => source.role === 'SUPPORTING');
    const missingRequirements = evaluatedSources
      .filter((source) => source.status === 'NEEDS_INPUT')
      .map((source) => source.sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE
        ? `source_type:${source.id}`
        : `source_role:${source.id}`);
    if (!controlling && policy.sourceRequired) {
      const requirement = 'source_role:controlling';
      if (!missingRequirements.includes(requirement)) missingRequirements.push(requirement);
    }
    const extractionMissing = policy.requiresFactAndClaimExtraction
      ? extractionRequirements(input.sourceAnalysis)
      : [];
    const allMissing = Array.from(new Set([...missingRequirements, ...extractionMissing]));
    return {
      ...metadataFor(
        policy,
        controlling?.sourceType || NO_SOURCE_DOCUMENT,
        controlling?.sourceMatter || 'NO_IDENTIFICADA',
      ),
      status: allMissing.length > 0 ? 'NEEDS_INPUT' : 'COMPATIBLE',
      ...(allMissing.length > 0 ? { code: evaluatedSources.some((source) => source.sourceType === UNKNOWN_SOURCE_DOCUMENT_TYPE) ? SOURCE_TYPE_UNKNOWN : EXTRACTION_INCOMPLETE } : {}),
      missingRequirements: allMissing,
      sources: evaluatedSources,
    };
  }

  // Una fuente cuyo tipo no pudo identificarse no es una incompatibilidad
  // demostrada. Se conserva como pendiente para no romper consumidores legacy
  // ni permitir que el pipeline trate texto ambiguo como una fuente válida.
  if (sourceDocumentType === UNKNOWN_SOURCE_DOCUMENT_TYPE) {
    const missingRequirements = ['tipo de documento fuente compatible'];
    return {
      ...base,
      status: 'NEEDS_INPUT',
      code: SOURCE_TYPE_UNKNOWN,
      missingRequirements,
      sources: [],
    };
  }

  const isAmparo = policy.matterId === 'constitucional_amparo' || isAmparoDocumentType(policy.selectedDocumentType);
  const incompatibleMatterRule = !isAmparo && policy.incompatibleMatterRules.find((rule) =>
    normalize(rule.matter) === normalize(sourceMatter),
  );
  if (incompatibleMatterRule) {
    throw new SourceDocumentIncompatibleError(base);
  }

  if (!allowedSourceTypes(policy).includes(sourceDocumentType)) {
    throw new SourceDocumentIncompatibleError(base);
  }

  const missingRequirements = policy.requiresFactAndClaimExtraction
    ? extractionRequirements(input.sourceAnalysis)
    : [];
  return {
    ...base,
    status: missingRequirements.length > 0 ? 'NEEDS_INPUT' : 'COMPATIBLE',
    ...(missingRequirements.length > 0 ? { code: EXTRACTION_INCOMPLETE } : {}),
    missingRequirements,
    sources: [],
  };
}

export function formatSourceDocumentIncompatibilityMessage(
  metadata: SourceOutputCompatibilityMetadata,
): string {
  const accepted = [...metadata.acceptedSourceTypes, ...metadata.optionalSourceTypes];
  return [
    SOURCE_DOCUMENT_INCOMPATIBLE,
    `El documento fuente detectado como ${metadata.sourceDocumentType} (${metadata.sourceMatter}) no es compatible con ${metadata.selectedDocumentType}.`,
    `Las fuentes aceptadas son: ${accepted.join(', ') || 'ninguna declarada'}.`,
  ].join(' ');
}
