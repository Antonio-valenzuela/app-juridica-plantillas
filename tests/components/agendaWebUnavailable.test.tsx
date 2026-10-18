// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
import { readAgendaEvents, writeAgendaEvents } from '@/lib/workspace/agenda';
import { synchronizeWorkspaceAgenda } from '@/lib/workspace/agendaClient';

function agenda405() {
  return new Response(JSON.stringify({ ok: false, errorCode: 'WEB_AGENDA_NOT_AVAILABLE' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

describe('Agenda web no disponible — el 405 se trata en silencio', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('consulta la API como siempre y, ante 405, cae a la copia local sin error visible', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => agenda405());
    vi.stubGlobal('fetch', fetchMock);
    const dueDate = `${new Date().toISOString().slice(0, 7)}-15`;
    writeAgendaEvents([{ id: 'agenda-local', documentId: 'doc-local', dueDate, title: 'Audiencia local', priority: 'MEDIUM', status: 'PENDING', needsReview: false, source: 'DOCUMENT', sourceText: 'Audiencia del día quince.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);

    render(<WorkspaceModulesView mode="terminos" onNavigate={() => undefined} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/workspace/agenda', { cache: 'no-store' }));
    expect(await screen.findByRole('button', { name: `Seleccionar eventos del ${dueDate}` })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls].map((args) => args.map(String).join(' '));
    expect(logged.filter((line) => /405|workspace\/agenda/i.test(line))).toEqual([]);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('sincroniza la agenda del documento en la copia local ante 405, sin lanzar ni registrar', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => agenda405());
    vi.stubGlobal('fetch', fetchMock);

    await expect(synchronizeWorkspaceAgenda('La audiencia se celebrará el 30 de septiembre de 2026.', { documentId: 'doc-web' })).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/agenda', expect.objectContaining({ method: 'POST' }));
    expect(readAgendaEvents().some((event) => event.documentId === 'doc-web')).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
