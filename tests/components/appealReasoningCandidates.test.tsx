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
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { AppealReasoningAiReview, AppealReasoningCandidatesPanel } from '@/app/machotes/components/AppealReasoningCandidatesPanel';
import { extractAppealReasoningCandidates, extractAppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { civilReasoningSource } from '../fixtures/appealReasoningSources';
import { eightConsideringsCivil } from '../fixtures/appealReasoningImpact';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('removes candidates when another resolution is selected, without restoring them on return', () => {
  const text = 'JUZGADO DE PRUEBA\nAUTO: TRÁMITE\nACTORES: PERSONA ALFA\nDEMANDADOS: PERSONA BETA\nLOCALIDAD A 12 DOCE DE AGOSTO DE 2026\nVISTOS: autos\nSe rechaza la solicitud de los actores porque no fue acreditada.';
  const source = { ...civilReasoningSource, pages: [{ page: 1, text, chars: text.length }, ...civilReasoningSource.pages!] };
  const { container } = render(<CaseDocumentsReader documents={[{ id: source.id, name: 'decisions.pdf', type: 'pdf', status: 'READY', pages: source.pages } as any]} sourceDocs={[source]} onSelectDocument={vi.fn()} />);
  fireEvent.change(screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!, { target: { value: 'apelacion_civil' } });
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
  fireEvent.change(screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!, { target: { value: 'apelacion_civil' } });
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
  fireEvent.change(screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!, { target: { value: 'contestacion_demanda_civil' } });
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

it('requires explicit provider consent and renders per-block AI results read-only after the UI action', async () => {
  const extraction = extractAppealResolutionReview([eightConsideringsCivil]);
  const resolution = extraction.resolutions[0];
  const review = extractAppealReasoningCandidates([eightConsideringsCivil], {
    documentType: 'apelacion_civil', resolution, parties: resolution.parties,
    representedNames: resolution.parties.filter(p => p.role === 'actor').map(p => p.name),
    sourceFingerprint: extraction.sourceFingerprint,
  });
  const reasoningBlock = review.blocks.find(block => block.kind === 'REASONING')!;
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    expect(body.externalProviderOptIn).toBe(true);
    expect(body.representedNames).toEqual(review.representedNames);
    expect(body.blocks.find((item: any) => item.id === reasoningBlock.id).sourceText).toBe(reasoningBlock.sourceText);
    return {
      ok: true,
      json: async () => ({ ok: true, warnings: [], classifications: [{
        blockId: reasoningBlock.id, impact: 'ADVERSE', appliedRule: 2,
        classificationReason: 'La cita expresa que un hecho no se acreditó.',
        status: 'AI_VALIDATED', citationValidated: true,
        validatedQuote: 'Este juzgado determina que no se acreditó la entrega del bien reclamado.',
        cacheKey: 'sha256-test',
      }] }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<AppealReasoningAiReview review={review} />);
  const action = screen.getByRole('button', { name: 'Clasificar razonamientos' });
  expect((action as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo enviar los bloques/ }));
  fireEvent.click(action);
  expect(await screen.findByText(/Cita OCR original validada · Página 5: Este juzgado determina que no se acreditó la entrega del bien reclamado/)).toBeTruthy();
  const readOnly = within(screen.getByLabelText('Agravios candidatos'));
  expect(readOnly.getByText(/IA · cita validada/)).toBeTruthy();
  expect(readOnly.queryAllByRole('textbox')).toHaveLength(0);
  expect(readOnly.queryAllByRole('button')).toHaveLength(0);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
});
