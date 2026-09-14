import { canonicalizeResearchValue, sha256ResearchValue, stableResearchId } from './canonical';
import type {
  LegalCodeLabel,
  LegalRegimeResolution,
  ResearchClock,
} from './types';

type PrimitiveRecord = Record<string, unknown>;

export interface LegalRegimeInput {
  taxonomy?: PrimitiveRecord;
  legalContext?: PrimitiveRecord;
  sourceFields?: PrimitiveRecord;
  technicalDocumentDefaults?: PrimitiveRecord;
  materialFields?: string[];
}

function isRecord(value: unknown): value is PrimitiveRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstDefined(input: LegalRegimeInput, key: string): unknown {
  return input.legalContext?.[key]
    ?? input.sourceFields?.[key]
    ?? input.taxonomy?.[key];
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function labelFor(value: unknown, kind: 'country' | 'entity' | 'matter' | 'procedure'): LegalCodeLabel | undefined {
  if (isRecord(value)) {
    const code = text(value.code);
    if (!code) return undefined;
    const displayName = text(value.displayName) || text(value.label) || code;
    return {
      code: kind === 'country' || kind === 'entity' ? code.toUpperCase() : code.toLowerCase(),
      displayName,
    };
  }
  const raw = text(value);
  if (!raw) return undefined;
  return {
    code: kind === 'country' || kind === 'entity' ? raw.toUpperCase() : raw.toLowerCase(),
    displayName: raw,
  };
}

function scopeFor(value: unknown): LegalRegimeResolution['scope'] {
  const raw = text(value)?.toLowerCase();
  switch (raw) {
    case 'federal': return 'FEDERAL';
    case 'state':
    case 'estatal': return 'STATE';
    case 'local': return 'LOCAL';
    case 'municipal': return 'MUNICIPAL';
    case 'administrative':
    case 'administrativa': return 'ADMINISTRATIVE';
    case 'electoral': return 'ELECTORAL';
    case 'military':
    case 'militar': return 'MILITARY';
    case 'other':
    case 'otra': return 'OTHER';
    default: return 'UNKNOWN';
  }
}

function temporalPrecisionFor(value: unknown, relevantDate?: string): LegalRegimeResolution['temporalPrecision'] {
  const explicit = text(value)?.toUpperCase();
  if (explicit === 'DAY' || explicit === 'MONTH' || explicit === 'YEAR' || explicit === 'UNKNOWN') return explicit;
  if (!relevantDate) return 'UNKNOWN';
  if (/^\d{4}-\d{2}-\d{2}$/.test(relevantDate)) return 'DAY';
  if (/^\d{4}-\d{2}$/.test(relevantDate)) return 'MONTH';
  if (/^\d{4}$/.test(relevantDate)) return 'YEAR';
  return 'UNKNOWN';
}

function addFieldEvidence(
  entries: LegalRegimeResolution['fieldEvidence'],
  field: string,
  value: LegalCodeLabel | string | undefined,
  source: LegalRegimeResolution['fieldEvidence'][number]['source'],
): void {
  if (value === undefined || value === '') return;
  entries.push({ field, value, source, provenanceIds: [] });
}

export function isMaterialRegimeFieldMissing(resolution: LegalRegimeResolution): boolean {
  return resolution.status === 'LEGAL_REGIME_UNRESOLVED' || resolution.unresolvedFields.length > 0;
}

export async function resolveLegalRegime(
  input: LegalRegimeInput,
  clock: ResearchClock = () => new Date(),
): Promise<LegalRegimeResolution> {
  const country = labelFor(firstDefined(input, 'country'), 'country');
  const scope = scopeFor(firstDefined(input, 'scope') ?? firstDefined(input, 'jurisdiction'));
  const federativeEntity = labelFor(firstDefined(input, 'federativeEntity'), 'entity');
  const matter = labelFor(firstDefined(input, 'matter'), 'matter');
  const procedure = labelFor(firstDefined(input, 'procedure'), 'procedure');
  const proceduralStage = text(firstDefined(input, 'proceduralStage'));
  const instance = text(firstDefined(input, 'instance'));
  const issuingOrAdjudicatingBody = text(firstDefined(input, 'issuingOrAdjudicatingBody') ?? firstDefined(input, 'authority'));
  const relevantDate = text(firstDefined(input, 'relevantDate'));
  const temporalPrecision = temporalPrecisionFor(firstDefined(input, 'temporalPrecision'), relevantDate);
  const materialFields = new Set([
    ...(input.materialFields || []),
    ...((input.legalContext?.materialFields as unknown[]) || []).filter((field): field is string => typeof field === 'string'),
  ]);
  const unresolvedFields: string[] = [];
  if (!country) unresolvedFields.push('country');
  if (scope === 'UNKNOWN') unresolvedFields.push('scope');
  if (!matter) unresolvedFields.push('matter');
  if (materialFields.has('procedure') && !procedure) unresolvedFields.push('procedure');
  if ((scope === 'STATE' || scope === 'LOCAL') && !federativeEntity) unresolvedFields.push('federativeEntity');
  if (materialFields.has('relevantDate') && !relevantDate) unresolvedFields.push('relevantDate');
  if (materialFields.has('proceduralStage') && !proceduralStage) unresolvedFields.push('proceduralStage');
  if (materialFields.has('instance') && !instance) unresolvedFields.push('instance');
  if (materialFields.has('issuingOrAdjudicatingBody') && !issuingOrAdjudicatingBody) unresolvedFields.push('issuingOrAdjudicatingBody');

  const fieldEvidence: LegalRegimeResolution['fieldEvidence'] = [];
  const source: LegalRegimeResolution['fieldEvidence'][number]['source'] = input.legalContext
    ? 'MANUAL_INPUT'
    : input.sourceFields
      ? 'EXPLICIT_SOURCE'
      : 'EXPLICIT_TAXONOMY';
  addFieldEvidence(fieldEvidence, 'country', country, source);
  addFieldEvidence(fieldEvidence, 'scope', scope === 'UNKNOWN' ? undefined : scope, source);
  addFieldEvidence(fieldEvidence, 'federativeEntity', federativeEntity, source);
  addFieldEvidence(fieldEvidence, 'matter', matter, source);
  addFieldEvidence(fieldEvidence, 'procedure', procedure, source);
  addFieldEvidence(fieldEvidence, 'proceduralStage', proceduralStage, source);
  addFieldEvidence(fieldEvidence, 'instance', instance, source);
  addFieldEvidence(fieldEvidence, 'issuingOrAdjudicatingBody', issuingOrAdjudicatingBody, source);
  addFieldEvidence(fieldEvidence, 'relevantDate', relevantDate, source);

  const semantic = canonicalizeResearchValue({
    country,
    scope,
    federativeEntity,
    matter,
    procedure,
    proceduralStage,
    instance,
    issuingOrAdjudicatingBody,
    relevantDate,
    temporalPrecision,
    unresolvedFields: [...new Set(unresolvedFields)].sort(),
  });
  const resolutionHash = await sha256ResearchValue(semantic);
  return {
    id: stableResearchId('regime', semantic),
    status: unresolvedFields.length > 0 ? 'LEGAL_REGIME_UNRESOLVED' : 'RESOLVED',
    country,
    scope,
    federativeEntity,
    matter,
    procedure,
    proceduralStage,
    instance,
    issuingOrAdjudicatingBody,
    relevantDate,
    temporalPrecision,
    fieldEvidence,
    unresolvedFields: [...new Set(unresolvedFields)].sort(),
    resolutionHash,
  };
}
