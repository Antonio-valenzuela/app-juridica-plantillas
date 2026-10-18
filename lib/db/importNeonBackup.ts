import type { PrismaClient } from '@prisma/client';

/**
 * Importación OPCIONAL desde un respaldo exportado de Neon/Postgres.
 *
 * No se conecta a Neon. Lee un JSON ya exportado (ver docs/persistencia-local.md,
 * "Importar un respaldo de Neon") con la forma:
 *
 *   { "format": "lexplantillas-neon-export-v1",
 *     "tables": { "Organization": [...], "User": [...], "LegalTemplate": [...],
 *                 "LegalDraft": [...], "workspace_case_party": [...],
 *                 "LawyerStyleProfile": [...] } }
 *
 * Idempotente: cada fila se inserta o actualiza por su id, en una sola transacción.
 * Las partes que chocan con la regla "una parte por rol y expediente" se omiten y
 * se reportan; nunca se sobrescribe en silencio. La telemetría de IA no se importa.
 */

export const NEON_EXPORT_FORMAT = 'lexplantillas-neon-export-v1';

type Row = Record<string, unknown>;

export interface NeonImportReport {
  imported: Record<string, number>;
  skipped: Array<{ table: string; id: string; reason: string }>;
}

const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'indexedAt', 'aiDisclosureAcknowledgedAt']);

function normalize(row: Row, allowed: readonly string[]): Row {
  const output: Row = {};
  for (const key of allowed) {
    if (!(key in row)) continue;
    const value = row[key];
    output[key] = DATE_FIELDS.has(key) && typeof value === 'string' ? new Date(value) : value;
  }
  if (typeof output.id !== 'string' || !output.id) throw new Error('NEON_IMPORT_ROW_WITHOUT_ID');
  return output;
}

const COLUMNS = {
  Organization: ['id', 'name', 'slug', 'createdAt', 'updatedAt'],
  User: ['id', 'email', 'name', 'createdAt', 'updatedAt'],
  LegalTemplate: ['id', 'slug', 'title', 'category', 'jurisdiction', 'practiceArea', 'documentType', 'description', 'content',
    'originalText', 'legalBasis', 'variables', 'structureJson', 'applicableLaws', 'warnings', 'disclaimer', 'exportFormats',
    'aiInstructions', 'systemPrompt', 'contentHash', 'version', 'visibility', 'organizationId', 'createdBy', 'sourceFileName',
    'indexed', 'indexedAt', 'createdAt', 'updatedAt'],
  LegalDraft: ['id', 'organizationId', 'userId', 'templateId', 'title', 'documentType', 'matter', 'jurisdiction', 'formData',
    'renderedText', 'pendingMarkers', 'structuredDoc', 'pipelineState', 'sourceDocuments', 'validationResults',
    'generationMetadata', 'status', 'createdAt', 'updatedAt'],
  CaseParty: ['id', 'organizationId', 'caseKey', 'draftId', 'role', 'name', 'source', 'confidence', 'createdAt', 'updatedAt'],
  LawyerStyleProfile: ['id', 'organizationId', 'lawyerName', 'firmName', 'preferredTone', 'preferredStructure',
    'preferredSectionOrdering', 'recurringFormulas', 'openingPatterns', 'closingPatterns', 'argumentPatterns', 'citationStyle',
    'legalTerminology', 'preferredDefenses', 'preferredWayToContestFacts', 'preferredWayToContestBenefits',
    'preferredWayToAttackEvidence', 'preferredWayToDevelopConstitutionalArguments', 'preferredWayToWritePetition',
    'averageSectionLength', 'preferredDocumentLength', 'aiDisclosureAcknowledgedAt', 'createdAt', 'updatedAt'],
} as const;

function rows(tables: Record<string, unknown>, ...names: string[]): Row[] {
  for (const name of names) {
    const value = tables[name];
    if (value === undefined) continue;
    if (!Array.isArray(value)) throw new Error(`NEON_IMPORT_TABLE_NOT_ARRAY:${name}`);
    return value as Row[];
  }
  return [];
}

export function parseNeonExport(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== NEON_EXPORT_FORMAT) {
    throw new Error('NEON_IMPORT_UNSUPPORTED_FORMAT');
  }
  const tables = (raw as { tables?: unknown }).tables;
  if (!tables || typeof tables !== 'object') throw new Error('NEON_IMPORT_TABLES_MISSING');
  return tables as Record<string, unknown>;
}

export async function importNeonExport(client: PrismaClient, raw: unknown): Promise<NeonImportReport> {
  const tables = parseNeonExport(raw);
  const report: NeonImportReport = { imported: {}, skipped: [] };
  const count = (table: string) => { report.imported[table] = (report.imported[table] ?? 0) + 1; };

  await client.$transaction(async (tx) => {
    // Orden por dependencias: organización/usuario → plantillas → borradores → partes/perfil.
    for (const row of rows(tables, 'Organization')) {
      const data = normalize(row, COLUMNS.Organization);
      await tx.organization.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('Organization');
    }
    for (const row of rows(tables, 'User')) {
      const data = normalize(row, COLUMNS.User);
      await tx.user.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('User');
    }
    for (const row of rows(tables, 'LegalTemplate')) {
      const data = normalize(row, COLUMNS.LegalTemplate);
      await tx.legalTemplate.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('LegalTemplate');
    }
    for (const row of rows(tables, 'LegalDraft')) {
      const data = normalize(row, COLUMNS.LegalDraft);
      await tx.legalDraft.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('LegalDraft');
    }
    for (const row of rows(tables, 'workspace_case_party', 'CaseParty')) {
      const data = normalize(row, COLUMNS.CaseParty);
      const clash = await tx.caseParty.findFirst({
        where: { organizationId: data.organizationId as string, caseKey: data.caseKey as string, role: data.role as string, NOT: { id: data.id as string } },
        select: { id: true },
      });
      if (clash) {
        report.skipped.push({ table: 'workspace_case_party', id: data.id as string, reason: `DUPLICATE_ROLE_FOR_CASE:${clash.id}` });
        continue;
      }
      await tx.caseParty.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('workspace_case_party');
    }
    for (const row of rows(tables, 'LawyerStyleProfile')) {
      const data = normalize(row, COLUMNS.LawyerStyleProfile);
      await tx.lawyerStyleProfile.upsert({ where: { id: data.id as string }, create: data as never, update: data as never });
      count('LawyerStyleProfile');
    }
  }, { timeout: 120_000 });
  return report;
}
