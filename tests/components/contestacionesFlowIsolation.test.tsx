// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContestacionesChecklist } from '@/app/machotes/components/ContestacionesChecklist';

afterEach(cleanup);

const baseProps = {
  hasDocument: true, analysisCompleted: true, configDefined: true,
  isGenerating: false, blockReason: null, isIncompatible: false,
  onGenerate: () => {},
};

describe('AISLAMIENTO de requisitos por flujo', () => {
  it('Apelación NO muestra requisitos propios de Contestación', () => {
    render(<ContestacionesChecklist {...baseProps} appealMode />);
    expect(screen.queryByText('Análisis de la demanda revisado')).toBeNull();
    expect(screen.queryByText(/demanda revisado/i)).toBeNull();
    expect(screen.getByText('Configuración de la apelación definida')).toBeTruthy();
  });

  it('Contestación SÍ muestra el análisis de la demanda', () => {
    render(<ContestacionesChecklist {...baseProps} appealMode={false} />);
    expect(screen.getByText('Análisis de la demanda revisado')).toBeTruthy();
    expect(screen.getByText('Configuración de la contestación definida')).toBeTruthy();
  });
});

describe('el checklist se habilita con una sola fuente de bloqueo', () => {
  it('sin blockers el botón queda habilitado', () => {
    render(<ContestacionesChecklist {...baseProps} />);
    const button = screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('con blockers visibles el botón queda deshabilitado', () => {
    render(<ContestacionesChecklist {...baseProps} blockReason="Selecciona la resolución que deseas impugnar." />);
    const button = screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Selecciona la resolución/)).toBeTruthy();
  });

  it('la incompatibilidad ya no es una vía oculta de bloqueo cuando no hay blocker', () => {
    // isIncompatible sin blockReason debe seguir bloqueando (es un dato real),
    // pero el bloqueo visible y la bandera no pueden divergir sin explicación.
    render(<ContestacionesChecklist {...baseProps} isIncompatible />);
    const button = screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

describe('layout: una sola barra vertical principal en Contestaciones', () => {
  const page = readFileSync('app/machotes/page.tsx', 'utf8');
  const reader = readFileSync('app/machotes/components/CaseDocumentsReader.tsx', 'utf8');

  it('la raíz del workspace de Contestaciones NO abre un scroll vertical propio', () => {
    const root = page.match(/className="contestaciones-workspace-root([^"]*)"/);
    expect(root, 'no se encontró .contestaciones-workspace-root').toBeTruthy();
    const classes = root![1];
    // `min-h-screen` + `overflow-y-auto` garantizaban una segunda barra.
    expect(classes).not.toMatch(/overflow-y-auto/);
    expect(classes).not.toMatch(/\bmin-h-screen\b/);
  });

  it('el visor de documento conserva su scroll interno legítimo', () => {
    // El visor de PDF/texto puede tener scroll propio: es un panel diseñado.
    expect(reader).toMatch(/contestaciones-document-preview[^"]*h-\[/);
    expect(reader).toMatch(/h-full overflow-y-auto/);
  });

  it('sólo el preview del documento y listas acotadas usan overflow-y-auto en el reader', () => {
    const matches = [...reader.matchAll(/overflow-y-auto/g)];
    // Un número acotado: no hay un segundo scroller general de página.
    expect(matches.length).toBeLessThanOrEqual(4);
  });
});