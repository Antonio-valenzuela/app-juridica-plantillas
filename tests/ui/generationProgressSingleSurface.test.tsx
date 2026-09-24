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
    expect(page).toContain('onCancel={isUniversalGenerating ? handleCancelGeneration : undefined}');

    expect(page).not.toContain('/* Barra determinada */');
    expect(page).not.toContain('mach-progress-indeterminate');
    expect(page).not.toContain('Fuentes y trazabilidad');

    const metadataSubbarStart = reader.indexOf('/* Document Metadata sub-bar */');
    const viewerBodyStart = reader.indexOf('/* Viewer Body */');
    expect(metadataSubbarStart).toBeGreaterThanOrEqual(0);
    expect(viewerBodyStart).toBeGreaterThan(metadataSubbarStart);
    const metadataSubbar = reader.slice(metadataSubbarStart, viewerBodyStart);
    expect(metadataSubbar).toContain('Texto extraído');
    expect(metadataSubbar).toContain('Reemplazar documento');
    expect(reader).not.toContain('Carga, consulta y navega el expediente base página por página.');
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

  it('muestra actividad indeterminada mientras el servidor aún no reporta total', () => {
    const markup = renderToStaticMarkup(React.createElement(GenerationStatusBar, {
      job: {
        status: 'processing',
        total: 0,
        completed: 0,
        percentage: 0,
        stage: 'Preparando documento…',
      },
    }));

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-progress-mode="indeterminate"');
    expect(markup).toContain('Preparando documento…');
  });

  it('activa la misma superficie global durante el análisis OCR del archivo', () => {
    const page = fs.readFileSync(pagePath, 'utf8');

    expect(page).toContain('uploadProgress');
    expect(page).toContain('setUploadProgress');
    expect(page).toContain('Procesando documento fuente…');
    expect(page).toContain("title={isUniversalGenerating ? 'Generando escrito jurídico…' : 'Procesando documento fuente…'}");
  });

  it('retira del Motor Jurídico el panel de análisis duplicado', () => {
    const page = fs.readFileSync(pagePath, 'utf8');

    expect(page).not.toContain('COLUMNA 2: ANÁLISIS JURÍDICO');
    expect(page).not.toContain('Estado del asunto:');
    expect(page).toContain("hasInitialContext ? 'lg:col-span-7' : 'lg:col-span-12'");
    expect(page).toContain('bg-white border border-slate-200');
  });
});
