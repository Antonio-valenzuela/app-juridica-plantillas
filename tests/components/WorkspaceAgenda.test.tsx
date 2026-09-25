// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
import { AGENDA_STORAGE_KEY, readAgendaEvents, writeAgendaEvents, type AgendaEvent } from '@/lib/workspace/agenda';

describe('Workspace agenda calendar', () => {
  const dueDate = `${new Date().toISOString().slice(0, 7)}-15`;

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows compact priority circles, opens the selected day, and persists attended status', async () => {
    const events: AgendaEvent[] = [
      { id: 'agenda-high', documentId: 'doc-a', dueDate, title: 'Presentar promoción', priority: 'HIGH', status: 'PENDING', needsReview: true, source: 'DOCUMENT', sourceText: 'Presentar promoción para el lunes.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'agenda-medium', documentId: 'doc-a', dueDate, title: 'Audiencia señalada', priority: 'MEDIUM', status: 'PENDING', needsReview: false, source: 'DOCUMENT', sourceText: 'Audiencia el lunes.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'agenda-low', documentId: 'doc-other', dueDate, title: 'Seguimiento', priority: 'LOW', status: 'COMPLETED', needsReview: false, source: 'DOCUMENT', sourceText: 'Dar seguimiento el lunes.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ];
    writeAgendaEvents(events);
    render(<WorkspaceModulesView mode="terminos" onNavigate={() => undefined} />);

    const day = await screen.findByRole('button', { name: `Seleccionar eventos del ${dueDate}` });
    expect(day).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[title="Alta: Presentar promoción"]')).toBeInTheDocument();
    expect(document.querySelector('[title="Media: Audiencia señalada"]')).toBeInTheDocument();
    expect(document.querySelector('[title="Baja: Seguimiento"]')).toBeInTheDocument();

    fireEvent.click(day);
    expect(screen.getByText('Día seleccionado')).toBeInTheDocument();
    expect(screen.getByText('Revisar fecha derivada del documento.')).toBeInTheDocument();
    expect(screen.getByText('Presentar promoción')).toBeInTheDocument();
    expect(screen.getByText('Seguimiento')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Marcar como atendido' })[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reabrir evento' }).length).toBeGreaterThanOrEqual(2));
    expect(readAgendaEvents().find((event) => event.id === 'agenda-high')?.status).toBe('COMPLETED');
    expect(window.localStorage.getItem(AGENDA_STORAGE_KEY)).toContain('COMPLETED');
  });
});
