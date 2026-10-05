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
import { extractAppealResolutionReview } from '@/lib/legal-engine/case-extraction/appealResolutionReview';
import { appealOcrMarginSource } from '../fixtures/appealOcrMarginSource';
afterEach(cleanup);
describe('phase 1 appeal review discovery', () => {
  it('shows original conflicting date and asks the lawyer for separate blank notification fields', () => {
    render(<AppealResolutionReviewPanel review={extractAppealResolutionReview([appealOcrMarginSource])} onChange={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(screen.getByText(/Confirmar fecha: el OCR/)).toBeTruthy();
    expect(screen.getByText(/2926 DOS/)).toBeTruthy();
    expect((screen.getByLabelText('Fecha de notificación') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Boletín de notificación') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Fecha de resolución confirmada') as HTMLInputElement).value).toBe('');
  });
  it('exposes the mandatory review without trusting a legacy misclassified analysis', () => {
    const { container } = render(<CaseDocumentsReader documents={[{ id: 'anonymous-scan', name: 'anonymous-decisions.pdf', type: 'pdf', status: 'READY', pages: appealResolutionSource.pages } as any]} sourceDocs={[appealResolutionSource]} onSelectDocument={vi.fn()} />);
    const select = screen.getAllByRole('combobox').find(element => element.querySelector('option[value="apelacion_civil"]'))!;
    fireEvent.change(select, { target: { value: 'apelacion_civil' } });
    const html = container.innerHTML;
    expect(html).toContain('Resoluciones detectadas');
    expect(html).toContain('Página 5');
    cleanup();
  });
  it('confirms by DOM interaction and invalidates confirmation when the decision changes', () => {
    const changes: any[] = [];
    const r = extractAppealResolutionReview([appealResolutionSource]);
    render(<AppealResolutionReviewPanel review={r} onChange={c => changes.push(c)} />);
    expect(screen.getByText('Pendiente de confirmar los datos del paso 1')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[1]);
    const confirm = screen.getByRole('checkbox', { name: 'Confirmar partes, resolución, destinatario y notificación' });
    expect((confirm as HTMLInputElement).disabled).toBe(true);
    for (const checkbox of screen.getAllByRole('checkbox').filter(el => el !== confirm).slice(0, 4)) fireEvent.click(checkbox);
    expect((confirm as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(changes.at(-1)?.representedNames).toHaveLength(4);
    expect(changes.at(-1)?.resolutionId).toBe(r.resolutions[1].id);
    expect(screen.getByText('Datos confirmados por el abogado')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Autoridad destinataria'), { target: { value: 'Autoridad corregida por abogado' } });
    expect(changes.at(-1)).toBeUndefined();
    fireEvent.click(screen.getAllByRole('radio')[0]);
    expect(screen.getByText('Pendiente de confirmar los datos del paso 1')).toBeTruthy();
    expect(changes.at(-1)).toBeUndefined();
  });
});
