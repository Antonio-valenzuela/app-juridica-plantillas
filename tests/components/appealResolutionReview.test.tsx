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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { CaseDocumentsReader } from '@/app/machotes/components/CaseDocumentsReader';
import { appealResolutionSource } from '../fixtures/appealResolutionSource';
import { AppealResolutionReviewPanel } from '@/app/machotes/components/AppealResolutionReviewPanel';
import { extractAppealResolutionReview, selectPrimaryAppealResolution, type AppealConfirmation } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { appealOcrMarginSource } from '../fixtures/appealOcrMarginSource';
afterEach(cleanup);

const CONFIRM = 'Confirmar partes, resolución, destinatario y notificación';
/** Lo que el abogado NO debe ver en la interfaz ordinaria. */
const TECHNICAL_NOISE = [/pending-upload/i, /anonymous-scan/i, /Resoluciones detectadas/, /Conflicto OCR/i, /\bOCR\b/, /Página \d/, /procedencia/i, /Detectada automáticamente/, /resoluciones encontradas/i, /NEEDS_USER_INPUT/];

describe('resolución a impugnar: una sola resolución principal, sin ruido técnico', () => {
  it('muestra solo la resolución principal (la sentencia), preseleccionada, sin lista de candidatas', () => {
    const { container } = render(<AppealResolutionReviewPanel review={extractAppealResolutionReview([appealResolutionSource])} onChange={vi.fn()} detectedExpediente="ANON-01" />);
    expect(screen.getByTestId('appeal-primary-resolution').textContent).toBe('Sentencia definitiva · JUZGADO QUINTO EN MATERIA FAMILIAR · 24 VEINTICUATRO DE AGOSTO DE 2026');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    for (const noise of TECHNICAL_NOISE) expect(container.textContent, String(noise)).not.toMatch(noise);
    expect((screen.getByLabelText('Número de expediente detectado') as HTMLInputElement).value).toBe('ANON-01');
  });

  it('el abogado puede cambiar de resolución sin que se muestren páginas ni identificadores', () => {
    const review = extractAppealResolutionReview([appealResolutionSource]);
    const onChange = vi.fn();
    const { container } = render(<AppealResolutionReviewPanel review={review} onChange={onChange} detectedExpediente="ANON-01" />);
    const select = screen.getByLabelText('Resolución que se impugna') as HTMLSelectElement;
    expect([...select.options].map(o => o.textContent)).toEqual([
      'Auto · JUZGADO QUINTO EN MATERIA FAMILIAR · 12 DOCE DE AGOSTO DEL AÑO 2026',
      'Sentencia definitiva · JUZGADO QUINTO EN MATERIA FAMILIAR · 24 VEINTICUATRO DE AGOSTO DE 2026',
    ]);
    fireEvent.change(select, { target: { value: review.resolutions[0].id } });
    expect((onChange.mock.calls.at(-1)![0] as AppealConfirmation).resolutionId).toBe(review.resolutions[0].id);
    for (const noise of TECHNICAL_NOISE) expect(container.textContent, String(noise)).not.toMatch(noise);
  });

  it('emite de inmediato una confirmación provisional: no se exige ningún formulario', () => {
    const review = extractAppealResolutionReview([appealResolutionSource]);
    const onChange = vi.fn();
    render(<AppealResolutionReviewPanel review={review} onChange={onChange} detectedExpediente="ANON-01" />);
    const emitted = onChange.mock.calls.at(-1)![0] as AppealConfirmation;
    expect(emitted).toMatchObject({ provisional: true, confirmed: false, resolutionId: selectPrimaryAppealResolution(review.resolutions).primary!.id, expediente: 'ANON-01' });
    expect(screen.getByRole('status').textContent).toMatch(/Se generará un borrador/);
  });

  it('una fecha inconsistente se explica en lenguaje claro, sin jerga ni fragmentos del OCR', () => {
    const review = extractAppealResolutionReview([appealOcrMarginSource]);
    const conflicted = review.resolutions.find(r => r.dateStatus === 'CONFIRM_DATE')!;
    expect(conflicted).toBeTruthy();
    const { container } = render(<AppealResolutionReviewPanel review={review} onChange={vi.fn()} />);
    // El abogado llega a la resolución con la fecha inconsistente desde el selector, sin ver páginas ni IDs.
    if (review.resolutions.length > 1) fireEvent.change(screen.getByLabelText('Resolución que se impugna'), { target: { value: conflicted.id } });
    expect(screen.getByText(/La fecha de la resolución debe revisarse/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Conflicto OCR|Confirmar fecha: el OCR/);
    expect((screen.getByLabelText('Fecha de notificación') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Boletín de notificación') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Fecha de resolución confirmada') as HTMLInputElement).value).toBe('');
  });

  it('un dato faltante queda pendiente y editable; nunca se infiere', () => {
    const source = structuredClone(appealResolutionSource);
    source.pages = [source.pages![1]];
    source.pages[0].text = source.pages[0].text
      .replace('JUZGADO QUINTO EN MATERIA FAMILIAR', 'ÓRGANO ILEGIBLE')
      .replace(/EXPEDIENTE:.*\n/, '')
      .replace(/ACTORES:.*\n/, '')
      .replace(/DEMANDADOS:[\s\S]*?ZAPOPAN,/, 'ZAPOPAN,');
    const onChange = vi.fn();
    render(<AppealResolutionReviewPanel review={extractAppealResolutionReview([source])} onChange={onChange} />);
    expect((screen.getByLabelText('Número de expediente detectado') as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Expediente: por confirmar/)).toBeTruthy();
    expect((screen.getByLabelText('Partes de la resolución') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Autoridad destinataria') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('checkbox', { name: CONFIRM }) as HTMLInputElement).disabled).toBe(true);
    // El borrador sigue siendo posible: los datos faltantes viajan como pendientes.
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ provisional: true, recipient: '[A CONFIRMAR POR EL ABOGADO]', expediente: '[A CONFIRMAR POR EL ABOGADO]' });
  });

  it('sin encabezados detectables no bloquea: informa y deja la resolución para revisión', () => {
    const empty = extractAppealResolutionReview([{ id: 's', filename: 'x.pdf', sourceValidated: true, pages: [{ page: 1, chars: 0, text: 'Texto sin encabezado de resolución.' }] } as any]);
    const onChange = vi.fn();
    render(<AppealResolutionReviewPanel review={empty} onChange={onChange} />);
    expect(screen.getByText(/No se identificó el encabezado de una resolución/)).toBeTruthy();
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ provisional: true, resolutionId: '' });
  });
});

