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

  it('los avisos y la barra de generación restan alto al cuerpo del workspace en vez de recortarlo', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    // El cuerpo ya no mide 100 % fijo: comparte la columna con lo que va arriba y el lienzo llega a su final.
    expect(css).toMatch(/data-active-tab="responses_resources"\] \.machotes-main-scroll \{\s*display: flex;\s*flex-direction: column;/);
    expect(css).toMatch(/\.machotes-workspace-content \{\s*flex: 1 1 0 !important;\s*height: auto !important;/);
    expect(css).toMatch(/\.legal-document-canvas \{\s*padding-bottom: 72px/);
  });

  it('el resultado de extensión y el anexo comparten una fila fina sobre el documento', () => {
    expect(page).toMatch(/className="lex-editor-meta"[\s\S]*page-target-result[\s\S]*<ReviewAnnexPanel/);
  });

  it('la regla heredada `.grid { margin-bottom: 3rem }` no deja franjas vacías en el workspace', () => {
    const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
    expect(css).toMatch(/\.contestaciones-layout-grid \{\s*margin-bottom: 0 !important;/);
    expect(css).toMatch(/\.appshell-content \.machotes-shell \.grid \{\s*margin-bottom: revert-layer;/);
  });
});

