import type { SourceAuthorityMention } from '../case-extraction/types';
import { sha256ResearchValue, stableResearchId } from './canonical';
import type {
  AuthorityCandidate,
  AuthorityRejectionReason,
  LegalRegimeResolution,
  ResearchVerificationRequest,
  OfficialSourceEvidence,
  ResearchClock,
  SupportedProposition,
  VerifiedAuthority,
} from './types';

export interface AuthorityVerificationInput {
  candidate?: AuthorityCandidate;
  evidence?: OfficialSourceEvidence;
  request: ResearchVerificationRequest;
  regime: LegalRegimeResolution;
  sourceMention?: SourceAuthorityMention;
  proposition?: SupportedProposition;
}

export interface AuthorityVerificationResult {
  verifiedAuthority?: VerifiedAuthority;
  rejection?: {
    candidate?: AuthorityCandidate;
    reasons: AuthorityRejectionReason[];
    detail: string[];
    rejectedAt: string;
  };
}

function normalizedIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function compatibleAuthorityType(
  mention: SourceAuthorityMention,
  candidate: AuthorityCandidate,
): boolean {
  if (mention.authorityType === 'LAW') {
    return candidate.authorityType === 'STATUTE' || candidate.authorityType === 'CONSTITUTION';
  }
  if (mention.authorityType === 'ARTICLE') {
    return candidate.authorityType === 'STATUTE' || candidate.authorityType === 'CODE';
  }
  return mention.authorityType === candidate.authorityType;
}

function rejection(
  candidate: AuthorityCandidate | undefined,
  reasons: AuthorityRejectionReason[],
  detail: string[],
  clock: ResearchClock,
): AuthorityVerificationResult {
  return {
    rejection: {
      candidate,
      reasons,
      detail,
      rejectedAt: clock().toISOString(),
    },
  };
}

function candidateCanonicalCitation(
  candidate: AuthorityCandidate,
  sourceMention?: SourceAuthorityMention,
): string {
  return (
    candidate.canonicalCitationCandidate ||
    candidate.observedCitation ||
    sourceMention?.citationText ||
    `${candidate.authorityType}:${candidate.id}`
  ).trim();
}

function validateIdentity(
  candidate: AuthorityCandidate,
  sourceMention?: SourceAuthorityMention,
): string[] {
  if (!sourceMention) return [];

  const details: string[] = [];
  if (candidate.sourceAuthorityMentionId !== sourceMention.id) {
    details.push('La autoridad candidata no conserva la relación con la mención de origen.');
  }
  if (!compatibleAuthorityType(sourceMention, candidate)) {
    details.push('El tipo de autoridad candidata no coincide con la mención de origen.');
  }

  const mentionCitation = normalizedIdentity(sourceMention.citationText);
  const candidateCitation = normalizedIdentity(candidateCanonicalCitation(candidate, sourceMention));
  if (!mentionCitation || !candidateCitation || mentionCitation !== candidateCitation) {
    details.push('La cita observada no coincide con la identidad canónica candidata.');
  }
  return details;
}

export type AuthorityJurisdictionCheck = VerifiedAuthority['jurisdictionValidity'] & {
  reasons: AuthorityRejectionReason[];
  detail: string[];
};

export type AuthorityTemporalCheck = VerifiedAuthority['temporalValidity'] & {
  reasons: AuthorityRejectionReason[];
  detail: string[];
};

export interface AuthorityKindClassification {
  authorityType: AuthorityCandidate['authorityType'];
  bindingCharacter: NonNullable<VerifiedAuthority['jurisdictionValidity']['bindingCharacter']>;
}

function normalizedCode(value?: string): string | undefined {
  return value ? normalizedIdentity(value).replace(/ /g, '') : undefined;
}

function candidateJurisdiction(value?: string): { scope?: string; federativeEntity?: string } {
  if (!value) return {};
  const parts = value.toUpperCase().split(':');
  if (parts.length === 2) return { scope: parts[0], federativeEntity: parts[1] };
  if (value.toUpperCase().startsWith('MX-')) return { scope: 'STATE', federativeEntity: value.toUpperCase() };
  return { scope: value.toUpperCase() };
}

