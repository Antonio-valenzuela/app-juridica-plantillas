/**
 * Importación opcional desde un respaldo exportado de Neon (JSON sintético).
 * No se conecta a Neon: lee un archivo ya exportado.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalPrismaClient, type LocalPrismaClient } from '@/lib/db/localDatabase';
import { NEON_EXPORT_FORMAT, importNeonExport, parseNeonExport } from '@/lib/db/importNeonBackup';

let root: string;
let client: LocalPrismaClient;

const exported = {
  format: NEON_EXPORT_FORMAT,
  tables: {
    Organization: [{ id: 'org-1', name: 'Despacho Sintético', slug: 'despacho-sintetico', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }],
    User: [{ id: 'user-1', email: 'abogado.sintetico@example.invalid', name: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    LegalDraft: [{
      id: 'draft-1', organizationId: 'org-1', userId: 'user-1', title: 'Borrador importado', documentType: 'escrito_libre',
      structuredDoc: { id: 'doc-importado', sections: [] }, formData: { intake: { expediente: 'SINT-9/2026' } },
      status: 'DRAFT', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z',
    }],
    workspace_case_party: [
      { id: 'party-1', organizationId: 'org-1', caseKey: 'SINT-9/2026', role: 'actor', name: 'PERSONA A', source: 'manual', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' },
      { id: 'party-2', organizationId: 'org-1', caseKey: 'SINT-9/2026', role: 'actor', name: 'PERSONA A (duplicada)', source: 'detected', createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' },
    ],
    AiUsageEvent: [{ id: 'telemetria-no-se-importa' }],
  },
};

beforeEach(() => {
  root = path.join(os.tmpdir(), `lex-import-${process.pid}-${Date.now()}`);
  client = createLocalPrismaClient({ databasePath: path.join(root, 'lexplantillas.db'), migrationsDir: path.resolve('prisma/migrations') });
});
afterEach(async () => {
  await client.$disconnect();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('importación de respaldo exportado de Neon', () => {
  it('rechaza formatos desconocidos', () => {
    expect(() => parseNeonExport({ format: 'otro', tables: {} })).toThrow('NEON_IMPORT_UNSUPPORTED_FORMAT');
    expect(() => parseNeonExport(null)).toThrow('NEON_IMPORT_UNSUPPORTED_FORMAT');
  });

  it('importa filas con fechas, omite telemetría y reporta partes duplicadas por rol', async () => {
    const report = await importNeonExport(client as never, exported);
    expect(report.imported).toMatchObject({ Organization: 1, User: 1, LegalDraft: 1, workspace_case_party: 1 });
    expect(report.skipped).toEqual([{ table: 'workspace_case_party', id: 'party-2', reason: 'DUPLICATE_ROLE_FOR_CASE:party-1' }]);
    const draft = await client.legalDraft.findUniqueOrThrow({ where: { id: 'draft-1' } });
    expect(draft.updatedAt.toISOString()).toBe('2026-01-04T00:00:00.000Z');
    expect((draft.structuredDoc as { id: string }).id).toBe('doc-importado');
  });

  it('es idempotente: importar dos veces no duplica filas', async () => {
    await importNeonExport(client as never, exported);
    await importNeonExport(client as never, exported);
    expect(await client.legalDraft.count()).toBe(1);
    expect(await client.caseParty.count()).toBe(1);
    expect(await client.organization.count()).toBe(1);
  });

  it('revierte todo si una fila es inválida (transacción)', async () => {
    const broken = { format: NEON_EXPORT_FORMAT, tables: { Organization: exported.tables.Organization, User: [{ email: 'sin-id@example.invalid' }] } };
    await expect(importNeonExport(client as never, broken)).rejects.toThrow('NEON_IMPORT_ROW_WITHOUT_ID');
    expect(await client.organization.count()).toBe(0);
  });
});
