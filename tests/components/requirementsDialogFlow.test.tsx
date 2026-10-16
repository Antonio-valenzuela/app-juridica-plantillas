// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { confirmCaseDossierInUi } from '../helpers/confirmCaseDossier';
import { OFFICIAL_DOCUMENT_MATRIX } from '../fixtures/documentosOficialesSinteticos';

afterEach(cleanup);

function renderDemand() {
  const source = OFFICIAL_DOCUMENT_MATRIX.find((item) => item.id === 'demanda-civil')!.source;
  const generate = vi.fn();
  render(<CaseDocumentsReader documents={[{ id: source.id, name: 'demanda.pdf', type: 'pdf', status: 'READY', pages: source.pages } as never]} sourceDocs={[source]} onSelectDocument={vi.fn()} onGenerateResponse={generate} />);
  return generate;
}

describe('diálogo de requisitos del escrito', () => {
  it('se abre solo cuando el escrito pide datos, sin tener que buscar el formulario', () => {
    renderDemand();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Confirma los datos del caso/);
    expect(dialog.querySelector('[data-testid="case-dossier-panel"]')).toBeTruthy();
    expect(screen.getByTestId('case-dossier-summary').textContent).toMatch(/Pendiente/);
  });

  it('se cierra al confirmar la ficha y el resumen muestra a quién se representa', () => {
    renderDemand();
    confirmCaseDossierInUi();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('case-dossier-summary').textContent).toMatch(/Confirmada · representas a/);
    expect((screen.getByRole('button', { name: /Generar contestación/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('«Completar después» lo cierra y «Revisar datos» o «Completar ficha» lo reabren', () => {
    renderDemand();
    fireEvent.click(screen.getByRole('button', { name: 'Completar después' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Completar ficha' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar datos para continuar' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('conserva lo escrito al cerrar y reabrir', () => {
    renderDemand();
    fireEvent.change(screen.getByLabelText('Parte que representas'), { target: { value: '__otra__' } });
    fireEvent.change(screen.getByLabelText('Nombre de la parte representada'), { target: { value: 'Mi Cliente Ficticio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Completar después' }));
    fireEvent.click(screen.getByRole('button', { name: 'Completar ficha' }));
    expect((screen.getByLabelText('Nombre de la parte representada') as HTMLInputElement).value).toBe('Mi Cliente Ficticio');
  });

  it('permite escribir varias letras seguidas: el foco no vuelve al primer campo en cada tecla', () => {
    renderDemand();
    const court = screen.getByLabelText('Órgano jurisdiccional') as HTMLInputElement;
    court.focus();
    for (const text of ['J', 'Ju', 'Jue', 'Juez Tercero']) {
      fireEvent.change(court, { target: { value: text } });
      expect(document.activeElement).toBe(court);
    }
    expect(court.value).toBe('Juez Tercero');
    const city = screen.getByLabelText('Lugar de presentación') as HTMLInputElement;
    city.focus();
    fireEvent.change(city, { target: { value: 'Zapopan' } });
    expect(document.activeElement).toBe(city);
    expect(city.value).toBe('Zapopan');
  });
});