export function classifyAuthorityKind(candidate: AuthorityCandidate): AuthorityKindClassification {
  return {
    authorityType: candidate.authorityType,
    bindingCharacter:
      candidate.authorityType === 'THESIS'
        ? 'PERSUASIVE'
        : candidate.authorityType === 'JURISPRUDENCE'
          ? 'BINDING_WHEN_APPLICABLE'
          : 'BINDING_WHEN_APPLICABLE',
  };
}

export function validateAuthorityJurisdiction(
  candidate: AuthorityCandidate,
  regime: LegalRegimeResolution,
): AuthorityJurisdictionCheck {
  const parsed = candidateJurisdiction(candidate.jurisdiction);
  const detail: string[] = [];
  const scopeMatches = parsed.scope === regime.scope;
  const expectedEntity = regime.federativeEntity?.code.toUpperCase();
  const entityMatches = expectedEntity ? parsed.federativeEntity === expectedEntity : true;
  const matterMatches = regime.matter
    ? !candidate.matter || normalizedCode(candidate.matter) === normalizedCode(regime.matter.code)
    : true;
  const procedureMatches = regime.procedure
    ? !candidate.procedure || normalizedCode(candidate.procedure) === normalizedCode(regime.procedure.code)
    : true;

  if (!candidate.jurisdiction) detail.push('La candidata no declara jurisdicción.');
  if (!scopeMatches) detail.push('El alcance de la candidata no coincide con el régimen resuelto.');
  if (!entityMatches) detail.push('La entidad federativa de la candidata no coincide con el régimen resuelto.');
  if (!matterMatches) detail.push('La materia de la candidata no coincide con el régimen resuelto.');
  if (!procedureMatches) detail.push('El procedimiento de la candidata no coincide con el régimen resuelto.');

  const applicable = detail.length === 0 && regime.status === 'RESOLVED';
  return {
    status: applicable ? 'APPLICABLE' : detail.length > 0 ? 'WRONG_JURISDICTION' : 'REVIEW_REQUIRED',
    country: regime.country?.code,
    scope: regime.scope,
    federativeEntity: regime.federativeEntity?.code,
    matter: regime.matter?.code,
    procedure: regime.procedure?.code,
    issuingBody: candidate.issuingAuthority,
    bindingCharacter: classifyAuthorityKind(candidate).bindingCharacter,
    basis: applicable
      ? ['La jurisdicción, entidad, materia y procedimiento coinciden con el régimen resuelto.']
      : detail,
    reasons: applicable ? [] : ['WRONG_JURISDICTION'],
    detail,
  };
}

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

function calendarParts(value?: string): CalendarParts | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return undefined;
  return {
    year: Number(match[1]),
    month: Number(match[2] || 1),
    day: Number(match[3] || 1),
  };
}

