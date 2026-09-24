export interface WorkspaceCaseSummary {
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
 * Summary projection for the cases list. The JSONB documents remain in storage,
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
    "structuredDoc"->'caseRefs'->>'expediente',
    "formData"->'intake'->>'expediente'
  ) AS "expediente",
  COALESCE(
    "structuredDoc"->'parties'->>'actor',
    "structuredDoc"->'parties'->>'promovente',
    "formData"->'intake'->>'promovente'
  ) AS "actor",
  COALESCE(
    "structuredDoc"->'parties'->>'demandado',
    "structuredDoc"->'parties'->>'counterparty',
    "formData"->'intake'->>'demandado'
  ) AS "counterparty",
  CASE
    WHEN jsonb_typeof("sourceDocuments") = 'array'
      THEN jsonb_array_length("sourceDocuments")
    ELSE 0
  END AS "sourceCount"
FROM "LegalDraft"
WHERE "organizationId" = $1 AND "userId" = $2
ORDER BY "updatedAt" DESC
`;

export interface WorkspaceCaseSummaryRow {
  id: string;
  title: string;
  matter: string | null;
  jurisdiction: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expediente: string | null;
  actor: string | null;
  counterparty: string | null;
  sourceCount: number;
}

export function mapWorkspaceCaseSummaryRow(row: WorkspaceCaseSummaryRow): WorkspaceCaseSummary {
  return {
    id: row.id,
    title: row.title,
    expediente: row.expediente || null,
    matter: row.matter || null,
    jurisdiction: row.jurisdiction || null,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
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
