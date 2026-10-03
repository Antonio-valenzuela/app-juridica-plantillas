import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = path.resolve(process.cwd(), 'app/globals.css');
const editorPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceDocumentEditor.tsx');

describe('Sistema visual LexPlantillas', () => {
  it('define tokens semánticos de escritorio y acento borgoña', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('--lex-ink: #17283e;');
    expect(css).toContain('--lex-navy-950: #11243a;');
    expect(css).toContain('--lex-wine-700: #78283a;');
    expect(css).toContain('--lex-surface-soft: #faf8f6;');
    expect(css).toContain('--lex-text-muted: #526173;');
  });

  it('mantiene foco visible en navegación y respeta movimiento reducido', () => {
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.lex-sidebar-item:focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
  });

  it('aplica patrones coherentes a módulos, plantillas, contestaciones y editor', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    const editor = fs.readFileSync(editorPath, 'utf8');

    expect(css).toContain('.appshell-content .lex-sidebar-item.is-active');
    expect(css).toContain('.appshell-content .machotes-shell .workspace-module-frame');
    expect(css).toContain('.appshell-content .machotes-shell .contestaciones-layout-grid');
    expect(css).toContain('.appshell-content .machotes-shell .templates-page');
    expect(css).toContain('.appshell-content .machotes-shell .redaccion-page');
    expect(css).toContain('.appshell-content .machotes-shell [data-testid="generation-status-bar"]');
    expect(css.includes('.appshell-content .machotes-shell .workspace-editor-shell')).toBe(true);
    expect(editor.includes('workspace-editor-shell')).toBe(true);
  });
});
