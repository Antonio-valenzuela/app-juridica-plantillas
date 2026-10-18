import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GenerationStatusBar } from '@/app/machotes/components/GenerationStatusBar';

const pagePath = path.resolve(process.cwd(), 'app/machotes/page.tsx');
const cancelledGate = "{(isUniversalGenerating || uploadProgress || activeGenJob?.status === 'cancelled') && (";
const cancelledJob = "job={isUniversalGenerating || activeGenJob?.status === 'cancelled' ? activeGenJob : uploadProgress}";

describe('Generation progress — estado cancelado visible', () => {
  it('la barra global sigue montada mientras se muestra el estado cancelado', () => {
    const page = fs.readFileSync(pagePath, 'utf8');

    expect(page).toContain(cancelledGate);
    expect(page).toContain(cancelledJob);
    expect(page).toContain("onCancel={isUniversalGenerating ? handleCancelGeneration : undefined}");
    expect(page).toContain('setActiveGenJob({ ...next, status: \'cancelled\' } as any)');
    expect(page).toMatch(/window\.setTimeout\(\(\) => \{\s*setActiveGenJob\(null\);\s*\}, 2500\);/);
  });

  it('renderiza «Generación cancelada» (nunca «Documento generado») sin botón Cancelar', () => {
    const markup = renderToStaticMarkup(React.createElement(GenerationStatusBar, {
      job: { status: 'cancelled', total: 10, completed: 6, percentage: 60, stage: 'Redactando el proyecto…' },
      onCancel: () => undefined,
    }));

    expect(markup.match(/data-testid="generation-status-bar"/g)).toHaveLength(1);
    expect(markup).toContain('data-status="cancelled"');
    expect(markup).toContain('Generación cancelada');
    expect(markup).toContain('Puedes iniciar una nueva corrida cuando lo necesites.');
    expect(markup).not.toContain('Documento generado');
    expect(markup).not.toContain('Cancelar');
    expect(markup).not.toContain('aria-busy="true"');
  });
});
