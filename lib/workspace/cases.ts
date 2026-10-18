export interface WorkspaceCaseSummary {
  kind?: 'LOCAL_CASE';
  notes?: string;
  draftIds?: string[];
  draftRecordId?: string | null;
  id: string;
  title: string;
  expediente: string | null;
  matter: string | null;
  jurisdiction: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
  actor: string | null;
  counterparty: string | null;
}

/**
 * Summary projection for the cases list. The JSON documents remain in storage,
 * but the list endpoint never transfers their complete contents to Node.
 */
export const WORKSPACE_CASE_SUMMARY_SQL = `
SELECT
  "id",
  "title",
  "matter",
  "jurisdiction",
  "status",
  "createdAt",
  "updatedAt",
  COALESCE(
    json_extract("structuredDoc", '$.caseRefs.expediente'),
    json_extract("formData", '$.intake.expediente')
  ) AS "expediente",
  COALESCE(
    json_extract("structuredDoc", '$.parties.actor'),
    json_extract("structuredDoc", '$.parties.promovente'),
    json_extract("formData", '$.intake.promovente')
  ) AS "actor",
  COALESCE(
    json_extract("structuredDoc", '$.parties.demandado'),
    json_extract("structuredDoc", '$.parties.counterparty'),
    json_extract("formData", '$.intake.demandado')
  ) AS "counterparty",
  CASE
    WHEN json_valid("sourceDocuments") AND json_type("sourceDocuments") = 'array'
      THEN json_array_length("sourceDocuments")
    ELSE 0
  END AS "sourceCount"
FROM "LegalDraft"
WHERE "organizationId" = ? AND "userId" = ?
ORDER BY "updatedAt" DESC
`;

export interface WorkspaceCaseSummaryRow {
  id: string;
  title: string;
  matter: string | null;
  jurisdiction: string | null;
  status: string;
  createdAt: Date | string | number | bigint;
  updatedAt: Date | string | number | bigint;
  expediente: string | null;
  actor: string | null;
  counterparty: string | null;
  sourceCount: number;
}

/**
 * SQL crudo en SQLite devuelve DateTime como milisegundos (escritos por Prisma) o
 * como texto UTC sin zona ("YYYY-MM-DD HH:MM:SS", valor por defecto de la columna).
 */
function toIsoDate(value: Date | string | number | bigint): string {
  if (typeof value === 'bigint') return new Date(Number(value)).toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
    return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
  }
  return new Date(value).toISOString();
}

export function mapWorkspaceCaseSummaryRow(row: WorkspaceCaseSummaryRow): WorkspaceCaseSummary {
  return {
    id: row.id,
    title: row.title,
    expediente: row.expediente || null,
    matter: row.matter || null,
    jurisdiction: row.jurisdiction || null,
    status: row.status,
    createdAt: toIsoDate(row.createdAt),
    updatedAt: toIsoDate(row.updatedAt),
    sourceCount: Number(row.sourceCount) || 0,
    actor: row.actor || null,
    counterparty: row.counterparty || null,
  };
}

interface LegalDraftSummaryInput {
  id: string;
  title: string;
  matter: string | null;
  jurisdiction: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  formData: unknown;
  structuredDoc: unknown;
  sourceDocuments: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const result = text(value);
    if (result) return result;
  }
  return null;
}

export function mapLegalDraftToWorkspaceCaseSummary(draft: LegalDraftSummaryInput): WorkspaceCaseSummary {
  const formData = record(draft.formData);
  const intake = record(formData.intake);
  const structuredDoc = record(draft.structuredDoc);
  const caseRefs = record(structuredDoc.caseRefs);
  const parties = record(structuredDoc.parties);
  const sources = Array.isArray(draft.sourceDocuments) ? draft.sourceDocuments : [];

  return {
    id: draft.id,
    title: draft.title,
    expediente: firstText(caseRefs.expediente, intake.expediente),
    matter: text(draft.matter),
    jurisdiction: text(draft.jurisdiction),
    status: draft.status,
    createdAt: new Date(draft.createdAt).toISOString(),
    updatedAt: new Date(draft.updatedAt).toISOString(),
    sourceCount: sources.length,
    actor: firstText(parties.actor, parties.promovente, intake.promovente),
    counterparty: firstText(parties.demandado, parties.counterparty, intake.demandado),
  };
}
