import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerationStatusBar } from '@/app/machotes/components/GenerationStatusBar';

const pagePath = path.resolve(process.cwd(), 'app/machotes/page.tsx');
const readerPath = path.resolve(process.cwd(), 'app/machotes/components/CaseDocumentsReader.tsx');
const modalPath = path.resolve(process.cwd(), 'app/machotes/components/WorkspaceDraftGeneratorModal.tsx');
const checklistPath = path.resolve(process.cwd(), 'app/machotes/components/ContestacionesChecklist.tsx');

function countStatusBarMounts(source: string): number {
  return source.match(/<GenerationStatusBar\b/g)?.length || 0;
}

describe('Generation progress — single visible surface', () => {
  it('mantiene una sola barra global y elimina las representaciones secundarias', () => {
    const page = fs.readFileSync(pagePath, 'utf8');
    const reader = fs.readFileSync(readerPath, 'utf8');
    const modal = fs.readFileSync(modalPath, 'utf8');
    const checklist = fs.readFileSync(checklistPath, 'utf8');

    expect(countStatusBarMounts(page)).toBe(1);
    expect(countStatusBarMounts(reader)).toBe(0);
    expect(countStatusBarMounts(modal)).toBe(0);
    expect(checklist).not.toContain("from './GenerationStatusBar'");
    expect(page).toContain('onCancel={handleCancelGeneration}');
  });

  it('renderiza una sola superficie activa con cancelación disponible', () => {
    const markup = renderToStaticMarkup(React.createElement(GenerationStatusBar, {
      job: {
        status: 'processing',
        total: 3,
        completed: 1,
        percentage: 33,
        stage: 'Generando escrito…',
        aiProvider: 'fallback',
      },
      onCancel: () => undefined,
    }));

    expect(markup.match(/data-testid="generation-status-bar"/g)).toHaveLength(1);
    expect(markup.match(/Cancelar/g)).toHaveLength(1);
  });
});
