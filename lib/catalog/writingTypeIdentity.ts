/**
 * writingTypeIdentity.ts — FUENTE CANÓNICA DE IDENTIDAD DE TIPOS DE ESCRITO.
 *
 * Responde, para cualquier identificador (canónico, alias o familia):
 *
 *   id → canonicalType → familia → materia → finalidad procesal
 *      → fuente compatible → blueprint → estrategia de generación
 *      → secciones → contrato → materialización → capacidades
 *
 * La clasificación NO es heurística de nombre:
 *   - ALIAS   : identificador con `targetId` explícito en el catálogo.
 *   - FAMILY  : identificador de familia (`kind: 'FAMILY'`).
 *   - CANONICAL: tipo con plantilla declarada propia (estructura propia).
 *   - VARIANT : tipo canónico materializado desde el blueprint de su familia
 *                (`FAMILY ENGINE → TYPE CONFIG → MATTER CONFIG → BLUEPRINT`).
 *
 * Ningún tipo visible queda como etiqueta: `resolveWritingType` siempre
 * devuelve blueprint, secciones y capacidades, o lanza.
 */
import {
  CANONICAL_DOCUMENT_TYPES, DOCUMENT_FAMILIES, LEGAL_AREAS, LEGAL_PROCEDURES,
  LEGACY_ALIASES, getCatalogDocument, getCatalogStats,
} from './legalCatalog';
import {
  DocumentTemplates, getDocumentTemplate, familyDerivedTemplateFor, familyDerivedTemplateIds,
  type DocumentTemplate,
} from '@/lib/legal-engine/documentTemplates';
import { familyBlueprintFor, type FamilyBlueprint } from '@/lib/legal-engine/documentFamilyBlueprints';
import { getDocumentStrategy } from '@/lib/legal-engine/documentStrategies';

export type WritingTypeKind = 'canonical' | 'variant' | 'alias' | 'family';

export interface WritingTypeCapabilities {
  draft: boolean;
  docx: boolean;
  pdf: boolean;
  finalEligible: boolean;
}

export interface WritingTypeIdentity {
  id: string;
  canonicalType: string;
  kind: WritingTypeKind;
  label: string;
  description: string;
  areaId: string;
  familyId: string;
  familyLabel: string;
  matter: string;
  proceeding: string;
  proceedingLabel: string;
  proceduralPurpose: string;
  compatibleSources: ReturnType<typeof resolveSourceCompatibility>;
  blueprint: FamilyBlueprint | null;
  generationStrategy: { id: string | null; templateId: string | null };
  template: DocumentTemplate;
  requiredSections: readonly string[];
  optionalSections: readonly string[];
  requiredFields: readonly string[];
  capabilities: WritingTypeCapabilities;
  implementationStatus: 'IMPLEMENTED' | 'IMPLEMENTED_BUT_UNCERTIFIED' | 'NOT_IMPLEMENTED';
  functionalStatus: 'PASS' | 'FAIL' | 'BLOCKED_EXTERNAL';
  humanReview: 'APPROVED' | 'PENDING' | 'NOT_REQUIRED';
  /** true si el tipo resuelto por un blueprint de familia, no por plantilla propia. */
  derivedFromFamily: boolean;
  /** true si su template resuelto es el fallback genérico (debe ser falso). */
  incorrectFallback: boolean;
}

const GENERIC_TEMPLATE_ID = 'escrito_libre';
const canonicalById = new Map(CANONICAL_DOCUMENT_TYPES.map(entry => [entry.id, entry]));
const aliasById = new Map(LEGACY_ALIASES.map(entry => [entry.id, entry]));
const familyById = new Map(DOCUMENT_FAMILIES.map(entry => [entry.id, entry]));
const areaById = new Map(LEGAL_AREAS.map(entry => [entry.id, entry]));
const procedureById = new Map(LEGAL_PROCEDURES.map(entry => [entry.id, entry]));
const ownTemplateIds = new Set(Object.keys(DocumentTemplates));
const derivedIds = new Set(familyDerivedTemplateIds());