describe('confirmación estricta opcional y conservación de lo editado', () => {
  it('ratificar los datos produce una confirmación estricta; editar después la vuelve provisional SIN perder lo escrito', () => {
    const changes: AppealConfirmation[] = [];
    const review = extractAppealResolutionReview([appealResolutionSource]);
    render(<AppealResolutionReviewPanel review={review} detectedExpediente="ANON-01" onChange={c => { if (c) changes.push(c); }} />);
    const confirm = screen.getByRole('checkbox', { name: CONFIRM }) as HTMLInputElement;
    expect(confirm.disabled).toBe(true);
    for (const checkbox of screen.getAllByRole('checkbox').filter(el => el !== confirm).slice(0, 4)) fireEvent.click(checkbox);
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(changes.at(-1)).toMatchObject({ confirmed: true, provisional: false });
    expect(changes.at(-1)!.representedNames).toHaveLength(4);
    expect(screen.getByText('Datos confirmados por el abogado.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Autoridad destinataria'), { target: { value: 'Autoridad corregida por abogado' } });
    expect(changes.at(-1)).toMatchObject({ confirmed: false, provisional: true, recipient: 'Autoridad corregida por abogado' });
    expect((screen.getByLabelText('Autoridad destinataria') as HTMLInputElement).value).toBe('Autoridad corregida por abogado');
    expect(screen.getByRole('status').textContent).toMatch(/Se generará un borrador/);
  });

  it('cambiar de resolución invalida la ratificación previa', () => {
    const changes: AppealConfirmation[] = [];
    const review = extractAppealResolutionReview([appealResolutionSource]);
    render(<AppealResolutionReviewPanel review={review} detectedExpediente="ANON-01" onChange={c => { if (c) changes.push(c); }} />);
    const confirm = screen.getByRole('checkbox', { name: CONFIRM });
    for (const checkbox of screen.getAllByRole('checkbox').filter(el => el !== confirm).slice(0, 4)) fireEvent.click(checkbox);
    fireEvent.click(confirm);
    expect(changes.at(-1)!.confirmed).toBe(true);
    fireEvent.change(screen.getByLabelText('Resolución que se impugna'), { target: { value: review.resolutions[0].id } });
    expect(changes.at(-1)).toMatchObject({ confirmed: false, provisional: true, resolutionId: review.resolutions[0].id });
  });
});

describe('integración con el lector de documentos', () => {
  it('el panel derecho muestra la resolución principal y ningún volcado técnico del motor', () => {
    render(<CaseDocumentsReader documents={[{ id: 'anonymous-scan', name: 'anonymous-decisions.pdf', type: 'pdf', status: 'READY', pages: appealResolutionSource.pages } as any]} sourceDocs={[appealResolutionSource]} onSelectDocument={vi.fn()} caseFicha={{ expediente: 'ANON-01/2026', actor: 'PERSONA ACTORA' } as any} />);
    const select = screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!;
    fireEvent.change(select, { target: { value: 'apelacion_civil' } });
    expect(screen.getByLabelText('Resolución a impugnar')).toBeTruthy();
    expect(screen.getByTestId('appeal-primary-resolution').textContent).toMatch(/^Sentencia definitiva/);
    // El visor del PDF tiene su propia paginación; la queja es del panel derecho (inspector).
    const inspector = screen.getByTestId('document-inspector');
    for (const noise of TECHNICAL_NOISE) expect(inspector.textContent, String(noise)).not.toMatch(noise);
    // El expediente del encabezado de la resolución prevalece sobre el estado global de la página.
    expect((screen.getByLabelText('Número de expediente detectado') as HTMLInputElement).value).toBe('ANON-01');
    // La ficha proyecta lo detectado en LA resolución actual, no el estado global (posible expediente ajeno).
    expect(screen.queryByText('PERSONA ACTORA')).toBeNull();
    expect(screen.getAllByText(/J\. ALFA APELLIDO UNO/).length).toBeGreaterThan(0);
    cleanup();
  });
});
