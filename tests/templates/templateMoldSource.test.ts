import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { templateDesignNotice, templateSourceFromRecord } from '@/lib/templates/templateMoldSource';
import { buildSyntheticLawyerTemplate } from '../helpers/syntheticLawyerTemplate';

describe('fuente de la plantilla del abogado', () => {
  it('lee el .docx guardado solo desde la carpeta de plantillas', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tpl-'));
    await writeFile(path.join(dir, '1-modelo.docx'), await buildSyntheticLawyerTemplate());
    const source = await templateSourceFromRecord(
      { id: 't1', originalText: 'texto', sourceFileName: 'modelo.docx', structureJson: { storage: { savedFileName: '1-modelo.docx' } } },
      dir,
    );
    expect(source.kind).toBe('docx');
    expect(source.bytes?.subarray(0, 2).toString()).toBe('PK');
    expect(source.originalText).toBe('texto');
  });

  it('PDF, texto, rutas fuera de la carpeta o archivos ausentes no se tratan como molde', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tpl-'));
    const cases = ['modelo.pdf', '../secreto.docx', 'faltante.docx'];
    for (const savedFileName of cases) {
      const source = await templateSourceFromRecord({ id: 't', structureJson: { storage: { savedFileName } } }, dir);
      expect(source.kind, savedFileName).toBe('other');
      expect(source.bytes).toBeUndefined();
    }
  });

  it('el aviso explica qué se conserva y qué se reescribe', () => {
    const notice = templateDesignNotice();
    expect(notice).toContain('Se conserva');
    expect(notice).toContain('Se reescribe');
    expect(notice).toContain('No se copia ningún dato');
  });
});