export function resolveSourceCompatibility(id: string) {
  const canonical = canonicalById.get(id);
  if (!canonical) {
    return { declared: false, sourceRequired: false, acceptedSourceTypes: [] as readonly string[], incompatibleMatterIds: [] as readonly string[] };
  }
  const declaration = canonical.sourceCompatibility;
  return {
    declared: Boolean(declaration),
    sourceRequired: declaration?.sourceRequired ?? false,
    acceptsAnySource: declaration?.acceptsAnySource ?? false,
    acceptedSourceTypes: declaration?.acceptedSourceTypes ?? [],
    optionalSourceTypes: declaration?.optionalSourceTypes ?? [],
    incompatibleSourceTypes: declaration?.incompatibleSourceTypes ?? [],
    incompatibleMatterIds: declaration?.incompatibleMatterIds ?? [],
  };
}

/** Clasificación de identidad derivada de la arquitectura, no del nombre. */
export function classifyWritingType(idOrAlias: string): WritingTypeKind {
  const id = (idOrAlias || '').trim();
  if (aliasById.has(id)) return 'alias';
  if (familyById.has(id)) return 'family';
  if (ownTemplateIds.has(id)) return 'canonical';
  if (derivedIds.has(id)) return 'variant';
  if (canonicalById.has(id)) return 'variant';
  return 'family';
}

/** Alias → tipo canónico. Un alias nunca duplica comportamiento. */
export function canonicalTypeOf(idOrAlias: string): string | null {
  const id = (idOrAlias || '').trim();
  const alias = aliasById.get(id);
  if (alias) return canonicalTypeOf(alias.targetId);
  if (canonicalById.has(id)) return id;
  return null;
}

export function resolveWritingType(idOrAlias: string): WritingTypeIdentity {
  const requested = (idOrAlias || '').trim();
  if (!requested) throw new Error('WRITING_TYPE_ID_REQUIRED');
  const kind = classifyWritingType(requested);
  if (kind === 'alias') {
    const alias = aliasById.get(requested)!;
    const resolved = resolveWritingType(alias.targetId);
    return { ...resolved, id: requested, canonicalType: resolved.canonicalType, kind };
  }
  const canonicalId = canonicalTypeOf(requested) || requested;
  const canonical = canonicalById.get(canonicalId);
  if (!canonical) {
    throw new Error(`WRITING_TYPE_UNKNOWN:${requested}`);
  }
  const family = familyById.get(canonical.familyId);
  const procedure = procedureById.get(canonical.procedureId);
  const area = areaById.get(canonical.areaId);
  const template = getDocumentTemplate(canonicalId, canonical.label);
  const strategy = getDocumentStrategy(canonicalId);
  const derived = derivedIds.has(canonicalId) || !ownTemplateIds.has(canonicalId);
  const sources = resolveSourceCompatibility(canonicalId);
  const implementationStatus: WritingTypeIdentity['implementationStatus'] =
    !template || !(template.estructura || []).length
      ? 'NOT_IMPLEMENTED'
      : canonical.status === 'REQUIRES_OFFICIAL_FORM' || canonical.status === 'ASSISTED_DRAFT'
        ? 'IMPLEMENTED_BUT_UNCERTIFIED'
        : 'IMPLEMENTED';
  return {
    id: canonicalId,
    canonicalType: canonicalId,
    kind: derived ? 'variant' : 'canonical',
    label: canonical.label,
    description: canonical.description,
    areaId: canonical.areaId,
    familyId: canonical.familyId,
    familyLabel: family?.label || canonical.familyId,
    matter: procedure ? `${area?.label || ''} / ${procedure.label}` : (template.materia as string),
    proceeding: canonical.procedureId,
    proceedingLabel: procedure?.label || canonical.procedureId,
    proceduralPurpose: template.objetivoProcesal,
    compatibleSources: sources,
    blueprint: familyBlueprintFor(canonical.familyId) || null,
    generationStrategy: { id: strategy?.id || null, templateId: template.tipo },
    template,
    requiredSections: template.estructura || [],
    optionalSections: template.camposOpcionales || [],
    requiredFields: template.camposObligatorios || [],
    capabilities: {
      draft: true,
      docx: true,
      pdf: true,
      // PASS técnico habilita DRAFT, no FINAL: FINAL exige además aprobación
      // humana y los gates del documento concreto.
      finalEligible: canonical.functionalStatus === 'PASS' && canonical.humanReview === 'APPROVED',
    },
    implementationStatus,
    functionalStatus: canonical.functionalStatus === 'NOT_APPLICABLE' ? 'FAIL' : canonical.functionalStatus,
    humanReview: canonical.humanReview,
    derivedFromFamily: derived,
    incorrectFallback: template.tipo === GENERIC_TEMPLATE_ID && canonicalId !== GENERIC_TEMPLATE_ID,
  };
}

