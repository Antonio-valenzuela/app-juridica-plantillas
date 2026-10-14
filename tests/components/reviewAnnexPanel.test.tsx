// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReviewAnnexPanel } from '@/app/machotes/components/ReviewAnnexPanel';
import { emptyReviewAnnex } from '@/lib/legal-engine/reviewAnnex';

afterEach(cleanup);

describe('anexo de revisión (panel)', () => {
  it('no muestra nada si no hay anexo o está vacío', () => {
    const { container, rerender } = render(<ReviewAnnexPanel />);
    expect(container.innerHTML).toBe('');
    rerender(<ReviewAnnexPanel annex={emptyReviewAnnex()} />);
    expect(container.innerHTML).toBe('');
  });

  it('lista citas omitidas, pendientes y notas fuera del escrito', () => {
    const annex = emptyReviewAnnex();
    annex.unverifiedCitations.push({ section: 'AGRAVIO PRIMERO', citation: 'tesis 50/2010', omitted: 'Conforme a la tesis 50/2010…' });
    annex.pendingItems.push({ section: 'DERECHO', text: 'Fundamento pendiente' });
    annex.notes.push({ section: 'AGRAVIO SEGUNDO', text: 'Podría argumentarse otra vía.' });
    render(<ReviewAnnexPanel annex={annex} />);
    const panel = screen.getByTestId('review-annex');
    expect(panel.textContent).toMatch(/3 puntos; fuera del escrito/);
    expect(panel.textContent).toContain('tesis 50/2010');
    expect(panel.textContent).toContain('Fundamento pendiente');
    expect(panel.textContent).toContain('Podría argumentarse otra vía.');
  });
});
