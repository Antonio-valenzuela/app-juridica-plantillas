// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceModulesView } from '@/app/machotes/components/WorkspaceModulesView';
import { readAgendaEvents } from '@/lib/workspace/agenda';
import { synchronizeWorkspaceAgenda } from '@/lib/workspace/agendaClient';

const COOKIE = 'lex_desktop_workspace_cap';

function clearCapabilityCookie() {
  document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

describe('Agenda web no disponible — sin llamadas 405', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearCapabilityCookie();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearCapabilityCookie();
  });

  it('la calculadora de términos usa la copia local sin consultar la API en web', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkspaceModulesView mode="terminos" onNavigate={() => undefined} />);

    await screen.findByTestId('workspace-terms-calendar-layout');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con capacidad de escritorio sí consulta la agenda durable', async () => {
    document.cookie = `${COOKIE}=1; path=/`;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, storage: 'DESKTOP_LOCAL', events: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<WorkspaceModulesView mode="terminos" onNavigate={() => undefined} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/workspace/agenda', { cache: 'no-store' }));
  });

  it('sincroniza la agenda del documento solo en localStorage cuando la agenda web no está disponible', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await synchronizeWorkspaceAgenda('La audiencia se celebrará el 30 de septiembre de 2026.', { documentId: 'doc-web' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readAgendaEvents().some((event) => event.documentId === 'doc-web')).toBe(true);
  });

  it('en escritorio sincroniza contra la API durable', async () => {
    document.cookie = `${COOKIE}=1; path=/`;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, storage: 'DESKTOP_LOCAL' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await synchronizeWorkspaceAgenda('La audiencia se celebrará el 30 de septiembre de 2026.', { documentId: 'doc-desktop' });

    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/agenda', expect.objectContaining({ method: 'POST' }));
  });
});
