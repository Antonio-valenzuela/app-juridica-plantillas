// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { AppealReasoningCandidatesPanel } from '@/app/machotes/components/AppealReasoningCandidatesPanel';
import { extractAppealReasoningCandidates, extractAppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { civilReasoningSource } from '../fixtures/appealReasoningSources';
import { eightConsideringsCivil } from '../fixtures/appealReasoningImpact';
afterEach(cleanup);
it('removes candidates when another resolution is selected, without restoring them on return', () => {
  const text = 'JUZGADO DE PRUEBA\nAUTO: TRÁMITE\nACTORES: PERSONA ALFA\nDEMANDADOS: PERSONA BETA\nLOCALIDAD A 12 DOCE DE AGOSTO DE 2026\nVISTOS: autos\nSe rechaza la solicitud de los actores porque no fue acreditada.';
  const source = { ...civilReasoningSource, pages: [{ page: 1, text, chars: text.length }, ...civilReasoningSource.pages!] };
  const { container } = render(<CaseDocumentsReader documents={[{ id: source.id, name: 'decisions.pdf', type: 'pdf', status: 'READY', pages: source.pages } as any]} sourceDocs={[source]} onSelectDocument={vi.fn()} />);
  fireEvent.change(container.querySelector('select')!, { target: { value: 'apelacion_civil' } });
  const review = within(screen.getByLabelText('Confirmación de apelación'));
  fireEvent.click(review.getAllByRole('radio')[1]);
  fireEvent.click(review.getByRole('checkbox', { name: 'PERSONA ALFA (actor)' }));
  fireEvent.change(review.getByLabelText('Fecha de notificación'), { target: { value: 'Dato manual de prueba' } });
  fireEvent.change(review.getByLabelText('Boletín de notificación'), { target: { value: 'Dato manual de prueba' } });
  fireEvent.click(review.getByRole('checkbox', { name: 'Confirmar partes, resolución, destinatario y notificación' }));
  expect(screen.getByLabelText('Agravios candidatos')).toBeTruthy();
  fireEvent.click(review.getAllByRole('radio')[0]);
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
  fireEvent.click(review.getAllByRole('radio')[1]);
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
});
it('shows a read-only candidate panel only after confirmation, and invalidates it on party/resolution/type changes', () => {
  const props = { documents: [{ id: civilReasoningSource.id, name: 'anonymous.pdf', type: 'pdf', status: 'READY', pages: civilReasoningSource.pages } as any], sourceDocs: [civilReasoningSource], onSelectDocument: vi.fn() };
  const { container, rerender } = render(<CaseDocumentsReader {...props} />);
  fireEvent.change(container.querySelector('select')!, { target: { value: 'apelacion_civil' } });
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
  const review = within(screen.getByLabelText('Confirmación de apelación'));
  fireEvent.click(review.getByRole('radio'));
  fireEvent.click(review.getByRole('checkbox', { name: 'PERSONA ALFA (actor)' }));
  fireEvent.change(review.getByLabelText('Fecha de notificación'), { target: { value: 'Dato manual de prueba' } });
  fireEvent.change(review.getByLabelText('Boletín de notificación'), { target: { value: 'Dato manual de prueba' } });
  fireEvent.click(review.getByRole('checkbox', { name: 'Confirmar partes, resolución, destinatario y notificación' }));
  const candidates = within(screen.getByLabelText('Agravios candidatos'));
  expect(candidates.getAllByText(/Página 5/).length).toBeGreaterThan(0);
  expect(candidates.getAllByText('sin soporte').length).toBeGreaterThan(0);
  expect(candidates.getByText('débil')).toBeTruthy();
  expect(candidates.queryAllByRole('button')).toHaveLength(0);
  expect(candidates.queryAllByRole('textbox')).toHaveLength(0);
  fireEvent.change(review.getByLabelText('Partes de la resolución'), { target: { value: 'actor: PERSONA NUEVA' } });
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
  const other = structuredClone(civilReasoningSource); other.id = 'other';
  rerender(<CaseDocumentsReader {...props} sourceDocs={[other]} />);
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
  fireEvent.change(container.querySelector('select')!, { target: { value: 'contestacion_demanda_civil' } });
  expect(screen.queryByLabelText('Agravios candidatos')).toBeNull();
});

it('shows the global disposition and the quoted rule behind each classification', () => {
  const extraction = extractAppealResolutionReview([eightConsideringsCivil]);
  const resolution = extraction.resolutions[0];
  const review = extractAppealReasoningCandidates([eightConsideringsCivil], {
    documentType: 'apelacion_civil', resolution, parties: resolution.parties,
    representedNames: resolution.parties.filter(p => p.role === 'actor').map(p => p.name),
    sourceFingerprint: extraction.sourceFingerprint,
  });
  render(<AppealReasoningCandidatesPanel review={review} />);
  const panel = within(screen.getByLabelText('Agravios candidatos'));
  expect(panel.getByText(/Resultado global: adverso/i)).toBeTruthy();
  expect(within(panel.getAllByRole('article')[0]).getByText(/Regla 2/)).toBeTruthy();
  expect(panel.getByTestId('appeal-global-outcome-page').textContent).toMatch(/Página 5/);
  expect(panel.getAllByText(/Este juzgado determina que no se acreditó la entrega del bien reclamado/).length).toBeGreaterThanOrEqual(2);
});
