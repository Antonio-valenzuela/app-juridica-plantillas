import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_CASE_SUMMARY_SQL,
  mapLegalDraftToWorkspaceCaseSummary,
} from '@/lib/workspace/cases';

describe('workspace case summaries', () => {
  it('projects only summary fields instead of selecting large persisted JSON blobs', () => {
    expect(WORKSPACE_CASE_SUMMARY_SQL).toContain('jsonb_array_length');
    expect(WORKSPACE_CASE_SUMMARY_SQL).toContain('"structuredDoc"->');
    expect(WORKSPACE_CASE_SUMMARY_SQL).not.toMatch(/SELECT[\s\S]*"structuredDoc"\s*,/i);
    expect(WORKSPACE_CASE_SUMMARY_SQL).not.toMatch(/SELECT[\s\S]*"sourceDocuments"\s*,/i);
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
