import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const editorPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceDocumentEditor.tsx');

describe('toolbar del editor jurídico', () => {
  it('mantiene dos filas canónicas y evita reflujo por el número de página', () => {
    const source = fs.readFileSync(editorPath, 'utf8');
    const toolbarStart = source.indexOf('data-testid="editor-toolbar"');
    const statusStart = source.indexOf('BORRADOR PARA REVISIÓN DEL ABOGADO');
    const toolbar = source.slice(toolbarStart, statusStart);

    expect(toolbarStart).toBeGreaterThanOrEqual(0);
    expect(toolbar).toContain('data-testid="editor-toolbar-row-primary"');
    expect(toolbar).toContain('data-testid="editor-toolbar-row-secondary"');
    expect(toolbar.match(/data-testid="editor-toolbar-row-/g)).toHaveLength(2);
    expect(toolbar).toContain('flex-nowrap');
    expect(toolbar).toContain('overflow-x-auto');
    expect(toolbar).not.toContain('flex flex-wrap');
    expect(toolbar).toContain('min-w-[9rem]');
    expect(toolbar).toContain('tabular-nums');
    expect(toolbar).not.toMatch(/currentPage[\s\S]{0,200}(?:flex-wrap|hidden|block)/);
  });

  it('conserva el orden de acciones en la misma toolbar para páginas 9, 10 y 31', () => {
    const source = fs.readFileSync(editorPath, 'utf8');
    const toolbarStart = source.indexOf('data-testid="editor-toolbar"');
    const statusStart = source.indexOf('BORRADOR PARA REVISIÓN DEL ABOGADO');
    const toolbar = source.slice(toolbarStart, statusStart);
    const actions = ['Editar contestación', 'Formatear', 'Páginas', 'Pág.', 'Buscar...', 'Subir Machote', 'Guardar', 'Exportar'];
    const positions = actions.map((action) => toolbar.indexOf(action));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
