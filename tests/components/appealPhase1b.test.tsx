// @vitest-environment jsdom
import React from 'react';
// Component-only approved catalog fixture. Production availability is tested
// separately and remains FAIL; this mock is not functional certification.
vi.mock('@/lib/catalog/legalCatalog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/catalog/legalCatalog')>();
  const approved = new Set(['apelacion_civil', 'apelacion_familiar', 'contestacion_demanda_civil']);
  return { ...actual,
    getContestacionesDocumentOptions: () => [
      ...actual.getContestacionesDeclaredDocumentTypes().filter(item => approved.has(item.id)).map(item => ({ value: item.id, label: item.label })),
      { value: 'redaccion_libre', label: 'Redacción libre' },
    ],
    getFunctionalDocumentStatus: (id: string) => approved.has(id) ? 'PASS' : actual.getFunctionalDocumentStatus(id),
  };
});
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
it('1.3a directs the blocked appeal action to its confirmation without generating', () => {
  const previousDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  const generate = vi.fn();
  try {
    const { container } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />);
    choose(container, 'apelacion_civil');
    const generateButton = screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement;
    expect(generateButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Revisar datos para continuar' }));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  } finally {
    if (previousDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previousDescriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});
it('1.4 labels only appeals as appeals', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(screen.getByText('Configuración de la apelación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar apelación/ })).toBeTruthy();
  choose(container, 'contestacion_demanda_civil');
  expect(screen.getByText('Configuración de la contestación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar contestación/ })).toBeTruthy();
});
it('2 leaves no appeal requirement on a response, and blocks the response on the real source mismatch', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil'); confirm();
  choose(container, 'contestacion_demanda_civil');
  // Sin residuos del flujo de apelación.
  expect(screen.queryByText('Resoluciones detectadas')).toBeNull();
  expect(screen.queryByLabelText('Confirmación de apelación')).toBeNull();
  const field = screen.getByPlaceholderText(/Ej. Elabora recurso/);
  fireEvent.change(field, { target: { value: 'Contestar conforme a la instrucción expresa del abogado.' } });
  // Contrato vigente: una resolución judicial NO es compatible con una
  // contestación de demanda. El bloqueo debe ser el de FUENTE, no uno de
  // apelación: ese es el requisito de aislamiento que este test protege.
  const alert = screen.getByRole('alert');
  expect(alert).toBeTruthy();
  expect(alert.textContent).toMatch(/resoluci[óo]n judicial, no una demanda/i);
  expect(alert.textContent).toMatch(/cambia a Apelaci[óo]n/i);
  expect(alert.textContent).not.toMatch(/Resoluciones detectadas|confirmaci[óo]n de apelaci[óo]n/i);
  const contestacionButton = screen.getByRole('button', { name: /Generar contestación/ }) as HTMLButtonElement;
  expect(contestacionButton.disabled).toBe(true);
  // Al volver a Apelación el requisito exclusive vuelve a ser el de apelación.
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
  // Aislamiento: el flujo de contestación NO puede arrastrar el contrato de
  // apelación. Con una resolución judicial la respuesta está bloqueada, así
  // que además no se emite ninguna petición.
  expect(screen.queryByLabelText('Confirmación de apelación')).toBeNull();
  expect(screen.queryByText('Resoluciones detectadas')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Generar contestación/ }));
  expect(generate).not.toHaveBeenCalled();
  // Y al pasar a Apelación, la respuesta anterior tampoco generó contrato.
  expect(generate.mock.calls.flatMap(call => Object.keys(call[0] || {}))).not.toContain('appealConfirmation');
});
