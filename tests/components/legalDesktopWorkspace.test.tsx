// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';

afterEach(cleanup);

describe('workspace jurídico de escritorio', () => {
  it('inicia con el inspector abierto y permite plegarlo sin desmontar su contenido', () => {
    render(
      <CaseDocumentsReader
        documents={[]}
        sourceDocs={[]}
        onSelectDocument={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Ocultar panel de datos' });
    const inspector = screen.getByTestId('document-inspector');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(inspector.getAttribute('aria-hidden')).toBe('false');
    expect(inspector.textContent).toContain('Configuración');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Mostrar panel de datos' }).getAttribute('aria-expanded')).toBe('false');
    expect(inspector.getAttribute('aria-hidden')).toBe('true');
    expect(inspector.textContent).toContain('Configuración');
  });

  it('marca el canvas y el inspector con estructura identificable para responsive desktop', () => {
    render(
      <CaseDocumentsReader
        documents={[]}
        sourceDocs={[]}
        onSelectDocument={vi.fn()}
      />,
    );

    expect(screen.getByTestId('legal-desktop-workspace')).toBeTruthy();
    expect(screen.getByTestId('document-canvas')).toBeTruthy();
    expect(screen.getByTestId('document-inspector')).toBeTruthy();
  });
});
