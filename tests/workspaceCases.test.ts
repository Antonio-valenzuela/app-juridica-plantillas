import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_CASE_SUMMARY_SQL,
  mapLegalDraftToWorkspaceCaseSummary,
} from '@/lib/workspace/cases';

// Fase 1 (2026-10-13): el motor pasó de Postgres/JSONB (->, ->>, jsonb_array_length, $1)
// a SQLite (json_extract, json_array_length, ?). El contrato probado es el mismo:
// proyección de solo resumen y aislamiento por organización y usuario.
describe('workspace case summaries', () => {
  it('projects only summary fields instead of selecting large persisted JSON blobs', () => {
    expect(WORKSPACE_CASE_SUMMARY_SQL).toContain('json_array_length');
    expect(WORKSPACE_CASE_SUMMARY_SQL).toContain(`json_extract("structuredDoc"`);
    // Columna JSON completa como elemento de la lista (no dentro de json_extract(...)).
    expect(WORKSPACE_CASE_SUMMARY_SQL).not.toMatch(/^\s*"structuredDoc"\s*,/im);
    expect(WORKSPACE_CASE_SUMMARY_SQL).not.toMatch(/^\s*"sourceDocuments"\s*,/im);
  });

  it('aplica el aislamiento del workspace por organización y usuario en la consulta', () => {
    expect(WORKSPACE_CASE_SUMMARY_SQL).toMatch(/WHERE\s+"organizationId"\s*=\s*\?\s+AND\s+"userId"\s*=\s*\?/i);
  });

  it('maps only explicit persisted case data and keeps missing identifiers empty', () => {
    const summary = mapLegalDraftToWorkspaceCaseSummary({
      id: 'draft-1',
      title: 'Contestación guardada',
      matter: 'Amparo',
      jurisdiction: 'federal',
      status: 'DRAFT',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-21T12:00:00.000Z'),
      formData: { intake: { expediente: '123/2026' } },
      structuredDoc: { parties: { actor: 'Persona promovente' } },
      sourceDocuments: [{ id: 'source-1' }],
    });

    expect(summary).toMatchObject({
      id: 'draft-1',
      title: 'Contestación guardada',
      expediente: '123/2026',
      matter: 'Amparo',
      jurisdiction: 'federal',
      status: 'DRAFT',
      sourceCount: 1,
      actor: 'Persona promovente',
      counterparty: null,
    });
  });

  it('does not invent an expediente when the persisted draft has none', () => {
    const summary = mapLegalDraftToWorkspaceCaseSummary({
      id: 'draft-2',
      title: 'Documento sin asunto identificado',
      matter: null,
      jurisdiction: null,
      status: 'DRAFT',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      updatedAt: new Date('2026-09-20T12:00:00.000Z'),
      formData: {},
      structuredDoc: null,
      sourceDocuments: null,
    });

    expect(summary.expediente).toBeNull();
    expect(summary.actor).toBeNull();
    expect(summary.sourceCount).toBe(0);
  });
});
