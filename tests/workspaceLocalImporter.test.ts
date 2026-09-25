import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLocalImportInventory,
  classifyLocalImportEntry,
  type LocalImportEntryInput,
} from '@/lib/workspace/localImporter';
import { scanLocalImportSource } from '@/lib/workspace/localImportSource';

function entry(overrides: Partial<LocalImportEntryInput> = {}): LocalImportEntryInput {
  return {
    relativePath: 'documentos/escrito.docx',
    name: 'escrito.docx',
    extension: '.docx',
    sizeBytes: 12_000,
    sha256: 'a'.repeat(64),
    modifiedAt: '2025-01-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('local importer classification', () => {
  it('excludes security-sensitive files without deleting or importing them', () => {
    for (const [name, extension, reason] of [
      ['firma.key', '.key', 'CREDENCIAL_O_CERTIFICADO'],
      ['certificado.p12', '.p12', 'CREDENCIAL_O_CERTIFICADO'],
      ['instalador.exe', '.exe', 'EJECUTABLE_O_SCRIPT'],
      ['script.bat', '.bat', 'EJECUTABLE_O_SCRIPT'],
      ['acceso.lnk', '.lnk', 'ACCESO_DIRECTO'],
      ['temporal.tmp', '.tmp', 'TEMPORAL'],
    ] as const) {
      const result = classifyLocalImportEntry(entry({ name, extension }));
      expect(result.status).toBe('EXCLUIDO_POR_SEGURIDAD');
      expect(result.exclusionReason).toBe(reason);
      expect(result).not.toHaveProperty('content');
    }
  });

  it('classifies a likely amparo document and leaves the source text out of metadata', () => {
    const result = classifyLocalImportEntry(entry({
      relativePath: 'AMPARO DE BAYARDO/AMPARO DIRECTO.docx',
      name: 'AMPARO DIRECTO.docx',
    }));

    expect(result.category).toBe('AMPARO');
    expect(result.matter).toBe('AMPARO_CONSTITUCIONAL');
    expect(result.status).toBe('IMPORTABLE');
    expect(result).not.toHaveProperty('content');
  });

  it('marks old editable formats for conversion instead of pretending they are fully supported', () => {
    const result = classifyLocalImportEntry(entry({
      name: 'contestacion.doc',
      extension: '.doc',
    }));

    expect(result.compatibility).toBe('SOPORTADO_PARCIAL');
    expect(result.status).toBe('REQUIERE_REVISION');
  });

  it('reflects the app extractor boundary for spreadsheet and presentation files', () => {
    expect(classifyLocalImportEntry(entry({ name: 'datos.xlsx', extension: '.xlsx' })).compatibility).toBe('REQUIERE_CONVERSION');
    expect(classifyLocalImportEntry(entry({ name: 'audiencia.pptx', extension: '.pptx' })).compatibility).toBe('REQUIERE_CONVERSION');
    expect(classifyLocalImportEntry(entry({ name: 'acta.pdf', extension: '.pdf' })).compatibility).toBe('SOPORTADO');
  });

  it('deduplicates by SHA-256 while preserving the canonical and duplicate paths', () => {
    const inventory = buildLocalImportInventory([
      entry({ relativePath: 'a/escrito.docx', name: 'escrito.docx' }),
      entry({ relativePath: 'b/copia.docx', name: 'copia.docx' }),
      entry({ relativePath: 'c/demanda.pdf', name: 'demanda.pdf', sha256: 'b'.repeat(64) }),
    ]);

    expect(inventory.records[0].status).toBe('IMPORTABLE');
    expect(inventory.records[1].status).toBe('DUPLICADO');
    expect(inventory.records[1].canonicalRecordId).toBe(inventory.records[0].id);
    expect(inventory.summary.duplicates).toBe(1);
    expect(inventory.summary.importable).toBe(2);
  });

  it('reports damaged, unknown and review items separately', () => {
    const inventory = buildLocalImportInventory([
      entry({ relativePath: 'vacio.docx', name: 'vacio.docx', sizeBytes: 0 }),
      entry({ relativePath: 'video.wmv', name: 'video.wmv', extension: '.wmv' }),
      entry({ relativePath: 'archivo.xyz', name: 'archivo.xyz', extension: '.xyz' }),
      entry({ relativePath: 'archivo.txt', name: 'archivo.txt', extension: '.txt', sha256: 'c'.repeat(64) }),
    ]);

    expect(inventory.summary.damaged).toBe(1);
    expect(inventory.summary.review).toBe(1);
    expect(inventory.summary.unclassified).toBe(1);
  });

  it('does not infer a practice area from broad everyday words', () => {
    expect(classifyLocalImportEntry(entry({ name: 'Manual de dignidad institucional.docx' })).matter).toBe('SIN_CLASIFICAR');
    expect(classifyLocalImportEntry(entry({ name: 'Contrato de servicios.docx' })).matter).toBe('SIN_CLASIFICAR');
    expect(classifyLocalImportEntry(entry({ name: 'Informe de trabajo.docx' })).matter).toBe('SIN_CLASIFICAR');
    expect(classifyLocalImportEntry(entry({ name: 'Factura de proveedor.docx' })).matter).toBe('SIN_CLASIFICAR');
  });

  it('scans a local directory, hashes files and keeps only metadata in the inventory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lex-import-'));
    try {
      await writeFile(path.join(root, 'demanda.docx'), 'fixture legal document');
      await writeFile(path.join(root, 'firma.key'), 'private fixture');

      const result = await scanLocalImportSource(root);

      expect(result.source.kind).toBe('DIRECTORY');
      expect(result.inventory.summary.analyzed).toBe(2);
      expect(result.inventory.records.every((record) => !('content' in record))).toBe(true);
      expect(result.inventory.records.find((record) => record.name === 'demanda.docx')?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.inventory.records.find((record) => record.name === 'firma.key')?.status).toBe('EXCLUIDO_POR_SEGURIDAD');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
