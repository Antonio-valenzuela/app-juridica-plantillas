// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';

afterEach(cleanup);

it('renders only the canonically declared Contestaciones options, not name-matched official forms', () => {
  const { container } = render(
    <CaseDocumentsReader documents={[]} onSelectDocument={vi.fn()} />,
  );
  const typeSelector = container.querySelector('select');
  expect(typeSelector).not.toBeNull();

  const ids = [...typeSelector!.options].map((option) => option.value);
  expect(ids).toEqual(['redaccion_libre']);
  expect(ids).not.toContain('contestacion_impedimento');
  expect(screen.getByText(/Tipos en desarrollo \(277\)/i)).toBeTruthy();
  expect(screen.getByText(/Carga primero el documento base/i)).toBeTruthy();
  const generateButton = screen.getByRole('button', { name: /Generar contestación/i }) as HTMLButtonElement;
  expect(generateButton.disabled).toBe(true);
  expect(generateButton.className).not.toContain('bg-[#0B2545]');
  expect(generateButton.className).toContain('bg-slate-200');
});

it('allows an explicitly selected unaccredited response as an assisted draft when a demand is loaded', () => {
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

  fireEvent.click(screen.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo de escrito' }), { target: { value: 'contestacion_demanda_civil' } });

  expect(screen.getByText(/Borrador asistido: revisión obligatoria/)).toBeTruthy();
  const generateButton = screen.getByRole('button', { name: /Generar contestación/i }) as HTMLButtonElement;
  expect(generateButton.disabled).toBe(false);
  fireEvent.click(generateButton);
  expect(generate).toHaveBeenCalledWith(expect.objectContaining({
    selectedDocumentType: 'contestacion_demanda_civil',
    uncertifiedDraftAcknowledged: true,
  }));
});

it('rejects a sentence as a contestation source and offers an appeal path in Spanish', () => {
  const sourceText = 'SENTENCIA DEFINITIVA EN MATERIA CIVIL. RESUELVE EL JUICIO.';
  const source = {
    id: 'synthetic-judgment', name: 'sentencia-sintetica.pdf', extractedText: sourceText,
    pages: [{ page: 1, text: sourceText }],
    classification: { sourceDocumentType: 'SENTENCIA_O_RESOLUCION', matter: 'CIVIL', sourceRole: 'PRIMARY' },
  } as any;
  render(
    <CaseDocumentsReader
      documents={[{ id: source.id, name: source.name, type: 'pdf', status: 'READY', pages: source.pages } as any]}
      sourceDocs={[source]}
      onSelectDocument={vi.fn()}
    />,
  );

  expect(screen.getByText(/la fuente es una sentencia o resolución, no una demanda/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Cambiar a Apelación/i }));
  expect((screen.getByRole('checkbox', { name: 'En desarrollo (sin certificar)' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('combobox', { name: 'Tipo de escrito' }) as HTMLSelectElement).value).toBe('apelacion_civil');
  expect((screen.getByRole('button', { name: /Generar apelación/i }) as HTMLButtonElement).disabled).toBe(true);
});
