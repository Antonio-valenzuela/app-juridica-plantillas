// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContestacionesChecklist } from '@/app/machotes/components/ContestacionesChecklist';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';

afterEach(cleanup);

const baseProps = {
  hasDocument: true, analysisCompleted: true, configDefined: true,
  isGenerating: false, blockReason: null, isIncompatible: false,
  onGenerate: () => {},
};

describe('AISLAMIENTO de requisitos por flujo', () => {
  it('Apelación NUNCA marca el análisis de la demanda como revisado', () => {
    render(<ContestacionesChecklist {...baseProps} appealMode />);
    // Contrato vigente (appealPhase1b 1.2): la fila permanece visible como
    // recordatorio, pero sin marca de revisado en Apelación.
    const label = screen.getByText('Análisis de la demanda revisado');
    expect(label).toBeTruthy();
    expect((label.parentElement as HTMLElement).querySelector('svg')).toBeNull();
    expect(screen.getByText('Configuración de la apelación definida')).toBeTruthy();
  });

  it('Contestación SÍ muestra el análisis de la demanda marcado', () => {
    render(<ContestacionesChecklist {...baseProps} appealMode={false} />);
    const label = screen.getByText('Análisis de la demanda revisado');
    expect((label.parentElement as HTMLElement).querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Configuración de la contestación definida')).toBeTruthy();
  });
});

describe('el checklist se habilita con una sola fuente de bloqueo', () => {
  it('sin blockers el botón queda habilitado', () => {
    render(<ContestacionesChecklist {...baseProps} />);
    expect((screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('con blockers visibles el botón queda deshabilitado', () => {
    render(<ContestacionesChecklist {...baseProps} blockReason="Selecciona la resolución que deseas impugnar." />);
    expect((screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Selecciona la resolución/)).toBeTruthy();
  });

  it('conserva el bloqueo jurídico pero permite ir al requisito pendiente', () => {
    const onReviewRequirements = vi.fn();
    const onGenerate = vi.fn();
    render(<ContestacionesChecklist
      {...baseProps}
      onGenerate={onGenerate}
      blockReason="Selecciona la resolución que deseas impugnar."
      onReviewRequirements={onReviewRequirements}
    />);

    const reviewButton = screen.getByRole('button', { name: 'Revisar datos para continuar' });
    expect((screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((reviewButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(reviewButton);
    expect(onReviewRequirements).toHaveBeenCalledOnce();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('la incompatibilidad es un dato real y también deshabilita', () => {
    render(<ContestacionesChecklist {...baseProps} isIncompatible />);
    expect((screen.getByRole('button', { name: /Generar/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('inicio de generación por flujo', () => {
  it('permite iniciar una contestación con demanda compatible cuando los requisitos del flujo están completos', () => {
    const sourceText = 'DEMANDA CIVIL. PRESTACIONES. HECHOS. PUNTOS PETITORIOS.';
    const source = {
      id: 'synthetic-demand', name: 'demanda-sintetica.pdf', extractedText: sourceText,
      pages: [{ page: 1, text: sourceText }],
      classification: { sourceDocumentType: 'DEMANDA_CIVIL', matter: 'CIVIL', sourceRole: 'PRIMARY' },
    } as any;
    const generate = vi.fn();
    render(
      <CaseDocumentsReader
        documents={[{ id: source.id, name: source.name, type: 'pdf', status: 'READY', pages: source.pages } as any]}
        sourceDocs={[source]}
        onSelectDocument={vi.fn()}
        onGenerateResponse={generate}
      />,
    );

    const button = screen.getByRole('button', { name: /Generar contestación/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({ selectedDocumentType: 'contestacion_demanda_civil' });
    expect(Object.keys(generate.mock.calls[0][0])).not.toContain('appealConfirmation');
  });
});

describe('layout: una sola barra vertical principal en Contestaciones', () => {
  const page = readFileSync('app/machotes/page.tsx', 'utf8');
  const reader = readFileSync('app/machotes/components/CaseDocumentsReader.tsx', 'utf8');
  const styles = readFileSync('app/globals.css', 'utf8');

  it('la raíz del workspace de Contestaciones NO abre un scroll vertical propio', () => {
    const root = page.match(/className="contestaciones-workspace-root([^"]*)"/);
    expect(root, 'no se encontró .contestaciones-workspace-root').toBeTruthy();
    // `min-h-screen` + `overflow-y-auto` garantizaban una segunda barra.
    expect(root![1]).not.toMatch(/overflow-y-auto/);
    expect(root![1]).not.toMatch(/\bmin-h-screen\b/);
  });

  it('el shell de Contestaciones contiene el scroll en una sola superficie principal', () => {
    expect(page).toMatch(/data-active-tab=\{activeNavTab\}[^>]*className="machotes-shell/);
    expect(styles).toMatch(/\.appshell-content\[data-active-tab="responses_resources"\]\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/);
    expect(styles).toMatch(/\.machotes-shell\[data-active-tab="responses_resources"\]\s+\.machotes-main-scroll\s*\{[\s\S]*?overflow-y:\s*auto/);
  });

  it('el visor de documento conserva su scroll interno legítimo', () => {
    expect(reader).toMatch(/contestaciones-document-preview[^"]*h-\[/);
    expect(reader).toMatch(/h-full overflow-y-auto/);
  });

  it('sólo el preview y listas acotadas usan overflow-y-auto en el reader', () => {
    expect([...reader.matchAll(/overflow-y-auto/g)].length).toBeLessThanOrEqual(4);
  });
});
