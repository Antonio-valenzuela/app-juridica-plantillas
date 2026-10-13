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

  it('mantiene el espacio jurídico acotado al viewport con inspector y canvas independientes', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const reader = fs.readFileSync(readerPath, 'utf8');

    expect(page).toContain('contestaciones-workspace-root');
    expect(reader).toContain('contestaciones-document-preview');
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .contestaciones-workspace-root')[0]).toMatchObject({
      'min-height': '0',
      'overflow': 'hidden',
    });
    expect(declarationsFor('.contestaciones-document-preview')[0]).toMatchObject({
      'height': 'auto',
      'min-height': '0',
      'max-height': 'none',
    });
    expect(reader).toContain('data-inspector-open={isInspectorOpen}');
    expect(reader).toContain('aria-expanded={isInspectorOpen}');
    expect(stylesheet().toString()).toContain('grid-template-columns: minmax(0, 1fr) minmax(360px, 400px) !important');
  });

  it('usa toda la altura de escritorio y deja un solo scroll completo para documento e inspector', () => {
    const reader = fs.readFileSync(readerPath, 'utf8');
    const mainScroll = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .machotes-main-scroll');
    const workspace = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-desktop-workspace');
    const inspector = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-side-column');
    const inspectorContent = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-side-column > .contestaciones-inspector-scroll');
    const inspectorFooter = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-inspector-footer');

    expect(mainScroll.at(-1)).toMatchObject({ height: '100%', padding: '0', overflow: 'hidden' });
    expect(workspace.at(-1)).toMatchObject({ height: '100%', 'min-height': '0', overflow: 'hidden' });
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-main-column .contestaciones-document-pdf-viewport').at(-1)).toMatchObject({
      'height': '100%',
      'max-height': 'none',
      'overflow-y': 'auto',
    });
    expect(inspector).toContainEqual(expect.objectContaining({ 'overflow-y': 'auto' }));
    expect(inspectorContent.at(-1)).toMatchObject({ display: 'contents' });
    expect(inspectorFooter.at(-1)).toMatchObject({ position: 'static', 'margin-top': '0' });
    expect(declarationsFor('body:has(.appshell-content[data-active-tab="responses_resources"]) #floating-legal-btn').at(-1)).toMatchObject({ display: 'none' });
    expect(reader).toContain('contestaciones-document-toolbar');
  });

  it('da al visor PDF el espacio flex restante sin crear un scroll exterior anidado', () => {
    const reader = fs.readFileSync(readerPath, 'utf8');
    const viewer = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-document-viewer');
    const pdfViewport = declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-document-pdf-viewport');

    expect(reader).toContain('contestaciones-document-viewer');
    expect(reader).toContain('contestaciones-document-pdf-viewport');
    expect(viewer.at(-1)).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      flex: '1 1 auto',
      'min-height': '0',
      height: '100%',
    });
    expect(pdfViewport.at(-1)).toMatchObject({
      'overflow-y': 'auto',
      'overflow-x': 'auto',
      flex: '1 1 auto',
      'min-height': '0',
      'max-height': 'none',
    });
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-main-column .contestaciones-document-preview').at(-1)).toMatchObject({
      flex: '1 1 auto',
      'height': 'auto',
      'min-height': '0',
      'max-height': 'none',
      'overflow-y': 'visible',
      'overflow-x': 'visible',
    });
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-document-viewer').at(-1)).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      flex: '1 1 auto',
      'min-height': '0',
      'height': '100%',
    });
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-document-pdf-viewport').at(-1)).toMatchObject({
      'overflow-y': 'auto',
      'overflow-x': 'auto',
      flex: '1 1 auto',
      'min-height': '0',
      'height': '100%',
      'max-height': 'none',
    });
    expect(declarationsFor('.appshell-content[data-active-tab="responses_resources"] .machotes-shell .contestaciones-document-preview').at(-1)).toMatchObject({
      'overflow-y': 'visible',
      'overflow-x': 'visible',
    });
  });
});
