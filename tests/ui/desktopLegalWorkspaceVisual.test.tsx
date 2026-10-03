import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { WorkspaceModulesView, type WorkspaceModule } from '@/app/machotes/components/WorkspaceModulesView';
import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.resolve(process.cwd(), 'app/globals.css');
const pagePath = path.resolve(process.cwd(), 'app/machotes/page.tsx');
const readerPath = path.resolve(process.cwd(), 'app/machotes/components/CaseDocumentsReader.tsx');

const moduleCases: Array<[WorkspaceModule, string]> = [
  ['inicio', 'dashboard'],
  ['expedientes', 'cases'],
  ['terminos', 'terms'],
  ['jurisprudencia', 'research'],
  ['biblioteca', 'library'],
  ['alertas', 'alerts'],
  ['configuracion', 'settings'],
  ['ayuda', 'help'],
];

function stylesheet() {
  return postcss.parse(fs.readFileSync(cssPath, 'utf8'));
}

function declarationsFor(selector: string) {
  const matches: Array<Record<string, string>> = [];
  stylesheet().walkRules(selector, (rule) => {
    const declarations: Record<string, string> = {};
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value;
    });
    matches.push(declarations);
  });
  return matches;
}

describe('Workspace jurídico de escritorio', () => {
  it.each(moduleCases)('%s expone identidad visual estable para su módulo', (mode, moduleName) => {
    const markup = renderToStaticMarkup(React.createElement(WorkspaceModulesView, {
      mode,
      onNavigate: () => undefined,
    }));

    expect(markup).toContain(`data-workspace-module="${moduleName}"`);
  });

  it('define superficies y acento jurídico mediante tokens semánticos', () => {
    const tokens: Record<string, string> = {};
    stylesheet().walkRules(':root', (rule) => {
      rule.walkDecls((declaration) => {
        tokens[declaration.prop] = declaration.value;
      });
    });

    expect(tokens).toMatchObject({
      '--lex-workspace-canvas': '#f2f0ec',
      '--lex-workspace-surface': '#fbfaf8',
      '--lex-workspace-border': '#d9d5d0',
      '--lex-workspace-accent': '#78283a',
      '--lex-workspace-control-height': '40px',
    });
  });

  it('aplica jerarquía de controles y densidad al workspace sin alcanzar el documento jurídico', () => {
    const controls = declarationsFor('.appshell-content .machotes-shell .workspace-module-frame :where(button:not([class*="min-h-"]))');
    expect(controls).toContainEqual(expect.objectContaining({
      'min-height': 'var(--lex-workspace-control-height)',
      'border-radius': 'var(--lex-workspace-control-radius)',
      'font-family': 'var(--lex-font-ui)',
    }));
    expect(controls).toContainEqual(expect.objectContaining({ 'min-height': '44px' }));

    expect(declarationsFor('.appshell-content .machotes-shell .workspace-module-frame[data-workspace-module="dashboard"] section:has(h2 + p)')[0]).toMatchObject({
      'background': 'var(--lex-workspace-surface)',
      'border-left': '3px solid var(--lex-workspace-accent)',
    });

    expect(declarationsFor('.appshell-content .machotes-shell .workspace-module-frame :where(button[class*="bg-[#0B2545]"])')[0]).toMatchObject({
      'background-color': 'var(--lex-workspace-accent)',
      'border-color': 'var(--lex-workspace-accent)',
    });

    expect(declarationsFor('.appshell-content .machotes-shell [data-testid="editor-toolbar"] :where(button:not([class*="min-h-"]))')[0]).toMatchObject({
      'min-height': 'var(--lex-workspace-control-height)',
      'border-radius': 'var(--lex-workspace-control-radius)',
    });
  });

  it('mantiene un único scroll de página y un visor fuente dimensionado al viewport', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const reader = fs.readFileSync(readerPath, 'utf8');

    expect(page).toContain('contestaciones-workspace-root');
    expect(reader).toContain('contestaciones-document-preview');
    expect(declarationsFor('.appshell-content .machotes-shell .contestaciones-workspace-root')[0]).toMatchObject({
      'min-height': '0',
      'overflow-y': 'visible',
    });
    expect(declarationsFor('.appshell-content .machotes-shell .contestaciones-document-preview')[0]).toMatchObject({
      'height': 'min(72vh, 760px)',
      'max-height': 'calc(100vh - 220px)',
    });
  });
});
