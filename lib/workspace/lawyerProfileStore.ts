import { prisma } from '@/lib/prisma';
import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from './lawyerProfileTypes';

const VALID_TONES = ['formal_academico', 'combativo_tecnico', 'directo_conciso', 'jurisprudencial'] as const;
const VALID_CITATIONS = ['completo_con_registro', 'sintetico', 'pie_de_pagina', 'transcripcion_marcada'] as const;
const VALID_SECTION_LENGTHS = ['breve', 'medio', 'extenso'] as const;
const VALID_DOC_LENGTHS = ['conciso', 'estandar', 'extenso_exhaustivo'] as const;

type LawyerStyleProfileRow = {
  lawyerName: string | null;
  firmName: string | null;
  preferredTone: string | null;
  preferredStructure: unknown;
  preferredSectionOrdering: unknown;
  recurringFormulas: unknown;
  openingPatterns: unknown;
  closingPatterns: unknown;
  argumentPatterns: unknown;
  citationStyle: string | null;
  legalTerminology: unknown;
  preferredDefenses: unknown;
  preferredWayToContestFacts: unknown;
  preferredWayToContestBenefits: unknown;
  preferredWayToAttackEvidence: unknown;
  preferredWayToDevelopConstitutionalArguments: unknown;
  preferredWayToWritePetition: unknown;
  averageSectionLength: string | null;
  preferredDocumentLength: string | null;
  aiDisclosureAcknowledgedAt?: Date | string | null;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Convierte una fila de DB en un LawyerProfile completo y válido (campos faltantes → default). */
export function rowToLawyerProfile(row: LawyerStyleProfileRow, lawyerId: string): LawyerProfile {
  return {
    lawyerId,
    lawyerName: row.lawyerName?.trim() || DEFAULT_LAWYER_PROFILE.lawyerName,
    firmName: row.firmName?.trim() || DEFAULT_LAWYER_PROFILE.firmName,
    preferredTone: pickEnum(row.preferredTone, VALID_TONES, DEFAULT_LAWYER_PROFILE.preferredTone),
    preferredStructure: toStringArray(row.preferredStructure),
    preferredSectionOrdering: toStringArray(row.preferredSectionOrdering),
    recurringFormulas: toStringArray(row.recurringFormulas),
    openingPatterns: toStringArray(row.openingPatterns),
    closingPatterns: toStringArray(row.closingPatterns),
    argumentPatterns: toStringArray(row.argumentPatterns),
    citationStyle: pickEnum(row.citationStyle, VALID_CITATIONS, DEFAULT_LAWYER_PROFILE.citationStyle),
    legalTerminology: toStringArray(row.legalTerminology),
    preferredDefenses: toStringArray(row.preferredDefenses),
    preferredWayToContestFacts: toStringArray(row.preferredWayToContestFacts),
    preferredWayToContestBenefits: toStringArray(row.preferredWayToContestBenefits),
    preferredWayToAttackEvidence: toStringArray(row.preferredWayToAttackEvidence),
    preferredWayToDevelopConstitutionalArguments: toStringArray(row.preferredWayToDevelopConstitutionalArguments),
    preferredWayToWritePetition: toStringArray(row.preferredWayToWritePetition),
    averageSectionLength: pickEnum(row.averageSectionLength, VALID_SECTION_LENGTHS, DEFAULT_LAWYER_PROFILE.averageSectionLength),
    preferredDocumentLength: pickEnum(row.preferredDocumentLength, VALID_DOC_LENGTHS, DEFAULT_LAWYER_PROFILE.preferredDocumentLength),
    createdAt: undefined,
    updatedAt: undefined,
    aiDisclosureAcknowledgedAt: row.aiDisclosureAcknowledgedAt ? new Date(row.aiDisclosureAcknowledgedAt).toISOString() : undefined,
  };
}

/**
 * Carga el perfil de estilo de la organización. Si no existe fila en DB retorna
 * DEFAULT_LAWYER_PROFILE sin persistir nada. Nunca escribe.
 */
export async function loadLawyerProfile(
  organizationId: string,
  lawyerId: string
): Promise<{ profile: LawyerProfile; fromDefault: boolean }> {
  try {
    const row = await prisma.lawyerStyleProfile.findUnique({ where: { organizationId } });
    if (!row) return { profile: { ...DEFAULT_LAWYER_PROFILE, lawyerId }, fromDefault: true };
    return { profile: rowToLawyerProfile(row, lawyerId), fromDefault: false };
  } catch (err: any) {
    console.warn('[lawyerProfileStore] No se pudo cargar el perfil guardado:', err?.message);
    return { profile: { ...DEFAULT_LAWYER_PROFILE, lawyerId }, fromDefault: true };
  }
}

/** Sanitiza un campo array del input: solo strings no vacíos. */
function sanitizeInputArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter((v) => v.length > 0);
}

function optionalScalar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

/**
 * Única fuente de reglas de sanitización del payload de perfil: acepta solo campos
 * conocidos con tipos válidos y descarta todo lo demás (incluye lawyerId/organizationId,
 * que nunca se aceptan del cliente). Usada por PUT y por la extracción con IA.
 */
export function sanitizeProfileInput(input: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.aiDisclosureAcknowledged === true) data.aiDisclosureAcknowledgedAt = new Date();

  const scalarStringFields = ['lawyerName', 'firmName'] as const;
  for (const field of scalarStringFields) {
    const v = optionalScalar(input[field]);
    if (v !== undefined) data[field] = v || null;
  }

  const enumFields: Array<[string, readonly string[]]> = [
    ['preferredTone', VALID_TONES],
    ['citationStyle', VALID_CITATIONS],
    ['averageSectionLength', VALID_SECTION_LENGTHS],
    ['preferredDocumentLength', VALID_DOC_LENGTHS],
  ];
  for (const [field, allowed] of enumFields) {
    const v = input[field];
    if (typeof v === 'string' && allowed.includes(v)) data[field] = v;
  }

  const arrayFields = [
    'preferredStructure',
    'preferredSectionOrdering',
    'recurringFormulas',
    'openingPatterns',
    'closingPatterns',
    'argumentPatterns',
    'legalTerminology',
    'preferredDefenses',
    'preferredWayToContestFacts',
    'preferredWayToContestBenefits',
    'preferredWayToAttackEvidence',
    'preferredWayToDevelopConstitutionalArguments',
    'preferredWayToWritePetition',
  ] as const;
  for (const field of arrayFields) {
    const v = sanitizeInputArray(input[field]);
    if (v !== undefined) data[field] = v;
  }

  return data;
}

/** Guarda/actualiza el perfil (upsert por organizationId @unique). Acepta payload parcial o completo. */
export async function saveLawyerProfile(
  organizationId: string,
  lawyerId: string,
  input: Record<string, unknown>
): Promise<LawyerProfile> {
  const data = sanitizeProfileInput(input);

  const row = await prisma.lawyerStyleProfile.upsert({
    where: { organizationId },
    update: data,
    create: { organizationId, ...data },
  });
  return rowToLawyerProfile(row, lawyerId);
}
