import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Caso reportado: al generar el escrito no se podía bajar a ver el resto. El marco del editor no tenía altura:
 * crecía al tamaño del documento y el ancestro con overflow hidden lo recortaba, de modo que el lienzo
 * (`overflow-auto`) nunca llegaba a tener su propio scroll.
 */
describe('marco del editor de documentos', () => {
  const page = readFileSync(path.join(process.cwd(), 'app/machotes/page.tsx'), 'utf8');
  const editor = readFileSync(path.join(process.cwd(), 'app/machotes/components/WorkspaceDocumentEditor.tsx'), 'utf8');

  it('el marco tiene altura acotada y min-h-0 para que el lienzo desplace su contenido', () => {
    const frame = page.match(/<div data-testid="document-editor-frame" className="([^"]+)"/)?.[1] ?? '';
    expect(frame).toMatch(/\bh-full\b/);
    expect(frame).toMatch(/\bmin-h-0\b/);
  });

  it('el lienzo del documento sigue siendo el contenedor con scroll', () => {
    expect(editor).toMatch(/legal-document-canvas flex-1 overflow-auto/);
  });
});