/** Tipos visibles: todos los canónicos del catálogo (con o sin certificar). */
export function visibleWritingTypes(): WritingTypeIdentity[] {
  return CANONICAL_DOCUMENT_TYPES.map(entry => resolveWritingType(entry.id));
}

export interface WritingTypeCensus {
  visibleTypes: number;
  canonicalTypes: number;
  variants: number;
  aliases: number;
  familyIdentifiers: number;
  implemented: number;
  implementedButUncertified: number;
  notImplemented: number;
  draftCapable: number;
  functionalPass: number;
  functionalFail: number;
  blockedExternal: number;
  humanReviewPending: number;
  humanReviewApproved: number;
  orphanTypes: string[];
  duplicateIds: string[];
  blueprintsMissing: string[];
  strategiesMissing: string[];
  incorrectFallbacks: string[];
  emptySections: string[];
  derivedFromFamily: number;
  byFamily: Record<string, number>;
  byArea: Record<string, number>;
}

export function writingTypeCensus(): WritingTypeCensus {
  const identities = visibleWritingTypes();
  const tally = (fn: (identity: WritingTypeIdentity) => boolean) => identities.filter(fn).length;
  const ids = identities.map(identity => identity.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  const byFamily: Record<string, number> = {};
  const byArea: Record<string, number> = {};
  for (const identity of identities) {
    byFamily[identity.familyId] = (byFamily[identity.familyId] || 0) + 1;
    byArea[identity.areaId] = (byArea[identity.areaId] || 0) + 1;
  }
  const familyIdentifiers = getCatalogStats().familyIdentifierCount;
  const aliases = LEGACY_ALIASES.length;
  return {
    visibleTypes: identities.length,
    canonicalTypes: tally(i => i.kind === 'canonical'),
    variants: tally(i => i.kind === 'variant'),
    aliases,
    familyIdentifiers,
    implemented: tally(i => i.implementationStatus === 'IMPLEMENTED'),
    implementedButUncertified: tally(i => i.implementationStatus === 'IMPLEMENTED_BUT_UNCERTIFIED'),
    notImplemented: tally(i => i.implementationStatus === 'NOT_IMPLEMENTED'),
    draftCapable: tally(i => i.capabilities.draft),
    functionalPass: tally(i => i.functionalStatus === 'PASS'),
    functionalFail: tally(i => i.functionalStatus === 'FAIL'),
    blockedExternal: tally(i => i.functionalStatus === 'BLOCKED_EXTERNAL'),
    humanReviewPending: tally(i => i.humanReview === 'PENDING'),
    humanReviewApproved: tally(i => i.humanReview === 'APPROVED'),
    orphanTypes: identities
      .filter(i => !i.requiredSections.length || !i.template || !i.compatibleSources.declared && !i.compatibleSources.acceptsAnySource)
      .map(i => i.id),
    duplicateIds: [...new Set(duplicates)],
    blueprintsMissing: identities.filter(i => !i.template || !(i.template.estructura || []).length).map(i => i.id),
    strategiesMissing: identities.filter(i => !i.generationStrategy.templateId).map(i => i.id),
    incorrectFallbacks: identities.filter(i => i.incorrectFallback).map(i => i.id),
    emptySections: identities.filter(i => !i.requiredSections.length).map(i => i.id),
    derivedFromFamily: tally(i => i.derivedFromFamily),
    byFamily,
    byArea,
  };
}

export { getCatalogDocument, familyDerivedTemplateFor };