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
import { confirmCaseDossierInUi } from '../helpers/confirmCaseDossier';
import { extractAppealResolutionReview, selectPrimaryAppealResolution } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
afterEach(cleanup);
const document = { id: 'anonymous-scan', name: 'anonymous-decisions.pdf', type: 'pdf', status: 'READY', pages: appealResolutionSource.pages } as any;
const props = { documents: [document], sourceDocs: [appealResolutionSource], onSelectDocument: vi.fn(), caseFicha: { actor: 'ACTOR HISTÓRICO ESPURIO', demandado: 'DEMANDADO HISTÓRICO ESPURIO', autoridad: 'TRIBUNAL HISTÓRICO ESPURIO', materia: 'Laboral' } };
// El selector del tipo de escrito es el que ofrece la opción de apelación (el de resolución, si existe, no).
function choose(_container: HTMLElement, value: string) {
  const select = screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!;
  fireEvent.change(select, { target: { value } });
}
function summary() { return within(screen.getByText('Resumen del expediente').closest('section')!); }
/** Ratificación opcional y estricta del abogado (el flujo normal ya no la exige). */
function confirm() {
  const checkbox = screen.getByRole('checkbox', { name: 'Confirmar partes, resolución, destinatario y notificación' });
  screen.getAllByRole('checkbox').filter(c => c !== checkbox).slice(0, 4).forEach(c => fireEvent.click(c));
  fireEvent.click(checkbox);
}
it('1.1 never shows the spurious historical identity, and projects the confirmed identity after the lawyer ratifies', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(summary().queryAllByText(/HISTÓRICO|Laboral/)).toHaveLength(0);
  expect(summary().getAllByText('Por confirmar').length).toBeGreaterThan(0);
  confirm();
  expect(summary().queryAllByText(/HISTÓRICO|Laboral/)).toHaveLength(0);
  expect(summary().getByText(/JUZGADO QUINTO EN MATERIA FAMILIAR/)).toBeTruthy();
  expect(summary().getByText(/J. ALFA APELLIDO UNO/)).toBeTruthy();
  // La materia sigue pendiente aunque el abogado ratifique: ni el tipo elegido ni la detección general la confirman.
  expect(summary().queryAllByText('Civil')).toHaveLength(0);
  expect(summary().getAllByText('Por confirmar').length).toBeGreaterThan(0);
});
it('1.2 removes legacy demand analysis and does not mark it reviewed', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_familiar');
  expect(screen.getByText('No aplica todavía: se construirá en la fase de razonamientos y agravios')).toBeTruthy();
  expect(screen.queryByText('Análisis de la demanda')).toBeNull();
  const row = screen.getByText('Análisis de la demanda revisado').parentElement!;
  expect(row.querySelector('svg')).toBeNull();
});
it('1.3 uses plain Spanish: no internal status codes, step jargon or candidate dumps', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  const inspector = screen.getByTestId('document-inspector').textContent || '';
  expect(container.textContent).not.toContain('NEEDS_USER_INPUT');
  expect(container.textContent).not.toContain('CONFIRMED');
  expect(container.textContent).not.toMatch(/paso 1|Conflicto OCR/i);
  expect(inspector).not.toMatch(/Resoluciones detectadas|resoluciones encontradas|Detectada automáticamente|pending-upload|anonymous-scan/);
  expect(screen.getByLabelText('Resolución a impugnar')).toBeTruthy();
});
it('1.3a pressing Generate goes straight to the draft with the provisional data: no dialog, no extra step', () => {
  const generate = vi.fn();
  const { container } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />);
  choose(container, 'apelacion_civil');
  confirmCaseDossierInUi();
  const generateButton = screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement;
  expect(generateButton.disabled).toBe(false);
  fireEvent.click(generateButton);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(generate).toHaveBeenCalledOnce();
  const request = generate.mock.calls[0][0];
  const review = extractAppealResolutionReview([appealResolutionSource]);
  expect(request.selectedDocumentType).toBe('apelacion_civil');
  expect(request.appealConfirmation).toMatchObject({
    provisional: true, confirmed: false, sourceFingerprint: review.sourceFingerprint,
    resolutionId: selectPrimaryAppealResolution(review.resolutions).primary!.id, representedNames: [],
  });
});
it('1.3b the chosen type is kept: the request carries the lawyer\'s selection, not another writing', () => {
  const generate = vi.fn();
  const { container } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />);
  choose(container, 'apelacion_familiar');
  confirmCaseDossierInUi();
  fireEvent.click(screen.getByRole('button', { name: /Generar apelación/ }));
  expect(generate.mock.calls[0][0].selectedDocumentType).toBe('apelacion_familiar');
});
it('1.4 labels only appeals as appeals', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil');
  expect(screen.getByText('Configuración de la apelación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar apelación/ })).toBeTruthy();
  choose(container, 'contestacion_demanda_civil');
  expect(screen.getByText('Configuración de la contestación')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Generar contestación/ })).toBeTruthy();
});
it('2 leaves no appeal residue on a response, and blocks the response on the real source mismatch', () => {
  const { container } = render(<CaseDocumentsReader {...props} />); choose(container, 'apelacion_civil'); confirm();
  choose(container, 'contestacion_demanda_civil');
  // Sin residuos del flujo de apelación.
  expect(screen.queryByLabelText('Resolución a impugnar')).toBeNull();
  fireEvent.click(screen.getByTestId("contestaciones-more-options"));
  const field = screen.getByLabelText("Instrucción directa (opcional)");
  fireEvent.change(field, { target: { value: 'Contestar conforme a la instrucción expresa del abogado.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
  // Contrato vigente: una resolución judicial NO es compatible con una
  // contestación de demanda. El bloqueo debe ser el de FUENTE, no uno de
  // apelación: ese es el requisito de aislamiento que este test protege.
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toMatch(/resoluci[óo]n judicial, no una demanda/i);
  expect(alert.textContent).toMatch(/cambia a Apelaci[óo]n/i);
  expect(alert.textContent).not.toMatch(/Resoluci[óo]n a impugnar|confirmaci[óo]n de apelaci[óo]n/i);
  expect((screen.getByRole('button', { name: /Generar contestación/ }) as HTMLButtonElement).disabled).toBe(true);
  // Al volver a Apelación el flujo propio de apelación vuelve a estar disponible.
  choose(container, 'apelacion_civil');
  expect(screen.getByLabelText('Resolución a impugnar')).toBeTruthy();
  confirmCaseDossierInUi();
  expect((screen.getByRole('button', { name: /Generar apelación/ }) as HTMLButtonElement).disabled).toBe(false);
});
it('2 a different PDF invalidates the lawyer\'s ratification: the request carries the NEW source revision as provisional', () => {
  const generate = vi.fn();
  const { container, rerender } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />); choose(container, 'apelacion_civil'); confirm();
  const changed = structuredClone(appealResolutionSource); changed.id = 'second-pdf';
  rerender(<CaseDocumentsReader {...props} sourceDocs={[changed]} onGenerateResponse={generate} />);
  expect(summary().getAllByText('Por confirmar').length).toBeGreaterThan(0);
  confirmCaseDossierInUi();
  fireEvent.click(screen.getByRole('button', { name: /Generar apelación/ }));
  const sent = generate.mock.calls.at(-1)![0].appealConfirmation;
  const review = extractAppealResolutionReview([changed]);
  expect(sent.sourceFingerprint).toBe(review.sourceFingerprint);
  expect(sent).toMatchObject({ confirmed: false, provisional: true });
});
it('2 does not send an appeal contract in a response request', () => {
  const generate = vi.fn(); const { container } = render(<CaseDocumentsReader {...props} onGenerateResponse={generate} />);
  choose(container, 'apelacion_civil'); choose(container, 'contestacion_demanda_civil');
  fireEvent.click(screen.getByTestId("contestaciones-more-options"));
  fireEvent.change(screen.getByLabelText("Instrucción directa (opcional)"), { target: { value: 'Contestar conforme a la instrucción expresa del abogado.' } });
  fireEvent.click(screen.getByRole("button", { name: "Listo" }));
  // Aislamiento: el flujo de contestación NO puede arrastrar el contrato de
  // apelación. Con una resolución judicial la respuesta está bloqueada, así
  // que además no se emite ninguna petición.
  expect(screen.queryByLabelText('Resolución a impugnar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Generar contestación/ }));
  expect(generate).not.toHaveBeenCalled();
  expect(generate.mock.calls.flatMap(call => Object.keys(call[0] || {}))).not.toContain('appealConfirmation');
});
