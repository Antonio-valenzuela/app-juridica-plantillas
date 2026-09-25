import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/machotes/components/LocalImportPanel.tsx'), 'utf8');

describe('local import panel contract', () => {
  it('exposes the staged local workflow without technical diagnostics', () => {
    expect(source).toContain('Analizar fuente local');
    expect(source).toContain('Archivos analizados');
    expect(source).toContain('Duplicados');
    expect(source).toContain('Excluidos por seguridad');
    expect(source).toContain('Importar seleccionados');
    expect(source).toContain('CANDIDATA_A_PLANTILLA');
    expect(source).not.toContain('SHA256 collision');
    expect(source).not.toContain('providerRouter');
  });

  it('keeps the selection explicit instead of importing every analyzed file', () => {
    expect(source).toContain('Seleccionar importables');
    expect(source).toContain('selectedIds');
    expect(source).toContain("action: 'import'");
  });

  it('shows imported office documents separately from official legal sources', () => {
    expect(source).toContain('Documentos del despacho');
    expect(source).toContain("fetch('/api/workspace/local-import'");
    expect(source).toContain('libraryQuery');
  });
});
