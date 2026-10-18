// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceDraftGeneratorModal } from '@/app/machotes/components/WorkspaceDraftGeneratorModal';

// Interfaz del generador: la meta de extensión debe llegar al payload, poder cambiarse y no perderse.
afterEach(() => cleanup());

function renderModal(overrides: Record<string, unknown> = {}) {
  const onGenerate = vi.fn().mockResolvedValue(false);
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    tabMode: 'universal' as const,
    onGenerate,
    templates: [],
    uploadedSources: [{ id: 'fuente-sintetica', filename: 'fuente.txt' } as any],
    onUploadFiles: vi.fn(),
    onRemoveUploadedSource: vi.fn(),
    caseFicha: null,
    onAnalyzeCase: vi.fn(),
    isGenerating: false,
    onOpenUploadCustomTemplateModal: vi.fn(),
    ...overrides,
  };
  const view = render(React.createElement(WorkspaceDraftGeneratorModal, props as any));
  return { onGenerate, onClose: props.onClose, ...view };
}

describe('WorkspaceDraftGeneratorModal: meta de extensión', () => {
  it('muestra el selector con «Detallado» (20) como valor inicial visible', () => {
    renderModal();
    expect(screen.getByTestId('page-target-selector')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Detallado, objetivo de 20 páginas/ })).toBeChecked();
  });

  it('envía al generar el valor seleccionado (Extenso = 40) en el payload', async () => {
    const { onGenerate } = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Extenso, objetivo de 40 páginas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generar Escrito Completo/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1));
    expect(onGenerate.mock.calls[0][0].pageTarget).toEqual({ preset: 'EXTENSO', pages: 40 });
  });

  it('conserva la selección tras un intento que no completó (el valor no se pierde)', async () => {
    const { onGenerate } = renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Breve, objetivo de 5 páginas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Generar Escrito Completo/ }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    expect(screen.getByRole('radio', { name: /Breve, objetivo de 5 páginas/ })).toBeChecked();
    expect(onGenerate.mock.calls[0][0].pageTarget).toEqual({ preset: 'BREVE', pages: 5 });
  });

  it('bloquea el selector mientras la generación está en curso', () => {
    renderModal({ isGenerating: true });
    expect(screen.getByRole('radio', { name: /Detallado, objetivo de 20 páginas/ })).toBeDisabled();
  });

  it('el selector no se puede tocar durante una generación, pero sí antes', () => {
    renderModal({ isGenerating: false });
    expect(screen.getByRole('radio', { name: /Extenso, objetivo de 40 páginas/ })).not.toBeDisabled();
  });
});