function calendarToken(parts: CalendarParts): number {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

function relevantDateBounds(
  value: string,
  precision: LegalRegimeResolution['temporalPrecision'],
): { start: number; end: number } | undefined {
  const parts = calendarParts(value);
  if (!parts) return undefined;
  if (precision === 'YEAR' || /^\d{4}$/.test(value)) {
    return { start: parts.year * 10000 + 101, end: parts.year * 10000 + 1231 };
  }
  if (precision === 'MONTH' || /^\d{4}-\d{2}$/.test(value)) {
    const endDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
    return {
      start: parts.year * 10000 + parts.month * 100 + 1,
      end: parts.year * 10000 + parts.month * 100 + endDay,
    };
  }
  const token = calendarToken(parts);
  return { start: token, end: token };
}

export function validateAuthorityTemporalStatus(
  candidate: AuthorityCandidate,
  regime: LegalRegimeResolution,
  now: Date,
): AuthorityTemporalCheck {
  const detail: string[] = [];
  const relevant = regime.relevantDate
    ? relevantDateBounds(regime.relevantDate, regime.temporalPrecision)
    : undefined;
  const effectiveFrom = calendarParts(candidate.effectiveFrom);
  const effectiveTo = calendarParts(candidate.effectiveTo);
  const nowToken = calendarToken({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() });

  if (candidate.temporalStatus === 'REPEALED') {
    detail.push('La candidata declara estado REPEALED.');
    return {
      status: 'REPEALED',
      relevantDate: regime.relevantDate,
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      checkedAt: now.toISOString(),
      basis: detail,
      reasons: ['OUTDATED'],
      detail,
    };
  }
  if (candidate.temporalStatus === 'SUPERSEDED') {
    detail.push('La candidata declara estado SUPERSEDED.');
    return {
      status: 'SUPERSEDED',
      relevantDate: regime.relevantDate,
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      checkedAt: now.toISOString(),
      basis: detail,
      reasons: ['OUTDATED'],
      detail,
    };
  }

  if (relevant && effectiveFrom && calendarToken(effectiveFrom) > relevant.end) {
    detail.push('La entrada en vigor es posterior a la fecha relevante.');
  }
  if (relevant && effectiveTo && calendarToken(effectiveTo) < relevant.start) {
    detail.push('La terminación de vigencia es anterior a la fecha relevante.');
  }
  if (!relevant && effectiveTo && calendarToken(effectiveTo) < nowToken) {
    detail.push('La terminación de vigencia es anterior a la fecha de verificación.');
  }
  if (detail.length > 0) {
    return {
      status: 'SUPERSEDED',
      relevantDate: regime.relevantDate,
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      checkedAt: now.toISOString(),
      basis: detail,
      reasons: ['OUTDATED'],
      detail,
    };
  }

  const historical = Boolean(relevant && relevant.end < nowToken);
  return {
    status: historical ? 'HISTORICALLY_APPLICABLE' : regime.relevantDate ? 'CURRENT_AND_APPLICABLE' : 'CURRENT_BUT_TEMPORAL_REVIEW_REQUIRED',
    relevantDate: regime.relevantDate,
    effectiveFrom: candidate.effectiveFrom,
    effectiveTo: candidate.effectiveTo,
    checkedAt: now.toISOString(),
    basis: regime.relevantDate
      ? ['La fecha relevante queda dentro del periodo de vigencia reportado.']
      : ['No se recibió fecha relevante suficiente para una conclusión temporal plena.'],
    reasons: [],
    detail: [],
  };
}

function temporalValidity(
  candidate: AuthorityCandidate,
  regime: LegalRegimeResolution,
  checkedAt: string,
): VerifiedAuthority['temporalValidity'] {
  const check = validateAuthorityTemporalStatus(candidate, regime, new Date(checkedAt));
  return {
    status: check.status,
    relevantDate: check.relevantDate,
    effectiveFrom: check.effectiveFrom,
    effectiveTo: check.effectiveTo,
    checkedAt,
    basis: check.basis,
  };
}

function jurisdictionValidity(
  candidate: AuthorityCandidate,
  regime: LegalRegimeResolution,
): VerifiedAuthority['jurisdictionValidity'] {
  const check = validateAuthorityJurisdiction(candidate, regime);
  return {
    status: check.status,
    country: check.country,
    scope: check.scope,
    federativeEntity: check.federativeEntity,
    matter: check.matter,
    procedure: check.procedure,
    issuingBody: check.issuingBody,
    bindingCharacter: check.bindingCharacter,
    basis: check.basis,
  };
}

export async function verifyAuthorityCandidate(
  input: AuthorityVerificationInput,
  clock: ResearchClock = () => new Date(),
): Promise<AuthorityVerificationResult> {
  const { candidate, evidence, request, regime, proposition } = input;
  if (!candidate) {
    return rejection(undefined, ['NOT_FOUND'], ['No se recuperó una autoridad candidata.'], clock);
  }
  if (candidate.requestId !== request.id) {
    return rejection(candidate, ['MISMATCH'], ['La candidata pertenece a otra solicitud de investigación.'], clock);
  }
  if (candidate.sourceTier !== 'OFFICIAL_PRIMARY') {
    return rejection(candidate, ['NON_OFFICIAL_ONLY'], ['La candidata no proviene de una fuente primaria oficial.'], clock);
  }
  if (!evidence || evidence.sourceTier !== 'OFFICIAL_PRIMARY') {
    return rejection(candidate, ['INSUFFICIENT_METADATA'], ['Falta evidencia oficial primaria recuperada.'], clock);
  }
  if (
    !candidate.sourceUrl ||
    !candidate.sourceDomain ||
    !candidate.retrievedAt ||
    !candidate.issuingAuthority ||
    candidate.metadataStatus !== 'COMPLETE' ||
    !evidence.sourceUrl ||
    !evidence.sourceDomain ||
    !evidence.sourceHash ||
    !evidence.retrievedAt
  ) {
    return rejection(candidate, ['INSUFFICIENT_METADATA'], ['La identidad o la evidencia oficial está incompleta.'], clock);
  }

  const identityDetails = validateIdentity(candidate, input.sourceMention);
  if (identityDetails.length > 0) {
    return rejection(candidate, ['MISMATCH'], identityDetails, clock);
  }
  if (
    !proposition ||
    !proposition.text.trim() ||
    (!evidence.excerptHash && !proposition.sourceLocator) ||
    (proposition.supportLevel !== 'DIRECT' && proposition.limitations.length === 0)
  ) {
    return rejection(candidate, ['NO_PROPOSITION_SUPPORT'], ['La evidencia no tiene una proposición jurídica directa.'], clock);
  }

  const checkedAt = clock().toISOString();
  const jurisdictionCheck = validateAuthorityJurisdiction(candidate, regime);
  if (jurisdictionCheck.reasons.length > 0) {
    return rejection(candidate, jurisdictionCheck.reasons, jurisdictionCheck.detail, clock);
  }
  const temporalCheck = validateAuthorityTemporalStatus(candidate, regime, new Date(checkedAt));
  if (temporalCheck.reasons.length > 0) {
    return rejection(candidate, temporalCheck.reasons, temporalCheck.detail, clock);
  }
  const canonicalCitation = candidateCanonicalCitation(candidate, input.sourceMention);
  const identityKey = stableResearchId('authority-identity', {
    authorityType: candidate.authorityType,
    canonicalCitation: normalizedIdentity(canonicalCitation),
    issuingAuthority: normalizedIdentity(candidate.issuingAuthority),
  });
  const semanticVerificationData = {
    requestId: request.id,
    candidateId: candidate.id,
    identityKey,
    sourceHash: evidence.sourceHash,
    excerptHash: evidence.excerptHash,
    proposition,
    regimeResolutionId: regime.id,
  };
  const verificationHash = await sha256ResearchValue(semanticVerificationData);

  return {
    verifiedAuthority: {
      id: stableResearchId('verified-authority', semanticVerificationData),
      provider: candidate.provider,
      officialUrl: evidence.sourceUrl,
      identifier: candidate.identifier || candidate.locator,
      title: candidate.title || canonicalCitation,
      identity: {
        canonicalCitation,
        authorityType: candidate.authorityType,
        issuingAuthority: candidate.issuingAuthority,
        identityKey,
      },
      source: evidence,
      temporalValidity: {
        status: temporalCheck.status,
        relevantDate: temporalCheck.relevantDate,
        effectiveFrom: temporalCheck.effectiveFrom,
        effectiveTo: temporalCheck.effectiveTo,
        checkedAt,
        basis: temporalCheck.basis,
      },
      jurisdictionValidity: {
        status: jurisdictionCheck.status,
        country: jurisdictionCheck.country,
        scope: jurisdictionCheck.scope,
        federativeEntity: jurisdictionCheck.federativeEntity,
        matter: jurisdictionCheck.matter,
        procedure: jurisdictionCheck.procedure,
        issuingBody: jurisdictionCheck.issuingBody,
        bindingCharacter: jurisdictionCheck.bindingCharacter,
        basis: jurisdictionCheck.basis,
      },
      proposition,
      verificationStatus: 'VERIFIED',
      supportsLegalIssueIds: request.legalIssueId ? [request.legalIssueId] : [],
      sourceAuthorityMentionIds: input.sourceMention ? [input.sourceMention.id] : [],
      verificationHash,
    },
  };
}

export async function verifySourceCitedMention(
  input: AuthorityVerificationInput & { mention: SourceAuthorityMention },
  clock: ResearchClock = () => new Date(),
): Promise<AuthorityVerificationResult> {
  return verifyAuthorityCandidate({ ...input, sourceMention: input.mention }, clock);
}
