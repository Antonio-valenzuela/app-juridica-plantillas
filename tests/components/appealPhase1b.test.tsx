// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
afterEach(cleanup);
const document = { id: 'anonymous-scan', name: 'anonymous-decisions.pdf', type: 'pdf', status: 'READY', pages: appealResolutionSource.pages } as any;
const props = { documents: [document], sourceDocs: [appealResolutionSource], onSelectDocument: vi.fn(), caseFicha: { actor: 'ACTOR HISTÓRICO ESPURIO', demandado: 'DEMANDADO HISTÓRICO ESPURIO', autoridad: 'TRIBUNAL HISTÓRICO ESPURIO', materia: 'Laboral' } };
function choose(container: HTMLElement, value: string) { fireEvent.change(container.querySelector('select')!, { target: { value } }); }
function summary() { return within(screen.getByText('Resumen del expediente').closest('section')!); }
function confirm() {
  fireEvent.click(within(screen.getByLabelText('Confirmación de apelación')).getAllByRole('radio')[1]);
  const checkbox = screen.getByRole('checkbox', { name: 'Confirmar partes, resolución, destinatario y notificación' });
  screen.getAllByRole('checkbox').filter(c => c !== checkbox).slice(0, 4).forEach(c => fireEvent.click(c));
  fireEvent.click(checkbox);
}
it('1.1 hides historical identity before confirming and projects confirmed identity afterwards', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(summary().queryAllByText(/HISTÓRICO|Laboral/)).toHaveLength(0);
  expect(summary().getAllByText('Pendiente de confirmar en el paso 1').length).toBeGreaterThan(0);
  confirm();
  expect(summary().getByText(/JUZGADO QUINTO EN MATERIA FAMILIAR/)).toBeTruthy();
  expect(summary().getByText(/J. ALFA APELLIDO UNO/)).toBeTruthy();
  expect(summary().getByText('Civil')).toBeTruthy();
});
it('1.2 removes legacy demand analysis and does not mark it reviewed', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_familiar');
  expect(screen.getByText('No aplica todavía: se construirá en la fase de razonamientos y agravios')).toBeTruthy();
  expect(screen.queryByText('Análisis de la demanda')).toBeNull();
  const row = screen.getByText('Análisis de la demanda revisado').parentElement!;
  expect(row.querySelector('svg')).toBeNull();
});
it('1.3 uses Spanish confirmation text, never internal status codes', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(container.textContent).not.toContain('NEEDS_USER_INPUT');
  expect(container.textContent).not.toContain('CONFIRMED');
  expect(screen.getByText(/Selecciona la resolución que vas a impugnar/)).toBeTruthy();
});
it('1.4 labels only appeals as appeals', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(screen.getByText('Configuración de la apelación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar apelación/ })).toBeTruthy();
  choose(container, 'contestacion_demanda_civil');
  expect(screen.getByText('Configuración de la contestación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar contestación/ })).toBeTruthy();
});
it('2 leaves no appeal requirement on a response, and requires fresh confirmation when returning', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil'); confirm();
  choose(container, 'contestacion_demanda_civil');
  expect(screen.queryByText('Resoluciones detectadas')).toBeNull();
  expect(screen.queryByLabelText('Confirmación de apelación')).toBeNull();
  const field = screen.getByPlaceholderText(/Ej. Elabora recurso/);
  fireEvent.change(field, { target: { value: 'Contestar conforme a la instrucción expresa del abogado.' } });
  expect(screen.queryByText('Requerimiento pendiente')).toBeNull();
  expect((screen.getByRole('button', { name: /Generar contestación/ }) as HTMLButtonElement).disabled).toBe(false);
  choose(container, 'apelacion_civil');
  expect(screen.getByText('Requerimiento pendiente')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement).disabled).toBe(true);
});
it('2 invalidates the previous PDF confirmation and exposes pending identity', () => {
  const { container, rerender } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil'); confirm();
  const changed = structuredClone(appealResolutionSource); changed.id = 'second-pdf';
  rerender(<CaseDocumentsReader {...props} sourceDocs={[changed]} />);
  expect(summary().getAllByText('Pendiente de confirmar en el paso 1').length).toBeGreaterThan(0);
  expect((screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<CaseDocumentsReader {...props} />);
  expect(summary().getAllByText('Pendiente de confirmar en el paso 1').length).toBeGreaterThan(0);
  expect((screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement).disabled).toBe(true);
});
it('2 does not send an appeal contract in a response request', () => {
  const generate = vi.fn(); const { container } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />);
  choose(container, 'apelacion_civil'); choose(container, 'contestacion_demanda_civil');
  fireEvent.change(screen.getByPlaceholderText(/Ej. Elabora recurso/), { target: { value: 'Contestar conforme a la instrucción expresa del abogado.' } });
  fireEvent.click(screen.getByRole('button', { name: /Generar contestación/ }));
  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0]).not.toHaveProperty('appealConfirmation');
});
